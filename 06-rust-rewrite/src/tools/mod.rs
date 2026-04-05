//! 工具模块：trait 定义 + 注册表 + 4个真实工具
//!
//! 对照 TS 版 tools/ 目录
//! 核心差异：
//!   - trait + Send + Sync 替代 interface
//!   - Result<String, ToolError> 替代 try-catch
//!   - Arc<dyn Tool> 替代普通对象引用

#![allow(dead_code)]

pub mod glob;
pub mod grep;
pub mod read;
pub mod write;

use async_trait::async_trait;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;

use crate::permission::PermissionResult;
use crate::types::{RiskLevel, ToolError};

// ─── Tool trait ───
// 对照 TS 版: interface Tool { name, execute, checkPermissions?, riskLevel? }
// Rust 版: trait + Send + Sync 保证线程安全
// 关键差异：TS 没有 Send + Sync 概念

#[async_trait]
pub trait Tool: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn risk_level(&self) -> RiskLevel;
    fn input_schema(&self) -> Value;

    /// 执行工具——返回 Result<T, E>，编译器逼你处理错误
    async fn execute(&self, input: Value) -> Result<String, ToolError>;

    /// 权限检查（可选）——None 表示无自定义检查
    fn check_permissions(&self, _input: &Value) -> Option<PermissionResult> {
        None
    }
}

// ─── 工具注册表 ───
// 对照 TS 版: class ToolRegistry { private tools = new Map() }
// Rust 版: HashMap<String, Arc<dyn Tool>>——Arc让工具可被多代理共享

pub struct ToolRegistry {
    tools: HashMap<String, Arc<dyn Tool>>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self {
            tools: HashMap::new(),
        }
    }

    pub fn register(&mut self, tool: impl Tool + 'static) {
        let name = tool.name().to_string();
        self.tools.insert(name, Arc::new(tool));
    }

    pub fn get(&self, name: &str) -> Option<Arc<dyn Tool>> {
        self.tools.get(name).cloned()
    }

    pub fn all_tools(&self) -> Vec<Arc<dyn Tool>> {
        self.tools.values().cloned().collect()
    }

    pub fn tool_count(&self) -> usize {
        self.tools.len()
    }
}
