# Implementation Plan

1. 完成远端同步、Trellis 规范读取、修复分诊和 GitNexus impact。
2. 按 IME / ANSI / diagnostics / facade 拆分 Pi 兼容模块并统一输出接线。
3. 在 PTY 环境边界补 truecolor 与 WSLENV 转发。
4. 抽取 Pi 历史恢复命令、参数清理和项目选择逻辑。
5. 更新 V1.3.3 Changelog、功能清单和前后端契约。
6. 运行 TypeScript、定向 Node、定向 Rust、cargo check、diff check 和 GitNexus detect_changes。
7. 不运行 dev/build/Tauri 启动命令；由用户新建 PowerShell Pi 终端手工验收。

## Regression Follow-up

8. 抽取通用 IME 锚点解析职责，删除“任意反色 cell 优先于真实 cursor”的错误分支。
9. terminal resize 后，闲置状态重新应用 Pi textarea resolver；composition 期间在
   reflow/render 后重算已失效锚点，Pi 底边解析继续复用同一有效输入锚点。
10. 增加闲置 resize 重钉、窄窗口反色状态栏、全屏重排、输入期间 resize、Pi
    双横线/无横线及非 Pi 回归测试。
11. 更新 V1.3.3 Changelog 与前端 IME 契约，运行定向 Node 测试、`npx tsc --noEmit`、
    `git diff --check` 和 GitNexus `detect_changes`；验证完成后提交 `fix(pi): 修复输入法编辑器锚点`
    并在正文关联 `Refs #177`。

## Editor Anchor Follow-up

12. 通用解析器先提供兜底锚点；Pi resolver 再通过可见 viewport 内的成对横线识别无提示符
    编辑器，优先区域内硬件光标，否则使用区域内反色软件光标；textarea resolver 最后定位
    同一区域下边框。
13. 回归覆盖全屏光标在编辑器上方、缩放后光标在右下状态区、多组横线、滚动提示横线、
    无有效编辑器、非 Pi 和编辑器外反色状态。

## Risk

- `PtyManager.create_with_launch`：CRITICAL；仅补缺省环境值，不改签名或生命周期。
- `XTermTerminal` / `useTerminalDisplay`：LOW；只接入共享转换与 reset。
- 历史恢复：LOW；Pi 使用独立 helper，保留 Claude/Codex/Grok 行为。
