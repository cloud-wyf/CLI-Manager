# Design

## Diagnostic Boundaries

进程资源由 Rust 主进程旁路采样；WebView 内部状态由前端单例聚合。Rust 是独立 JSONL 文件的唯一写入者，WebView 通过受限的内部 IPC 提交结构化指标，两侧按 30 秒周期和时间戳关联。

## Backend

- 新增单例资源诊断线程，由现有 `set_debug_logging` 同步启停。
- 复用现有滚动写入器输出 `resource-diagnostics.log`（开发版为 `resource-diagnostics-dev.log`），单文件 10 MiB、保留 7 天。
- `sysinfo` 保持跨采样状态，首次采样标记 CPU 尚未形成有效区间，后续按 30 秒间隔刷新。
- 读取现有 daemon discovery PID，并基于父进程链分类：daemon 子树优先，其余主进程子树归为 WebView/应用子进程。
- 日志只输出角色、PID、进程名、CPU、RSS 和聚合值，不输出命令行。

## Frontend

- `TerminalProcessManager` 为每个输出状态维护 O(1) 的排队字节计数，并提供有界诊断快照。
- `PtyHostSocket` 维护待监听输出的 O(1) 字节计数，并扩展只读生命周期快照。
- 新增运行时诊断协调器；调试模式开启时立即采样，之后每 30 秒采样，关闭时清理定时器。
- 诊断记录通过独立 helper 调用内部 IPC，不再进入普通 `logInfo` 或崩溃面包屑。
- 快照只保留积压最大的前 5 个会话，避免日志自身放大内存和磁盘占用。

## Threshold Policy

- 告警：单会话 `queuedBytes >= 4 MiB` 或 `queuedFrames >= 1024`。
- 恢复：两项同时降到各自阈值的一半以下。
- 同一越界周期只写一次告警和一次恢复；不丢弃、不压缩、不跳过任何输出帧。

## Compatibility

- 不修改已有调用方签名、序列化协议和 ACK 顺序。
- 新增的诊断写入 IPC 仅接受固定的 level/source/event 组合，单条 JSONL 最大 64 KiB。
- `performance.memory` 是可选 Chromium 扩展；缺失时记录 `null`。
- daemon 已有有界 buffer，确认与本任务无关，不扩展协议。
