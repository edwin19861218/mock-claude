/// 核心类型定义
///
/// 对照 TS 版 types.ts，观察 Rust 的 enum 如何替代 union type + if-else

// ─── 消息类型 ───

#[derive(Debug, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: Vec<ContentBlock>,
}

#[derive(Debug, Clone)]
pub enum ContentBlock {
    Text { text: String },
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
    ToolResult {
        tool_use_id: String,
        content: String,
        is_error: bool,
    },
}

// ─── 循环状态 ───

#[derive(Debug)]
pub struct LoopState {
    pub messages: Vec<ChatMessage>,
    pub turn_count: usize,
}

// ─── 风险等级：enum + match 保证穷举 ───
// 对照 TS 版的 type RiskLevel = "safe" | "moderate" | "dangerous"

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RiskLevel {
    Safe,
    Moderate,
    Dangerous,
}

impl std::fmt::Display for RiskLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RiskLevel::Safe => write!(f, "safe"),
            RiskLevel::Moderate => write!(f, "moderate"),
            RiskLevel::Dangerous => write!(f, "dangerous"),
        }
    }
}

// ─── 权限决策 ───

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PermissionDecision {
    Allow,
    Deny,
    Ask,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PermissionMode {
    Auto,
    Default,
    DontAsk,
}

// ─── 流式事件：enum 替代 TS 的 union type ───

#[derive(Debug, Clone)]
pub enum StreamEvent {
    TextDelta { text: String },
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
    PermissionCheck {
        tool: String,
        decision: PermissionDecision,
    },
    ToolResult {
        tool_use_id: String,
        content: String,
    },
    TurnComplete { turn: usize },
    TokenBudget {
        used: usize,
        max: usize,
        threshold: usize,
    },
    LoopComplete { reason: String },
}

// ─── Token 预算 ───

#[derive(Debug, Clone)]
pub struct TokenBudget {
    pub max_tokens: usize,
    pub buffer_ratio: f64,
    pub compact_threshold: usize,
}

impl TokenBudget {
    pub fn new(max_tokens: usize, buffer_ratio: f64) -> Self {
        let buffer = (max_tokens as f64 * buffer_ratio) as usize;
        Self {
            max_tokens,
            buffer_ratio,
            compact_threshold: max_tokens - buffer,
        }
    }

    pub fn estimate(messages: &[ChatMessage]) -> usize {
        let mut chars = 0;
        for msg in messages {
            for block in &msg.content {
                chars += block_content_length(block);
            }
            chars += 10; // role + 结构开销
        }
        (chars + 3) / 4 // 向上取整
    }

    pub fn is_over_threshold(&self, used: usize) -> bool {
        used >= self.compact_threshold
    }
}

fn block_content_length(block: &ContentBlock) -> usize {
    match block {
        ContentBlock::Text { text } => text.len(),
        ContentBlock::ToolUse { id, name, input } => {
            name.len() + id.len() + input.to_string().len()
        }
        ContentBlock::ToolResult {
            tool_use_id,
            content,
            ..
        } => tool_use_id.len() + content.len(),
    }
}

// ─── 工具错误类型 ───
// 对照 TS 版的 try-catch：Rust 用 Result<T, E> 强制处理

#[derive(Debug)]
pub struct ToolError(pub String);

impl std::fmt::Display for ToolError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for ToolError {}
