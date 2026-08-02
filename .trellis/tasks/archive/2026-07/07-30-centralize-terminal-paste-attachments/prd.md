# centralize-terminal-paste-attachments

## Goal

将终端通过 Ctrl+V、右键粘贴或浏览器粘贴事件接收的剪贴板图片，统一保存到 CLI-Manager 用户数据目录的 `attachments` 子目录，避免在每个项目中生成 `.cli-manager/attachments`。

Windows 示例：`C:\Users\1\.cli-manager\attachments`。

## Background

- 当前前端以项目路径优先、会话 cwd 兜底，调用 `file_attach_data`。
- 当前 Rust 命令在该根目录下创建 `.cli-manager/attachments`。
- 项目已有 `app_paths::cli_manager_data_dir()`，Windows 下解析为 `%USERPROFILE%\.cli-manager`，应直接复用。
- GitNexus 影响分析结果为 LOW；`savePastedImageForTerminal` 的直接调用方为粘贴事件和统一剪贴板读取链路。

## Requirements

- R1：所有本地终端会话共用 `<cli_manager_data_dir>/attachments`，不再依赖项目路径或会话 cwd。
- R2：`file_attach_data` 返回可直接传入终端的绝对附件路径。
- R3：附件过期清理使用同一个全局目录，继续保留 2 天保留期。
- R4：复用 `app_paths::cli_manager_data_dir()`，不新增依赖或配置项。
- R5：PowerShell、CMD、Pwsh、WSL/Bash、分屏、多会话和 Workspan 均走相同保存目录；现有 shell 路径格式化逻辑保持不变。
- R6：用户可见的粘贴失败行为保持不变。
- R7：在 `CHANGELOG.md` 的 `V1.3.3` 下记录本次行为变更。

## Acceptance Criteria

- [x] 粘贴剪贴板图片后，文件写入 `%USERPROFILE%\.cli-manager\attachments`。
- [x] 项目目录及会话 cwd 下不再新建 `.cli-manager/attachments`。
- [x] 终端收到的路径指向实际生成的图片文件。
- [x] 图片文件名去重、大小限制和 2 天过期清理行为保持有效。
- [x] 无项目会话也能粘贴图片，不再因缺少项目路径或 cwd 返回空结果。
- [x] 前端 TypeScript 类型检查和 Rust 相关测试/编译检查通过。
- [x] `CHANGELOG.md` 的 `V1.3.3` 已包含变更说明。

## Out of Scope

- 不迁移或删除旧项目目录中的附件。
- 不修改附件保留时长。
- 不新增附件目录设置项。
- 不改变资源管理器文件路径粘贴和纯文本粘贴逻辑。

## Changelog Target

`V1.3.3`
