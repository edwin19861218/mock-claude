/**
 * 记忆系统（对照 Claude Code 源码 src/memdir/）
 *
 * 核心设计:
 *   1. MEMORY.md 作为索引（对照 memdir.ts L272-316）
 *   2. 每条记忆一个 .md 文件，YAML frontmatter 格式
 *   3. 4 种类型: user / feedback / project / reference
 *   4. buildMemoryPrompt() 注入到系统提示
 */

import fs from "node:fs";
import path from "node:path";
import type { MemoryEntry, MemoryType, MemoryConfig, StreamEvent } from "./types.js";

// ─── 配置 ───

/** 创建默认记忆配置 */
export function createMemoryConfig(baseDir: string): MemoryConfig {
  const memoryDir = path.join(baseDir, ".memory");
  return {
    memoryDir,
    indexPath: path.join(memoryDir, "MEMORY.md"),
    maxIndexLines: 200, // 对照源码 truncateEntrypointContent() 行数上限
  };
}

/** 确保记忆目录存在（对照源码 memdir.ts L129-147 ensureMemoryDirExists） */
export function ensureMemoryDir(config: MemoryConfig): void {
  if (!fs.existsSync(config.memoryDir)) {
    fs.mkdirSync(config.memoryDir, { recursive: true });
  }
}

// ─── Frontmatter 解析（对照源码 frontmatterParser.ts）───

/** 从 markdown 文本解析 YAML frontmatter */
export function parseFrontmatter(text: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: text };
  }

  const yaml = match[1];
  const body = match[2];
  const frontmatter: Record<string, string> = {};

  for (const line of yaml.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value: string = line.slice(colonIdx + 1).trim();
    // 去掉引号
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

/** 将记忆条目序列化为 markdown + frontmatter */
export function serializeMemory(entry: MemoryEntry): string {
  return [
    "---",
    `name: ${entry.name}`,
    `description: ${entry.description}`,
    `type: ${entry.type}`,
    "---",
    "",
    entry.content,
    "",
  ].join("\n");
}

// ─── 记忆读写 ───

/** 保存一条记忆（对照源码通过 FileWriteTool 写入 .md 文件） */
export function saveMemory(config: MemoryConfig, entry: MemoryEntry): StreamEvent {
  ensureMemoryDir(config);

  // 1. 写入记忆文件
  const filePath = path.join(config.memoryDir, entry.fileName);
  fs.writeFileSync(filePath, serializeMemory(entry), "utf-8");

  // 2. 更新 MEMORY.md 索引（对照源码 memdir.ts 中的索引更新逻辑）
  updateIndex(config, entry);

  return { type: "memory_saved", fileName: entry.fileName, type: entry.type };
}

/** 更新 MEMORY.md 索引（对照源码: 索引格式 `- [Title](file.md) — hook`） */
function updateIndex(config: MemoryConfig, entry: MemoryEntry): void {
  let lines: string[] = [];

  if (fs.existsSync(config.indexPath)) {
    const content = fs.readFileSync(config.indexPath, "utf-8");
    lines = content.split("\n").filter((l) => l.trim().length > 0);
  }

  // 检查是否已存在同名的条目
  const indexLine = `- [${entry.name}](${entry.fileName}) — ${entry.description}`;
  const existingIdx = lines.findIndex((l) => l.includes(`(${entry.fileName})`));

  if (existingIdx >= 0) {
    lines[existingIdx] = indexLine;
  } else {
    lines.push(indexLine);
  }

  // 截断到最大行数（对照源码 truncateEntrypointContent()）
  if (lines.length > config.maxIndexLines) {
    lines = lines.slice(0, config.maxIndexLines);
  }

  fs.writeFileSync(config.indexPath, lines.join("\n") + "\n", "utf-8");
}

/** 加载所有记忆（对照源码 memdir.ts 中的 scanMemoryFiles） */
export function loadMemories(config: MemoryConfig): MemoryEntry[] {
  if (!fs.existsSync(config.memoryDir)) return [];

  const files = fs.readdirSync(config.memoryDir).filter((f) => f.endsWith(".md") && f !== "MEMORY.md");

  return files.map((fileName) => {
    const filePath = path.join(config.memoryDir, fileName);
    const raw = fs.readFileSync(filePath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(raw);

    return {
      fileName,
      name: frontmatter.name ?? fileName.replace(".md", ""),
      description: frontmatter.description ?? "",
      type: (frontmatter.type as MemoryType) ?? "project",
      content: body.trim(),
    };
  });
}

// ─── 记忆提示构建（对照源码 memdir.ts buildMemoryPrompt）───

/** 构建记忆提示文本，注入到系统消息 */
export function buildMemoryPrompt(memories: MemoryEntry[]): string {
  if (memories.length === 0) {
    return "";
  }

  const typeGroups = new Map<MemoryType, MemoryEntry[]>();
  for (const m of memories) {
    const list = typeGroups.get(m.type) ?? [];
    list.push(m);
    typeGroups.set(m.type, list);
  }

  const typeLabels: Record<MemoryType, string> = {
    user: "用户信息",
    feedback: "行为指导",
    project: "项目上下文",
    reference: "外部引用",
  };

  const sections: string[] = [
    "以下是你的持久化记忆，跨会话保留。在回复时参考:",
    "",
  ];

  for (const [type, entries] of typeGroups) {
    sections.push(`## ${typeLabels[type]}`);
    for (const entry of entries) {
      sections.push(`### ${entry.name}`);
      sections.push(entry.content);
      sections.push("");
    }
  }

  return sections.join("\n");
}

/** 清除所有记忆（测试用） */
export function clearMemories(config: MemoryConfig): void {
  if (fs.existsSync(config.memoryDir)) {
    const files = fs.readdirSync(config.memoryDir);
    for (const f of files) {
      fs.unlinkSync(path.join(config.memoryDir, f));
    }
    fs.rmdirSync(config.memoryDir);
  }
}
