# Design

## Architecture

数据流：Hook bridge event → `App.tsx` 校验共享事件筛选与窗口焦点 → 独立调用系统 Toast 和任务栏提醒 IPC → Rust 在 Windows 映射为 `FlashWindowEx`，非 Windows 安全无操作。

安装状态修复只改前端展示：后端继续无条件返回四种 CLI 状态；桥接开关仅控制运行能力和详情/操作区，不控制状态徽标与全局刷新入口。

## Contracts

- IPC：`set_taskbar_attention(mode: "finite" | "untilFocused" | null, flashCount?: number)`。
- `finite` 映射 `FLASHW_TRAY | FLASHW_TIMERNOFG`，`uCount=flashCount`。
- `untilFocused` 映射 `FLASHW_TRAY | FLASHW_TIMERNOFG`，`uCount=u32::MAX`，由聚焦时的停止调用终止。
- `null` 映射 `FLASHW_STOP`。
- Rust 边界验证 mode 与 1..20 次数；测试纯参数构造逻辑，避免单测依赖真实窗口。
- 前端事件筛选仍使用 `systemNotificationEvents`，避免迁移已有用户选择。

## Compatibility

- 新设置缺失或非法时迁移到 `true / finite / 5`。
- 非 Windows IPC 返回成功且不操作。
- 现有 Toast、第三方通知、标签状态、应用内 Toast 和桥接能力判断保持不变。

## Risks

- `Settings` 为 CRITICAL 共享类型：通过穷尽同步策略、默认值与 load migration 控制风险。
- Tauri 获取 HWND/Win32 调用可能失败：错误返回前端并仅记录调试日志，不阻断 Hook 主链路。
- 托盘隐藏无任务栏按钮：不显示窗口、不制造按钮，保持无操作语义。

