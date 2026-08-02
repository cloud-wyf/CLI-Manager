# Technical Design

## Responsibility Boundaries

- `terminalImeAnchor.ts`：通用终端输入锚点解析；真实 buffer cursor 优先，prompt fallback
  只在 cursor 已离开输入区域时使用。
- `terminalIme.ts`：IME DOM 事件、composition 生命周期与调度；闲置 resize 后重新钉住
  helper textarea，composition 中 resize/reflow 时失效并重建冻结锚点。
- `TerminalCliContext.ts`：统一解析 session/project CLI 身份。
- `TerminalPiIme.ts`：扫描可见 viewport 的成对横线，解析 Pi 输入行和 composer 下边框。
- `TerminalPiAnsiTransform.ts`：状态化 CSI 解析与精确 SGR 背景替换。
- `TerminalPiDiagnostics.ts`：开发期有界诊断。
- `TerminalPiCompatibility.ts`：Pi 激活状态、门面和子模块协调。
- `XTermTerminal.tsx`：只组合 Pi 输出转换与既有光标转换，透传 IME 策略。

## IME Anchor Contract

- prompt/input 区域内的 `buffer.cursorX/cursorY` 是唯一真实输入位置；状态栏反色 cell 不得
  覆盖它。
- composition 期间可冻结锚点抵抗普通 TUI 状态刷新，但 terminal rows/cols 变化后冻结值
  必须作废，并在 buffer reflow/render 后重算。
- 非 composition resize 时 xterm 会先把 helper textarea 同步到硬件光标；应用的后注册
  `Terminal.onResize` 回调必须立即并在下一动画帧使用 `resolveTextareaAnchor` 覆盖该位置。
- 调用顺序固定为通用兜底锚点、Pi 输入行修正、Pi textarea 下边框修正。
- `.composition-view` 使用 Pi 编辑器内的真实/软件光标；Pi helper textarea 使用同一编辑器
  的下边框。硬件光标在区域内时优先，编辑器外反色状态不得参与解析。
- 非 Pi、无底边、越界底边均保持通用锚点行为。
- `historyResumeCommand.ts`：本地历史恢复命令与 Pi 专用参数清理。
- `historyResumeProject.ts`：来源匹配与本地项目选择。

## ANSI Contract

- RGB 只匹配 Pi 0.82.1 内置 dark/light 的 pending/success/error 值。
- 256 色只替换无歧义的 22/52/255；17/254 保留。
- 不解析或改写 OSC；不丢弃被 frame 拆分的 CSI；reset 丢弃未完成残片。
- 禁止访问 xterm 私有 `_line/loadCell/setCell`。

## PTY Contract

- 最终环境缺省补 `COLORTERM=truecolor`。
- Windows 不增改 `TERM`；非 Windows 缺省补 `TERM=xterm-256color`。
- WSLENV 按变量名去重转发 `COLORTERM`，保留 flag 和原条目。

## Resume Contract

- Pi：`pi --session <id>`；不得使用 `--session-id`。
- Pi 参数清理独立于现有 Claude/Codex/Grok helper。
- 精确 Worktree 和正确来源优先；错误来源的当前项目不能自动绑定。

## Rollback

移除 Pi facade 接线、PTY 能力默认值和 Pi resume capability 即可；现有三种 CLI 恢复语义不变。
