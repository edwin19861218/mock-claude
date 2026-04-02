/**
 * Mini Claude Code 缔示 — 对话循环
 *
 * 三种运行模式：
 *   npx tsx src/main.ts              # 模拟模式（不需要 API Key）
 *   npx tsx src/main.ts --api           # 真实 API 调用（需要 ANTHROPIC_API_KEY）
 *   npx tsx src/main.ts --step           # 单步模式，逐轮展示）
 */

import { agentLoop } from "./loop.js";
import type { LoopState, StreamEvent, Message, Tool } from "./types.js";
import { mockCallModel, readFileTool, searchFilesTool } from "./mock.js";
import { createAnthropicCaller } from "./anthropic.js";

// 解析命令行参数
const args = process.argv.slice(2);
const useApi = args.includes("--api");
const useStep = args.includes("--step");

// ============================================================
// 工具注册
// ============================================================
const tools: Tool[] = [readFileTool];

// ============================================================
// 模拟模式
// ============================================================
async function runMockDemo() {
  console.log("=== 模拟模式（mock callModel）===\n");

  const initialState: LoopState = {
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "帮我看看 /src/index.ts 这个文件" }],
      },
    ],
    turnCount: 0,
  };

  console.log("用户: 帮我看看 /src/index.ts 这个文件\n");

  const loop = agentLoop(initialState, mockCallModel, tools);

  for await (const event of loop) {
    printEvent(event);
  }

  console.log("=== 模拟完成 ===");
}

// ============================================================
// 稡拟模式（单步展示）
// ============================================================
async function runStepDemo() {
  console.log("=== 单步模式（逐轮展示）===\n");

  const initialState: LoopState = {
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "帮我看看 /src/index.ts 这个文件" }],
      },
    ],
    turnCount: 0,
  };

  console.log("用户: 帮我看看 /src/index.ts 这个文件\n");

  const loop = agentLoop(initialState, mockCallModel, tools);

  let turnCount = 0;
  for await (const event of loop) {
    if (event.type === "turn_complete") {
      turnCount = event.turn + 1;
      console.log(`\n--- 第 ${turnCount} 轮结束 ---\n`);
    } else if (event.type === "loop_complete") {
      console.log(`\n循环结束: ${event.reason}`);
    } else if (event.type === "text_delta") {
      console.log(`  [文本] ${event.text}`);
    } else if (event.type === "tool_use") {
      console.log(`  [工具调用] ${event.name}(${JSON.stringify(event.input)})`);
    } else if (event.type === "tool_result") {
      const prefix = event.is_error ? "❌" : "✅";
      console.log(`  ${prefix}[工具结果] ${event.content?.slice(0, 80)}...`);
    }
  }
}

// ============================================================
// 稡拟模式（真实 API 调用）
// ============================================================
async function runApiDemo() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("请设置 ANTHROPIC_API_KEY 环境变量");
    process.exit(1);
  }

  console.log("=== API 模式（真实 Anthropic 调用）===\n");

  const callAnthropic = createAnthropicCaller("claude-sonnet-4-20250514");

  const initialState: LoopState = {
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "帮我看看当前目录下有哪些 TypeScript 文件" }],
      },
    ],
    turnCount: 0,
  };

  console.log("用户: 帮我看看当前目录下有哪些 TypeScript 文件\n");

  const loop = agentLoop(initialState, callAnthropic, tools);

  for await (const event of loop) {
    if (event.type === "turn_complete") {
      console.log(`\n--- 第 ${event.turn + 1} 轮结束 ---\n`);
    } else if (event.type === "loop_complete") {
      console.log(`\n循环结束: ${event.reason}`);
    } else if (event.type === "text_delta") {
      process.stdout.write(event.text);
    } else if (event.type === "tool_use") {
      console.log(`\n  [工具调用] ${event.name}`);
    } else if (event.type === "tool_result") {
      const prefix = event.is_error ? "❌" : "✅";
      console.log(`  ${prefix}[工具结果]\n${event.content?.slice(0, 200)}`);
    }
  }
}

// ============================================================
// 工具函数
// ============================================================
function printEvent(event: StreamEvent) {
  switch (event.type) {
    case "text_delta":
      console.log(`  [文本] ${event.text}`);
      break;
    case "tool_use":
      console.log(`  [工具调用] ${event.name}(${JSON.stringify(event.input)})`);
      break;
    case "tool_result":
      const prefix = event.is_error ? "❌" : "✅";
      console.log(`  ${prefix}[工具结果] ${event.content.slice(0, 100)}...`);
      break;
    case "turn_complete":
      console.log(`  --- 第 ${event.turn + 1} 轮完成 ---`);
      break;
    case "loop_complete":
      console.log(`  循环结束: ${event.reason}`);
      break;
  }
}

// ============================================================
// 入口
// ============================================================
if (useApi) {
  runApiDemo();
} else if (useStep) {
  runStepDemo();
} else {
  runMockDemo();
}
