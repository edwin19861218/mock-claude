/**
 * 入口：演示上下文管理
 *   - 默认: Mock 模式，模拟 10 轮对话，观察 token 增长和自动压缩
 */

import type { LoopState, StreamEvent, Tool, TokenBudget } from "./types.js";
import { createTokenBudget, needsCompact } from "./token.js";
import { ToolRegistry } from "./tools/registry.js";
import { PermissionGate } from "./permission.js";
import { ToolExecutor } from "./executor.js";
import { agentLoop } from "./loop.js";
import { mockCallModel, mockTools, resetMockCounter } from "./mock.js";

const args = process.argv.slice(2);
const apiMode = args.includes("--api");

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
      const icon = evt.decision === "allow" ? "✅" : evt.decision === "deny" ? "🚫" : "❓";
      console.log(`  ${icon} 权限: ${evt.tool} → ${evt.decision}`);
      break;
    }
    case "tool_result":
      console.log(`  📦 ${evt.is_error ? "❌ " : ""}${(evt.content as string).slice(0, 60)}...`);
      break;
    case "token_budget": {
      const pct = Math.round((evt.used / evt.max) * 100);
      const bar = "█".repeat(Math.floor(pct / 5)) + "░".repeat(20 - Math.floor(pct / 5));
      const warn = evt.used > evt.threshold ? " ⚠️ 超阈值!" : "";
      console.log(`  📊 Token: [${bar}] ${pct}% (${evt.used}/${evt.max})${warn}`);
      break;
    }
    case "context_compact": {
      const savedPct = Math.round(((evt.beforeTokens - evt.afterTokens) / evt.beforeTokens) * 100);
      const icon = evt.method === "truncate" ? "✂️" : "📝";
      console.log(`  ${icon} 压缩: ${evt.beforeTokens} → ${evt.afterTokens} tokens (-${savedPct}%, ${evt.method})`);
      break;
    }
    case "turn_complete":
      console.log(`  --- 第 ${evt.turn + 1} 轮结束 ---`);
      break;
  }
}

// ─── 主入口 ───

async function main() {
  console.log("📊 第三篇 Demo：上下文管理\n");

  // 使用较小的 token 预算（加速触发压缩）
  const budget = createTokenBudget(2000, 0.25); // 2000 tokens, 25% buffer → 阈值 1500

  const registry = new ToolRegistry();
  registry.registerAll(mockTools);

  const permission = new PermissionGate("auto");
  permission.addRule({ pattern: "Grep", decision: "allow", source: "session" });
  permission.addRule({ pattern: "Read", decision: "allow", source: "session" });

  const executor = new ToolExecutor(registry, permission);
  const tools = registry.getAll();

  console.log(`🛠️  工具: ${registry.listNames().join(", ")}`);
  console.log(`📊 Token 预算: ${budget.maxTokens} (阈值: ${budget.compactThreshold})\n`);

  const initialState: LoopState = {
    messages: [{ role: "user", content: [{ type: "text", text: "分析一下整个项目的代码结构" }] }],
    turnCount: 0,
  };

  console.log("🚀 开始对话（模拟 10 轮，观察 token 增长和自动压缩）\n");
  console.log("=".repeat(60));

  for await (const evt of agentLoop(initialState, mockCallModel, tools, executor, budget, { maxTurns: 10 })) {
    printEvent(evt);
  }

  console.log("=".repeat(60));
  console.log("\n✅ 演示完毕！观察 token 增长和压缩事件。");
}

main().catch(console.error);
