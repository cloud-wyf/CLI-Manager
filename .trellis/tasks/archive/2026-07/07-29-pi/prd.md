# Issue #177：Pi 终端兼容与历史恢复

## Goal

在 V1.3.3 根因修复 Pi 0.82.1 的中文输入法定位、工具状态背景和本地历史恢复问题。

## Root Causes

- IME 扫描遇到第一条横线即返回，把 composer 内部分隔线误认成底边。
- IME 回归：xterm 在 terminal resize 时通过 `_syncTextArea()` 把闲置 helper textarea 写回
  TUI 硬件光标；应用的 resize 回调在尚未 composition 时直接返回，没有恢复 Pi composer
  底边锚点，导致下一次 Windows IME 从屏幕右侧启动。
- composition 开始后冻结的行列坐标也必须在终端缩放/全屏 reflow 后失效，否则组合文字会
  继续使用旧 viewport 行并上下错位。
- 通用解析器假设输入区存在 `>` / Shell 提示符；Pi 编辑器只有成对横线和反色软件光标。
  全屏时因此回退到编辑器上方的硬件光标，缩放后又会回退到右下状态区光标。
- Windows PTY 未声明 truecolor，Pi 降级到存在颜色冲突的 256 色；旧方案还依赖 xterm 私有缓冲区写 API。
- Pi 已进入历史来源注册表，但来源匹配、恢复命令和当前项目选择未同步接入。

## Requirements

- 组合文字保持真实输入行；helper textarea 使用限定范围内最后一条 composer 底边。
- Pi 编辑器必须通过可见 viewport 内的成对横线独立识别，并兼容横线中的滚动提示；真实
  cursor 在区域内时优先，否则只接受区域内的反色软件光标。
- 当前 buffer cursor 位于已识别输入区域时必须优先使用真实 cursor，不得以任意反色单元
  覆盖；终端 resize/reflow 必须重新解析 composition 锚点。
- 非 composition 状态发生 terminal resize 时，必须在 xterm `_syncTextArea()` 之后重新应用
  CLI 专用 textarea resolver，并保留下一帧重钉以覆盖异步 render。
- 通用 IME 锚点解析与 DOM/事件生命周期按职责拆分；Pi 专用算法继续留在
  `TerminalPiIme.ts`，`XTermTerminal.tsx` 只接线。
- Windows 默认补 `COLORTERM=truecolor` 且不改 `TERM`；非 Windows 保持
  `TERM=xterm-256color`；WSL 通过 `WSLENV` 转发 `COLORTERM`。
- 写入 xterm 前用可跨 frame 的 CSI 转换器清除 Pi 内置深浅主题工具状态背景；保留前景、用户/自定义背景、Diff 与其他 ANSI/OSC。
- live、replay、初始序列化快照共用转换器，reset/dispose 清空残片。
- Pi 本地恢复使用 `pi --session <session-id>`，清理冲突 Pi 参数并保留普通参数。
- 项目选择顺序固定为 Worktree、来源+cwd/project-key、当前筛选项目、唯一候选、选择框。
- SSH Pi 恢复不在本次范围；不新增依赖、不修改 Pi 安装目录。

## Acceptance

- 定向 IME、ANSI、PTY 环境与历史恢复回归通过。
- `npx tsc --noEmit`、定向 Rust 测试、`cargo check` 通过。
- 新建 PowerShell Pi 终端手工验证候选框、三种工具状态和历史恢复。
- 在窄窗口、全屏窗口以及输入期间切换窗口尺寸时，组合文字保持输入行，候选框保持在
  composer 底边下方。

## Changelog Target

`V1.3.3`
