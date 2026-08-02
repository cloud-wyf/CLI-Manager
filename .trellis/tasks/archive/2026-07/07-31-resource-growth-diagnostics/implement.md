# Implementation

- [x] 加载前后端规约并再次确认计划触点的 GitNexus 影响。
- [x] 实现 Rust 进程分类、调试开关和 30 秒资源采样日志。
- [x] 为 `TerminalProcessManager` 增加排队字节计数、阈值状态与诊断快照。
- [x] 为 `PtyHostSocket` 增加待输出字节计数、阈值状态与诊断快照。
- [x] 增加前端运行时诊断协调器并接入 `App` 调试模式生命周期。
- [x] 添加 Rust 分类测试并检查前端所有清理路径。
- [x] 更新 `CHANGELOG.md` 的 `V1.3.3`。
- [x] 运行 `npx tsc --noEmit`、`cargo check`、`cargo test`（全量 Rust 的 3 个既有失败可独立复现，其余 774 个通过）。
- [x] 运行 GitNexus `detect_changes`；整类映射为 CRITICAL，实际修改方法复核为 LOW/MEDIUM，影响限于预期终端与诊断链路。
- [x] 将资源诊断迁移到独立 JSONL 文件并复用 10 MiB/7 天轮转。
- [x] 新增受限前端写入 IPC，移除周期快照对普通日志和崩溃面包屑的占用。
- [x] 更新诊断测试、规约和 `V1.3.3` 说明并重新执行质量门禁。
