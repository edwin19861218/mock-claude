/**
 * Mock 模式：演示真实工具调用流程
 *
 * 模拟 Agent 接收到用户请求后的完整工具调用链:
 *   1. Glob 查找文件
 *   2. Grep 搜索内容
 *   3. Read 读取文件
 *   4. Write 写入修改
 */

import type { Message, ContentBlock, Tool } from "./types.js";

let callCount = 0;

/** 模拟 5 轮工具调用链 */
export async function mockCallModel(
  _messages: Message[],
  _tools: Tool[],
): Promise<ContentBlock[]> {
  callCount++;

  // 如果是摘要请求
  if (_messages.length > 0) {
    const first = _messages[0];
    if (first.role === "system" && first.content[0]?.type === "text") {
      if (first.content[0].text.includes("摘要")) {
        return [{ type: "text", text: "对话摘要：Agent使用工具链分析了项目结构。" }];
      }
    }
  }

  // 模拟工具调用链：Glob → Grep → Read → Write → 总结
  if (callCount === 1) {
    return [
      { type: "text", text: "我先找一下项目里有哪些 TypeScript 文件。" },
      {
        type: "tool_use",
        id: "call_glob_001",
        name: "Glob",
        input: { pattern: "**/*.ts", path: "." },
      },
    ];
  }

  if (callCount === 2) {
    return [
      { type: "text", text: "找到了一些文件，我来搜索一下有没有 export function 的定义。" },
      {
        type: "tool_use",
        id: "call_grep_001",
        name: "Grep",
        input: { pattern: "export function", path: "." },
      },
    ];
  }

  if (callCount === 3) {
    return [
      { type: "text", text: "看到 types.ts 里有几个类型定义，我读取一下完整内容。" },
      {
        type: "tool_use",
        id: "call_read_001",
        name: "Read",
        input: { file_path: "src/types.ts" },
      },
    ];
  }

  if (callCount === 4) {
    return [
      { type: "text", text: "我注意到项目中缺少错误处理的示例，我来创建一个。" },
      {
        type: "tool_use",
        id: "call_write_001",
        name: "Write",
        input: {
          file_path: "/tmp/mock-claude-safe-loop.ts",
          content: "// 这是模拟写入的文件内容\nexport function safeLoop() {\n  try {\n    // loop logic\n  } catch (e) {\n    console.error(e);\n  }\n}\n",
        },
      },
    ];
  }

  // 第 5 轮：总结，结束循环
  return [
    {
      type: "text",
      text: `分析完毕。项目有多个 TypeScript 文件，我创建了一个带错误处理的示例文件。这次调用了 4 个工具：Glob（找文件）→ Grep（搜内容）→ Read（读文件）→ Write（写修改）。这就是 Claude Code 的真实工作流。`,
    },
  ];
}

/** 保存记忆的 mock（沿用） */
const saveMemoryTool: Tool = {
  name: "SaveMemory",
  description: "保存一条记忆",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      description: { type: "string" },
      type: { type: "string", enum: ["user", "feedback", "project", "reference"] },
      content: { type: "string" },
    },
    required: ["name", "description", "type", "content"],
  },
  riskLevel: "safe",
  execute: async (_input) => "记忆保存成功",
};

export const mockTools: Tool[] = [saveMemoryTool];

export function resetMockCounter() {
  callCount = 0;
}
