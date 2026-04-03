/**
 * 工具注册表
 * 对照 Claude Code 源码:
 *   - src/tools/ 目录下 45+ 工具
 *   - src/constants/tools.ts 的 getAllBaseTools()
 */

import type { Tool } from "../types.js";

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  /** 注册工具 */
  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  /** 批量注册 */
  registerAll(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /** 按名查找 */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /** 获取所有工具（传给模型用的列表） */
  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  /** 列出已注册工具名 */
  listNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /** 工具数量 */
  get size(): number {
    return this.tools.size;
  }
}
