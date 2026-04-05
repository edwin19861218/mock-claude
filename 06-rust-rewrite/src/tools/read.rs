/// Read 工具——读文件带行号
///
/// 对照 TS 版 src/tools/built-in/index.ts 的 readTool
/// 差异：PathBuf + Result 替代 fs.existsSync + try-catch

use std::fs;
use std::path::Path;

use async_trait::async_trait;
use serde_json::{json, Value};

use crate::tools::{Tool, ToolError};
use crate::types::RiskLevel;

pub struct ReadTool;

#[async_trait]
impl Tool for ReadTool {
    fn name(&self) -> &str {
        "Read"
    }

    fn description(&self) -> &str {
        "读取文件内容，返回带行号的文本"
    }

    fn risk_level(&self) -> RiskLevel {
        RiskLevel::Safe
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "file_path": { "type": "string", "description": "文件路径" },
                "offset": { "type": "number", "description": "起始行号（可选）" },
                "limit": { "type": "number", "description": "最大行数（可选）" }
            },
            "required": ["file_path"]
        })
    }

    async fn execute(&self, input: Value) -> Result<String, ToolError> {
        // Rust: 必须显式处理 Option（TS 用 as 断言，可能是 undefined）
        let file_path = input
            .get("file_path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError("缺少 file_path 参数".into()))?;

        let offset = input
            .get("offset")
            .and_then(|v| v.as_u64())
            .unwrap_or(1) as usize;
        let limit = input
            .get("limit")
            .and_then(|v| v.as_u64())
            .unwrap_or(2000) as usize;

        let path = Path::new(file_path);

        // Path 存在性检查
        if !path.exists() {
            return Err(ToolError(format!("文件不存在: {}", file_path)));
        }

        // 读取 + 添加行号
        let content = fs::read_to_string(path)
            .map_err(|e| ToolError(format!("读取失败: {}", e)))?;

        let lines: Vec<&str> = content.lines().collect();
        let selected = lines
            .iter()
            .skip(offset.saturating_sub(1))
            .take(limit);

        let numbered: Vec<String> = selected
            .enumerate()
            .map(|(i, line)| format!("{}\t{}", offset + i, line))
            .collect();

        Ok(numbered.join("\n"))
    }
}
