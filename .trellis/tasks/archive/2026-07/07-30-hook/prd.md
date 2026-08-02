# Hook 任务栏提醒与安装状态检测修复

Changelog Target: V1.3.3

## Goal

解决 Issue #176：Windows 主窗口失焦时，Hook 事件可独立触发任务栏提醒；同时让关闭 Claude、Codex、Pi、Grok 桥接后仍能查看并刷新真实 Hook 安装状态。

## Background

- `hook_settings_get_status` 已无条件检测四种 CLI；状态不可见的根因在前端：桥接关闭时隐藏状态徽标和刷新入口。
- Hook 事件已经统一进入 `src/App.tsx`，系统 Toast 由 `systemNotificationsEnabled` 与 `systemNotificationEvents` 控制。
- GitNexus 影响分析：`HookSettingsPage` 和状态检测为 LOW；共享 `Settings` 接口为 CRITICAL（186 个受影响符号、71 个直接依赖）。

## Requirements

1. 新增 Windows 任务栏提醒偏好：独立总开关、`finite | untilFocused` 模式、有限模式次数；默认开启、有限模式、5 次，次数仅接受整数 1..20。
2. 旧设置缺失或非法时回退默认值；三个字段属于可同步偏好。
3. 保留 `systemNotificationEvents` 键，其事件筛选同时控制系统 Toast 与任务栏提醒。
4. Hook 事件满足任务栏开关和共享事件筛选且主窗口未聚焦时触发任务栏提醒；不要求绑定 Tab。后台任务模式也不得绕过任务栏独立开关或事件筛选。
5. `finite` 仅闪任务栏指定次数；`untilFocused` 持续闪烁至主窗口聚焦；聚焦时主动停止任何提醒。调用失败仅写调试日志，不影响其他通知和状态链路。
6. Hook 设置页增加 Windows 专属任务栏提醒开关、模式和次数输入。系统 Toast 或任务栏提醒任一开启时，事件筛选可配置；两者都关闭时才禁用。
7. 页面顶部提供“刷新全部 Hook 状态”。四种 CLI 的状态徽标始终显示；桥接关闭时仍隐藏模块卡片、路径和安装操作。刷新只检测展示，不启用、安装或注入环境。
8. 所有新增用户可见文案覆盖 `zh-CN` 和 `en-US`，不得硬编码单语文案。
9. 不新增依赖，不修改数据库，不升级 Tauri/Spring；更新 CLI Hook 契约、`CHANGELOG.md` V1.3.3、`docs/功能清单.md`，提交关联 `Refs #176`。

## Scenario Coverage

- 窗口：聚焦、失焦、最小化、隐藏到托盘。
- 提醒组合：Toast/任务栏分别单开、同时开启、同时关闭。
- 任务栏模式：1 次、5 次、20 次、持续到聚焦、聚焦提前终止。
- Hook 事件：默认关闭的 SessionStart/UserPromptSubmit 与默认开启的其他事件。
- Hook 来源：Claude、Codex、Pi、Grok；本地与 WSL；有无 Tab 绑定。
- 安装状态：目录缺失、未安装、部分安装、已安装；桥接开启和关闭。

## Acceptance Criteria

- [ ] Windows 10/11 失焦后默认准确请求闪烁 5 次，聚焦可提前停止。
- [ ] 持续模式保持提醒直到聚焦；有限次数 1/20 接受，0/21 与非整数回退或拒绝。
- [ ] Toast 与任务栏开关互不依赖，共享事件筛选；两者都关闭不影响应用内状态。
- [ ] 未绑定 Tab 的合格 Hook 事件仍可触发任务栏提醒。
- [ ] 托盘隐藏时不强制恢复窗口；Toast 仍按自身设置运行。
- [ ] 四种桥接关闭后仍能刷新和查看真实安装状态，且不自动启用、重装或注入环境。
- [ ] 设置重启与同步后保持；中英文文案完整。
- [ ] Rust 单测覆盖 Win32 参数边界与停止模式；`npx tsc --noEmit`、`cargo check`、`cargo test`、`git diff --check` 通过。

## Out of Scope

- macOS Dock、Linux urgency、托盘图标闪烁。
- 自定义任务栏颜色、提醒队列、每种 CLI 独立任务栏配置。

