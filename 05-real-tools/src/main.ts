/**
 * 入口：演示真实工具调用
 *   - 模拟 Agent 使用 Glob → Grep → Read → Write 工具链
 *   - 展示工具注册、权限检查、结果格式化
 */

import type { LoopState, StreamEvent } from "./types.js";
import { createTokenBudget } from "./token.js";
import { ToolRegistry } from "./tools/registry.js";
import { PermissionGate } from "./permission.js";
import { ToolExecutor } from "./executor.js";
import { agentLoop } from "./loop.js";
import { mockCallModel, mockTools } from "./mock.js";
import { realTools } from "./tools/built-in/index.js";

// ─── 打印工具 ───

function printEvent(evt: StreamEvent) {
  switch (evt.type) {
    case "text_delta":
      console.log(`  💬 ${evt.text}`);
      break;
    case "tool_use":
      console.log(`  🔧 ${evt.name}(${JSON.stringify(evt.input).slice(0, 80)})`);
      break;
    case "permission_check": {
      const icon = evt.decision === "allow" ? "✅" : "🚫";
      console.log(`  ${icon} 权限: ${evt.tool} → ${evt.decision}`);
      break;
    }
    case "tool_result":
      console.log(`  📦 ${evt.is_error ? "❌ " : ""}${(evt.content as string).slice(0, 100)}`);
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
      console.log(`  ${icon} 压缩: ${evt.beforeTokens} → ${evt.afterTokens} tokens (-${savedPct}%)`);
      break;
    }
    case "memory_loaded":
      console.log(`  🧠 记忆已加载: ${evt.count} 条 (类型: ${evt.types.join(", ")})`);
      break;
    case "memory_saved":
      console.log(`  💾 记忆已保存: ${evt.fileName} (${evt.type})`);
      break;
    case "turn_complete":
      console.log(`  --- 第 ${evt.turn + 1} 轮结束 ---\n`);
      break;
  }
}

// ─── 主入口 ───

async function main() {
  console.log("🔧 第五篇 Demo：真实工具调用\n");

  const budget = createTokenBudget(10000, 0.13);

  // 注册真实工具 + mock 工具
  const registry = new ToolRegistry();
  registry.registerAll([...realTools, ...mockTools]);

  // 权限配置
  const permission = new PermissionGate("auto");
  permission.addRule({ pattern: "Read", decision: "allow", source: "session" });
  permission.addRule({ pattern: "Grep", decision: "allow", source: "session" });
  permission.addRule({ pattern: "Glob", decision: "allow", source: "session" });
  permission.addRule({ pattern: "Write", decision: "allow", source: "session" });
  permission.addRule({ pattern: "SaveMemory", decision: "allow", source: "session" });

  const executor = new ToolExecutor(registry, permission);
  const tools = registry.getAll();

  console.log(`🛠️  工具: ${registry.listNames().join(", ")}`);
  console.log(`📊 工具数量: ${registry.listNames().length}`);

  // 展示工具风险等级
  console.log("\n📋 工具风险等级:");
  for (const tool of tools) {
    const risk = tool.riskLevel ?? "unknown";
    const icon = risk === "safe" ? "🟢" : risk === "moderate" ? "🟡" : "🔴";
    console.log(`  ${icon} ${tool.name}: ${risk}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("🚀 开始对话（模拟工具调用链: Glob → Grep → Read → Write）\n");

  const initialState: LoopState = {
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "帮我分析项目的 TypeScript 文件，创建一个带错误处理的示例" }],
      },
    ],
    turnCount: 0,
  };

  for await (const evt of agentLoop(initialState, mockCallModel, tools, executor, budget, {
    maxTurns: 10,
  })) {
    printEvent(evt);
  }

  console.log("=".repeat(60));
  console.log("\n✅ 演示完毕！观察真实工具的调用链和结果。");
}

main().catch(console.error);
