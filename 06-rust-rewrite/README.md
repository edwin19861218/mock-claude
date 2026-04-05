# 迷你Claude Code Rust版

500行代码实现迷你Claude Code的Rust重写版，系列总结篇配套demo。

## 前置要求

- Rust 1.70+（推荐 stable）
- 安装：`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

## 运行

### Mock 模式（默认）

```bash
cargo run
```

### Anthropic API 模式

```bash
# 1. 配置 API Key
cp .env.example .env
# 编辑 .env 填入 ANTHROPIC_API_KEY

# 2. 运行
cargo run -- --api
```

支持环境变量：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ANTHROPIC_API_KEY` | API密钥（必填） | - |
| `ANTHROPIC_BASE_URL` | API地址 | `https://open.bigmodel.cn/api/anthropic` |
| `ANTHROPIC_MODEL` | 模型名 | `glm-5.1` |

兼容 Anthropic 协议的 API（如智谱 BigModel）只需修改 `ANTHROPIC_BASE_URL`。

输出示例：

```
🔧 迷你Claude Code Rust版：真实工具调用

📋 工具风险等级:
  🟡 Write: moderate
  🟢 Read: safe
  🟢 Grep: safe
  🟢 Glob: safe

🚀 开始对话（Rust版工具调用链: Glob → Grep → Read → Write）

  💬 我先找一下项目里有哪些Rust文件。
  🔧 Glob({"path":".","pattern":"**/*.rs"})
  ✅ 权限: Glob → Allow
  📦 找到 14 个文件
  ...
```

## 运行测试

```bash
cargo test
```

29个测试覆盖：4个工具、权限管线、Token预算、工具注册表。

## 项目结构

```
src/
├── main.rs         # 入口：注册工具、创建权限管线、运行Agent循环（支持 --api）
├── lib.rs          # 库导出
├── types.rs        # 核心类型：ContentBlock、RiskLevel、StreamEvent、TokenBudget
├── model.rs        # ModelCaller trait：统一 Mock/Anthropic 调用接口
├── anthropic.rs    # Anthropic API 调用器：真实 Claude API
├── permission.rs   # 权限管线：enum+match穷举实现4关卡
├── loop_.rs        # Agent循环：mpsc channel事件流
├── mock.rs         # Mock模型：5轮工具调用链（Glob→Grep→Read→Write→总结）
└── tools/
    ├── mod.rs      # Tool trait + ToolRegistry
    ├── read.rs     # 读文件（带行号+分页）
    ├── write.rs    # 写文件（自动建目录+系统目录拦截）
    ├── grep.rs     # 正则搜索（递归+深度限制）
    └── glob.rs     # 模式匹配（glob crate）
```

## 对照TS版

本demo对照 `05-real-tools` 目录的TypeScript版，核心差异：

| TS版 | Rust版 |
|------|--------|
| interface Tool | trait Tool: Send + Sync |
| try-catch | Result<T, E> |
| if-else权限链 | enum + match穷举 |
| Promise.all | tokio::spawn |
| GC内存管理 | 所有权drop |
| AsyncGenerator | mpsc channel |

## 系列文章

本demo是「500行代码实现迷你Claude Code」系列第6篇的配套代码：

1. 200行对话循环
2. 权限管线
3. Token预算与上下文压缩
4. 会话持久化
5. 真实工具调用（TypeScript）
6. **Rust重写（本篇）**
