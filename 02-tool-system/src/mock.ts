/**
 * Mock 模型调用（第二版：多场景演示权限管线）
 */

import type { Message, ContentBlock, Tool } from "./types.js";

let callCount = 0;

/** 场景 1: 安全工具自动放行 */
export async function mockCallModelSafe(_messages: Message[], _tools: Tool[]): Promise<ContentBlock[]> {
  callCount++;
  if (callCount === 1) {
    return [
      { type: "text", text: "我来搜索一下相关代码。" },
      { type: "tool_use", id: "call_001", name: "Grep", input: { pattern: "agentLoop" } },
    ];
  }
  return [{ type: "text", text: "找到了 agentLoop 的 3 处定义，主要在 src/loop.ts 中。" }];
}

/** 场景 2: 危险命令被拦截 */
export async function mockCallModelDanger(_messages: Message[], _tools: Tool[]): Promise<ContentBlock[]> {
  callCount++;
  if (callCount === 1) {
    return [
      { type: "text", text: "我来清理一下临时文件。" },
      { type: "tool_use", id: "call_002", name: "Bash", input: { command: "rm -rf /tmp/old-builds" } },
    ];
  }
  return [{ type: "text", text: "已清理完毕。" }];
}

/** 场景 3: 超危险命令被安全检查拦截 */
export async function mockCallModelNuclear(_messages: Message[], _tools: Tool[]): Promise<ContentBlock[]> {
  return [
    { type: "text", text: "我来清理一下系统..." },
    { type: "tool_use", id: "call_003", name: "Bash", input: { command: "rm -rf /" } },
  ];
}

/** 场景 4: 完整 3 轮对话（搜索 → 读取 → 总结） */
let fullCallCount = 0;
export async function mockCallModelFull(_messages: Message[], _tools: Tool[]): Promise<ContentBlock[]> {
  fullCallCount++;
  if (fullCallCount === 1) {
    return [
      { type: "text", text: "让我先搜一下相关文件。" },
      { type: "tool_use", id: "call_010", name: "Glob", input: { pattern: "**/*.ts" } },
    ];
  }
  if (fullCallCount === 2) {
    return [
      { type: "text", text: "找到了，看看 loop.ts 的内容。" },
      { type: "tool_use", id: "call_011", name: "Read", input: { path: "src/loop.ts" } },
    ];
  }
  return [
    { type: "text", text: "loop.ts 包含 agentLoop 函数，是 Agent 的核心循环。使用了 async function* 生成器模式。" },
  ];
}

/** 重置计数器 */
export function resetMockCounters() {
  callCount = 0;
  fullCallCount = 0;
}
