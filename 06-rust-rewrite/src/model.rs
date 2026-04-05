//! 模型调用者 trait
//!
//! Mock 和 Anthropic API 都实现此 trait
//! 对照 TS 版：函数签名 callModel(messages) => ContentBlock[]

use async_trait::async_trait;
use crate::types::{ChatMessage, ContentBlock};

/// 模型调用者——统一接口
///
/// Mock 版按 turn 返回预设结果，Anthropic 版调用真实 API
/// 对照 TS 版的 callModel 参数：两个实现共享同一个接口
#[async_trait]
pub trait ModelCaller: Send + Sync {
    /// 根据对话历史，返回模型响应（Text + ToolUse 块）
    async fn call(&self, messages: &[ChatMessage]) -> Vec<ContentBlock>;
}
