# 修复 Pi 终端消息不可见

## Goal

定位并修复 Issue #177：Pi Coding Agent 在 CLI-Manager 内置终端提交消息后，只显示灰色背景，文字不可见。

## Background

- 关闭 WebGL 后仍可复现，渲染器选择不是充分解释。
- Pi 的 `PI_TUI_WRITE_LOG` 包含目标文本、`38;5;188` 前景色和 `48;5;59` 背景色。
- 当前项目版本的 xterm 离线重放完整 Pi 日志正常；保留或删除 `CSI ?2026h/l` 都正常。
- 真实 `useTerminalOsc` 流水线离线重放正常，resize/reflow 测试也正常。
- 现有 `TerminalPiCompatibility` 删除同步输出序列的方案已被证伪，不能作为最终修复或项目契约保留。
- 当前缺少 Pi stdout 经 ConPTY/daemon 到前端 live frame，以及 xterm 写入完成后的同次证据。

## Root Cause

`useTerminalOsc` 的 shell integration 扫描器处理连续的 OSC 133 序列时，只写回每个 OSC
序列本身，没有写回当前游标与下一个 OSC 起点之间的普通 CSI/文本。Pi 将正式用户消息放在
`OSC 133;A` 与后续 `OSC 133;B/C` 之间，因此前端归一化删除了用户消息和 `38;5;188`
前景色，只留下灰色背景行。修复应位于该通用 OSC 边界，不能在 Pi 或 renderer 层补字。

## Requirements

- R1：Pi 相关职责继续位于独立模块，`XTermTerminal.tsx` 只负责接线。
- R2：新增仅在 Vite DEV 模式且识别为 Pi 会话时启用的诊断，记录 daemon live frame、标准化后文本和 xterm write callback 后的 buffer 状态。
- R3：诊断只记录固定 marker 命中、长度、ANSI 属性计数和 marker 所在行的 cell 属性；不得记录完整会话内容。
- R4：诊断复用现有 `cli-manager-dev.log` 持久化链路，不新增依赖、Tauri command 或 PTY 协议字段。
- R5：撤销 `CSI ?2026h/l` 过滤及其错误测试、spec 和 Changelog 结论；在获得边界证据前不猜测新的 ANSI workaround。
- R6：诊断不得改变非 Pi 会话、生产构建、frame ACK 顺序、replay 语义或 xterm 写入内容。

## Acceptance Criteria

- [x] Pi DEV 会话发送以 `PI177-` 开头的 marker 后，`%USERPROFILE%\.cli-manager\logs\cli-manager-dev.log` 同时出现 raw/normalized/write-committed 三阶段结构化摘要。
- [x] 摘要能判断 marker 在 daemon frame、标准化文本和 xterm buffer 的首次出现/丢失位置，并包含对应前景/背景/逆显/暗显属性。
- [x] 日志不包含 marker 所在行之外的终端正文，单条预览有固定上限。
- [x] 非 Pi 会话和生产构建不输出 `[pi177]` 诊断。
- [x] Pi 输出不再删除 `CSI ?2026h/l`，其他 ANSI、OSC 133 与文本保持原样。
- [x] Pi 正式用户消息在任意 daemon frame 拆分点下均逐字保留。
- [x] `npx tsc --noEmit` 和相关 Node 测试通过；不运行 dev/build/Tauri 启动命令。

## Manual Acceptance

- 2026-07-29：用户完整重启 CLI-Manager 后复测 Pi，确认提交消息文字正常显示，Issue #177 修复完成。

## Out of Scope

- 在证据确认丢失边界前修改 Rust PTY、daemon 协议或 xterm 主题。
- 新增设置项或用户界面。
- 自动启动、重启或构建 Tauri。

## Changelog Target

`V1.3.3`
