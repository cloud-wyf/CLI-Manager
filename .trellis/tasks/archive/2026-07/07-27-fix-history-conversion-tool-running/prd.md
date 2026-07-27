# 修复历史转换运行态误阻断

## Goal

允许 Claude 与 Codex 历史会话在目标 CLI 正在运行时继续执行非破坏性转换，同时保留删除、备份恢复等原地 mutation 的运行态保护。

## Background

- `history_convert_session` 在 `src-tauri/src/commands/history.rs:1421` 复用了 `is_target_tool_running`，因此系统中任意目标 CLI 进程都会返回 `history_target_tool_running`。
- 转换在 `src-tauri/src/commands/history.rs:4720` 生成新 UUID，并在独立 rollout/transcript 后追加目标共享索引；它不覆盖活动会话文件。
- 删除与恢复分别在 `src-tauri/src/commands/history.rs:4807`、`src-tauri/src/commands/history_edit.rs:815` 修改既有 artifact，仍需要排他保护。
- GitNexus 上游影响分析：`history_convert_session` 为 LOW（0 个图内上游调用）；`is_target_tool_running` 为 LOW（3 个直接调用，覆盖转换、删除、恢复）。

## Requirements

- R1：Claude -> Codex 与 Codex -> Claude 转换不得仅因目标 CLI 进程存在而失败。
- R2：转换继续生成全新的目标 session id，不覆盖、不合并活动会话。
- R3：Codex 的 `history.jsonl` 与 `session_index.jsonl` 每条记录必须通过一次 append 写入，避免并发 writer 在 JSON 与换行之间交错。
- R4：Codex `state_5.sqlite` 注册继续使用现有 15 秒 `busy_timeout`；真实锁冲突或 I/O 错误必须原样失败，不得伪造成功。
- R5：删除会话、恢复备份和恢复计划的 `history_target_tool_running` 保护保持不变。
- R6：不新增依赖，不改变 Tauri IPC 参数与返回结构。
- R7：转换后的目标会话没有同来源项目配置时，若 `cwd` 唯一命中一个本地或 WSL 项目目录，继续对话应直接在该目录执行目标 CLI 的裸恢复命令，不弹出项目选择框，也不继承原 CLI 的参数、环境变量或供应商覆盖。

## Acceptance Criteria

- [x] AC1：目标 Codex 正在运行时，Claude -> Codex 转换不再返回 `history_target_tool_running`。
- [x] AC2：目标 Claude 正在运行时，Codex -> Claude 转换同样不再被运行态检查阻断。
- [x] AC3：转换后的目标 JSONL 可被现有 parser 读取，Codex 共享索引每行均为合法 JSON。
- [x] AC4：`delete_session_tree_with_backup_root`、`restore_backup_for_file` 和 `build_file_restore_plan` 仍调用 `is_target_tool_running`。
- [x] AC5：相关 Rust 定向测试、`cargo check` 通过。
- [x] AC6：Claude -> Codex 转换后，原 Claude 项目目录唯一命中 `cwd` 时，“继续对话”不再要求选择项目；重复目录或无目录命中时仍保留现有选择流程。

## Scenario Coverage

- 目标未运行：行为不变，转换成功。
- 目标正在运行：新增转换成功；删除与恢复仍拒绝。
- 同时存在多个目标 CLI 会话：转换使用新 UUID，不触碰任何活动 rollout/transcript。
- Windows 本地 Codex：共享 JSONL 使用单次追加，SQLite 写入等待现有 writer。
- WSL Codex：保留现有 rollout/index 路径转换与跳过 Windows 侧 WAL 注册策略。
- 目录唯一命中异来源项目：使用会话 `cwd` 和目标 CLI 裸恢复命令，不传入原项目 id 或启动配置。
- 相同目录有多个项目：不猜测选择，保留项目选择框。
- SSH 历史：仍走远端 preflight 和同 Host/来源配置匹配，不应用本地 `cwd` 自动恢复。

## Out Of Scope

- 不调整通用进程识别算法。
- 不放宽编辑、删除、恢复等原地 mutation。
- 不重构现有 conversion writer 或补做完整跨 artifact 事务。
