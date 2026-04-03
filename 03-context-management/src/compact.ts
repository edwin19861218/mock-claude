/**
 * 上下文压缩
 * 对照 Claude Code 源码:
 *   - src/services/compact/autoCompact.ts: autoCompactIfNeeded() (L241)
 *   - src/services/compact/compact.ts: compactConversation() (L387)
 *   - src/services/compact/microCompact.ts: 时间清理旧工具结果
 *
 * 精简版提供两种策略：
 *   1. truncate: 截断旧消息（对照源码的 Snip）
 *   2. summary: 用模型生成摘要（对照源码的 AutoCompact）
 */

import type { Message, ContentBlock } from "./types.js";
import { estimateTokens } from "./token.js";

/**
 * 截断策略：保留系统提示 + 最早消息 + 最近 N 条
 * 对照源码 snipCompactIfNeeded (query.ts L401)
 */
export function truncateMessages(
  messages: Message[],
  keepRecent: number = 6,
): { messages: Message[]; tokensFreed: number } {
  if (messages.length <= keepRecent + 1) {
    return { messages, tokensFreed: 0 };
  }

  const beforeTokens = estimateTokens(messages);

  // 分离系统消息
  const systemMsgs = messages.filter((m) => m.role === "system");
  const nonSystemMsgs = messages.filter((m) => m.role !== "system");

  // 保留第一条用户消息（上下文锚点）+ 最近 N 条
  const kept = [
    nonSystemMsgs[0],
    ...nonSystemMsgs.slice(-keepRecent),
  ].filter(Boolean);

  // 去重（第一条可能在 keepRecent 范围内）
  const seen = new Set<Message>();
  const unique = kept.filter((m) => {
    if (seen.has(m)) return false;
    seen.add(m);
    return true;
  });

  const result = [...systemMsgs, ...unique];
  const afterTokens = estimateTokens(result);

  return {
    messages: result,
    tokensFreed: beforeTokens - afterTokens,
  };
}

/**
 * 摘要策略：用 callModel 生成对话摘要，替换历史
 * 对照源码 compactConversation (compact.ts L387)
 *
 * 源码生成 SystemMessage + UserMessage 对（boundary marker + summary）
 * 我们简化为一条 system 消息 + 一条摘要消息
 */
export async function compactWithSummary(
  messages: Message[],
  callModel: (messages: Message[], tools?: any[]) => Promise<ContentBlock[]>,
): Promise<{ messages: Message[]; tokensFreed: number }> {
  const beforeTokens = estimateTokens(messages);

  // 把历史消息格式化给模型做摘要
  const historyText = messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      const role = m.role === "user" ? "用户" : "助手";
      const texts = m.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join(" ");
      const tools = m.content
        .filter((b) => b.type === "tool_use")
        .map((b) => `[调用 ${(b as any).name}]`)
        .join(" ");
      return `${role}: ${texts} ${tools}`;
    })
    .join("\n");

  // 调用模型生成摘要（对照源码 compact.ts 的 summary prompt）
  const summaryMessages: Message[] = [
    {
      role: "system",
      content: [{ type: "text", text: "你是对话摘要助手。把下面的对话历史压缩成一段简洁的摘要，保留关键信息、决策和当前状态。" }],
    },
    {
      role: "user",
      content: [{ type: "text", text: `请摘要以下对话：\n\n${historyText}` }],
    },
  ];

  const summaryContent = await callModel(summaryMessages);
  const summaryText = summaryContent
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("\n");

  // 用摘要替换历史（对照源码的 CompactionResult.summaryMessages）
  const systemMsgs = messages.filter((m) => m.role === "system");
  const result: Message[] = [
    ...systemMsgs,
    {
      role: "user",
      content: [
        { type: "text", text: `[上下文摘要] 以下是之前对话的压缩摘要：\n${summaryText}` },
      ],
    },
    // 保留最近 2 条消息作为衔接
    ...messages.slice(-2),
  ];

  const afterTokens = estimateTokens(result);
  return {
    messages: result,
    tokensFreed: beforeTokens - afterTokens,
  };
}
