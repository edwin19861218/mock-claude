/// Glob 工具——按模式查找文件
///
/// 对照 TS 版 globTool
/// 用 glob crate 做真正的模式匹配

use std::path::Path;

use async_trait::async_trait;
use serde_json::{json, Value};

use crate::tools::{Tool, ToolError};
use crate::types::RiskLevel;

pub struct GlobTool;

#[async_trait]
impl Tool for GlobTool {
    fn name(&self) -> &str {
        "Glob"
    }

    fn description(&self) -> &str {
        "按模式查找文件"
    }

    fn risk_level(&self) -> RiskLevel {
        RiskLevel::Safe
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "pattern": { "type": "string", "description": "glob 模式" },
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

        let base = Path::new(search_path);
        let full_pattern = base.join(pattern).to_string_lossy().to_string();

        let mut results = Vec::new();
        let max = 100;

        for entry in glob::glob(&full_pattern)
            .map_err(|e| ToolError(format!("无效模式: {}", e)))?
            .flatten()
        {
            if results.len() >= max {
                break;
            }
            if let Some(rel) = pathdiff(entry.as_path(), base) {
                results.push(rel);
            }
        }

        if results.is_empty() {
            return Ok(format!("没有找到匹配 \"{}\" 的文件", pattern));
        }

        let note = if results.len() >= max {
            " (截断，超过100文件)"
        } else {
            ""
        };
        Ok(format!(
            "找到 {} 个文件{}:\n{}",
            results.len(),
            note,
            results.join("\n")
        ))
    }
}

/// 简单的相对路径计算
fn pathdiff(path: &Path, base: &Path) -> Option<String> {
    path.strip_prefix(base)
        .ok()
        .map(|p| p.to_string_lossy().to_string())
        .or_else(|| Some(path.to_string_lossy().to_string()))
}
