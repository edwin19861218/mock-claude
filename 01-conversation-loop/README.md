# 500行实现迷你 Claude Code（一）：对话循环

> 对应文章：[500行代码实现一个迷你 Claude Code（一）：对话循环](https://mp.weixin.qq.com)

## 快速开始

```bash
# 安装依赖
npm install

# 模拟模式（不需要 API Key）
npx tsx src/main.ts

# 单步模式（逐轮展示循环过程）
npx tsx src/main.ts --step

# 真实 API 调用（需要 ANTHROPIC_API_KEY）
ANTHROPIC_API_KEY=sk-xxx npx tsx src/main.ts --api
```

## 项目结构

```
src/
├── types.ts       # 核心类型定义（Message, ContentBlock, LoopState）
├── loop.ts        # Agent 对话循环核心（agentLoop async generator）
├── mock.ts        # 模拟模型调用 + 模拟工具
├── anthropic.ts   # 真实 Anthropic API 调用
├── main.ts        # 入口：三种运行模式
└── index.ts       # 统一导出
```

## 对照源码

| Demo 文件 | Claude Code 源码 | 对应关系 |
|-----------|------------------|----------|
| `loop.ts` | `src/query.ts` L241-1729 | while(true) 循环 + state 更新 |
| `types.ts` | `src/types/message.ts` | Message / ContentBlock 类型 |
| `mock.ts` | — | 模拟 callModel，不依赖 API |

## 核心设计

- **while(true) 循环**：和 Claude Code 源码相同的模式
- **AsyncGenerator**：yield 流式事件，实时输出
- **tool_use 判断**：无工具调用时退出循环
- **state = next**：状态更新模式，每轮构建新的 state 对象
