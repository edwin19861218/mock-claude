/**
 * 核心类型定义（第四篇扩展：记忆系统）
 *
 * 对照 Claude Code 源码:
 *   - src/memdir/memoryTypes.ts: 4种记忆类型
 *   - src/memdir/paths.ts: 记忆路径解析
 *   - src/memdir/memdir.ts: 记忆提示构建
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

// ─── 工具类型 ───

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

// ─── Token 预算 ───

export interface TokenBudget {
  used: number;
  maxTokens: number;
  bufferTokens: number;
  compactThreshold: number;
}

// ─── 记忆类型（第四篇核心新增）───
// 对照源码 src/memdir/memoryTypes.ts

/** 记忆类型（对照源码 MemoryType） */
export type MemoryType = "user" | "feedback" | "project" | "reference";

/** 记忆条目（对照源码 YAML frontmatter 格式） */
export interface MemoryEntry {
  /** 文件名（不含路径） */
  fileName: string;
  /** 记忆名称（frontmatter name 字段） */
  name: string;
  /** 一行描述（frontmatter description 字段） */
  description: string;
  /** 记忆类型 */
  type: MemoryType;
  /** 记忆正文内容 */
  content: string;
}

/** 记忆目录配置 */
export interface MemoryConfig {
  /** 记忆文件目录路径 */
  memoryDir: string;
  /** MEMORY.md 索引文件路径 */
  indexPath: string;
  /** 索引最大行数（对照源码 200 行上限） */
  maxIndexLines: number;
}

// ─── 流式事件 ───

export type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "permission_check"; tool: string; decision: PermissionDecision; reason?: string }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  | { type: "turn_complete"; turn: number }
  | { type: "context_compact"; beforeTokens: number; afterTokens: number; method: "truncate" | "summary" }
  | { type: "token_budget"; used: number; max: number; threshold: number }
  | { type: "memory_loaded"; count: number; types: string[] }
  | { type: "memory_saved"; fileName: string; type: MemoryType }
  | { type: "loop_complete"; reason: string };
