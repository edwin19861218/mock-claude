/// Grep 工具——正则搜索文件内容
///
/// 对照 TS 版 grepTool
/// 简化版：递归遍历 + regex（源码用ripgrep，我们用标准库）

use std::fs;
use std::path::Path;

use async_trait::async_trait;
use regex::Regex;
use serde_json::{json, Value};

use crate::tools::{Tool, ToolError};
use crate::types::RiskLevel;

pub struct GrepTool;

#[async_trait]
impl Tool for GrepTool {
    fn name(&self) -> &str {
        "Grep"
    }

    fn description(&self) -> &str {
        "搜索文件内容（简化版）"
    }

    fn risk_level(&self) -> RiskLevel {
        RiskLevel::Safe
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "pattern": { "type": "string", "description": "正则表达式" },
                "path": { "type": "string", "description": "搜索目录" }
            },
            "required": ["pattern"]
        })
    }

    async fn execute(&self, input: Value) -> Result<String, ToolError> {
        let pattern = input
            .get("pattern")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError("缺少 pattern".into()))?;

        let search_path = input
            .get("path")
            .and_then(|v| v.as_str())
            .unwrap_or(".");

        let regex = Regex::new(pattern)
            .map_err(|e| ToolError(format!("无效正则: {}", e)))?;

        let mut results = Vec::new();
        let max_results = 50;

        search_dir(Path::new(search_path), &regex, &mut results, max_results, 0);

        if results.is_empty() {
            return Ok(format!("没有找到匹配 \"{}\" 的内容", pattern));
        }

        Ok(results.join("\n"))
    }
}

fn search_dir(
    dir: &Path,
    regex: &Regex,
    results: &mut Vec<String>,
    max: usize,
    depth: usize,
) {
    if depth > 5 || results.len() >= max {
        return;
    }

    let skip_dirs = [".git", "node_modules", "target", ".svn"];
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        if results.len() >= max {
            break;
        }

        let path = entry.path();
        let file_name = entry.file_name();
        let name = file_name.to_string_lossy();

        if path.is_dir() {
            if !skip_dirs.contains(&name.as_ref()) {
                search_dir(&path, regex, results, max, depth + 1);
            }
        } else {
            if let Ok(content) = fs::read_to_string(&path) {
                for (i, line) in content.lines().enumerate() {
                    if results.len() >= max {
                        break;
                    }
                    if regex.is_match(line) {
                        let rel = path.to_string_lossy();
                        results.push(format!("{}:{}: {}", rel, i + 1, line.trim()));
                    }
                }
            }
        }
    }
}
