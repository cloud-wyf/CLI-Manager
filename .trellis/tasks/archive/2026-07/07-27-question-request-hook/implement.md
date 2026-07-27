# 实施清单

1. 对安装、状态、验证和通知相关符号执行 GitNexus upstream impact，确认风险。
2. 更新本地 Claude/Codex Hook 模板、模块卸载、状态检查、Codex trust state 与测试。
3. 更新 SSH agent Hook 模板与测试，保持本地/远程一致。
4. 允许 Codex `Notification` 桥接上报，保留提问工具名并补充后端测试。
5. 前端识别提问通知，增加 `zh-CN`、`zh-TW`、`en-US` 专用 toast/系统通知文案与测试。
6. 更新 `V1.3.2` Changelog、功能清单和 CLI Hook 契约。
7. 运行定向 Rust 测试、`cargo check`、前端定向测试和 `npx tsc --noEmit`；不主动运行被 guard 禁止的 build/dev 命令。
8. 运行 GitNexus `detect_changes`，确认影响范围仅覆盖预期 Hook 安装与通知流程。

## Risky Points

- `src-tauri/src/commands/hook_settings.rs`：Codex trust hash 和 cc-switch state block 必须同步。
- `src-tauri/src/claude_hook.rs` / daemon：白名单遗漏会导致 Hook 命令执行但上报被拒绝。
- Claude Attention 卸载不能删除 Subagent 模块的通用 `PreToolUse` 条目。

## Verification

- `cargo test --manifest-path src-tauri/Cargo.toml claude_hook::`：8 passed。
- 新增本地 matcher/status、trust hash、common-config、卸载隔离测试均通过；Hook settings 全组 42 项中 41 项通过，唯一失败为既有 Pi `install_then_uninstall_pi_extension` 状态断言，与本任务无关且单独复跑仍失败。
- `cargo test --manifest-path src-tauri/hook-schema/Cargo.toml`：5 passed。
- `cargo test --manifest-path src-tauri/ssh-agent/Cargo.toml`：70 passed；Agent 版本同步为 `0.1.4`。
- `node --test scripts/gitStoreRemote.test.mjs`：6 passed，覆盖 Agent 不可变版本断言。
- `cargo check --manifest-path src-tauri/Cargo.toml`、`cargo check --manifest-path src-tauri/ssh-agent/Cargo.toml`、`npx tsc --noEmit`：通过。
- GitNexus `detect-changes`：LOW，13 个可索引文件、56 个符号、0 条受影响执行流程。
- 待人工烟测：在 `zh-CN` / `zh-TW` / `en-US` 下分别触发 Codex `request_user_input` 与 Claude `AskUserQuestion`，确认应用内/系统通知文案与点击定位。

## Dev Regression: Codex Trust State Duplicate Key

### Root Cause

Codex 已用 TOML literal string 写入 `hooks.state` Windows 路径键，而 CLI-Manager 的信任状态合并按双引号源码文本比较，未识别两种写法对应同一语义键，因而追加等价表并使整个 `config.toml` 无法解析。

### Discovery List

- `toml_hooks_state_key`：根因点；改为使用现有 `toml` 解析器返回语义键。
- `merge_codex_common_config_hook_state_blocks` / `remove_codex_hook_state_blocks`：按语义键替换已有 CLI-Manager 状态块。
- `read_codex_cli_manager_hook_state_blocks` / `extract_codex_hook_state_blocks`：兼容 Codex 写入的 literal/basic 两种表头。
- `build_codex_status_with_trust_repair`：在完整 TOML 解析前，仅折叠当前 CLI-Manager Hook 的等价重复状态块。
- cc-switch common config：复用同一解析与合并逻辑，已由现有同步测试覆盖。
- Claude、SSH Agent Hook 配置：不使用桌面 Codex `config.toml` 信任状态，确认不受影响。

### Verification

- `cargo test --manifest-path src-tauri/Cargo.toml codex_hook_state`：2 passed。
- `cargo test --manifest-path src-tauri/Cargo.toml codex_status_repairs_equivalent_duplicate_hook_state_keys`：1 passed。
- Hook settings 全组：45 passed；唯一失败仍为既有 Pi `install_then_uninstall_pi_extension`。
- `cargo check --manifest-path src-tauri/Cargo.toml`、`cargo check --manifest-path src-tauri/ssh-agent/Cargo.toml`、`npx tsc --noEmit`：通过。
- 实际 `C:\Users\1\.codex\config.toml` 已由 dev 热重载后的状态检查折叠重复块；`codex --version` 正常返回 `0.145.0`。
