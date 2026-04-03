/**
 * 权限管线
 * 对照 Claude Code 源码 src/utils/permissions/permissions.ts:
 *   - hasPermissionsToUseTool() (L473-956): 主权限检查，10 步
 *   - hasPermissionsToUseToolInner() (L1158-1319): 内层检查
 *
 * 我们精简到 4 关卡:
 *   1. 规则匹配（源码第 1、8 步）
 *   2. 工具自定义检查（源码第 3 步）
 *   3. 安全检查（源码第 6 步）
 *   4. 用户确认 / 模式决策（源码第 4、10 步）
 */

import type { Tool, PermissionDecision, PermissionRule, PermissionCheckResult, PermissionMode } from "./types.js";

/** 规则匹配：检查 pattern 是否匹配工具调用 */
function matchPattern(pattern: string, toolName: string, input: Record<string, unknown>): boolean {
  // 精确匹配
  if (pattern === toolName) return true;
  // 前缀匹配: "Bash(rm" 匹配 Bash 工具且命令含 rm
  const match = pattern.match(/^(\w+)\((.+)\)$/);
  if (match) {
    const [, pTool, pContent] = match;
    if (pTool !== toolName) return false;
    return JSON.stringify(input).includes(pContent);
  }
  return false;
}

export class PermissionGate {
  private rules: PermissionRule[] = [];
  private mode: PermissionMode;
  private onAsk?: (tool: Tool, input: Record<string, unknown>, reason: string) => Promise<boolean>;

  constructor(
    mode: PermissionMode = "default",
    onAsk?: (tool: Tool, input: Record<string, unknown>, reason: string) => Promise<boolean>,
  ) {
    this.mode = mode;
    this.onAsk = onAsk;
  }

  /** 添加规则 */
  addRule(rule: PermissionRule): void {
    this.rules.push(rule);
  }

  /**
   * 权限检查主入口（4 关卡）
   * 对照源码 hasPermissionsToUseToolInner() L1158-1319
   */
  async check(
    tool: Tool,
    input: Record<string, unknown>,
  ): Promise<PermissionCheckResult & { gate: number }> {
    // ── 关卡 1: 规则匹配 ──
    // 对照源码: 工具级 deny 规则 (L1171) + always-allow 规则 (L1283)
    for (const rule of this.rules) {
      if (matchPattern(rule.pattern, tool.name, input)) {
        if (rule.decision === "deny") {
          return { decision: "deny", reason: `规则拒绝: ${rule.pattern}`, gate: 1 };
        }
        if (rule.decision === "allow") {
          return { decision: "allow", reason: `规则放行: ${rule.pattern}`, gate: 1 };
        }
      }
    }

    // ── 关卡 2: 工具自定义检查 ──
    // 对照源码: tool.checkPermissions() (L1208)
    if (tool.checkPermissions) {
      const result = tool.checkPermissions(input);
      if (result.decision === "deny") {
        return { ...result, gate: 2 };
      }
      if (result.decision === "allow") {
        return { ...result, gate: 2 };
      }
      // ask 继续往下走
    }

    // ── 关卡 3: 安全检查 ──
    // 对照源码: 安全检查 (L1252) — bypass 免疫
    if (tool.riskLevel === "dangerous") {
      const dangerousInput = this.checkDangerousInput(tool, input);
      if (dangerousInput) {
        return { decision: "deny", reason: dangerousInput, gate: 3 };
      }
    }

    // ── 关卡 4: 模式决策 / 用户确认 ──
    // 对照源码: dontAsk/auto 模式转换 (L504-953)
    return this.resolveByMode(tool, input);
  }

  /** 安全检查：不可绕过的硬限制 */
  private checkDangerousInput(tool: Tool, input: Record<string, unknown>): string | null {
    // Bash 的 rm -rf / 类命令永远拒绝
    if (tool.name === "Bash") {
      const cmd = (input.command as string) || "";
      if (cmd.includes("rm -rf /") || cmd.includes("rm -rf /*")) {
        return `安全检查拦截: ${cmd}`;
      }
    }
    // Write 系统路径
    if (tool.name === "Write") {
      const path = (input.path as string) || "";
      if (path.startsWith("/etc/") || path.startsWith("/System/")) {
        return `安全检查拦截: 禁止写入 ${path}`;
      }
    }
    return null;
  }

  /** 根据权限模式决策 */
  private async resolveByMode(
    tool: Tool,
    input: Record<string, unknown>,
  ): Promise<PermissionCheckResult & { gate: number }> {
    // safe 工具默认放行
    if (tool.riskLevel === "safe") {
      return { decision: "allow", reason: "安全工具自动放行", gate: 4 };
    }

    switch (this.mode) {
      case "auto":
        // auto 模式: AI 分类器（我们简化为风险等级判断）
        if (tool.riskLevel === "moderate") {
          return { decision: "allow", reason: "auto 模式: 中风险自动放行", gate: 4 };
        }
        return { decision: "ask", reason: "auto 模式: 高风险需确认", gate: 4 };

      case "dontAsk":
        // dontAsk: ask → deny（对照源码 L504）
        return { decision: "deny", reason: "dontAsk 模式: 静默拒绝", gate: 4 };

      case "default":
      default:
        // default: 安全的放行，其他问用户
        if (tool.riskLevel === "safe") {
          return { decision: "allow", reason: "默认放行", gate: 4 };
        }
        // 有 onAsk 回调就走用户确认
        if (this.onAsk) {
          const approved = await this.onAsk(tool, input, `执行 ${tool.name}?`);
          return {
            decision: approved ? "allow" : "deny",
            reason: approved ? "用户确认" : "用户拒绝",
            gate: 4,
          };
        }
        // 没有回调就 deny
        return { decision: "deny", reason: "无用户确认回调", gate: 4 };
    }
  }
}
