# 为 Codex 和 Claude 增加提问通知 Hook

## Goal

当 Codex CLI 或 Claude Code 阻塞等待用户选择/回答时，通过 CLI-Manager 现有 Hook attention 通知链路及时提醒用户并可返回对应终端。

## Background

- Codex CLI 0.145.0 的 Questions 由 `request_user_input` 工具实现，触发 `PreToolUse`/`PostToolUse`，不会触发 `PermissionRequest`。
- Claude Code 的提问工具是 `AskUserQuestion`；官方契约保证调用前触发 `PreToolUse`。`Notification/elicitation_dialog` 仅用于 MCP elicitation，不等价于 Claude 提问。
- CLI-Manager 当前 Codex 安装模板未注册 `PreToolUse`；Claude 虽注册了通用工具生命周期 Hook，但 `ToolStart` 被 UI 主动静默，无法形成等待回答提醒。
- 现有 `Notification` 已映射为 attention，具备应用内 toast、标签状态、系统通知、第三方通知和后台模式强提醒能力。
- Changelog Target: `V1.3.2`。

## Requirements

- R1 Codex 本地 Hook 安装必须增加 `PreToolUse`，matcher 精确为 `request_user_input`，桥接事件使用现有 `Notification`。
- R2 Claude 本地 Hook 安装必须增加 `PreToolUse`，matcher 精确为 `AskUserQuestion`，桥接事件使用现有 `Notification`；不得使用 `elicitation_dialog` 代替。
- R3 Hook 接收端必须接受两种来源上报的专用提问通知，并保留 `toolName`，使通知渲染能够识别等待回答场景。
- R4 提问通知复用现有 attention 状态和通知开关，不新增持久化事件类型、数据库字段或依赖。
- R5 应用内 toast 与系统通知必须显示专用“需要选择或回答”语义，并兼容 `zh-CN`、`zh-TW`、`en-US`；点击行为复用现有终端定位与聚焦逻辑。
- R6 完整安装、单独 Attention 模块安装、卸载、安装状态检测、旧配置升级、Codex trust hash 修复和 cc-switch common config 必须识别新增 Hook，且不删除用户自有 Hook。
- R7 SSH agent 的 Claude/Codex Hook 模板与本地模板保持一致；Windows、WSL 和 SSH 会话使用相同匹配语义。
- R8 精确 matcher 之外的普通工具调用不得产生等待回答通知；Claude 现有 `ToolStart`/`ToolStop` 和子代理 Hook 行为保持不变。

## Technical Notes

- 专用 Hook 的底层事件仍是 `PreToolUse`，传给 CLI-Manager 的桥接事件为 `Notification`。
- Codex matcher 为 `request_user_input`；Claude matcher 为 `AskUserQuestion`。
- Claude 的通用 `PreToolUse -> ToolStart` 可与专用条目并存；卸载 Attention 模块时只能移除专用条目。
- Codex trust state 的规范化事件名为 `pre_tool_use`，信任哈希必须包含 matcher。
- 旧版完整安装缺少新增条目时应报告为 partial/outdated，并由既有重新安装/升级流程补齐，不在状态检查中静默安装缺失事件。

## Acceptance Criteria

- [ ] AC1 Codex 调用 `request_user_input` 时产生一次 `Notification` attention 上报，payload 保留 `toolName=request_user_input`；普通工具不产生该专用上报。
- [ ] AC2 Claude 调用 `AskUserQuestion` 时产生一次 `Notification` attention 上报，payload 保留 `toolName=AskUserQuestion`；MCP `elicitation_dialog` 行为不被改写。
- [ ] AC3 应用内和系统通知在三种支持语言下表达“需要选择或回答”，点击后激活正确终端；前台抑制、后台强提醒沿用现有设置。
- [ ] AC4 本地 Claude/Codex 完整安装及 Attention 模块安装写入精确 matcher；卸载只删除 CLI-Manager 自有条目。
- [ ] AC5 Codex 新条目获得正确的 `pre_tool_use` trust state，缺失或 stale trust 可按现有规则修复；旧安装被判为不完整而不是误判 installed。
- [ ] AC6 cc-switch common config 同步和 SSH agent 安装包含新增条目，并保留用户配置及非 CLI-Manager Hook。
- [ ] AC7 Rust 单元测试覆盖安装、卸载、matcher、状态、trust hash、SSH 模板和 payload 接受；前端测试/类型检查覆盖专用通知判定与文案。
- [ ] AC8 更新 `CHANGELOG.md` 的 `V1.3.2` 和 `docs/功能清单.md`。

## Out of Scope

- 不接管或自动填写问题答案。
- 不修改 Codex/Claude CLI 本身。
- 不新增独立的通知设置开关或数据库迁移。
- 不把 `PostToolUse` 用作等待回答提醒。
