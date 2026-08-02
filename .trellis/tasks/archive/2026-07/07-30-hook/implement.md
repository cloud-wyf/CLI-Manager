# Implementation

## Checklist

- [x] 更新 Settings 类型、默认值、迁移、同步策略。
- [x] 新增 Rust 任务栏提醒命令、Win32 参数构造测试并注册 IPC。
- [x] 在 App Hook 链路独立触发提醒并在窗口聚焦时停止。
- [x] 更新 Hook 设置 UI、全局刷新、状态徽标与中英文文案。
- [x] 更新 CLI Hook 契约、CHANGELOG V1.3.3、功能清单。
- [x] 运行 GitNexus detect_changes 与静态/单元检查。

## Validation

- `npx tsc --noEmit`
- `cd src-tauri && cargo check`
- `cd src-tauri && cargo test`
- `git diff --check`

## Risk / Rollback Points

- `src/stores/settingsStore.ts`：共享 Settings 迁移必须完整。
- `src/App.tsx`：任务栏失败不得改变 Hook 事件处理时序。
- `src-tauri/src/commands/system_notification.rs`：Win32 flags/count 必须由单测固定。
- `HookSettingsPage.tsx`：桥接关闭只影响详情和操作，不影响检测与徽标。

## Verification Result

- `npx tsc --noEmit`：通过。
- `cargo check`：通过。
- 任务栏参数定向测试：3/3 通过。
- `cargo test`：766 通过、1 跳过、3 个未修改模块测试失败；失败可定向稳定复现，分别为 Pi extension 卸载状态 1 项、request logs 行数 2 项，与本任务文件无调用关系。
- `cargo fmt -- --check`、`git diff --check`：通过。
- GitNexus `detect_changes`：CRITICAL，来源为共享 `Settings` 接口；穷尽同步分类与 TypeScript 检查已覆盖。
