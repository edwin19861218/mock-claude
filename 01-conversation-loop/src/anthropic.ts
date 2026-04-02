/**
 * 真实 API 调用
 * 支持 Anthropic 官方 API 或兼容接口（如智谱）
 *
 * 配置方式（二选一）：
 *   1. 项目根目录 .env 文件
 *   2. 环境变量 ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL
 */

import Anthropic from "@anthropic-ai/sdk"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { Message, ContentBlock, Tool } from "./types.js"

// 加载 .env 文件（不依赖 dotenv 库）
function loadEnv() {
  const envPath = resolve(process.cwd(), ".env")
  try {
    const content = readFileSync(envPath, "utf-8")
    for (const line of content.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eqIndex = trimmed.indexOf("=")
      if (eqIndex === -1) continue
      const key = trimmed.slice(0, eqIndex).trim()
      const value = trimmed.slice(eqIndex + 1).trim()
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  } catch {
    // .env 文件不存在，使用环境变量
  }
}

loadEnv()

export function createAnthropicCaller(model: string = "claude-sonnet-4-20250514") {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error("请设置 ANTHROPIC_API_KEY（环境变量或 .env 文件）")
  }

  const baseURL = process.env.ANTHROPIC_BASE_URL

  const client = new Anthropic({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  })

  console.log(`[API] 基地址: ${baseURL || "https://api.anthropic.com"}`)
  console.log(`[API] 模型: ${model}`)

  return async function callAnthropic(
    messages: Message[],
    tools: Tool[],
  ): Promise<ContentBlock[]> {
    const sdkMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content.map((block) => {
        if (block.type === "text") return { type: "text" as const, text: block.text }
        if (block.type === "tool_use") {
          return {
            type: "tool_use" as const,
            id: block.id,
            name: block.name,
            input: block.input,
          }
        }
        if (block.type === "tool_result") {
          return {
            type: "tool_result" as const,
            tool_use_id: block.tool_use_id,
            content: block.content,
            is_error: block.is_error,
          }
        }
        return block
      }),
    }))

    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      messages: sdkMessages as any[],
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as any,
      })),
    })

    return response.content.map((block): ContentBlock => {
      if (block.type === "text") {
        return { type: "text", text: block.text }
      }
      if (block.type === "tool_use") {
        return {
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        }
      }
      return { type: "text", text: JSON.stringify(block) }
    })
  }
}
