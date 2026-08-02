# fix-terminal-cursor-visibility

## Goal

恢复终端光标的原生显隐行为：启用终端背景图后打开 Claude CLI 时光标仍可见，Codex CLI 执行期间不再被 CLI-Manager 的输出转换逻辑强制延迟显示或长期隐藏。

## Background

- `src/components/XTermTerminal.tsx:706` 会截获 CLI 输出中的 DECTCEM `CSI ?25h` / `CSI ?25l`。
- 当前实现立即透传隐藏序列，但移除显示序列并延迟 80 ms 写回；持续重绘会反复重置计时器，使光标长期保持隐藏。
- 人工验证确认：移除通用拦截后 Codex 会在 Working、正文和底部状态栏之间闪烁；关闭背景图仍可复现，而外部 PowerShell 终端正常，说明这是 xterm 分片渲染暴露中间显隐状态，不是背景图归一化导致。
- Claude 在背景图模式下仍无光标；`normalizeTerminalTuiComposerBackground()` 的全视口分支会清除任何 inverse flag，而 Claude 使用孤立反色单元格作为软件输入光标。
- GitNexus 上游影响分析结果为 LOW：直接调用方为 `XTermTerminal`，再上游为 `PaneLeafView`。
- 该问题属于前端终端渲染层的状态相关行为缺陷。人工迭代证明，基于 Codex 可视结构推断并替换光标会在运行态输入编辑时产生新的位置错误，因此最终不接管 Codex 光标。

## Requirements

- 删除通用 DECTCEM 延迟拦截。
- 删除 Codex 专用可视光标、输入框锚点识别及 DECTCEM 改写，Codex 输出直接交给 xterm。
- 透明背景归一化只清除宽反色区域，保留 Claude 的孤立反色软件光标。
- 保留现有 Pi 终端输出兼容转换，其结果直接交给 xterm 处理。
- Claude、普通 Shell、Pi 及其他终端完整保留 CLI 自身的光标显隐序列，不进入 Codex 可视光标分支。
- 同步删除针对旧延迟光标行为的测试断言与失效规约。
- 不新增依赖，不修改 Tauri/Rust 后端或用户配置。

## Acceptance Criteria

- [ ] 背景图开启时启动 Claude CLI，输入区光标能够正常显示。
- [x] Codex 不再经过 CLI-Manager 专用光标显隐、定位或覆盖逻辑。
- [x] Pi 输出兼容转换仍被调用，转换后的完整输出直接写入 xterm。
- [x] 普通终端、Claude 和 Pi 不引入 Codex 专用光标控制。
- [x] 相关定向测试与 `npx tsc --noEmit` 通过。
- [x] `CHANGELOG.md` 的 `V1.3.3` 条目记录该修复。

## Out of Scope

- 修改 Claude、Codex 自身的光标策略。
- 修改全局光标样式、宽度或闪烁设置。
- 修改终端背景图渲染、透明度或 WebGL 策略。

## Changelog Target

`V1.3.3`

## Notes

- 用户已明确批准方案和创建任务。
- 本任务为轻量根因修复，仅需 PRD。
- 2026-07-31 人工验证：Claude 背景图光标已修复；Codex 显示防抖会错误隐藏运行时光标，已撤销，位置闪烁仍待按外部终端行为继续定位。
- 2026-07-31 用户批准最终方案：Codex 使用输入框结构定位的专用稳定可视光标；其他终端保持原生行为。
- 2026-07-31 人工复测发现运行时输入会在内容起点与末尾闪烁；根因是 Codex 在同一输入行重绘时短暂把硬件光标放回提示符后。稳定锚点现区分正常亮度输入与 dim 占位文本，前者固定到最后一个占用单元格之后，后者仍停在输入起点。
- 2026-07-31 第二次人工复测证明亮度假设不成立：Codex 运行态会把已输入内容也标为 dim。根因类别为隐式假设 + 测试覆盖缺口；最终判定改用运行态结构标记，dim 仅用于非运行态占位回退。
- 2026-07-31 用户最终决定取消全部 Codex 专用光标处理。上述稳定光标实验、结构标记和测试已全部删除，保留 Claude 背景图光标修复。
