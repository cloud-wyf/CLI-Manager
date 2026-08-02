# 增加资源持续上涨诊断日志

## Goal

为“任务运行一段时间后 CLI-Manager CPU 与内存持续上涨”补齐端到端诊断证据，能够区分主进程、WebView、PTY daemon、终端子进程与前端输出积压。本任务只增加可观测性，不直接改变输出、渲染或进程生命周期行为。

## Background

- 复现条件暂不稳定，但均发生在有任务持续执行一段时间后。
- `TerminalProcessManager` 会在帧提交前保留输出，`PtyHostSocket` 也维护待消费输出；现有普通终端链路缺少积压数量和字节诊断。
- daemon 已限制单会话 ring buffer 为 2 MiB、总 buffer 为 128 MiB、客户端输出队列为 2 MiB，本轮不修改 daemon 协议或缓冲策略。
- GitNexus：`TerminalProcessManager` 与 `PtyHostSocket` 上游影响均为 MEDIUM；实现必须保持现有公开行为和方法签名兼容。

## Requirements

- 调试模式开启时，每 30 秒记录一次进程资源与 WebView 运行时快照。
- 进程资源按 Tauri 主进程、WebView 子进程、PTY daemon、daemon 子进程分类，记录进程数、CPU、内存和占用最高的进程。
- WebView 快照记录 JS heap（可用时）、DOM/Canvas/终端数量、会话数量、WebSocket 生命周期计数、待处理输出帧和字节数。
- 普通模式不周期采样；单会话积压达到 4 MiB 或 1024 帧时记录一次告警，降至阈值一半以下后记录恢复并允许再次告警。
- 日志不得包含终端正文、命令、路径、环境变量、认证信息或其他用户输入。
- 不新增依赖；仅新增内部资源诊断写入 IPC，不修改既有 PTY IPC、daemon 协议、数据库或设置结构，不新增用户可见文案。
- 继续复用现有单文件 10 MiB、保留 7 天的日志轮转。
- 资源诊断使用独立 JSONL 文件，避免周期快照污染主日志和前端崩溃面包屑。

## Acceptance Criteria

- [x] 调试模式关闭时没有新增周期快照，积压越阈值告警仍有效且不会重复刷屏。
- [x] 调试模式开启后，独立日志每 30 秒出现 `source=process` 与 `source=webview` 的 `runtimeSnapshot` 记录（已人工确认）。
- [x] 输出队列在入队、提交、reset、关闭与重新订阅后计数正确，不改变原有输出顺序、ACK 与重放行为。
- [x] 进程分类覆盖主进程、主进程子树、daemon 及 daemon 子树，重叠时 daemon 子树优先。
- [x] 不支持 `performance.memory` 的 WebView 返回空 heap 字段，不中断其他采样。
- [x] 日志内容不包含终端文本或敏感上下文。
- [x] `npx tsc --noEmit`、`cd src-tauri && cargo check` 与本任务相关测试通过；Rust 全量仅保留 3 个可独立复现的既有失败，其余 774 个通过。
- [x] `CHANGELOG.md` 的 `V1.3.3` 记录本次诊断能力。

## Notes

- Changelog Target: `V1.3.3`
- 正式版日志位置：`%USERPROFILE%\.cli-manager\logs\resource-diagnostics.log`；开发版使用 `resource-diagnostics-dev.log`。
- 运行态人工复现不在自动检查范围内；不主动启动 Tauri 开发窗口。
