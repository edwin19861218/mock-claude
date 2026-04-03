/**
 * 权限管线（沿用第二篇，精简版）
 */

import type { Tool, PermissionDecision, PermissionRule, PermissionCheckResult, PermissionMode } from "../types.js";

function matchPattern(pattern: string, toolName: string, input: Record<string, unknown>): boolean {
  if (pattern === toolName) return true;
  return false;
}

export class PermissionGate {
  private rules: PermissionRule[] = [];
  private mode: PermissionMode;

  constructor(mode: PermissionMode = "default") {
    this.mode = mode;
  }

  addRule(rule: PermissionRule): void {
    this.rules.push(rule);
  }

  async check(tool: Tool, input: Record<string, unknown>): Promise<PermissionCheckResult & { gate: number }> {
    // 关卡 1: 规则匹配
    for (const rule of this.rules) {
      if (matchPattern(rule.pattern, tool.name, input)) {
        return { decision: rule.decision, reason: `规则: ${rule.pattern}`, gate: 1 };
      }
    }

    // 关卡 2: 工具自定义检查
    if (tool.checkPermissions) {
      const result = tool.checkPermissions(input);
      if (result.decision === "deny") return { ...result, gate: 2 };
      if (result.decision === "allow") return { ...result, gate: 2 };
    }

    // 关卡 3+4: 安全检查 + 模式决策
    if (tool.riskLevel === "safe") {
      return { decision: "allow", reason: "安全工具自动放行", gate: 4 };
    }

    if (this.mode === "auto" && tool.riskLevel === "moderate") {
      return { decision: "allow", reason: "auto 模式中风险放行", gate: 4 };
    }

    if (this.mode === "dontAsk") {
      return { decision: "deny", reason: "dontAsk 静默拒绝", gate: 4 };
    }

    // default: mock 模式直接放行
    return { decision: "allow", reason: "mock 放行", gate: 4 };
  }
}
