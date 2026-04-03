/**
 * Agent 对话循环（第二版：集成工具注册表和权限管线）
 * 对照 Claude Code 源码 src/query.ts:
 *   - queryLoop (L241-1729): 1500 行
 *   - while(true) (L307): 相同循环结构
 *   - L1382: tool_use 处理入口 → toolOrchestration
 */

import type { Message, ContentBlock, LoopState, Terminal, StreamEvent, Tool } from "./types.js";
import { ToolExecutor } from "./executor.js";

export async function* agentLoop(
  state: LoopState,
  callModel: (messages: Message[], tools: Tool[]) => Promise<ContentBlock[]>,
  tools: Tool[],
  executor: ToolExecutor,
  options: { maxTurns?: number } = {},
): AsyncGenerator<StreamEvent, Terminal> {
  const maxTurns = options.maxTurns ?? 10;

  while (true) {
    const { messages, turnCount } = state;

    if (turnCount >= maxTurns) {
      return { reason: "max_turns" };
    }

    // 1. 调用模型
    const assistantContent = await callModel(messages, tools);
    for (const block of assistantContent) {
      if (block.type === "text") yield { type: "text_delta", text: block.text };
      else if (block.type === "tool_use") yield { type: "tool_use", id: block.id, name: block.name, input: block.input };
    }

    // 2. 收集 tool_use
    const toolCalls = assistantContent.filter(
      (b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use",
    );

    if (toolCalls.length === 0) {
      yield { type: "turn_complete", turn: turnCount };
      return { reason: "completed" };
    }

    // 3. 通过执行器执行工具（内含权限检查）
    const { results: toolResults, events } = await executor.executeCalls(toolCalls);
    for (const evt of events) {
      yield evt;
    }

    yield { type: "turn_complete", turn: turnCount };

    // 4. 回填结果，进入下一轮
    state = {
      messages: [
        ...messages,
        { role: "assistant", content: assistantContent },
        { role: "user", content: toolResults },
      ],
      turnCount: turnCount + 1,
    };
  }
}
