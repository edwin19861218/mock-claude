/**
 * 工具执行器（沿用第二篇，精简版）
 */

import type { Tool, ContentBlock, StreamEvent } from "./types.js";
import { ToolRegistry } from "./tools/registry.js";
import { PermissionGate } from "./permission.js";

export class ToolExecutor {
  constructor(
    private registry: ToolRegistry,
    private permission: PermissionGate,
  ) {}

  async executeCalls(
    calls: Extract<ContentBlock, { type: "tool_use" }>[],
  ): Promise<{ results: ContentBlock[]; events: StreamEvent[] }> {
    const results: ContentBlock[] = [];
    const events: StreamEvent[] = [];

    for (const call of calls) {
      const tool = this.registry.get(call.name);

      if (!tool) {
        results.push({ type: "tool_result", tool_use_id: call.id, content: `Unknown tool: ${call.name}`, is_error: true });
        events.push({ type: "tool_result", tool_use_id: call.id, content: `Error: unknown tool`, is_error: true });
        continue;
      }

      const perm = await this.permission.check(tool, call.input);
      events.push({ type: "permission_check", tool: tool.name, decision: perm.decision, reason: perm.reason });

      if (perm.decision === "deny") {
        results.push({ type: "tool_result", tool_use_id: call.id, content: `权限拒绝: ${perm.reason}`, is_error: true });
        events.push({ type: "tool_result", tool_use_id: call.id, content: `权限拒绝: ${perm.reason}`, is_error: true });
        continue;
      }

      try {
        const content = await tool.execute(call.input);
        results.push({ type: "tool_result", tool_use_id: call.id, content });
        events.push({ type: "tool_result", tool_use_id: call.id, content });
      } catch (err) {
        results.push({ type: "tool_result", tool_use_id: call.id, content: String(err), is_error: true });
        events.push({ type: "tool_result", tool_use_id: call.id, content: `Error: ${err}`, is_error: true });
      }
    }

    return { results, events };
  }
}
