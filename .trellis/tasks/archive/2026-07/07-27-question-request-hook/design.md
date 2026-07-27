# 提问通知 Hook 技术设计

## Architecture

两端使用精确的 `PreToolUse` matcher，并把 CLI-Manager 命令事件统一设为 `Notification`：

```text
Codex request_user_input / Claude AskUserQuestion
  -> PreToolUse exact matcher
  -> cli-manager __hook --event Notification
  -> hook_client preserves toolName
  -> daemon/app validation
  -> existing attention state + toast/system/third-party notification
```

不增加新的跨层事件枚举。前端通过 `source + toolName` 判断提问通知，使用专用 i18n 文案；其余 `Notification` 保持原行为。

## Installation Contract

- Codex Attention 模块同时拥有 `PermissionRequest` 和 `PreToolUse(request_user_input -> Notification)`。
- Claude Attention 模块同时拥有 `Notification(permission_prompt|idle_prompt)` 和 `PreToolUse(AskUserQuestion -> Notification)`。
- 状态检查要求 Attention 模块的两个条目都存在。
- 模块卸载按 `hook event + source + command event` 精确删除提问条目，避免删除 Claude Subagent 模块拥有的通用 PreToolUse。
- Codex Hook 事件清单、状态键和规范化哈希加入 `PreToolUse -> pre_tool_use`；matcher 参与哈希。
- SSH agent 模板写入相同条目，确保远程行为一致。

## Compatibility

- 旧安装缺少新条目时返回 partial/outdated，用户重新安装即可升级。
- 不改现有 `Notification`、`PermissionRequest` 设置结构，持久化数据无需迁移。
- 保留所有非 CLI-Manager Hook；完整安装只替换带 `__hook` 标记或已知旧脚本的条目。
- Codex/Claude 不支持对应工具时，matcher 永远不命中，不影响启动。

## Notification Behavior

- `Notification` 继续映射为 attention，不引入新的 tab 状态。
- `toolName=request_user_input|AskUserQuestion` 时，toast 和系统通知使用“需要选择或回答”文案。
- 窗口聚焦、托盘、后台任务、分屏、多会话和 Workspan 路由全部复用现有通知目标激活逻辑。
- 第三方通知继续接收 `Notification`，无需配置迁移。

## Rollback

卸载 Attention 或完整 Hook 时删除新增 CLI-Manager 条目。回滚代码后重新安装旧模板即可恢复原配置；无数据迁移需要回滚。
