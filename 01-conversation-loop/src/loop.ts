/**
 * Agent 对话循环核心实现
 * 对应文章「核心循环：60 行搞定」章节
 *
 * 对照 Claude Code 源码 src/query.ts:
 *   - queryLoop (L241-1729): 1500 行，我们精简到 ~80 行
 *   - while(true) (L307): 相同的循环结构
 *   - needsFollowUp (L558): 相同的退出判断
 *   - state = next (L1715): 相同的状态更新模式
 */

import type { Message, ContentBlock, LoopState, Terminal, StreamEvent, Tool } from "./types.js";

export async function* agentLoop(
  state: LoopState,
  callModel: (messages: Message[], tools: Tool[]) => Promise<ContentBlock[]>,
  tools: Tool[],
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

    // 流式输出文本块
    for (const block of assistantContent) {
      if (block.type === "text") {
        yield { type: "text_delta", text: block.text };
      } else if (block.type === "tool_use") {
        yield { type: "tool_use", id: block.id, name: block.name, input: block.input };
      }
    }

    // 2. 收集 tool_use
    const toolCalls = assistantContent.filter(
      (b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use",
    );

    // 3. 没有 tool_use → 循环结束（对应源码 L1062: if (!needsFollowUp)）
    if (toolCalls.length === 0) {
      yield { type: "turn_complete", turn: turnCount };
      return { reason: "completed" };
    }

    // 4. 执行工具
    const toolResults: ContentBlock[] = [];
    for (const call of toolCalls) {
      const tool = tools.find((t) => t.name === call.name);
      if (!tool) {
        const errResult: ContentBlock = {
          type: "tool_result",
          tool_use_id: call.id,
          content: `Unknown tool: ${call.name}`,
          is_error: true,
        };
        toolResults.push(errResult);
        yield { type: "tool_result", tool_use_id: call.id, content: `Error: unknown tool`, is_error: true };
        continue;
      }
      try {
        const result = await tool.execute(call.input);
        const okResult: ContentBlock = {
          type: "tool_result",
          tool_use_id: call.id,
          content: result,
        };
        toolResults.push(okResult);
        yield { type: "tool_result", tool_use_id: call.id, content: result };
      } catch (err) {
        const errResult: ContentBlock = {
          type: "tool_result",
          tool_use_id: call.id,
          content: String(err),
          is_error: true,
        };
        toolResults.push(errResult);
        yield { type: "tool_result", tool_use_id: call.id, content: `Error: ${err}`, is_error: true };
      }
    }

    yield { type: "turn_complete", turn: turnCount };

    // 5. 回填结果，进入下一轮（对应源码 L1715: state = next）
    // 注意：tool_result 必须放在 role: "user" 消息里（Anthropic API 约定）
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
