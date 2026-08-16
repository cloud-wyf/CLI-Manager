# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介

CLI-Manager 是基于 **Tauri 2** 的桌面应用（Windows 完整测试，macOS/Linux 实验性）：前端 React 19 + TypeScript 负责 UI 与状态，Rust 负责 PTY 守护进程、SSH 远程终端、Shell 解析、Git/Worktree 操作、多源历史解析、WebDAV 同步与 CLI Hook 桥接。

## 常用命令

```bash
npm install                  # 安装前端依赖（跑测试前必须先装，测试依赖 typescript）
npm run tauri dev            # 启动桌面应用（Rust + 前端）
npm run tauri build          # 构建发行版
npm run tauri:build:local    # 用 src-tauri/tauri.local.conf.json 构建本地包

npx tsc --noEmit             # 前端类型检查
npm run build                # tsc && vite build（仅前端产物）

cd src-tauri && cargo check              # Rust 编译检查
cd src-tauri && cargo test               # Rust 全部测试
cd src-tauri && cargo test <test_name>   # 单个 Rust 测试
```

### 前端测试

**前端测试不在 package.json 里注册**，而是 `scripts/*.test.mjs` 下的 60+ 个 `node:test` 文件，直接用 node 跑：

```bash
node scripts/terminalOsc.test.mjs             # 跑单个测试文件（最常用）
node --test scripts/                          # 跑全部
node scripts/terminalOsc.test.mjs --test-name-pattern "osc7"   # 跑文件内单个用例

npm run test:codex-proxy:e2e     # Codex app-server 代理 E2E（仅此两个进了 package.json）
npm run test:tauri-dev-proxy
```

这些测试用 `typescript` 编译目标 `.ts` 源文件到临时目录再断言，**不是** vitest/jest。改终端、diff、桌宠、git、history、ssh 相关逻辑时，`scripts/` 下通常已有同名测试，先找再改。

- 前端无 ESLint/Prettier；静态校验只有 `tsc --noEmit`。
- `npm run dev` 走 `scripts/dev-server.mjs`：探测 `localhost:1420`，已有本应用的 Vite server 则复用；端口被非本应用占用直接报错退出。
- 调试日志：`CLI_MANAGER_DEBUG=1` 开启 Rust Debug 日志输出到 Webview/Stdout，日志文件 `cli-manager.log` 位于 Tauri LogDir。

## 架构要点

### PTY 走独立守护进程，不走 Tauri 事件

**这是最容易踩坑的地方。** PTY 输出**不经过** Tauri command/event，而是 WebSocket 二进制帧：

- 后端 `src-tauri/src/bin/cli-manager-daemon.rs` + `src-tauri/src/daemon/` 是独立守护进程，UI 只是客户端。应用退出后任务继续跑，重启时 attach 回放。
- 前端 `src/terminal/transport/PtyHostSocket.ts` + `src/terminal/core/TerminalProcessManager.ts` 是传输核心。Tauri command 只负责 bootstrap（`pty_host_get_endpoint`）和 provider/hook 环境准备（`pty_prepare_create`），真正的 create/write/resize/close 全走同一条 WebSocket。
- 有流控：未确认字符达 100000 暂停 PTY reader，降到 5000 以下恢复；ACK 用 UTF-16 code units 计数。
- 改这一层前必读 `.trellis/spec/backend/pty-daemon-contracts.md`，帧格式、attach 顺序、replay spool 都有硬约束。

### IPC 边界

- 后端命令在 `src-tauri/src/lib.rs` 的 `invoke_handler![]` 集中注册——**新增命令必须在此登记**。实现分散在 `src-tauri/src/commands/*.rs`（terminal/fs/shell/history*/sync/git*/ssh*/desktop_pet/cc_connect/background/hook_settings/ccusage/ccswitch/model_pricing/…）。
- 后端 → 前端事件只有四个：`claude-hook-notification`、`history-index-status`、`background-task-activate-requested`、`tray-quit-requested`。前端另监听若干由 watcher 派生的事件（`git-changed`、`project-files-changed`、`subagent-transcript-append`、`ssh-agent-hook-gap`）。

### 终端与状态双数据源

- `src-tauri/src/pty/`（会话生命周期、`boundary.rs` 命令边界 OSC 解析）；`shell_resolver.rs` + `wsl.rs` 决定如何启动 PowerShell/CMD/Pwsh/WSL/Bash；SSH 远程终端走 `ssh_transport.rs` / `ssh_launch.rs`。
- 前端 `stores/terminalStore.ts` 管会话与激活态，`stores/terminalPaneTree.ts` 维护**分屏树**（水平/垂直分屏、拖拽 reorder/split 都在树上操作）。
- **Tab 状态有双来源**：CLI Hook（`hook`）与 Shell 集成 OSC（`shell`），按 `TAB_STATUS_PRIORITY` 合并出最终通知态（none/running/attention/done/failed）。改状态逻辑必须同时考虑两个来源。

### CLI Hook 桥接（Claude / Codex）

- `src-tauri/src/claude_hook.rs` 启动时在 `127.0.0.1` 绑定随机端口起 TCP server，一次性 token 校验，接收 SessionStart/UserPromptSubmit/Notification/Stop/StopFailure/PermissionRequest，转成 `claude-hook-notification` 发给前端。
- `hook_settings.rs` 负责把 hook 配置安装/卸载进 Claude/Codex 配置目录；`hook_client.rs` 是上报端。
- 前端在 `App.tsx` 监听：`SessionStart`/`UserPromptSubmit` 仅绑定 sessionId 不弹 toast，其余弹通知。实时统计依赖 hook 上报的 sessionId，未装 hook 时引导去设置。

### 数据层

- SQLite 通过 `tauri-plugin-sql`，**migrations 定义在 `lib.rs` 的 `migrations()`，当前到 v24**。新增表/列必须追加新 `Migration`（只增不改），不要修改历史 migration。
- 前端 `Database.load("sqlite:cli-manager.db")` 直接读写（见 `src/lib/db.ts`）。表包括 `projects`、`groups`、`command_templates`、`command_history`、`session_meta`、`sync_meta`、`ccusage_cache`、`model_prices`、`history_edit_audit`、`request_logs`、`ssh_hosts`、`ssh_host_groups`、`ssh_agent_integrations`。
- 用户偏好（设置/主题/快捷键/同步配置）走 `tauri-plugin-store`，由 `stores/settingsStore.ts` 管理，与 SQLite 分离。

### 前端状态（Zustand，`src/stores/`）

每个领域一个 store，约 25 个。Store 之间通过 `useXxxStore.getState()` 直接互调（如 terminalStore 读 settings/session）。改跨 store 的流程前看 `.trellis/spec/frontend/state-management.md`。

### 启动时序（`App.tsx`）

分阶段 `runStartupStage`：settings → sync/session 并行 + 预热 model pricing → `projectStore.fetchAll()` → **终端会话恢复**（`restoreSessions()` / `attachDaemonSession()`，可被设置关闭，也可弹窗让用户确认）→ 首屏后跑延迟任务（自动同步、检查更新）。窗口关闭行为由 `closeBehavior` 控制（最小化托盘 / 直接退出 / 询问）。

### 同步

`src-tauri/src/sync/` + `webdav/`：WebDAV 远端存储 + 冲突处理。启动与关闭时触发自动同步，冲突不静默覆盖，提示用户处理。

## 约定

- **国际化是强制的**：任何用户可见文案（按钮、菜单、tooltip、aria 标签、空状态、toast、系统通知、hook 通知脚本）必须同步 `zh-CN` 与 `en-US`，通过 `src/lib/i18n.ts` 的 `useI18n()` / `translateCurrent()` 取，禁止硬编码。交付前切换"设置 → 通用 → 界面语言"确认，时间格式不得在英文下变成 12 小时制。
- `src-tauri/capabilities/default.json` 控制 Tauri 权限与 asset 协议 scope。新增文件/资源访问能力时必须同步更新 capability。
- 终端背景图复制到 `appLocalData/backgrounds/<hash>.<ext>`，asset scope 锁死该目录。

## 修复与新需求前置（强制）

改任何 bug、加任何需求前，先过分诊闸机 `.trellis/spec/guides/fix-triage-guide.md`：

- **修 bug**：先判定"最小修复"还是"根因修复"。表现层静态值（颜色/文案/常量）走最小修复；行为性、跨边界、回归、偶发或你想加兜底的，一律走根因——产出根因陈述 + 发现清单，禁止只在症状处打补丁。
- **加需求**：动手前对照该文档 §5 的场景维度清单枚举场景（窗口焦点、分屏、WSL、Worktree、hook 装没装……），别只做主路径漏掉边界场景。
- 找全代码触点优先用 GitNexus，不可用时降级到 `.trellis/spec/*-contracts.md` 契约 + grep。

其余闸机见 `.trellis/spec/guides/index.md`：`task-delivery-checklist.md`（写文件前 + 提交前）、`tauri-user-file-security-checklist.md`（新增接收路径的 command 或放宽 assetProtocol/fs scope 时）、`version-update-checklist.md`（改版本号/发版前）、`code-reuse-thinking-guide.md`、`cross-layer-thinking-guide.md`。

契约文档按层分布在 `.trellis/spec/backend/`（26 份，含 pty-daemon、ssh-remote-terminal、history-index、webdav-sync、worktree-isolation 等）与 `.trellis/spec/frontend/`（12 份）。**动某个子系统前先读对应契约**。

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **CLI-Manager** (25532 symbols, 51499 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/CLI-Manager/context` | Codebase overview, check index freshness |
| `gitnexus://repo/CLI-Manager/clusters` | All functional areas |
| `gitnexus://repo/CLI-Manager/processes` | All execution flows |
| `gitnexus://repo/CLI-Manager/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
