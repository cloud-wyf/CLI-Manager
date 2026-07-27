# 技术设计

## 根因陈述

Bug 横跨两个边界：后端将 additive conversion 错误当成 destructive mutation 并复用运行态排他检查；前端将“项目目录归属”与“目标 CLI 启动配置”绑在同一来源过滤中，使转换后的目标会话无法自动复用原 `cwd`。修复分别落在转换入口和恢复项目匹配层，不削弱进程检测，也不把原 CLI 配置泄漏给目标 CLI。

## 数据流

`HistoryWorkspace` -> `history_convert_session` -> 解析来源详情 -> 生成新 UUID 和目标 transcript -> 追加目标 JSONL 索引 -> 通过带 `busy_timeout` 的 SQLite 连接注册 Codex thread -> 刷新历史缓存。

## 方案

1. 从 `history_convert_session` 移除 `is_target_tool_running` 检查。
2. 保留 `ensure_source_mutation_unlocked`，避免目标来源已处于人工恢复锁定状态时继续写入。
3. 将 `append_jsonl_line` 的 JSON 与换行拼成一个缓冲区并只调用一次 `write_all`。
4. 删除、恢复和恢复计划继续使用 `is_target_tool_running`，不改变其契约。
5. 前端在同来源项目匹配为空时，额外检查会话 `cwd` 是否唯一命中本地/WSL 项目。唯一命中时直接调用现有无项目恢复分支；不传入项目 id，因此不会应用原 CLI 参数、环境变量、Provider 覆盖或 Agent 元数据。仅复用 Shell 类型以保持本地/WSL 运行边界。

## 并发边界

- 新 transcript 使用 UUID 路径，不与活动会话文件冲突。
- 共享 JSONL 只追加一条完整记录，不做读取后覆盖。
- SQLite 仍由 SQLite 自身锁与 15 秒 `busy_timeout` 协调；超时继续返回明确错误。
- CLI-Manager 不结束目标 CLI 进程，也不修改现有活动 session。
- 自动恢复仅在 `cwd` 唯一精确命中时触发；重复目录、缺失 `cwd`、Worktree 与 SSH 继续走现有显式选择流程。

## 兼容性与回滚

- IPC 签名和错误结构不变。
- 回滚后端时恢复转换入口 guard 与原 append 写法；回滚前端时移除无项目自动恢复分支。删除/恢复逻辑未改。
