/**
 * Mock 模式：演示记忆系统的保存、加载和跨会话持久化
 *
 * 模拟场景:
 *   - 会话 1: 用户介绍自己 → Agent 保存 user 记忆
 *   - 会话 2: 用户给反馈 → Agent 保存 feedback 记忆
 *   - 会话 3: 新会话加载记忆 → Agent 记住了之前的对话
 */

import type { Message, ContentBlock, Tool } from "./types.js";

let callCount = 0;
let session = 0;

/** 模拟 3 个会话的模型响应 */
export async function mockCallModel(
  _messages: Message[],
  _tools: Tool[],
): Promise<ContentBlock[]> {
  callCount++;

  // 如果是摘要请求（系统提示含"摘要"），直接返回摘要
  if (_messages.length > 0) {
    const first = _messages[0];
    if (first.role === "system" && first.content[0]?.type === "text") {
      const text = first.content[0].text;
      if (text.includes("摘要")) {
        return [
          {
            type: "text",
            text: `对话摘要：用户请求分析项目，共进行了 ${callCount} 轮交互。`,
          },
        ];
      }
    }
  }

  // 会话 1: 保存 user 类型记忆
  if (session === 0) {
    if (callCount === 1) {
      return [
        { type: "text", text: "好的，我记下你的信息。" },
        {
          type: "tool_use",
          id: "call_save_001",
          name: "SaveMemory",
          input: {
            name: "user_profile",
            description: "用户的基本信息和技术背景",
            type: "user",
            content: "用户是一名前端开发者，精通 React 和 TypeScript，正在学习 AI Agent 开发。偏好简洁的代码风格，喜欢有实际例子的解释方式。",
          },
        },
      ];
    }
    return [{ type: "text", text: "已记住你的信息，下次对话我会参考这些。" }];
  }

  // 会话 2: 保存 feedback 类型记忆
  if (session === 1) {
    if (callCount === 1) {
      return [
        { type: "text", text: "明白了，我记住这个偏好了。" },
        {
          type: "tool_use",
          id: "call_save_002",
          name: "SaveMemory",
          input: {
            name: "code_review_feedback",
            description: "用户对代码风格的要求",
            type: "feedback",
            content: "用户要求代码注释使用中文。代码示例必须有完整的 TypeScript 类型。不要使用 any 类型。Why: 用户认为中文注释降低阅读门槛。How to apply: 所有新增代码的注释都用中文。",
          },
        },
      ];
    }
    return [{ type: "text", text: "已保存你的代码偏好，后续会遵守。" }];
  }

  // 会话 3: 展示记忆加载效果
  if (callCount === 1) {
    const systemMsg = _messages.find((m) => m.role === "system");
    const hasMemory = systemMsg?.content.some(
      (b) => b.type === "text" && b.text.includes("持久化记忆"),
    );

    if (hasMemory) {
      return [
        {
          type: "text",
          text: "我记得你！你是一名前端开发者，精通 React 和 TypeScript。你要求代码注释用中文，而且不允许用 any 类型。有什么我可以帮你的？",
        },
      ];
    }
    return [{ type: "text", text: "你好，有什么可以帮你的？" }];
  }

  return [{ type: "text", text: `第 ${callCount} 轮分析结果：所有分析已完成。` }];
}

/** 设置当前会话编号 */
export function setSession(n: number) {
  session = n;
  callCount = 0;
}

/** 工具 mock: SaveMemory */
const saveMemoryTool: Tool = {
  name: "SaveMemory",
  description: "保存一条记忆到持久化存储",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "记忆名称" },
      description: { type: "string", description: "一行描述" },
      type: { type: "string", enum: ["user", "feedback", "project", "reference"] },
      content: { type: "string", description: "记忆内容" },
    },
    required: ["name", "description", "type", "content"],
  },
  riskLevel: "safe",
  execute: async (_input) => "记忆保存成功",
};

/** 工具 mock: Grep（沿用） */
const grepTool: Tool = {
  name: "Grep",
  description: "搜索代码",
  input_schema: { type: "object", properties: { pattern: { type: "string" } }, required: ["pattern"] },
  riskLevel: "safe",
  execute: async (input) => `找到 3 处匹配 "${input.pattern}"`,
};

export const mockTools: Tool[] = [saveMemoryTool, grepTool];

export function resetMockCounter() {
  callCount = 0;
}
