/// Agent 循环
///
/// 对照 TS 版 loop.ts：async function* + while(true) + yield
/// Rust 版用 mpsc channel 发事件，效果一样但类型更安全

use crate::model::ModelCaller;
use crate::permission::PermissionGate;
use crate::tools::ToolRegistry;
use crate::types::{
    ContentBlock, LoopState, PermissionDecision, StreamEvent, TokenBudget,
};

pub async fn agent_loop(
    state: &mut LoopState,
    caller: &dyn ModelCaller,
    registry: &ToolRegistry,
    gate: &PermissionGate,
    budget: &TokenBudget,
    max_turns: usize,
    tx: &tokio::sync::mpsc::Sender<StreamEvent>,
) -> Result<String, String> {
    loop {
        if state.turn_count >= max_turns {
            tx.send(StreamEvent::LoopComplete {
                reason: "max_turns".into(),
            })
            .await
            .map_err(|e| e.to_string())?;
            return Ok("max_turns".into());
        }

        // Token 预算检查
        let used = TokenBudget::estimate(&state.messages);
        tx.send(StreamEvent::TokenBudget {
            used,
            max: budget.max_tokens,
            threshold: budget.compact_threshold,
        })
        .await
        .map_err(|e| e.to_string())?;

        // 1. 调用模型——对照 TS 版 callModel(messages)
        let blocks = caller.call(&state.messages).await;

        // 2. 发送文本和工具调用事件
        let mut tool_calls: Vec<ContentBlock> = Vec::new();
        for block in &blocks {
            match block {
                ContentBlock::Text { text } => {
                    tx.send(StreamEvent::TextDelta { text: text.clone() })
                        .await
                        .map_err(|e| e.to_string())?;
                }
                ContentBlock::ToolUse { id, name, input } => {
                    tx.send(StreamEvent::ToolUse {
                        id: id.clone(),
                        name: name.clone(),
                        input: input.clone(),
                    })
                    .await
                    .map_err(|e| e.to_string())?;
                    tool_calls.push(block.clone());
                }
                _ => {}
            }
        }

        // 3. 没有工具调用 → 结束
        if tool_calls.is_empty() {
            tx.send(StreamEvent::TurnComplete {
                turn: state.turn_count,
            })
            .await
            .map_err(|e| e.to_string())?;
            tx.send(StreamEvent::LoopComplete {
                reason: "completed".into(),
            })
            .await
            .map_err(|e| e.to_string())?;
            return Ok("completed".into());
        }

        // 4. 执行工具
        let mut results: Vec<ContentBlock> = Vec::new();
        for call in &tool_calls {
            if let ContentBlock::ToolUse { id, name, input } = call {
                if let Some(tool) = registry.get(name) {
                    // 权限检查
                    let perm = gate.check(tool.as_ref(), input);
                    let decision = perm.decision;
                    tx.send(StreamEvent::PermissionCheck {
                        tool: name.clone(),
                        decision,
                    })
                    .await
                    .map_err(|e| e.to_string())?;

                    match decision {
                        PermissionDecision::Deny => {
                            results.push(ContentBlock::ToolResult {
                                tool_use_id: id.clone(),
                                content: format!("权限拒绝: {}", perm.reason),
                                is_error: true,
                            });
                        }
                        _ => {
                            // 执行
                            let result = tool.execute(input.clone()).await;
                            match result {
                                Ok(content) => {
                                    results.push(ContentBlock::ToolResult {
                                        tool_use_id: id.clone(),
                                        content,
                                        is_error: false,
                                    });
                                }
                                Err(e) => {
                                    results.push(ContentBlock::ToolResult {
                                        tool_use_id: id.clone(),
                                        content: format!("错误: {}", e),
                                        is_error: true,
                                    });
                                }
                            }
                        }
                    }
                } else {
                    results.push(ContentBlock::ToolResult {
                        tool_use_id: id.clone(),
                        content: format!("未知工具: {}", name),
                        is_error: true,
                    });
                }
            }
        }

        // 发送工具结果事件
        for r in &results {
            if let ContentBlock::ToolResult {
                tool_use_id, content, ..
            } = r
            {
                tx.send(StreamEvent::ToolResult {
                    tool_use_id: tool_use_id.clone(),
                    content: content.clone(),
                })
                .await
                .map_err(|e| e.to_string())?;
            }
        }

        tx.send(StreamEvent::TurnComplete {
            turn: state.turn_count,
        })
        .await
        .map_err(|e| e.to_string())?;

        // 更新状态
        state.messages.push(crate::types::ChatMessage {
            role: "assistant".into(),
            content: blocks,
        });
        state.messages.push(crate::types::ChatMessage {
            role: "user".into(),
            content: results,
        });
        state.turn_count += 1;
    }
}
