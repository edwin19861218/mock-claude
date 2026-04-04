/**
 * 真实文件操作工具（对照 Claude Code 源码 src/tools/）
 *
 * 对照源码:
 *   - FileReadTool: src/tools/FileReadTool/ - 读取文件，支持行号、偏移
 *   - FileWriteTool: src/tools/FileWriteTool/ - 写入文件
 *   - GrepTool: src/tools/GrepTool/ - 搜索文件内容
 *   - GlobTool: src/tools/GlobTool/ - 按模式查找文件
 */

import fs from "node:fs";
import path from "node:path";
import type { Tool } from "../../types.js";

// ─── Read 工具（对照源码 FileReadTool）───

export const readTool: Tool = {
  name: "Read",
  description: "读取文件内容，返回带行号的文本",
  input_schema: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "文件的绝对路径" },
      offset: { type: "number", description: "起始行号（可选）" },
      limit: { type: "number", description: "最大行数（可选）" },
    },
    required: ["file_path"],
  },
  riskLevel: "safe",
  async execute(input) {
    const filePath = input.file_path as string;
    const offset = (input.offset as number) ?? 1;
    const limit = (input.limit as number) ?? 2000;

    if (!fs.existsSync(filePath)) {
      return `错误：文件不存在 ${filePath}`;
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    // 源码用 addLineNumbers() 添加行号前缀
    const selected = lines.slice(offset - 1, offset - 1 + limit);
    const numbered = selected.map((line, i) => `${offset + i}\t${line}`);

    return numbered.join("\n");
  },
};

// ─── Write 工具（对照源码 FileWriteTool）───

export const writeTool: Tool = {
  name: "Write",
  description: "写入文件内容",
  input_schema: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "文件的绝对路径" },
      content: { type: "string", description: "要写入的内容" },
    },
    required: ["file_path", "content"],
  },
  riskLevel: "moderate",
  checkPermissions(input) {
    // 对照源码的安全检查：阻止写入敏感路径
    const filePath = input.file_path as string;
    const blocked = ["/etc/", "/usr/", "/bin/", "/sbin/", "/dev/"];
    for (const prefix of blocked) {
      if (filePath.startsWith(prefix)) {
        return { decision: "deny", reason: `不允许写入系统目录 ${prefix}` };
      }
    }
    return { decision: "allow" };
  },
  async execute(input) {
    const filePath = input.file_path as string;
    const content = input.content as string;

    // 确保父目录存在
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, content, "utf-8");

    // 对照源码：返回行数和文件大小
    const lines = content.split("\n").length;
    const size = Buffer.byteLength(content, "utf-8");
    return `文件已写入: ${filePath} (${lines} 行, ${size} 字节)`;
  },
};

// ─── Grep 工具（对照源码 GrepTool，基于 ripgrep 简化）───

export const grepTool: Tool = {
  name: "Grep",
  description: "搜索文件内容（简化版，对照源码 ripgrep）",
  input_schema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "搜索的正则表达式" },
      path: { type: "string", description: "搜索目录（可选，默认当前目录）" },
    },
    required: ["pattern"],
  },
  riskLevel: "safe",
  async execute(input) {
    const pattern = input.pattern as string;
    const searchPath = (input.path as string) ?? ".";

    let regex: RegExp;
    try {
      regex = new RegExp(pattern, "i");
    } catch {
      return `错误：无效正则表达式 ${pattern}`;
    }

    const results: string[] = [];
    const maxResults = 50; // 对照源码 head_limit

    function searchDir(dir: string, depth: number = 0) {
      if (depth > 5 || results.length >= maxResults) return;

      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch { return; }

      // 对照源码：排除 VCS 目录
      const skipDirs = new Set([".git", "node_modules", ".svn", "__pycache__"]);

      for (const entry of entries) {
        if (results.length >= maxResults) break;
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!skipDirs.has(entry.name)) {
            searchDir(fullPath, depth + 1);
          }
        } else if (entry.isFile()) {
          try {
            const content = fs.readFileSync(fullPath, "utf-8");
            const lines = content.split("\n");
            for (let i = 0; i < lines.length && results.length < maxResults; i++) {
              if (regex.test(lines[i])) {
                const relPath = path.relative(searchPath, fullPath);
                results.push(`${relPath}:${i + 1}: ${lines[i].trim()}`);
              }
            }
          } catch { /* 跳过无法读取的文件 */ }
        }
      }
    }

    searchDir(path.resolve(searchPath));

    if (results.length === 0) {
      return `没有找到匹配 "${pattern}" 的内容`;
    }
    return results.join("\n");
  },
};

// ─── Glob 工具（对照源码 GlobTool）───

export const globTool: Tool = {
  name: "Glob",
  description: "按模式查找文件（对照源码 fast-glob）",
  input_schema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "glob 模式，如 **/*.ts" },
      path: { type: "string", description: "搜索目录（可选）" },
    },
    required: ["pattern"],
  },
  riskLevel: "safe",
  async execute(input) {
    const pattern = input.pattern as string;
    const searchPath = (input.path as string) ?? ".";

    // 简化版 glob：支持 **/*.ext 和 *.ext 模式
    const extMatch = pattern.match(/\*\*?\/?\*\.(\w+)$/);
    const nameMatch = pattern.match(/^\*\.(\w+)$/);

    let ext: string | null = null;
    let recursive = false;

    if (extMatch) {
      ext = extMatch[1];
      recursive = pattern.includes("**");
    } else if (nameMatch) {
      ext = nameMatch[1];
      recursive = false;
    }

    const results: string[] = [];
    const maxFiles = 100; // 对照源码默认 100 文件上限

    if (ext) {
      function findFiles(dir: string, depth: number = 0) {
        if (results.length >= maxFiles) return;
        let entries;
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch { return; }

        const skipDirs = new Set([".git", "node_modules", ".svn"]);

        for (const entry of entries) {
          if (results.length >= maxFiles) break;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory() && recursive && !skipDirs.has(entry.name)) {
            findFiles(fullPath, depth + 1);
          } else if (entry.isFile() && entry.name.endsWith(`.${ext}`)) {
            results.push(path.relative(path.resolve(searchPath), fullPath));
          }
        }
      }
      findFiles(path.resolve(searchPath));
    }

    if (results.length === 0) {
      return `没有找到匹配 "${pattern}" 的文件`;
    }

    const truncated = results.length >= maxFiles ? " (截断，超过 100 文件)" : "";
    return `找到 ${results.length} 个文件${truncated}:\n${results.join("\n")}`;
  },
};

export const realTools: Tool[] = [readTool, writeTool, grepTool, globTool];
