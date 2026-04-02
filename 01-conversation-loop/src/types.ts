/**
 * 核心类型定义
 * 对应文章「先定义类型」章节
 */

// 消息内容块 —— 一条消息可以混合文本和工具调用
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

// 消息
export interface Message {
  role: "user" | "assistant";
  content: ContentBlock[];
}

// 循环状态 —— 比源码精简很多，只保留核心字段
export interface LoopState {
  messages: Message[];
  turnCount: number;
}

// 循环终止原因
export interface Terminal {
  reason: string;
}

// 工具定义
export interface Tool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<string>;
}

// 流式事件
export type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  | { type: "turn_complete"; turn: number }
  | { type: "loop_complete"; reason: string };
