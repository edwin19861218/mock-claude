/**
 * Token 估算与预算管理
 * 对照 Claude Code 源码:
 *   - src/services/compact/autoCompact.ts L72-91: getAutoCompactThreshold()
 *   - 源码用 tiktoken 精确计数，我们用字符数/4 近似
 */

import type { Message, ContentBlock, TokenBudget } from "./types.js";

/** 估算消息的 token 数（1 token ≈ 4 字符） */
export function estimateTokens(messages: Message[]): number {
  let chars = 0;
  for (const msg of messages) {
    for (const block of msg.content) {
      chars += blockContentLength(block);
    }
    // role 和结构开销
    chars += 10;
  }
  return Math.ceil(chars / 4);
}

function blockContentLength(block: ContentBlock): number {
  switch (block.type) {
    case "text":
      return block.text.length;
    case "tool_use":
      return (block.name.length + JSON.stringify(block.input).length + block.id.length);
    case "tool_result":
      return block.content.length + block.tool_use_id.length;
  }
}

/** 创建 token 预算 */
export function createTokenBudget(
  maxTokens: number = 100000,
  bufferRatio: number = 0.13, // 源码 13000/100000
): TokenBudget {
  const bufferTokens = Math.ceil(maxTokens * bufferRatio);
  return {
    used: 0,
    maxTokens,
    bufferTokens,
    compactThreshold: maxTokens - bufferTokens,
  };
}

/** 检查是否需要压缩 */
export function needsCompact(budget: TokenBudget, messages: Message[]): TokenBudget {
  const used = estimateTokens(messages);
  return { ...budget, used, compactThreshold: budget.maxTokens - budget.bufferTokens };
}

/** 是否超过压缩阈值 */
export function isOverThreshold(budget: TokenBudget): boolean {
  return budget.used >= budget.compactThreshold;
}
