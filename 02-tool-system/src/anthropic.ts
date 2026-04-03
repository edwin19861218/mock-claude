/**
 * 真实 Anthropic API 调用（可选）
 * 支持智谱等 Anthropic 兼容 API
 */

import type { Message, ContentBlock, Tool } from "./types.js";

export async function createAnthropicCaller() {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.ANTHROPIC_BASE_URL,
  });

  return async function callModel(messages: Message[], tools: Tool[]): Promise<ContentBlock[]> {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: "你是一个代码分析助手。使用提供的工具来分析代码。用中文回复。",
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content as any,
      })),
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as any,
      })),
    });

    return (response.content as ContentBlock[]).filter(
      (b: any) => b.type === "text" || b.type === "tool_use",
    );
  };
}
