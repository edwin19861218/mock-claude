/**
 * Agent 对话循环（第四版：集成记忆系统）
 *
 * 新增:
 *   - 启动时加载记忆，注入系统消息
 *   - 工具调用支持 SaveMemory
 *   - yield memory_loaded / memory_saved 事件
 */

import type { Message, ContentBlock, LoopState, StreamEvent, Tool, TokenBudget, MemoryConfig, MemoryEntry } from "./types.js";
import { needsCompact, isOverThreshold } from "./token.js";
import { truncateMessages, compactWithSummary } from "./compact.js";
import { loadMemories, buildMemoryPrompt, saveMemory } from "./memory.js";
import type { ToolExecutor } from "./executor.js";

export interface LoopOptions {
  maxTurns?: number;
  memoryConfig?: MemoryConfig;
}

export async function* agentLoop(
  state: LoopState,
  callModel: (messages: Message[], tools: Tool[]) => Promise<ContentBlock[]>,
  tools: Tool[],
  executor: ToolExecutor,
  budget: TokenBudget,
  options: LoopOptions = {},
): AsyncGenerator<StreamEvent, { reason: string }> {
  const maxTurns = options.maxTurns ?? 10;

  // ── 记忆加载（对照源码 loadMemoryPrompt）──
  if (options.memoryConfig) {
    const memories = loadMemories(options.memoryConfig);
    const types = [...new Set(memories.map((m) => m.type))];
    yield { type: "memory_loaded", count: memories.length, types };

    const memoryPrompt = buildMemoryPrompt(memories);
    if (memoryPrompt) {
      // 将记忆注入到系统消息中（对照源码 memdir.ts buildMemoryPrompt）
      const systemMsg: Message = {
        role: "system",
        content: [{ type: "text", text: memoryPrompt }],
      };
      // 在现有系统消息之后插入记忆
      const hasSystem = state.messages[0]?.role === "system";
      if (hasSystem) {
        state = {
          ...state,
          messages: [
            state.messages[0],
            systemMsg,
            ...state.messages.slice(1),
          ],
        };
      } else {
        state = {
          ...state,
          messages: [systemMsg, ...state.messages],
        };
      }
    }
  }

  while (true) {
    const { messages, turnCount } = state;

    if (turnCount >= maxTurns) {
      return { reason: "max_turns" };
    }

    // ── 上下文管理 ──
    const currentBudget = needsCompact(budget, messages);
    yield {
      type: "token_budget",
      used: currentBudget.used,
      max: currentBudget.maxTokens,
      threshold: currentBudget.compactThreshold,
    };

    if (isOverThreshold(currentBudget)) {
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
          // 摘要失败就用截断结果继续
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

    // 3. 拦截 SaveMemory 工具调用 → 走记忆系统保存
    const memoryCalls = toolCalls.filter((c) => c.name === "SaveMemory");
    const otherCalls = toolCalls.filter((c) => c.name !== "SaveMemory");

    // 保存记忆
    const memoryResults: ContentBlock[] = [];
    for (const call of memoryCalls) {
      if (options.memoryConfig) {
        const input = call.input;
        const entry: MemoryEntry = {
          fileName: `${input.name as string}.md`,
          name: input.name as string,
          description: input.description as string,
          type: input.type as MemoryEntry["type"],
          content: input.content as string,
        };
        const evt = saveMemory(options.memoryConfig, entry);
        yield evt;
        memoryResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: `记忆已保存: ${entry.fileName}`,
        });
      }
    }

    // 执行其他工具
    const { results: toolResults, events } = await executor.executeCalls(otherCalls);
    for (const evt of events) {
      yield evt;
    }

    yield { type: "turn_complete", turn: turnCount };

    // 4. 回填结果
    state = {
      messages: [
        ...state.messages,
        { role: "assistant", content: assistantContent },
        { role: "user", content: [...memoryResults, ...toolResults] },
      ],
      turnCount: turnCount + 1,
    };
  }
}
