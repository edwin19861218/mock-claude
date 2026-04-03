/**
 * 工具执行器
 * 对照 Claude Code 源码:
 *   - src/services/tools/toolOrchestration.ts: runTools() 协调
 *   - src/services/tools/toolExecution.ts: runToolUse() 单工具执行
 *   - checkPermissionsAndCallTool() (L599-890): 权限+执行
 *
 * 职责: 校验 → 权限检查 → 执行 → 结果处理
 */

import type { Tool, ContentBlock, StreamEvent, PermissionDecision } from "./types.js";
import { ToolRegistry } from "./tools/registry.js";
import { PermissionGate } from "./permission.js";

export interface ExecutorResult {
  /** 执行结果内容块 */
  results: ContentBlock[];
  /** 产出的事件流 */
  events: StreamEvent[];
}

export class ToolExecutor {
  constructor(
    private registry: ToolRegistry,
    private permission: PermissionGate,
  ) {}

  /**
   * 执行一组工具调用
   * 对照源码 toolOrchestration.ts 的 runTools()
   */
  async executeCalls(
    calls: Extract<ContentBlock, { type: "tool_use" }>[],
  ): Promise<ExecutorResult> {
    const results: ContentBlock[] = [];
    const events: StreamEvent[] = [];

    for (const call of calls) {
      const tool = this.registry.get(call.name);

      if (!tool) {
        const errResult: ContentBlock = {
          type: "tool_result",
          tool_use_id: call.id,
          content: `Unknown tool: ${call.name}`,
          is_error: true,
        };
        results.push(errResult);
        events.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: `Error: unknown tool ${call.name}`,
          is_error: true,
        });
        continue;
      }

      // 权限检查（对照源码 checkPermissionsAndCallTool L599）
      const permResult = await this.permission.check(tool, call.input);
      events.push({
        type: "permission_check",
        tool: tool.name,
        decision: permResult.decision,
        reason: permResult.reason,
      });

      if (permResult.decision === "deny") {
        const denyResult: ContentBlock = {
          type: "tool_result",
          tool_use_id: call.id,
          content: `权限拒绝: ${permResult.reason || "未授权"}`,
          is_error: true,
        };
        results.push(denyResult);
        events.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: `权限拒绝: ${permResult.reason || "未授权"}`,
          is_error: true,
        });
        continue;
      }

      // 执行工具（对照源码 tool.call()）
      try {
        const content = await tool.execute(call.input);
        const okResult: ContentBlock = {
          type: "tool_result",
          tool_use_id: call.id,
          content,
        };
        results.push(okResult);
        events.push({
          type: "tool_result",
          tool_use_id: call.id,
          content,
        });
      } catch (err) {
        const errResult: ContentBlock = {
          type: "tool_result",
          tool_use_id: call.id,
          content: String(err),
          is_error: true,
        };
        results.push(errResult);
        events.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: `Error: ${err}`,
          is_error: true,
        });
      }
    }

    return { results, events };
  }
}
