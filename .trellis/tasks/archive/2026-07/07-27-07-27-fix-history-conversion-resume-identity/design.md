# 技术设计

## 根因陈述

Bug 位于三条边界：转换写入/索引身份、删除操作/来源进程识别、索引事件/虚拟列表加载状态。转换只返回摘要并立即依赖异步索引，Windows 目录大小写又可让目标键与扫描候选不同；删除把来源级进程存在误当成目标文件活跃；后台索引事件使用阻塞加载把列表压成单行并重置分页。修复分别落在转换返回契约、删除事务入口和 Store 后台刷新模式，不放宽通用文件路径校验。

## 数据流

`convertSession` -> `history_convert_session` -> 写目标 JSONL -> 规范化目标路径并取实际项目目录名 -> 用目标 `SessionFileRef` 直接解析详情 -> 返回 summary + detail -> `addConvertedSession` 原子设置列表、key、detail -> `resumeConversation` 校验当前身份 -> 既有 `requestResume`。

`history-index-status ready` / `refreshIndex` -> `loadSessions({ background: true })` -> 按现有 `sessionListOffset` 拉取 -> 原列表保持挂载 -> 请求完成后原子替换同范围数据。

`history_delete_session` -> 路径/来源/项目校验 -> source mutation lock -> 文件备份 -> 删除 -> 失败回滚；不再以机器上任意同来源进程作为删除前置条件。

## 方案

1. `HistoryConversionResult` 新增 `detail` 字段；后端写完 Claude 目标文件后从规范化路径的父目录取得真实项目键，再用现有 parser 构建详情并校验目标身份。
2. `addConvertedSession` 同时接收 summary/detail，归一化后验证 identity，再一次性更新 `sessions`、`activeSessionKey` 和 `activeSession`。
3. `openSession`、`openSearchHit` 发起新详情请求时清空 `activeSession`，保留现有 request sequence 防乱序机制。
4. `resumeConversation` 仅在当前详情与当前 view 的 source/session id/file path 一致时调用 `requestResume`。
5. 不修改 `resolve_session_file_ref`；普通后续打开仍走现有索引和路径边界。
6. 显式删除移除来源级进程 guard，但保留备份、失败回滚和 manual recovery lock；备份恢复及恢复计划继续使用该 guard。
7. `loadSessions` 增加后台选项：已有列表时不切换 `loadingSessions`，按已加载 offset 重拉；索引 ready、远程缓存刷新和手动刷新使用后台模式，筛选变化仍走前台模式。
8. `visibleSessionCount` 只随筛选/查询变化重置，不再依赖 `loadingSessions`。

## 兼容性

- Tauri 参数不变，返回值只增加字段，对旧调用方为加法兼容。
- 不改变转换文件格式、session id、resume command、项目匹配和终端创建契约。
- 不改变通用索引校验；只保证转换生产的项目键与该校验使用的扫描候选一致。
- 不改变删除 IPC 参数、路径边界、备份格式或回滚流程；只移除无法证明目标 session 活跃的来源级误拦截。
- `loadSessions()` 无参数保持原前台加载语义；后台选项是前端 Store 内部加法兼容。
- 转换 writer 成功但目标 parser 失败时返回错误；文件仍可能已写出，沿用现有非事务转换边界，不伪造成功。

## 回滚

- 可移除新增 `detail` 字段并恢复转换后 `openSession` 调用。
- Store 的清空和身份校验可独立保留，属于通用状态安全修复。
- 可恢复删除进程 guard，但会重新引入任意同来源进程阻塞全部删除的问题。
- 可把自动与手动刷新调用恢复为无参数，但会重新触发虚拟列表滚动归零。
