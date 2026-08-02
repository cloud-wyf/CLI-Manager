# Bug Analysis: Pi IME 窄屏漂移与全屏错位

## 1. Root Cause Category

- **Category**: D（测试覆盖缺口）+ E（隐式假设）。
- **Specific Cause**: 通用解析器隐式假设编辑器存在可识别提示符，但 Pi 编辑器只用成对
  横线和反色软件光标表达输入区；全屏和 resize 后硬件光标位于编辑器外时，组合文字与
  helper textarea 都从错误的通用兜底锚点启动。

## 2. Why Fixes Failed

1. 上次修复只验证 Pi resolver 能从“有效输入锚点”找到最后一条横线，没有验证 Pi 无提示符
   布局能否自行产出这个前置锚点。
2. 测试只覆盖静态 buffer 行，没有覆盖 xterm `_syncTextArea()` 与应用 resize 回调的调用顺序。
3. Pi 专用职责虽然已经拆分，但通用锚点解析仍嵌在 IME 事件控制器中，难以直接做行为测试。

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|---|---|---|---|
| P0 | Architecture | 抽取 `terminalImeAnchor.ts`，让锚点解析可独立验证 | DONE |
| P0 | Test Coverage | 覆盖无提示符编辑器、状态区 cursor、多组/滚动横线、区域外反色和非 Pi | DONE |
| P0 | Documentation | 规范明确 idle/composing 两种 resize 路径与 xterm 写回顺序 | DONE |
| P1 | Manual Check | 同时验收窄窗口、全屏、输入期间切换尺寸 | TODO（用户验收） |

## 4. Systematic Expansion

- **Similar Issues**: 分屏拖拽、DPI/字体变化和显示器切换也会触发 xterm resize 写回，必须
  同时覆盖闲置 textarea 重钉与 composition 锚点失效路径。
- **Design Improvement**: CLI 专用 composition resolver 可修正通用兜底锚点，textarea
  resolver 再从同一编辑器区域定位下边框；`XTermTerminal.tsx` 保持纯接线。
- **Process Improvement**: IME 布局修复必须同时覆盖静态结构和窗口状态转换，不能只测最终
  buffer 快照。

## 5. Knowledge Capture

- [x] 更新 `.trellis/spec/frontend/component-guidelines.md`。
- [x] 更新 V1.3.3 Changelog 与功能清单。
- [x] 在原 Issue #177 任务中保存本复盘。
- [x] 仓库确认不存在 `src/templates/markdown/spec/` 镜像，无需同步。
- [ ] 不执行自动提交；按用户要求保留工作区改动。
