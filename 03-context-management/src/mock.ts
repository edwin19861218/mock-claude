/**
 * Mock 模式：模拟多轮对话，演示 token 增长和自动压缩
 */

import type { Message, ContentBlock, Tool } from "./types.js";

let callCount = 0;

/**
 * 模拟 10 轮对话的模型响应
 * 每轮调用一个工具 + 生成一段文本，让 token 线性增长
 */
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
            text: `对话摘要：用户请求分析项目，共进行了 ${callCount} 轮交互，主要使用了 Grep 和 Read 工具分析代码结构。当前正在分析 loop.ts 文件。`,
          },
        ];
      }
    }
  }

  // 正常对话轮次：每轮都调用工具让 token 持续增长
  if (callCount >= 8) {
    // 第 8 轮起返回纯文本，结束循环
    return [
      { type: "text", text: `第 ${callCount} 轮分析结果：所有代码已完成分析，项目结构清晰，模块划分合理。` },
    ];
  }

  const toolName = callCount % 2 === 0 ? "Read" : "Grep";
  const toolInput = callCount % 2 === 0
    ? { path: `src/module${callCount}.ts` }
    : { pattern: `function.*${callCount}` };

  return [
    { type: "text", text: `第 ${callCount} 轮：我来${callCount % 2 === 0 ? "读取" : "搜索"}一下相关代码。` },
    { type: "tool_use", id: `call_${String(callCount).padStart(3, "0")}`, name: toolName, input: toolInput },
  ];
}

/** 工具 mock */
const grepTool: Tool = {
  name: "Grep",
  description: "搜索代码",
  input_schema: { type: "object", properties: { pattern: { type: "string" } }, required: ["pattern"] },
  riskLevel: "safe",
  execute: async (input) => `找到 5 处匹配 "${input.pattern}":\n  src/types.ts:3\n  src/loop.ts:12\n  src/main.ts:8\n  src/token.ts:15\n  src/compact.ts:22`,
};

const readTool: Tool = {
  name: "Read",
  description: "读取文件",
  input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  riskLevel: "safe",
  execute: async (input) => {
    const path = input.path as string;
    // 模拟一个较长的文件内容（加速 token 增长）
    const lines = Array.from({ length: 40 }, (_, i) => `export function handler${i}(param: string): number { return param.length + ${i}; }`);
    return `// ${path}\n// Auto-generated module file\n${lines.join("\n")}`;
  },
};

export const mockTools: Tool[] = [grepTool, readTool];

export function resetMockCounter() {
  callCount = 0;
}
