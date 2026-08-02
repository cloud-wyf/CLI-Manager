# 项目右键菜单增加外部终端打开

## Goal

在项目列表的右键菜单中提供“在外部终端中打开”，让用户直接以该项目目录作为工作目录启动系统外部终端。

## Background

- 用户要求在“项目的右菜单”增加外部终端打开能力。
- 本任务属于新增功能，必须覆盖本地项目、Worktree、目录失效及不同终端运行环境等场景。
- GitNexus 语义查询未命中相关流程，已降级使用精确搜索补全代码触点。
- `src/components/sidebar/index.tsx` 的项目右键菜单已有“打开终端”，但它受 `useExternalTerminal` / `compactMode` 控制，常规模式下会打开内置终端，没有一个始终显式启动外部终端的独立入口。
- 同文件已有 `openProjectExternally()`，会校验项目能力并把项目路径、名称、Shell 与启动命令交给 `openWindowsTerminal()`，可直接复用。
- `sidebar.menu.openExternalTerminal` 已有 `zh-CN` 与 `en-US` 文案，无需新增翻译键。
- `src/lib/externalTerminal.ts` 已封装 Tauri `open_windows_terminal` 调用；本任务不改变该跨平台启动契约。

## Requirements

- 在项目右键菜单中增加外部终端入口。
- 入口仅加入普通项目节点，不加入 Worktree 节点。
- 复用项目已有的外部终端配置和启动能力，不引入新的终端依赖或重复配置。
- 新入口调用 `openProjectExternally([project])`，使用项目实际路径、名称、Shell，并执行项目配置的 CLI 启动命令。
- 仅当当前“打开终端”会启动内置终端时显示独立入口；`compactMode` 或全局外部终端模式下，现有首项已经是“打开外部终端”，不得重复显示同义菜单项。
- 菜单文案复用现有中英文翻译；启动失败沿用现有外部终端错误处理。
- 不改变现有“打开内部终端”等项目操作行为。

## Acceptance Criteria

- [x] 右键点击项目后可见“在外部终端中打开”菜单项。
- [x] Worktree 右键菜单保持不变。
- [x] 点击后以该项目的实际目录为工作目录启动已配置的外部终端。
- [x] 外部终端执行项目配置的 CLI 启动命令，并沿用项目 Shell。
- [x] `compactMode` 或全局外部终端模式下不出现两个“打开外部终端”菜单项。
- [x] 中英文界面显示已有对应翻译，启动失败沿用现有错误提示。
- [x] 现有项目右键菜单功能及内部终端启动行为无回归。

## Scenario Matrix

- 窗口焦点：菜单触发时窗口聚焦；启动外部终端后焦点允许转移到新进程。
- 分屏 / Workspan：功能作用于被右键点击的项目，与当前 Pane、Tab、Workspan 无关。
- 最小化 / 托盘：入口仅从可见项目菜单触发，不新增后台触发路径。
- 运行环境：复用已有 `open_windows_terminal` 对 PowerShell、CMD、Pwsh、WSL、Bash 的支持范围，不新增平台分支。
- Worktree：不新增入口，现有行为保持不变。
- CLI Hook：与 Hook 安装状态无关。

## Changelog Target

`V1.3.3`

## Technical Notes

- 预计仅修改 `src/components/sidebar/index.tsx` 的项目菜单渲染，并增加针对菜单条件与调用目标的轻量回归测试。
- 更新 `CHANGELOG.md` 的 `V1.3.3` 与 `docs/功能清单.md`。
- 不修改 Rust IPC、数据库、配置结构、依赖或 Worktree 菜单。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
