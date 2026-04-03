/**
 * Agent 对话循环（第三版：集成上下文管理）
 * 对照 Claude Code 源码 src/query.ts:
 *   - L365-458: 执行顺序 Snip → Microcompact → Context Collapse → AutoCompact
 *   - L282-288: autoCompactTracking
 */

import type { Message, ContentBlock, LoopState, Terminal, StreamEvent, Tool, TokenBudget } from "./types.js";
import { needsCompact, isOverThreshold } from "./token.js";
import { truncateMessages, compactWithSummary } from "./compact.js";
import type { ToolExecutor } from "./executor.js";

export async function* agentLoop(
  state: LoopState,
  callModel: (messages: Message[], tools: Tool[]) => Promise<ContentBlock[]>,
  tools: Tool[],
  executor: ToolExecutor,
  budget: TokenBudget,
  options: { maxTurns?: number } = {},
): AsyncGenerator<StreamEvent, Terminal> {
  const maxTurns = options.maxTurns ?? 10;

  while (true) {
    const { messages, turnCount } = state;

    if (turnCount >= maxTurns) {
      return { reason: "max_turns" };
    }

    // ── 上下文管理：检查 token 预算 ──
    // 对照源码 query.ts L365-458 的压缩链路
    const currentBudget = needsCompact(budget, messages);
    yield {
      type: "token_budget",
      used: currentBudget.used,
      max: currentBudget.maxTokens,
      threshold: currentBudget.compactThreshold,
    };

    if (isOverThreshold(currentBudget)) {
      // 先尝试截断（对照源码 Snip）
      const truncated = truncateMessages(messages, 4);
      if (truncated.tokensFreed > 0) {
        state = { ...state, messages: truncated.messages };
        const newBudget = needsCompact(budget, truncated.messages);
        yield {
          type: "context_compact",
          beforeTokens: currentBudget.used,
          afterTokens: newBudget.used,
          method: "truncate",
        };
      }

      // 截断后还超限 → 尝试摘要压缩（对照源码 AutoCompact）
      const recheckBudget = needsCompact(budget, state.messages);
      if (isOverThreshold(recheckBudget)) {
        try {
          const compacted = await compactWithSummary(state.messages, callModel);
          state = { ...state, messages: compacted.messages };
          const finalBudget = needsCompact(budget, compacted.messages);
          yield {
            type: "context_compact",
            beforeTokens: recheckBudget.used,
            afterTokens: finalBudget.used,
            method: "summary",
          };
        } catch {
          // 摘要失败就用截断结果继续（对照源码熔断器）
        }
      }
    }

    // 1. 调用模型
    const assistantContent = await callModel(state.messages, tools);
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

    // 3. 执行工具
    const { results: toolResults, events } = await executor.executeCalls(toolCalls);
    for (const evt of events) {
      yield evt;
    }

    yield { type: "turn_complete", turn: turnCount };

    // 4. 回填结果
    state = {
      messages: [
        ...state.messages,
        { role: "assistant", content: assistantContent },
        { role: "user", content: toolResults },
      ],
      turnCount: turnCount + 1,
    };
  }
}
