# Fork 同步与发版流程

本仓库是 [dark-hxx/CLI-Manager](https://github.com/dark-hxx/CLI-Manager) 的个人 fork，仅供自用。上游持续开发，本仓库有少量本地改动。本文档是手动同步上游并发版的完整流程，供人或 AI 助手按步骤执行。

## 仓库拓扑

| remote | 地址 | 作用 |
|---|---|---|
| `origin` | cloud-wyf/CLI-Manager | 自己的 fork，发版目标 |
| `upstream` | dark-hxx/CLI-Manager | 上游，只读 |

前提：工作区干净（有未完成改动先 `git stash`），当前在 `master`。

## 1. 拉取并评估

```bash
git fetch upstream master
git rev-list --left-right --count upstream/master...HEAD
```

输出是 `behind ahead`：`0 N` 表示上游没动，直接结束；`N M` 进入合并。

看上游改了什么：

```bash
git log --oneline --no-merges HEAD..upstream/master
```

## 2. 合并

项目惯例是 merge（上游历史全是 merge commit），**不要 rebase**。

```bash
git merge upstream/master
```

## 3. 处理冲突

遵循 `/pull-safely` 原则：**默认保留远端逻辑**；只有本地明确是在修远端 bug 时才保留本地；任何丢弃远端逻辑的决定都必须显式说明。

### 本仓库的固定冲突

以下冲突是本地既有决策造成的，照此处理，不必重新判断：

| 文件 | 处理 | 原因 |
|---|---|---|
| `README.md` | 保留本地：`git checkout --ours README.md` | 已精简为自用声明 |
| `README.zh-CN.md` `README.en-US.md` | 保持删除：`git rm` | 本地已删除 |
| `src/components/settings/AboutSection.tsx` | 保留本地的 `REPOSITORY_URL` / `UPSTREAM_URL` / 「原作者 + 维护者」两行，其余取上游 | fork 身份标识，AGPL 要求 |
| `src/stores/updateStore.ts` | 保留本地的 `RELEASES_URL` 与 `fork-v` tag 前缀，其余取上游 | 指向本仓库 release |

### 绝对不要动

- `src-tauri/ssh-agent-public-key.txt` —— 上游公钥，编译期 `include_str!` 嵌入，用于验证 SSH Agent manifest 签名。改了远程终端功能直接崩。
- `src-tauri/tauri.conf.json` 的 `updater` 段 —— 本地通过 `tauri.fork.conf.json` 覆盖，不要改主配置。

### 本地新增文件

上游没有同名文件，永远不会冲突：`.github/workflows/fork-release.yml`、`src-tauri/tauri.fork.conf.json`、本文档。

### 其他冲突

按 `/pull-safely` 决策矩阵判断。注意本仓库常见的假冲突：CRLF/LF 行尾差异会把冲突块撑到几百行，先用 `git diff --ignore-cr-at-eol` 看真实差异，通常只有几行。

## 4. 验证

```bash
npx tsc --noEmit
cd src-tauri && cargo check --all-targets && cd ..
node --test scripts/*.test.mjs
```

前端测试用 `scripts/*.test.mjs` 的 glob，不要用 `node --test scripts/`（Windows 上会失败）。

**已知失败**：上游自带 8 个失败用例，分布在 `gitDiffEditorPin`、`gitStoreRemote`、`historyConversationView`、`terminalRemountSnapshot`、`terminalCursorMovement`，与本地改动无关。怀疑是新增失败时，开一个 worktree checkout 到 `upstream/master` 跑同一组测试对照——**注意不要用 junction 链接 `node_modules`，删除 worktree 时会连带删掉主仓库的依赖**，用复制或重新 `npm ci`。

## 5. 推送

```bash
git push origin master
```

## 6. 构建发版

版本号读自 `src-tauri/tauri.conf.json`，tag 为 `fork-v<version>`。

```bash
gh workflow run fork-release.yml --repo cloud-wyf/CLI-Manager
```

若该版本的 release 已存在（上游没发新版但你同步了提交），先删再建：

```bash
gh release delete fork-v<version> --cleanup-tag --yes
```

看进度：

```bash
gh run list --repo cloud-wyf/CLI-Manager --workflow fork-release.yml --limit 1
```

## 构建流程做了什么

1. 从上游最新 release 下载 SSH Agent 四件套（两个 Linux 二进制 + manifest + 签名）到 `src-tauri/resources/ssh-agent/`。四件套缺一不可，缺了报 `ssh_agent_bundled_resources_incomplete`。
2. `tauri build --config src-tauri/tauri.fork.conf.json`——RFC 7396 merge patch，把 updater 的 `pubkey` 和 `endpoints` 换成本仓库的。
3. 发 release 到 `cloud-wyf/CLI-Manager`：msi、nsis setup、便携版 zip、`latest.json`。

只构建 Windows。需要 macOS / Linux 时取消 `fork-release.yml` 里 matrix 的注释。

## 两条独立的签名信任链

不要混淆：

| | 密钥 ID | 用途 | 配置位置 |
|---|---|---|---|
| 应用自动更新 | `6528DD1AC1768FA2`（自己的） | 签 `latest.json` | `tauri.fork.conf.json` 覆盖 |
| SSH Agent 验签 | `7A4E2261E9C3AB36`（上游的） | 验 agent manifest | `ssh-agent-public-key.txt` |

私钥在 `~/.tauri/fork-cli-manager.key`，同时存于仓库 secret `TAURI_SIGNING_PRIVATE_KEY`。**丢失后已安装用户再也收不到更新**，只能手动重装。

## 许可证

AGPL-3.0-or-later。`README.md` 顶部的修改声明与日期是 §5(a) 的强制要求，做过实质性修改后更新那个日期。分发二进制时须提供对应源码——这也是「关于」页的开源地址指向本仓库而非上游的原因。
