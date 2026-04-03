/**
 * 入口：演示记忆系统
 *   - 模拟 3 个会话，展示记忆的保存、加载和跨会话持久化
 */

import type { LoopState, StreamEvent, Tool, TokenBudget } from "./types.js";
import { createTokenBudget } from "./token.js";
import { ToolRegistry } from "./tools/registry.js";
import { PermissionGate } from "./permission.js";
import { ToolExecutor } from "./executor.js";
import { agentLoop } from "./loop.js";
import { mockCallModel, mockTools, setSession } from "./mock.js";
import { createMemoryConfig, ensureMemoryDir, loadMemories, clearMemories } from "./memory.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ─── 打印工具 ───

function printEvent(evt: StreamEvent) {
  switch (evt.type) {
    case "text_delta":
      console.log(`  💬 ${evt.text}`);
      break;
    case "tool_use":
      console.log(`  🔧 ${evt.name}(${JSON.stringify(evt.input)})`);
      break;
    case "permission_check": {
      const icon = evt.decision === "allow" ? "✅" : "🚫";
      console.log(`  ${icon} 权限: ${evt.tool} → ${evt.decision}`);
      break;
    }
    case "tool_result":
      console.log(`  📦 ${evt.is_error ? "❌ " : ""}${(evt.content as string).slice(0, 80)}`);
      break;
    case "token_budget": {
      const pct = Math.round((evt.used / evt.max) * 100);
      const bar = "█".repeat(Math.floor(pct / 5)) + "░".repeat(20 - Math.floor(pct / 5));
      console.log(`  📊 Token: [${bar}] ${pct}% (${evt.used}/${evt.max})`);
      break;
    }
    case "context_compact": {
      const savedPct = Math.round(((evt.beforeTokens - evt.afterTokens) / evt.beforeTokens) * 100);
      const icon = evt.method === "truncate" ? "✂️" : "📝";
      console.log(`  ${icon} 压缩: ${evt.beforeTokens} → ${evt.afterTokens} tokens (-${savedPct}%, ${evt.method})`);
      break;
    }
    case "memory_loaded":
      console.log(`  🧠 记忆已加载: ${evt.count} 条记忆 (类型: ${evt.types.join(", ")})`);
      break;
    case "memory_saved":
      console.log(`  💾 记忆已保存: ${evt.fileName} (${evt.type})`);
      break;
    case "turn_complete":
      console.log(`  --- 第 ${evt.turn + 1} 轮结束 ---`);
      break;
  }
}

// ─── 主入口 ───

async function main() {
  console.log("🧠 第四篇 Demo：记忆系统\n");

  // 使用临时目录作为记忆存储（对照源码 ~/.claude/projects/.../memory/）
  const memoryDir = path.join(os.tmpdir(), "mini-claude-memory-demo");
  const memConfig = createMemoryConfig(memoryDir);

  // 清理上次 demo 残留
  if (fs.existsSync(memConfig.memoryDir)) {
    clearMemories(memConfig);
  }

  const budget = createTokenBudget(2000, 0.25);
  const registry = new ToolRegistry();
  registry.registerAll(mockTools);

  const permission = new PermissionGate("auto");
  permission.addRule({ pattern: "SaveMemory", decision: "allow", source: "session" });
  permission.addRule({ pattern: "Grep", decision: "allow", source: "session" });

  const executor = new ToolExecutor(registry, permission);
  const tools = registry.getAll();

  console.log(`🛠️  工具: ${registry.listNames().join(", ")}`);
  console.log(`📁 记忆目录: ${memConfig.memoryDir}`);
  console.log("=".repeat(60));

  // ── 会话 1：保存用户信息 ──
  setSession(0);
  console.log("\n📡 会话 1：用户介绍自己");
  console.log("-".repeat(40));

  const state1: LoopState = {
    messages: [{ role: "user", content: [{ type: "text", text: "你好，我是一名前端开发者，正在学习 AI Agent 开发" }] }],
    turnCount: 0,
  };

  for await (const evt of agentLoop(state1, mockCallModel, tools, executor, budget, {
    maxTurns: 3,
    memoryConfig: memConfig,
  })) {
    printEvent(evt);
  }

  // 展示记忆文件
  console.log(`\n  📂 记忆目录内容:`);
  if (fs.existsSync(memConfig.memoryDir)) {
    for (const f of fs.readdirSync(memConfig.memoryDir)) {
      console.log(`     - ${f}`);
    }
  }

  // ── 会话 2：保存反馈 ──
  setSession(1);
  console.log("\n\n📡 会话 2：用户给出代码偏好");
  console.log("-".repeat(40));

  const state2: LoopState = {
    messages: [{ role: "user", content: [{ type: "text", text: "以后代码注释用中文，不要用 any 类型" }] }],
    turnCount: 0,
  };

  for await (const evt of agentLoop(state2, mockCallModel, tools, executor, budget, {
    maxTurns: 3,
    memoryConfig: memConfig,
  })) {
    printEvent(evt);
  }

  // 展示更新后的 MEMORY.md
  console.log(`\n  📋 MEMORY.md 索引:`);
  if (fs.existsSync(memConfig.indexPath)) {
    const indexContent = fs.readFileSync(memConfig.indexPath, "utf-8");
    for (const line of indexContent.split("\n").filter((l) => l.trim())) {
      console.log(`     ${line}`);
    }
  }

  // ── 会话 3：加载记忆 ──
  setSession(2);
  console.log("\n\n📡 会话 3：新会话（验证记忆持久化）");
  console.log("-".repeat(40));

  const state3: LoopState = {
    messages: [{ role: "user", content: [{ type: "text", text: "你好，帮我分析一下这个项目" }] }],
    turnCount: 0,
  };

  for await (const evt of agentLoop(state3, mockCallModel, tools, executor, budget, {
    maxTurns: 3,
    memoryConfig: memConfig,
  })) {
    printEvent(evt);
  }

  console.log("\n" + "=".repeat(60));
  console.log("\n✅ 演示完毕！观察记忆在 3 个会话间的保存和加载。");
  console.log(`📁 记忆文件保存在: ${memConfig.memoryDir}`);
}

main().catch(console.error);
