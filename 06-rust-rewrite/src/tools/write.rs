/// Write 工具——带安全检查的文件写入
///
/// 对照 TS 版 writeTool：riskLevel: "moderate" + checkPermissions
/// 差异：自定义权限检查返回 Option<PermissionResult>

use std::fs;
use std::path::Path;

use async_trait::async_trait;
use serde_json::{json, Value};

use crate::permission::PermissionResult;
use crate::tools::{Tool, ToolError};
use crate::types::RiskLevel;

pub struct WriteTool;

#[async_trait]
impl Tool for WriteTool {
    fn name(&self) -> &str {
        "Write"
    }

    fn description(&self) -> &str {
        "写入文件内容"
    }

    fn risk_level(&self) -> RiskLevel {
        RiskLevel::Moderate
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "file_path": { "type": "string", "description": "文件路径" },
                "content": { "type": "string", "description": "要写入的内容" }
            },
            "required": ["file_path", "content"]
        })
    }

    /// 自定义权限检查——阻止写入系统目录
    /// 对照 TS 版: checkPermissions(input) { ... blocked dirs ... }
    fn check_permissions(&self, input: &Value) -> Option<PermissionResult> {
        let file_path = input.get("file_path")?.as_str()?;
        let blocked = ["/etc/", "/usr/", "/bin/", "/sbin/", "/dev/"];
        for prefix in &blocked {
            if file_path.starts_with(prefix) {
                return Some(PermissionResult::deny(
                    &format!("不允许写入系统目录 {}", prefix),
                    2,
                ));
            }
        }
        None // None 表示通过自定义检查，继续走后续关卡
    }

    async fn execute(&self, input: Value) -> Result<String, ToolError> {
        let file_path = input
            .get("file_path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError("缺少 file_path".into()))?;

        let content = input
            .get("content")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError("缺少 content".into()))?;

        let path = Path::new(file_path);

        // 自动创建父目录
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)
                    .map_err(|e| ToolError(format!("创建目录失败: {}", e)))?;
            }
        }

        fs::write(path, content)
            .map_err(|e| ToolError(format!("写入失败: {}", e)))?;

        let lines = content.lines().count();
        let size = content.len();
        Ok(format!("文件已写入: {} ({} 行, {} 字节)", file_path, lines, size))
    }
}
