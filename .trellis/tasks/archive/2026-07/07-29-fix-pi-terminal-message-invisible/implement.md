# Implementation Plan

1. 对将修改的 `useTerminalDisplay`、`XTermTerminal` 和 Pi compatibility 符号执行 GitNexus upstream impact，记录风险。
2. 将 `TerminalPiCompatibility.ts` 改为纯识别 + 有界 DEV 诊断模块，删除同步输出过滤。
3. 在 `useTerminalDisplay.ts` 增加通用可选诊断回调，覆盖 live raw/normalized 与 write-committed；保持 ACK 顺序不变。
4. 在 `XTermTerminal.tsx` 仅完成 Pi 上下文和诊断引用接线。
5. 重写 `terminalPiCompatibility.test.mjs`，验证识别、有界/脱敏摘要、生产/非 Pi 静默以及不改写输出。
6. 从 frontend spec 和 `CHANGELOG.md` 删除已证伪的 DEC 2026 根因结论，记录 V1.3.3 的诊断进展而非宣称已修复。
7. 运行 `npx tsc --noEmit` 与定向 Node 测试；运行 GitNexus `detect_changes` 检查影响范围。
8. 让用户在现有 Tauri dev 会话发送 `PI177-REPRO-你好`，读取 `cli-manager-dev.log` 后给出根因陈述和最终修复方案。

## Root-Cause Implementation

9. 修复 `processShellIntegrationOsc` 遗漏连续受管 OSC 之间普通文本的问题。
10. 撤销已证伪的 Pi viewport refresh，并将 OSC 测试改为使用真实 parser。
11. 对 Pi OSC 133 用户消息的每个 frame 拆分点运行回归测试。

## Risky Files / Rollback Points

- `src/hooks/useTerminalDisplay.ts`：共享终端输出与 ACK 热路径；任何异常必须保持原写入和 commit 顺序。
- `src/components/XTermTerminal.tsx`：高流量终端入口，只允许接线。
- `src/terminal/browser/TerminalPiCompatibility.ts`：Pi 专用职责边界。

## Validation Commands

```powershell
npx tsc --noEmit
node --test scripts/terminalPiCompatibility.test.mjs
```

禁止运行 `npm run build/dev`、`npm run tauri build/dev`。
