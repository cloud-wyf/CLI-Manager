# 验证结果

## 根因与发现清单

- 根因一：转换 IPC 只返回摘要，前端立即依赖尚未更新的索引重读目标详情；读取失败后 `historyStore` 保留旧来源详情，`resumeConversation` 又未验证详情与当前视图身份，最终用旧 Codex 数据恢复 Claude 视图。
- 根因二：Windows 复用已存在的混合大小写 Claude 项目目录时，转换结果返回从 `cwd` 编码出的全小写 `project_key`，扫描器却返回磁盘真实目录名；同一路径在项目键精确校验处被拒绝为 `session_file_not_indexed`。
- 根因三：删除入口使用来源级进程扫描，只要机器上任意进程名或命令行包含 Claude/Codex 就拒绝所有同来源历史文件；该信号不能识别用户实际选中的 session。
- 根因四：索引 ready 与手动刷新调用阻塞式 `loadSessions()`，先把虚拟列表替换为单个 loading 行并将分页 offset 清零；浏览器在列表高度缩小时把 `scrollTop` 压回零，组件又因 `loadingSessions` 变化重置可见数量。
- 日志证据：请求键为 `f--ws-labway-fee-control`，规范化目标路径的实际父目录为 `F--ws-Labway-Fee-Control`，路径范围校验通过后没有命中扫描候选。
- `src-tauri/src/commands/history.rs`：转换 writer/parser 已可直接构建目标详情；Claude 写入后从规范化目标路径读取真实项目键；已修改返回契约和两个方向/普通重开的往返断言。
- `src/stores/historyStore.ts`：转换摘要/详情原子激活；普通详情请求先清空旧值并验证返回身份；已修改。
- `src/components/HistoryWorkspace.tsx`：转换后不再立即读取索引，组件只消费与当前视图身份一致的详情；已修改。
- `src/components/HistoryWorkspace.tsx`：可见会话数量不再随 loading 状态重置；已修改。
- `src/lib/historySessionIdentity.ts`：本地/WSL/POSIX 路径感知的共享身份比较；已新增。
- `resolve_session_file_ref`：MEDIUM 影响且安全边界正确；确认不修改。
- `delete_session_tree_with_backup_root`：LOW 影响；移除无法定位 session 的来源级进程 guard，保留路径校验、备份、失败回滚和 manual recovery lock。
- `build_file_restore_plan` / 备份恢复：继续保留 `history_target_tool_running`，确认不放宽覆盖写入边界。
- `loadSessions`：MEDIUM 影响（6 个直接调用方）；增加加法式后台选项，前台默认语义不变。
- `ensureHistoryIndexListener`、`openHistory`、`loadMoreSessions`、`refreshIndex`、`HistoryWorkspace`：LOW 影响；自动/手动/远程刷新已有列表时接入后台模式。
- SSH 历史：只读且不进入本地转换；确认无关。

## Bug Analysis

### 1. Root Cause Category

- **Category**：B（跨层契约）+ C（状态/时序）+ D（测试覆盖缺口）+ E（隐式假设）。
- **Specific Cause**：转换契约没有覆盖 response -> Store -> ordinary reopen 的完整身份往返；删除把来源进程存在等同于目标文件活跃；刷新把后台数据更新等同于初次阻塞加载。这些隐式等价关系分别在 Windows 目录复用、同来源多会话和虚拟列表滚动状态下失效。

### 2. Why Previous Fix Was Incomplete

1. 上一轮修复了转换运行态误阻断和无同来源项目时的 cwd 恢复，但没有覆盖转换后立即激活详情。
2. 第一版修复覆盖了转换响应直接激活，但把“普通后续打开仍走现有索引”当作既有正确路径，没有验证转换结果字段能作为该路径的请求参数。
3. Rust 测试只从扫描结果重新读取文件，没有用返回的 `file_path/source/project_key` 调用 `validate_session_file_ref`。
4. 测试每次创建全新小写项目目录，没有预建大小写不同但 Windows 视为同一路径的 Claude 目录，因此扫描键与编码键总是偶然一致。

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|---|---|---|---|
| P0 | Architecture | 转换响应直接携带后端解析后的目标详情 | DONE |
| P0 | Architecture | Claude 项目键取写入后规范化目标文件的实际父目录名 | DONE |
| P0 | Runtime invariant | Store/组件校验 source + session id + file path | DONE |
| P0 | Test coverage | 增加混合大小写既有目录 + 转换结果参数普通重开回归 | DONE |
| P0 | Test coverage | 增加转换状态接线和身份比较回归 | DONE |
| P0 | Boundary | 显式删除移除来源级进程 guard，保留备份恢复 guard | DONE |
| P0 | State model | 已有列表刷新使用后台模式并按源 offset 保留加载范围 | DONE |
| P0 | Test coverage | 增加删除/恢复 guard 边界与列表刷新状态回归 | DONE |
| P1 | Documentation | 同步前后端历史契约与功能清单 | DONE |

### 4. Systematic Expansion

- 普通 `openSession` 和 `openSearchHit` 同样先清空旧详情，避免任何详情请求失败后串用上一会话。
- 本地 Windows、自定义 Claude 根目录都以规范化后的实际父目录为准；WSL 仍由其大小写敏感目录和现有扫描器决定项目键。
- 通用文件索引校验没有放宽；安全边界和状态一致性分别在各自层解决。
- 显式删除不再使用来源级进程扫描；用户若删除正在写入的具体会话，外部 CLI 可能重建文件，因此删除事务继续依赖备份、失败回滚和 manual recovery lock，而备份恢复仍保持来源级排他。
- 自动索引 ready、手动刷新、远程缓存刷新和远程 generation 变化统一走后台加载；首次打开和筛选变化继续前台加载。

## 命令结果

- `cargo fmt -- --check`：通过。
- 两个转换方向 Rust 定向测试：2 passed；Codex -> Claude 覆盖 Windows 既有混合大小写目录、返回项目键与扫描候选一致、普通 `validate_session_file_ref` 重开成功。
- `node scripts/historySessionIdentity.test.mjs`：3 passed。
- `node scripts/historyConversionState.test.mjs`：3 passed。
- `node --test scripts/historyListRefreshState.test.mjs scripts/historyConversionState.test.mjs scripts/historySessionIdentity.test.mjs`：10 passed。
- `node scripts/historyResumeProject.test.mjs`：3 passed。
- `node scripts/resumeCliArgs.test.mjs`：5 passed。
- `npx tsc --noEmit`：通过。
- `cargo check`：通过（包含本次项目键修复）。
- `npm run build`：沿用本任务前序验证通过；本轮按 guardrail 未重复执行。
- `git diff --check`：通过。
- `cargo test history --lib`：151 passed，2 个既有 `request_logs` 测试失败；两者读取当前应用数据库时预期 1 条、实际 12 条，与上一任务记录相同，失败集合未扩大。
- GitNexus 逐符号影响均为 LOW；`detect_changes` 为 HIGH，原因是 `HistoryWorkspace` 聚合入口映射到 7 条通用流程，实际 diff 未修改这些流程的主题、路径、语言或关闭逻辑。

## 人工验证清单（需桌面应用）

- 在桌面应用中执行 Codex -> Claude，确认转换后详情立即显示且来源为 Claude，点击继续对话启动 `claude --resume <target-id>`。
- 执行 Claude -> Codex，确认点击继续对话启动 `codex resume <target-id>`。
- 快速切换两个会话或制造详情读取失败，确认不会显示或恢复前一个会话。
- 保持一个 Codex/Claude 终端运行，批量删除同来源旧历史，确认不再报 `history_target_tool_running`；备份恢复仍提示先停止来源 CLI。
- 在历史列表加载多页并滚动到中部，等待索引自动刷新及点击手动刷新，确认列表不跳到顶部且已加载范围不缩回 20 条。
