/// Mock 模型——模拟Agent的5轮决策
///
/// 对照 TS 版 mock.ts
/// 工具调用链: Glob → Grep → Read → Write → 总结

use async_trait::async_trait;
use serde_json::json;

use crate::model::ModelCaller;
use crate::types::{ChatMessage, ContentBlock};

/// Mock 调用器——实现 ModelCaller trait
///
/// 对照 TS 版：mock 模式直接按 turn 返回预设结果
pub struct MockCaller;

#[async_trait]
impl ModelCaller for MockCaller {
    async fn call(&self, messages: &[ChatMessage]) -> Vec<ContentBlock> {
        // 从消息数推算轮次：初始1条，每轮+2条
        let turn = (messages.len() + 1) / 2;
        mock_call_model(turn)
    }
}

pub fn mock_call_model(turn: usize) -> Vec<ContentBlock> {
    match turn {
        // 第1轮：Glob找文件
        1 => vec![
            ContentBlock::Text {
                text: "我先找一下项目里有哪些Rust文件。".into(),
            },
            ContentBlock::ToolUse {
                id: "call_glob_001".into(),
                name: "Glob".into(),
                input: json!({"pattern": "**/*.rs", "path": "."}),
            },
        ],
        // 第2轮：Grep搜函数定义
        2 => vec![
            ContentBlock::Text {
                text: "找到了一些文件，我来搜索函数定义。".into(),
            },
            ContentBlock::ToolUse {
                id: "call_grep_001".into(),
                name: "Grep".into(),
                input: json!({"pattern": "pub (fn|struct|enum)", "path": "."}),
            },
        ],
        // 第3轮：Read读文件
        3 => vec![
            ContentBlock::Text {
                text: "看到types.rs里有些类型定义，我读取一下。".into(),
            },
            ContentBlock::ToolUse {
                id: "call_read_001".into(),
                name: "Read".into(),
                input: json!({"file_path": "src/types.rs"}),
            },
        ],
        // 第4轮：Write写入
        4 => vec![
            ContentBlock::Text {
                text: "我给项目加一个输出示例文件。".into(),
            },
            ContentBlock::ToolUse {
                id: "call_write_001".into(),
                name: "Write".into(),
                input: json!({
                    "file_path": "/tmp/rust-agent-demo-output.txt",
                    "content": "# Rust Agent Demo Output\n\n这是Rust版Agent的输出示例。\n4个工具全部真实执行。\n\n工具调用链: Glob -> Grep -> Read -> Write\n"
                }),
            },
        ],
        // 第5轮：总结
        _ => vec![ContentBlock::Text {
            text: "分析完毕。调用了4个工具：Glob（找文件）→ Grep（搜内容）→ Read（读文件）→ Write（写输出）。这就是Rust版Agent的完整工作流。".into(),
        }],
    }
}
