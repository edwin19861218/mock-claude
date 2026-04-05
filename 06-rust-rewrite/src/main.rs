//! 迷你Claude Code —— Rust重写版
//!
//! 对照 TS 版 05-real-tools/src/main.ts
//! 运行：cargo run

#![allow(dead_code)]

mod anthropic;
mod loop_;
mod mock;
mod model;
mod permission;
mod tools;
mod types;

use types::*;

#[tokio::main]
async fn main() {
    println!("🔧 迷你Claude Code Rust版：真实工具调用");
    println!();

    // ── 1. 创建工具注册表 ──
    let mut registry = tools::ToolRegistry::new();
    registry.register(tools::read::ReadTool);
    registry.register(tools::write::WriteTool);
    registry.register(tools::grep::GrepTool);
    registry.register(tools::glob::GlobTool);

    // 打印工具风险等级——对照 TS 版的表格输出
    println!("📋 工具风险等级:");
    for tool in registry.all_tools() {
        let icon = match tool.risk_level() {
            RiskLevel::Safe => "🟢",
            RiskLevel::Moderate => "🟡",
            RiskLevel::Dangerous => "🔴",
        };
        println!("  {} {}: {}", icon, tool.name(), tool.risk_level());
    }
    println!("📊 工具数量: {}", registry.tool_count());
    println!();

    // ── 2. 创建权限管线 ──
    let gate = permission::PermissionGate::new(PermissionMode::Auto);

    // ── 3. 初始化状态 ──
    let mut state = LoopState {
        messages: vec![ChatMessage {
            role: "user".into(),
            content: vec![ContentBlock::Text {
                text: "帮我分析这个Rust项目的结构".into(),
            }],
        }],
        turn_count: 0,
    };

    let budget = TokenBudget::new(10000, 0.13);
    let max_turns = 5;

    // ── 4. 创建事件channel ──
    let (tx, mut rx) = tokio::sync::mpsc::channel::<StreamEvent>(100);

    // 启动事件打印任务
    let printer = tokio::spawn(async move {
        let mut turn = 0;
        while let Some(event) = rx.recv().await {
            match event {
                StreamEvent::TextDelta { text } => {
                    println!("  💬 {}", text);
                }
                StreamEvent::ToolUse { name, input, .. } => {
                    let display: String = input
                        .to_string()
                        .chars()
                        .take(60)
                        .collect();
                    println!("  🔧 {}({})", name, display);
                }
                StreamEvent::PermissionCheck { tool, decision } => {
                    let icon = match decision {
                        PermissionDecision::Allow => "✅",
                        PermissionDecision::Deny => "🚫",
                        PermissionDecision::Ask => "❓",
                    };
                    println!("  {} 权限: {} → {:?}", icon, tool, decision);
                }
                StreamEvent::ToolResult { content, .. } => {
                    let preview: String = content.chars().take(120).collect();
                    println!("  📦 {}", preview);
                }
                StreamEvent::TurnComplete { turn: t } => {
                    println!("  --- 第 {} 轮结束 ---\n", t + 1);
                    turn = t + 1;
                }
                StreamEvent::TokenBudget { used, max, .. } => {
                    let pct = (used as f64 / max as f64 * 100.0) as usize;
                    let filled = std::cmp::min(pct / 5, 20);
                    let bar: String = "█".repeat(filled) + &"░".repeat(20 - filled);
                    println!("  📊 Token: [{}] {}% ({}/{})", bar, pct, used, max);
                }
                StreamEvent::LoopComplete { reason } => {
                    println!("\n✅ 循环结束: {}", reason);
                }
            }
        }
        turn
    });

    // ── 5. 运行Agent循环 ──
    // 检查 --api 参数——对照 TS 版的 process.argv.includes("--api")
    let use_api = std::env::args().any(|a| a == "--api");

    if use_api {
        let env_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(".env");
        let _ = dotenvy::from_path(&env_path);
    }

    println!("============================================================");
    if use_api {
        let caller = anthropic::AnthropicCaller::new(&registry)
            .expect("请设置 ANTHROPIC_API_KEY（在 .env 文件中）");
        println!("🌐 Anthropic API 模式（模型: {}）\n", caller.model_name());

        let result = loop_::agent_loop(
            &mut state,
            &caller,
            &registry,
            &gate,
            &budget,
            max_turns,
            &tx,
        )
        .await;

        drop(tx);
        let _turns = printer.await.unwrap_or(0);

        println!("============================================================\n");
        match result {
            Ok(reason) => println!("✅ 演示完毕！退出原因: {}", reason),
            Err(e) => println!("❌ 错误: {}", e),
        }
    } else {
        println!("🎭 Mock 模式（预设的5轮工具调用链）\n");

        let caller = mock::MockCaller;
        let result = loop_::agent_loop(
            &mut state,
            &caller,
            &registry,
            &gate,
            &budget,
            max_turns,
            &tx,
        )
        .await;

        drop(tx);
        let _turns = printer.await.unwrap_or(0);

        println!("============================================================\n");
        match result {
            Ok(reason) => println!("✅ 演示完毕！退出原因: {}", reason),
            Err(e) => println!("❌ 错误: {}", e),
        }
    }
}
