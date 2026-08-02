# 修复 Grok TUI 鼠标滚动并拆分 XTermTerminal 职责

## Goal

让 Grok 等启用终端鼠标协议的全屏 TUI 能直接接收普通鼠标点击与拖动，同时把相关 xterm 浏览器交互策略从超大组件 `XTermTerminal.tsx` 中按职责拆出。

## Background

- 本机 Grok CLI 版本为 `0.2.111`，fullscreen 模式使用 alternate screen，并在终端字符网格中绘制自己的 scrollback 与滚动条。
- `src/components/XTermTerminal.tsx:1002` 当前配置 `mouseEventsRequireAlt: true`。xterm 只在按住 Alt 时才把 click、drag、move 报告给底层 TUI；wheel 不受该选项影响。
- 因此 Grok 的滚轮可工作，但普通点击/拖动无法到达 Grok 自绘滚动条。问题位于 xterm 鼠标协议边界，不在 CSS、React 覆盖层或 Rust PTY。
- `XTermTerminal` 当前位于 `src/components/XTermTerminal.tsx:394-1980`，同时承担 xterm 构造、显示生命周期、输入、链接、上下文菜单、搜索、快照等多项职责。

## Requirements

- R1：启用鼠标协议的 TUI 默认接收普通 click、drag、move 事件，不要求用户按 Alt。
- R2：保留滚轮行为；不得为 Grok 增加进程名判断、特殊转义序列或 CLI 专用分支。
- R3：在 TUI 鼠标模式中，终端文本选择遵循 xterm 标准方式（Shift + 拖动）；普通 shell 的选择行为不得改变。
- R4：只把本次涉及的终端鼠标交互策略从 `XTermTerminal.tsx` 抽到职责明确的浏览器终端模块；不得同步拆分链接、生命周期等其他职责。
- R5：用户可见行为变更记录到 `CHANGELOG.md` 的 `V1.3.3`。

## Scenario Coverage

- Grok fullscreen/alternate-screen：普通点击和拖动发送给 Grok；滚轮继续由 Grok 处理。
- Grok minimal/native-scrollback：保持 xterm 原生滚动，不依赖 Grok 鼠标命中。
- 其他启用鼠标协议的 TUI（如 Vim 类应用）：普通鼠标交互恢复为标准终端行为，Shift + 拖动用于文本选择。
- 普通 PowerShell/CMD/Pwsh/WSL shell：未启用鼠标协议时，普通文本选择保持现状。
- 单窗格、分屏、焦点切换：每个 xterm 实例应用同一策略，不引入全局可变状态。

## Acceptance Criteria

- [x] AC1：Grok fullscreen 模式下，无需 Alt 即可点击可交互区域并拖动其自绘滚动条。
- [x] AC2：Grok 中鼠标滚轮仍可滚动 scrollback。
- [x] AC3：启用鼠标协议的 TUI 中可用 Shift + 拖动选择终端文本。
- [x] AC4：普通 shell 的鼠标文本选择行为不回归。
- [x] AC5：鼠标策略位于独立职责模块，`XTermTerminal.tsx` 只负责装配。
- [x] AC6：前端类型检查和相关测试通过。
- [x] AC7：`CHANGELOG.md` 的 `V1.3.3` 包含该兼容性修复。

## Out of Scope

- 修改 Grok 配置或 Grok CLI 本身。
- 增加 Grok 专用检测。
- 修改 Rust PTY、IPC 或数据库。
- 全量重写 `XTermTerminal` 生命周期。

## Changelog Target

`V1.3.3`
