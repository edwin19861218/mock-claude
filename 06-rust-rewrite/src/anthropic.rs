//! Anthropic API 调用器
//!
//! 对照 TS 版 anthropic.ts
//! 调用真实的 Claude API，支持工具调用

use async_trait::async_trait;
use serde_json::{json, Value};

use crate::model::ModelCaller;
use crate::tools::ToolRegistry;
use crate::types::{ChatMessage, ContentBlock};

/// Anthropic API 调用器
///
/// 对照 TS 版的 createAnthropicCaller()
/// 差异：Rust 用 struct + trait 替代闭包工厂
pub struct AnthropicCaller {
    client: reqwest::Client,
    api_key: String,
    base_url: String,
    model: String,
    tool_schemas: Vec<Value>,
    system_prompt: String,
}

impl AnthropicCaller {
    /// 从环境变量读取配置，从注册表提取工具定义
    ///
    /// 对照 TS 版：new Anthropic({ apiKey, baseURL })
    pub fn new(registry: &ToolRegistry) -> Result<Self, String> {
        let api_key = std::env::var("ANTHROPIC_API_KEY")
            .map_err(|_| "请设置 ANTHROPIC_API_KEY（.env 文件或环境变量）".to_string())?;
        let base_url = std::env::var("ANTHROPIC_BASE_URL")
            .unwrap_or_else(|_| "https://open.bigmodel.cn/api/anthropic".into());
        let model = std::env::var("ANTHROPIC_MODEL")
            .unwrap_or_else(|_| "glm-5.1".into());

        // 提取工具 schema——对照 TS 版 tools.map(t => ({ name, description, input_schema }))
        let tool_schemas: Vec<Value> = registry
            .all_tools()
            .iter()
            .map(|t| {
                json!({
                    "name": t.name(),
                    "description": t.description(),
                    "input_schema": t.input_schema()
                })
            })
            .collect();

        let tools = registry.all_tools();
        let tool_names: Vec<String> = tools.iter().map(|t| t.name().to_string()).collect();
        let system_prompt = format!(
            "你是一个代码分析助手，可以使用以下工具来帮助用户：{}。\n请用中文回复。",
            tool_names.join("、")
        );

        Ok(Self {
            client: reqwest::Client::new(),
            api_key,
            base_url,
            model,
            tool_schemas,
            system_prompt,
        })
    }

    pub fn model_name(&self) -> &str {
        &self.model
    }

    /// 将内部消息格式转换为 Anthropic API 格式
    ///
    /// 对照 TS 版：messages.map(m => ({ role, content }))
    fn convert_messages(&self, messages: &[ChatMessage]) -> Vec<Value> {
        messages
            .iter()
            .map(|msg| {
                let content: Vec<Value> = msg
                    .content
                    .iter()
                    .map(|block| match block {
                        ContentBlock::Text { text } => {
                            json!({"type": "text", "text": text})
                        }
                        ContentBlock::ToolUse { id, name, input } => {
                            json!({
                                "type": "tool_use",
                                "id": id,
                                "name": name,
                                "input": input
                            })
                        }
                        ContentBlock::ToolResult {
                            tool_use_id,
                            content,
                            ..
                        } => {
                            json!({
                                "type": "tool_result",
                                "tool_use_id": tool_use_id,
                                "content": content
                            })
                        }
                    })
                    .collect();
                json!({"role": msg.role, "content": content})
            })
            .collect()
    }
}

#[async_trait]
impl ModelCaller for AnthropicCaller {
    async fn call(&self, messages: &[ChatMessage]) -> Vec<ContentBlock> {
        let api_messages = self.convert_messages(messages);

        let body = json!({
            "model": self.model,
            "max_tokens": 4096,
            "system": self.system_prompt,
            "messages": api_messages,
            "tools": self.tool_schemas,
        });

        let url = format!("{}/v1/messages", self.base_url);

        // 发送请求——对照 TS 版 client.messages.create()
        let resp = match self
            .client
            .post(&url)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&body)
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                return vec![ContentBlock::Text {
                    text: format!("[API连接失败: {}]", e),
                }]
            }
        };

        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();

        let data: Value = match serde_json::from_str(&text) {
            Ok(d) => d,
            Err(_) => {
                return vec![ContentBlock::Text {
                    text: format!("[API响应解析失败: {}]", &text[..text.len().min(100)]),
                }]
            }
        };

        // 解析 content 数组
        let Some(content) = data["content"].as_array() else {
            return vec![ContentBlock::Text {
                text: format!(
                    "[API错误 {}: {}]",
                    status,
                    data["error"]["message"].as_str().unwrap_or("未知错误")
                ),
            }];
        };

        content
            .iter()
            .filter_map(|b| match b["type"].as_str() {
                Some("text") => Some(ContentBlock::Text {
                    text: b["text"].as_str().unwrap_or("").to_string(),
                }),
                Some("tool_use") => Some(ContentBlock::ToolUse {
                    id: b["id"].as_str().unwrap_or("").to_string(),
                    name: b["name"].as_str().unwrap_or("").to_string(),
                    input: b["input"].clone(),
                }),
                _ => None,
            })
            .collect::<Vec<_>>()
    }
}
