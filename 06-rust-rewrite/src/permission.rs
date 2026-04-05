/// 权限管线——enum + match 实现
///
/// 对照 TS 版 permission.ts 的 4 道关卡
/// 核心差异：match 保证穷举，新增 RiskLevel 变体时编译器会报错

use crate::types::{PermissionDecision, PermissionMode, RiskLevel};

#[derive(Debug)]
pub struct PermissionResult {
    pub decision: PermissionDecision,
    pub reason: String,
    pub gate: usize,
}

impl PermissionResult {
    pub fn allow(reason: &str, gate: usize) -> Self {
        Self {
            decision: PermissionDecision::Allow,
            reason: reason.to_string(),
            gate,
        }
    }

    pub fn deny(reason: &str, gate: usize) -> Self {
        Self {
            decision: PermissionDecision::Deny,
            reason: reason.to_string(),
            gate,
        }
    }
}

pub struct PermissionGate {
    mode: PermissionMode,
}

impl PermissionGate {
    pub fn new(mode: PermissionMode) -> Self {
        Self { mode }
    }

    pub fn check(
        &self,
        tool: &dyn crate::tools::Tool,
        input: &serde_json::Value,
    ) -> PermissionResult {
        // Gate 2: 工具自定义检查
        // 对照 TS 版的 tool.checkPermissions(input)
        if let Some(custom) = tool.check_permissions(input) {
            if custom.decision == PermissionDecision::Deny {
                return custom;
            }
        }

        // Gate 4: 基于风险等级 + 模式的决策
        // 对照 TS 版的 if-else 链
        // 关键差异：match 保证穷举，新增变体编译器会报错
        match (tool.risk_level(), self.mode) {
            (RiskLevel::Safe, _) => {
                PermissionResult::allow("安全工具自动放行", 4)
            }
            (RiskLevel::Moderate, PermissionMode::Auto) => {
                PermissionResult::allow("auto模式放行moderate", 4)
            }
            (RiskLevel::Moderate, PermissionMode::Default) => {
                PermissionResult::allow("default放行(mock)", 4)
            }
            (RiskLevel::Moderate, PermissionMode::DontAsk) => {
                PermissionResult::deny("dontAsk静默拒绝", 4)
            }
            (RiskLevel::Dangerous, PermissionMode::Auto) => {
                PermissionResult::allow("auto模式放行dangerous", 4)
            }
            (RiskLevel::Dangerous, PermissionMode::Default) => {
                PermissionResult::deny("需确认(dangerous)", 4)
            }
            (RiskLevel::Dangerous, PermissionMode::DontAsk) => {
                PermissionResult::deny("dontAsk静默拒绝", 4)
            }
        }
    }
}
