# Technical Design

## Data Flow

```text
Pi stdout -> ConPTY -> PtyHost binary frame -> TerminalProcessManager
  -> useTerminalDisplay decode/normalize -> xterm.write -> xterm buffer/render
```

诊断锚点放在前端已经拥有的三个边界：

1. `queuePayload` 解码后的 `rawText`：代表从 daemon 收到的原始 live frame 文本。
2. `normalizeOutputRef` 后的文本：确认 OSC 等前端规范化是否删除 marker。
3. `terminal.write` callback：扫描 xterm buffer，确认 parser 提交后 marker 与 cell 属性是否存在。

## Module Boundary

- `TerminalPiCompatibility.ts` 负责 Pi 会话识别和 DEV 诊断摘要，不修改输出字节。
- `useTerminalDisplay.ts` 提供通用、可选的输出诊断回调点，不包含 Pi 判断。
- `XTermTerminal.tsx` 创建 Pi 诊断实例并把引用传给 display hook，不实现诊断算法。

## Diagnostic Contract

- 固定 marker 前缀：`PI177-`。
- 仅 `import.meta.env.DEV && isPiTerminalContext(context)` 时输出。
- raw/normalized 阶段记录：frame kind、sequence、UTF-16 长度、marker 命中、`38;5;188`、`48;5;59`、同步输出 begin/end 数量。
- write-committed 阶段记录：marker 是否存在、buffer 行号、受限行预览，以及 marker cell 的 fg/bg/color mode/inverse/dim/bold。
- 跨 frame marker 通过模块内部有界尾部窗口识别；缓存不得无限增长。
- 使用现有 `logInfo()` 写入 `cli-manager-dev.log`，避免新后端命令和热重载之外的重启要求。

## Compatibility and Rollback

- 回调为可选；未提供时 `useTerminalDisplay` 行为不变。
- 生产构建静默；非 Pi 会话静默。
- 诊断确认根因并落地最终修复后，删除临时诊断接线或收敛为长期可维护的 Debug Mode 诊断。
- 立即撤销已证伪的同步输出过滤，恢复 Pi 原始字节进入 xterm。

## Final Fix

- 在 `processShellIntegrationOsc` 找到受管 OSC 起点后，先写回 `cursor..start` 的普通文本。
- `none`、`partial`、中断和完整序列分支从 `start` 继续处理，避免重复写入。
- 使用真实 `terminalOscParse.ts` 构造 Pi OSC 133 消息块，对每个字符边界拆分输入，断言
  消息正文、前景色、背景色及同步输出序列逐字保留。
