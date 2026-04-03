/**
 * 核心类型定义
 * 第二篇扩展：新增权限相关类型
 *
 * 对照 Claude Code 源码:
 *   - src/Tool.ts (793行): 工具定义、ToolDef、ToolUseContext
 *   - src/types/permissions.ts: PermissionMode、PermissionRule
 */

// ─── 基础类型（继承自第一篇）───

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface Message {
  role: "user" | "assistant";
  content: ContentBlock[];
}

export interface LoopState {
  messages: Message[];
  turnCount: number;
}

export interface Terminal {
  reason: string;
}

// ─── 工具定义（扩展版）───
// 对照源码 src/Tool.ts 的 Tool interface

export interface Tool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<string>;
  /** 新增：自定义权限检查（对照源码 tool.checkPermissions） */
  checkPermissions?: (input: Record<string, unknown>) => PermissionCheckResult;
  /** 新增：危险等级，决定默认权限策略 */
  riskLevel?: "safe" | "moderate" | "dangerous";
}

// ─── 权限类型（第二篇核心新增）───
// 对照源码 src/types/permissions.ts

/** 权限决策 */
export type PermissionDecision = "allow" | "deny" | "ask";

/** 权限检查结果 */
export interface PermissionCheckResult {
  decision: PermissionDecision;
  reason?: string;
}

/** 权限模式（对照源码 6 种精简到 3 种） */
export type PermissionMode = "auto" | "default" | "dontAsk";

/** 权限规则（对照源码 PermissionRule） */
export interface PermissionRule {
  /** 工具名或模式（如 "Bash", "Bash(rm *)"） */
  pattern: string;
  /** 决策 */
  decision: PermissionDecision;
  /** 来源 */
  source: "user" | "project" | "session";
}

// ─── 流式事件（扩展）───

export type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "permission_check"; tool: string; decision: PermissionDecision; reason?: string }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  | { type: "turn_complete"; turn: number }
  | { type: "loop_complete"; reason: string };
