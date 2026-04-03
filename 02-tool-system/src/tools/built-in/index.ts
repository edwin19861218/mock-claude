/**
 * 5 个内置工具（精简版）
 * 对照 Claude Code 源码 src/tools/ 目录下的完整实现:
 *   - BashTool: src/tools/BashTool/
 *   - FileReadTool: src/tools/FileReadTool/
 *   - FileWriteTool: src/tools/FileWriteTool/
 *   - GrepTool: src/tools/GrepTool/
 *   - GlobTool: src/tools/GlobTool/
 *
 * 这里只保留核心结构和 mock 实现，重点演示权限检查
 */

import type { Tool, PermissionCheckResult } from "../../types.js";

/** Read: 安全的只读操作 */
export const readTool: Tool = {
  name: "Read",
  description: "读取文件内容",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "文件路径" },
    },
    required: ["path"],
  },
  riskLevel: "safe",
  execute: async (input) => {
    const path = input.path as string;
    return `// ${path}\nexport function main() { console.log("hello") }`;
  },
};

/** Write: 有风险的写入操作 */
export const writeTool: Tool = {
  name: "Write",
  description: "写入文件",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "文件路径" },
      content: { type: "string", description: "文件内容" },
    },
    required: ["path", "content"],
  },
  riskLevel: "moderate",
  checkPermissions: (input) => {
    const path = input.path as string;
    // 危险路径检查
    if (path.includes("/etc/") || path.includes("/system/")) {
      return { decision: "deny", reason: `禁止写入系统路径: ${path}` };
    }
    return { decision: "ask", reason: `确认写入 ${path}?` };
  },
  execute: async (input) => {
    const path = input.path as string;
    const content = input.content as string;
    return `已写入 ${path} (${content.length} 字节)`;
  },
};

/** Bash: 高风险，需要严格权限检查 */
export const bashTool: Tool = {
  name: "Bash",
  description: "执行 shell 命令",
  input_schema: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell 命令" },
    },
    required: ["command"],
  },
  riskLevel: "dangerous",
  checkPermissions: (input) => {
    const cmd = (input.command as string).trim();
    // 危险命令拦截（对照源码 src/tools/BashTool/ 的安全检查）
    const dangerousPatterns = ["rm -rf /", "rm -rf /*", "mkfs", "dd if=", ":(){ :|:& };:"];
    for (const pattern of dangerousPatterns) {
      if (cmd.includes(pattern)) {
        return { decision: "deny", reason: `危险命令被拦截: ${cmd}` };
      }
    }
    // 写入类命令需要确认
    const writePatterns = ["rm ", "rmdir", "mv ", "chmod", "chown", "> ", ">> "];
    for (const pattern of writePatterns) {
      if (cmd.includes(pattern)) {
        return { decision: "ask", reason: `写入类命令需确认: ${cmd}` };
      }
    }
    return { decision: "ask", reason: `确认执行: ${cmd}?` };
  },
  execute: async (input) => {
    const command = input.command as string;
    return `$ ${command}\n(模拟执行完成，退出码 0)`;
  },
};

/** Grep: 安全的搜索操作 */
export const grepTool: Tool = {
  name: "Grep",
  description: "搜索文件内容",
  input_schema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "搜索模式" },
      path: { type: "string", description: "搜索路径" },
    },
    required: ["pattern"],
  },
  riskLevel: "safe",
  execute: async (input) => {
    const pattern = input.pattern as string;
    return `找到 3 处匹配 "${pattern}":\n  src/types.ts:5\n  src/loop.ts:12\n  src/main.ts:8`;
  },
};

/** Glob: 安全的文件查找 */
export const globTool: Tool = {
  name: "Glob",
  description: "按模式查找文件",
  input_schema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Glob 模式" },
    },
    required: ["pattern"],
  },
  riskLevel: "safe",
  execute: async (input) => {
    const pattern = input.pattern as string;
    return `匹配 ${pattern}:\n  src/index.ts\n  src/utils.ts\n  src/main.ts`;
  },
};

/** 导出所有内置工具 */
export const builtInTools: Tool[] = [readTool, writeTool, bashTool, grepTool, globTool];
