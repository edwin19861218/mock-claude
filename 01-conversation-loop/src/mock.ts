/**
 * 模拟模型调用 + 模拟工具
 * 用于不依赖 API Key 的纯本地 Demo
 */

import type { Message, ContentBlock, Tool } from "./types.js";

/**
 * 模拟模型：预设两轮对话
 *   - 第 1 轮：返回 tool_use（调 readFile）
 *   - 第 2 轮：返回纯文本（总结回答）
 *
 * 对应文章「跑起来看效果」章节
 */
let callCount = 0;

export async function mockCallModel(
  _messages: Message[],
  _tools: Tool[],
): Promise<ContentBlock[]> {
  callCount++;
  if (callCount === 1) {
    return [
      { type: "text", text: "让我看看这个文件的内容。" },
      {
        type: "tool_use",
        id: "call_001",
        name: "readFile",
        input: { path: "/src/index.ts" },
      },
    ];
  }
  return [
    {
      type: "text",
      text: "文件内容已读取。这是项目入口，导出了 main 函数，调用 greet 辅助函数打印欢迎信息。建议将 greet 函数提取到单独模块中。",
    },
  ];
}

/** 模拟 readFile 工具 */
export const readFileTool: Tool = {
  name: "readFile",
  description: "读取文件内容",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "文件路径" },
    },
    required: ["path"],
  },
  execute: async (input) => {
    const path = input.path as string;
    return [
      `// ${path}`,
      `import { greet } from "./utils"`,
      ``,
      `export function main() {`,
      `  const name = "World"`,
      `  console.log(greet(name))`,
      `}`,
    ].join("\n");
  },
};

/** 模拟 searchFiles 工具（第二轮 demo 用） */
export const searchFilesTool: Tool = {
  name: "searchFiles",
  description: "搜索文件",
  input_schema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "搜索模式" },
    },
    required: ["pattern"],
  },
  execute: async (input) => {
    return `找到 2 个匹配文件:\n- src/index.ts\n- src/utils.ts`;
  },
};
