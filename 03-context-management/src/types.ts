/**
 * 核心类型定义（第三篇扩展：上下文管理）
 *
 * 对照 Claude Code 源码:
 *   - src/services/compact/compact.ts: CompactionResult
 *   - src/services/compact/autoCompact.ts: AutoCompactTrackingState
 */

// ─── 基础类型 ───

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface Message {
  role: "user" | "assistant" | "system";
  content: ContentBlock[];
}

export interface LoopState {
  messages: Message[];
  turnCount: number;
}

export interface Terminal {
  reason: string;
}

// ─── 工具类型（精简版，沿用第二篇）───

export type PermissionDecision = "allow" | "deny" | "ask";

export interface PermissionCheckResult {
  decision: PermissionDecision;
  reason?: string;
}

export type PermissionMode = "auto" | "default" | "dontAsk";

export interface Tool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<string>;
  checkPermissions?: (input: Record<string, unknown>) => PermissionCheckResult;
  riskLevel?: "safe" | "moderate" | "dangerous";
}

// ─── Token 预算（第三篇核心新增）───
// 对照源码 src/services/compact/autoCompact.ts L62-65

export interface TokenBudget {
  /** 估算的当前 token 数 */
  used: number;
  /** 上下文窗口大小 */
  maxTokens: number;
  /** 缓冲区（源码 AUTOCOMPACT_BUFFER_TOKENS = 13000） */
  bufferTokens: number;
  /** 触发压缩的阈值 */
  compactThreshold: number;
}

// ─── 流式事件（扩展）───

export type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "permission_check"; tool: string; decision: PermissionDecision; reason?: string }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  | { type: "turn_complete"; turn: number }
  | { type: "context_compact"; beforeTokens: number; afterTokens: number; method: "truncate" | "summary" }
  | { type: "token_budget"; used: number; max: number; threshold: number }
  | { type: "loop_complete"; reason: string };
