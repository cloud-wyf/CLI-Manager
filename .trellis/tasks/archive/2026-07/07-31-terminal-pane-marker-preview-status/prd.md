# 终端状态标记 Demo 状态颜色联动

## Goal

将“完成 / 错误 / 审批”颜色配置改为可选择的预览状态，使两个终端标记样式 Demo 使用当前选中状态的颜色，便于用户直接比较效果。

## Requirements

- 三个状态以可点击选项展示，默认选中“完成”。
- 点击状态选项后，完整边框与顶部标记两个 Demo 同步使用对应配置颜色。
- 点击颜色控件时同时选中所属状态；修改颜色后 Demo 实时更新。
- 预览状态仅为设置页本地状态，不新增持久化字段，不改变真实终端状态逻辑。
- 保持现有颜色值编辑、开关禁用和中英文文案兼容。

## Acceptance Criteria

- [ ] 三个状态均可通过鼠标和键盘选择，并有清晰的选中反馈。
- [ ] 两个 Demo 的边框颜色始终与当前选中状态颜色一致。
- [ ] 颜色控件修改值后，对应 Demo 立即使用新颜色。
- [ ] 设置关闭时，状态选项与颜色控件维持现有禁用行为。
- [ ] TypeScript 检查、终端状态标记回归测试和差异检查通过。

## Changelog Target

`[TEMP]`

## Out of Scope

- 不持久化当前预览状态。
- 不修改 Hook 状态判定、终端运行时标记优先级或设置数据结构。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
