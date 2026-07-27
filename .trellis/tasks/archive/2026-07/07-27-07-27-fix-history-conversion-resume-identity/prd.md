# 修复历史转换身份、删除误拦截与列表刷新跳顶

## Goal

保证 Claude/Codex 会话转换完成后立即显示并恢复目标会话；用户确认删除时不被无关同来源进程误拦截；历史列表后台刷新不丢失滚动位置和已加载范围。

## Background

- `history_convert_session` 已成功写出目标文件并返回目标摘要，但前端随后调用 `openSession`，重新依赖异步历史索引读取。
- 目标详情读取返回 `session_file_not_indexed` 时，`openSession` 只结束 loading，不清空旧 `activeSession`。
- `resumeConversation` 只检查 `activeSession` 非空，没有验证它与 `activeSessionKey`/`activeView` 同属一个会话，因而可能用旧 Codex 详情恢复新 Claude 视图。
- Windows 上若 Claude 已存在大小写不同的项目目录，转换写入会复用该目录；转换结果仍返回从 `cwd` 生成的全小写 `project_key`，而后续扫描返回磁盘真实目录名，普通详情校验因此报 `session_file_not_indexed`。
- `history_target_tool_running` 的进程扫描只能识别 CLI 来源，无法识别正在写入的具体 session；把它用于显式删除会让任意 Claude/Codex 进程阻塞同来源全部历史文件。
- 索引 ready 事件会调用阻塞式 `loadSessions()`，把虚拟列表暂时缩成单个 loading 行；浏览器因此将 `scrollTop` 压回零，同时 Store 重置已加载分页和组件可见数量。
- GitNexus 上游影响：`history_convert_session`、`openSession`、`resumeConversation`、删除链路均为 LOW；通用 `resolve_session_file_ref` 为 MEDIUM，本任务不修改该通用校验。

## Requirements

- R1：转换接口必须返回由后端现有 parser 从刚写出的目标文件构建的目标详情；写入后不能解析时，转换应明确失败。
- R1a：Claude 目标摘要和详情的 `project_key` 必须取写入后规范化文件的实际父目录名，保证与普通扫描候选一致。
- R2：前端添加转换结果时必须原子设置目标摘要、`activeSessionKey` 与目标详情，不再立即走索引读取。
- R3：打开其他会话时必须先清空旧详情；详情请求失败或乱序完成后，旧详情不得与新 key 共存。
- R4：详情页继续对话必须校验详情与当前视图的 source、session id 和 file path 一致，否则拒绝恢复。
- R5：Claude -> Codex 与 Codex -> Claude 均覆盖立即显示、立即恢复和后续普通重新打开。
- R6：本地、WSL、自定义 Claude/Codex 配置根目录沿用现有路径和 parser 契约，不新增依赖。
- R7：用户确认删除后不再使用来源级进程 guard；删除继续保留文件备份、失败回滚和 manual recovery lock。
- R7a：备份恢复与恢复计划继续使用 `history_target_tool_running`，禁止运行时覆盖既有文件。
- R7b：索引 ready、远程缓存刷新和手动刷新已有列表时使用后台加载，不切换阻塞 loading，并按 `sessionListOffset` 重拉已加载范围。
- R7c：初次打开、来源/项目筛选变化仍使用阻塞加载；可见数量不因后台 loading 状态变化而重置。
- R8：用户可见行为变更记录到 `CHANGELOG.md` 的 `[TEMP]`。

## Acceptance Criteria

- [x] AC1：Codex -> Claude 转换后不再出现 `session_file_not_indexed`，详情来源为 Claude。
- [x] AC2：转换后立即点击继续对话，构造并启动 Claude 恢复流程；反向转换启动 Codex。
- [x] AC3：目标详情加载失败或快速切换时，继续按钮不能消费前一个会话详情。
- [x] AC4：后端往返测试验证转换结果详情的 source/session id/file path/messages/project key 与摘要和普通扫描候选一致，并可通过普通详情校验重新打开。
- [x] AC5：前端静态回归测试覆盖“切换先清空”和“恢复身份校验”。
- [x] AC6：同来源 CLI 运行时显式删除不再返回 `history_target_tool_running`；备份恢复仍保留运行态保护。
- [x] AC7：自动/手动刷新已有列表时不渲染单 loading 行，不缩回第一页，可见数量不被 loading 重置。
- [x] AC8：Rust 定向测试、`cargo test history --lib`、`cargo check`、前端测试和 `npx tsc --noEmit` 通过，或明确记录与本次无关的既有失败。

## Scenario Coverage

- 转换方向：Claude -> Codex / Codex -> Claude。
- 入口：详情页转换 / 列表会话转换。
- 时序：目标尚未进入 catalog / 普通索引已完成 / 快速切换到另一会话。
- 环境：Windows 本地（含已存在目录大小写与 cwd 编码不同）/ WSL UNC / 自定义配置根目录。
- 运行态：目标 CLI 未运行 / 运行中；转换保持 additive，显式删除走备份事务，备份恢复保持 exclusive。
- 列表状态：空列表首次加载 / 已有一页 / 已加载多页；自动索引 ready / 手动刷新 / 远程缓存刷新 / 切换筛选。
- 工作区：主项目 / Worktree / 无同来源项目但 cwd 唯一命中，继续沿用现有恢复匹配契约。
- SSH 历史：只读且不支持本地转换，确认不受影响。

## Out Of Scope

- 不修改通用 `resolve_session_file_ref` 的索引和路径安全策略。
- 不尝试从模糊进程命令行猜测活动 session；删除后外部 CLI 是否重建仍在写入的文件不作伪保证。
- 不移除备份恢复与恢复计划的运行态保护。
- 不重构历史 catalog、转换 writer 或终端创建流程。
