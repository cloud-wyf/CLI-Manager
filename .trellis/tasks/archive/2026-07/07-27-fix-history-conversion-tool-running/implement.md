# 实施计划

1. 修改 `src-tauri/src/commands/history.rs`，仅取消转换入口的目标进程阻断。
2. 将 `append_jsonl_line` 合并为单次 append 写。
3. 补充 Rust 回归测试，覆盖并发追加记录完整性与转换读回。
4. 更新 `docs/历史索引库设计.md`、`CHANGELOG.md` 和 `docs/功能清单.md`。
5. 运行：
   - `cargo test convert_claude_history_to_codex_jsonl_readable_by_history_parser --lib`
   - `cargo test append_jsonl_line --lib`
   - `cargo check`
   - GitNexus `detect_changes(scope=unstaged)`
6. 新增前端 `cwd` 精确匹配策略：无同来源项目、但唯一命中本地/WSL 目录时，直接走无项目裸恢复分支。
7. 运行 `node scripts/historyResumeProject.test.mjs` 与 `npx tsc --noEmit`。

## 风险与回滚点

- 风险文件：`src-tauri/src/commands/history.rs`、`src/components/HistoryWorkspace.tsx`。
- 若共享索引并发测试不稳定，停止放宽并重新评估目标原生导入接口；不通过重试或吞错掩盖损坏。
- 不修改 `history_backup.rs` 和 `history_edit.rs`，避免扩大破坏性 mutation 的行为面。
