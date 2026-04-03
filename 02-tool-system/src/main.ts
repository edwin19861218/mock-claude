/**
 * 入口：3 种模式演示工具系统和权限管线
 *   - 默认: Mock 模式（多场景演示权限关卡）
 *   - --step: 逐步执行（每步暂停）
 *   - --danger: 危险命令演示
 *   - --api: 真实 Anthropic API 调用
 */

import type { LoopState, PermissionMode, StreamEvent, Tool } from "./types.js";
import { ToolRegistry } from "./tools/registry.js";
import { builtInTools } from "./tools/built-in/index.js";
import { PermissionGate } from "./permission.js";
import { ToolExecutor } from "./executor.js";
import { agentLoop } from "./loop.js";
import {
  mockCallModelSafe,
  mockCallModelDanger,
  mockCallModelNuclear,
  mockCallModelFull,
  resetMockCounters,
} from "./mock.js";
import { createAnthropicCaller } from "./anthropic.js";

const args = process.argv.slice(2);
const stepMode = args.includes("--step");
const dangerMode = args.includes("--danger");
const apiMode = args.includes("--api");

// ─── 工具注册 ───

function setupRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.registerAll(builtInTools);
  return registry;
}

// ─── 事件打印 ───

function printEvent(evt: StreamEvent) {
  switch (evt.type) {
    case "text_delta":
      console.log(`  💬 ${evt.text}`);
      break;
    case "tool_use":
      console.log(`  🔧 调用工具: ${evt.name}`);
      console.log(`     参数: ${JSON.stringify(evt.input)}`);
      break;
    case "permission_check":
      const icon = evt.decision === "allow" ? "✅" : evt.decision === "deny" ? "🚫" : "❓";
      console.log(`  ${icon} 权限: ${evt.tool} → ${evt.decision}${evt.reason ? ` (${evt.reason})` : ""}`);
      break;
    case "tool_result":
      const rIcon = evt.is_error ? "❌" : "📦";
      console.log(`  ${rIcon} 结果: ${evt.content.slice(0, 100)}`);
      break;
    case "turn_complete":
      console.log(`  --- 第 ${evt.turn + 1} 轮结束 ---`);
      break;
  }
}

// ─── 运行场景 ───

async function runScenario(
  name: string,
  callModel: (messages: Message[], tools: Tool[]) => Promise<ContentBlock[]>,
  registry: ToolRegistry,
  mode: PermissionMode = "default",
) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📌 场景: ${name}`);
  console.log(`🔒 权限模式: ${mode}`);
  console.log(`${"=".repeat(60)}\n`);

  const permission = new PermissionGate(mode, async (tool, _input, reason) => {
    console.log(`  ⚠️  权限请求: ${reason}`);
    console.log(`  → 自动回复: 允许（Mock 模式）`);
    return true;
  });

  // 添加一条 always-allow 规则（演示关卡 1）
  permission.addRule({ pattern: "Read", decision: "allow", source: "session" });

  const executor = new ToolExecutor(registry, permission);
  const tools = registry.getAll();

  const initialState: LoopState = {
    messages: [{ role: "user", content: [{ type: "text", text: "分析一下项目结构" }] }],
    turnCount: 0,
  };

  for await (const evt of agentLoop(initialState, callModel, tools, executor)) {
    printEvent(evt);
    if (stepMode && evt.type === "turn_complete") {
      await new Promise<void>((r) => {
        process.stdin.once("data", () => r());
      });
    }
  }
}

// ─── 主入口 ───

async function main() {
  const registry = setupRegistry();
  console.log("🛠️  已注册工具:", registry.listNames().join(", "));

  if (apiMode) {
    // 真实 API 模式
    console.log("\n🌐 API 模式: 连接 Anthropic API...\n");
    const callModel = await createAnthropicCaller();
    await runScenario("真实 API 调用", callModel, registry);
    return;
  }

  // Mock 模式：4 个场景依次演示
  resetMockCounters();
  await runScenario("安全工具（Grep）→ 自动放行", mockCallModelSafe, registry, "default");

  resetMockCounters();
  await runScenario("危险命令（Bash rm）→ 需确认", mockCallModelDanger, registry, "default");

  if (dangerMode) {
    resetMockCounters();
    await runScenario("超危险命令（rm -rf /）→ 安全检查拦截", mockCallModelNuclear, registry, "default");
  }

  resetMockCounters();
  await runScenario("完整 3 轮对话（Glob → Read → 总结）", mockCallModelFull, registry, "auto");

  console.log(`\n${"=".repeat(60)}`);
  console.log("✅ 所有场景演示完毕！");
  console.log("试试: npm run demo:danger  npm run demo:step  npm run demo:anthropic");
  console.log(`${"=".repeat(60)}\n`);
}

main().catch(console.error);
