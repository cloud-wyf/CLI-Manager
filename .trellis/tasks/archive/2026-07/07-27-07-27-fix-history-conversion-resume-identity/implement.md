# 实施计划

1. 后端转换结果增加目标详情；Claude 目标写入后从规范化父目录读取实际项目键，复用目标 `SessionFileRef` 和 `build_session_detail`，补齐两个方向及普通重开的身份/消息断言。
2. Store 将转换摘要与详情原子落入状态；会话详情请求开始时清空旧详情。
3. 历史工作区删除转换后的索引重读，并在继续对话前校验当前视图身份。
4. 增加静态回归测试，覆盖 Store 清空、转换不重读和恢复身份门禁。
5. 更新前后端契约、`CHANGELOG.md [TEMP]`，按需更新功能清单。
6. 删除事务移除来源级进程 guard，备份恢复保留 guard；补充静态边界回归。
7. Store 增加后台列表刷新，保留已加载范围；索引 ready、远程缓存和手动刷新接入，移除 loading 对可见数量的重置。
8. 运行格式、Rust 定向/历史模块/编译、前端脚本和 TypeScript 检查。
9. 运行 GitNexus `detect_changes(scope=all)`，核对只影响转换、删除与历史列表/详情状态链路。

## 风险点

- `HistoryConversionResult` 由 Rust camelCase 序列化，前端类型和字段名必须一致。
- Windows 可能复用大小写不同的既有 Claude 项目目录，不能假设 cwd 编码值等于扫描器返回的目录名。
- Store 请求序列不得让旧请求清空或覆盖新转换详情。
- 不触碰 `resolve_session_file_ref`；只移除显式删除的来源级 guard，备份恢复 guard 保持不变。
- 显式删除正在写入的具体会话时，外部 CLI 可能重新创建文件或产生不完整历史；来源级进程扫描不能可靠解决该风险。
- 后台刷新必须使用源分页 offset，而不是包含收藏快照后的列表长度。
