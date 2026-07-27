# 验证结果

## 验收映射

- AC1 / AC2：`history_convert_session` 已无 `is_target_tool_running` 分支；当前机器存在多个真实 Codex 进程，转换入口不再能返回该稳定错误。
- AC3：Claude -> Codex、Codex -> Claude writer/parser round-trip 测试均通过；8 个并发 writer 共 400 条 JSONL 记录全部可解析。
- AC4：源码审计确认运行态 guard 仍位于 `delete_session_tree_with_backup_root`、`restore_backup_for_file` 和 `build_file_restore_plan`。
- AC5：格式和编译检查通过。
- AC6：无同来源项目时，本地/WSL `cwd` 唯一命中会直接走无项目恢复分支；重复目录、SSH 和缺失 `cwd` 不自动选择。该分支只复用 Shell 类型，不传入项目 id、CLI 参数、环境变量或 Provider 覆盖。

## 发现清单

- `src-tauri/src/commands/history.rs`：转换入口与 JSONL append writer，已修改。
- `src/stores/historyStore.ts`：`normalizeSummary` / `addConvertedSession` 已保留 `cwd`，确认无关，未修改。
- `src/components/HistoryWorkspace.tsx`：同来源项目过滤导致转换后无候选项目，已在项目匹配边界修复。
- `src/lib/projectStartupCommand.ts`：`appendResumeCliArgs` 已阻止异来源 CLI 参数拼接，确认无关，未修改。
- `src/stores/terminalStore.ts`：项目 id 会触发 Provider 和 Agent 启动元数据；新分支明确不传项目 id，未修改 Store 契约。
- `src/components/history/HistoryResumeProjectDialog.tsx`：仅用于零/多个无法自动决策的候选项目，确认无关，未修改。
- SSH 恢复：继续走 Host/来源/config-root 匹配和远端 preflight，确认不受本地 `cwd` 分支影响。

## 命令结果

- `cargo fmt -- --check`：通过。
- `cargo test append_jsonl_line_keeps_concurrent_records_intact --lib`：1 passed。
- `cargo test convert_claude_history_to_codex_jsonl_readable_by_history_parser --lib`：1 passed。
- `cargo test convert_codex_history_to_claude_jsonl_readable_by_history_parser --lib`：1 passed。
- `cargo check`：通过。
- `node scripts/historyResumeProject.test.mjs`：3 passed。
- `node scripts/resumeCliArgs.test.mjs`：5 passed。
- `npx tsc --noEmit`：通过。
- `git diff --check HEAD`：通过。
- GitNexus `detect_changes(scope=staged)`：组件级总评为 HIGH，因 `HistoryWorkspace` 是 1193 行的聚合入口，索引将任意子符号变更扩散到 7 条通用流程。逐符号上游影响为 LOW：`findHistoryProjects` 4 个影响符号、`requestResume` 3 个、`resumeSession` 4 个、`append_jsonl_line` 7 个，后端 0 个执行流程。
- GitNexus 7 条 HIGH 流程复核：均仅因 `HistoryWorkspace` 组件入口共享而命中，分别通向主题、数据路径、single-flight、系统平台、语言检测、对话框样式和关闭函数；本次 diff 未修改这些 Hook/设置/国际化调用。

## 已知测试环境问题

`cargo test history --lib` 共 153 项，151 项通过；以下两个未改动的 `request_logs` 测试读取现有应用数据库时预期 1 条、实际已有 12 条，单独重跑仍失败：

- `sync_is_idempotent_and_replaces_changed_files`
- `unavailable_root_does_not_purge_existing_logs`

失败文件 `src-tauri/src/commands/history/request_logs.rs` 不在本次 diff，且不调用历史转换 writer。
