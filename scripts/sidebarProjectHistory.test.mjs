import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const sidebar = read("../src/components/sidebar/index.tsx");
const treeNodeItem = read("../src/components/sidebar/TreeNodeItem.tsx");
const projectTree = read("../src/components/sidebar/ProjectTree.tsx");
const historySessions = read("../src/components/sidebar/useProjectHistorySessions.ts");
const historyResume = read("../src/components/history/useHistoryResume.tsx");

test("raw backend rows go through normalizeSummary, never a bare cast", () => {
  // 后端按 camelCase 序列化（sessionId/projectKey）。把原始行直接断言成 snake_case 的
  // HistorySessionSummary 会让 session_id 变 undefined，resume 时 .trim() 抛异常。
  assert.match(historySessions, /import \{ normalizeSummary \} from "\.\.\/\.\.\/stores\/historyStore";/);
  assert.match(historySessions, /invoke<unknown\[\]>\("history_list_sessions"/);
  assert.match(historySessions, /\.map\(\(row\) => normalizeSummary\(row\)\)/);
  assert.doesNotMatch(historySessions, /invoke<HistorySessionSummary\[\]>/);
});

test("resume rejections surface instead of being swallowed by void", () => {
  // resumeSession 是 async：同步抛出会变成无人处理的 rejection，点击后静默无反应。
  assert.match(
    historyResume,
    /const startResume = useCallback\(\([\s\S]*?\.catch\(\(err\) => \{[\s\S]*?logError\("history resume: unexpected failure"[\s\S]*?toast\.error\(/
  );
  const afterWrapper = historyResume.slice(historyResume.indexOf("const startResume = useCallback("));
  const wrapperBody = afterWrapper.slice(0, afterWrapper.indexOf("const requestResume = useCallback("));
  const callSites = afterWrapper.slice(afterWrapper.indexOf("const requestResume = useCallback("));
  // 包装器自己那一处 void 是允许的，其余调用点必须走 startResume。
  assert.match(wrapperBody, /void resumeSession\(/);
  assert.doesNotMatch(callSites, /void resumeSession\(/);
});

test("inline history expansion is gated to local projects outside compact mode", () => {
  const gate = sidebar.match(
    /const canExpandProjectHistory = useCallback\(\s*\(project: Project\) =>([\s\S]*?)\);/
  )?.[1];

  assert.ok(gate, "canExpandProjectHistory should exist");
  assert.match(gate, /!compactMode/);
  assert.match(gate, /project\.environment_type !== "ssh"/);
  assert.match(gate, /projectSupportsCapability\(project, "history"\)/);
});

test("plain project click toggles history once and respects the gate", () => {
  const clickHandler = sidebar.match(
    /const handleSelectProject = useCallback\(\(e: ReactMouseEvent, project: Project\) => \{[\s\S]*?\n  \}, \[/
  )?.[0];

  assert.ok(clickHandler, "handleSelectProject should exist");
  // 双击开终端会连发两次 click，第二次不能把刚展开的历史又收起来。
  assert.match(
    clickHandler,
    /e\.detail <= 1 && canExpandProjectHistory\(project\)[\s\S]*?projectHistory\.toggle\(project\)/
  );
  // 修饰键多选分支必须在 toggle 之前 return，不能连带展开。
  const additiveBranch = clickHandler.slice(0, clickHandler.indexOf("e.detail <= 1"));
  assert.doesNotMatch(additiveBranch, /projectHistory\.toggle/);
});

test("sidebar resumes through the shared history resume flow", () => {
  assert.match(sidebar, /import \{ useHistoryResume \} from "\.\.\/history\/useHistoryResume";/);
  assert.match(sidebar, /const \{ requestResume, resumeDialog \} = useHistoryResume\(\);/);
  // 传项目 id 作为 hint，让 selectLocalHistoryResumeProject 直接命中该项目。
  assert.match(
    sidebar,
    /requestResume\(session, session\.title\.trim\(\) \|\| session\.session_id, project\.id\)/
  );
  // 候选歧义时要有对话框可弹。
  assert.match(sidebar, /\{resumeDialog\}/);
  // 侧边栏不得自己拼 resume 命令或建终端，必须走同一条流程。
  assert.doesNotMatch(sidebar, /buildHistoryResumeCommand/);
});

test("search mode never expands inline history", () => {
  assert.match(
    treeNodeItem,
    /const historyOpen = !forceExpanded && actions\.expandedHistoryProjectIds\.has\(p\.id\)/
  );
  assert.match(
    projectTree,
    /searchActive \? EMPTY_KEY_SET : actions\.expandedHistoryProjectIds/
  );
});

test("history rows join the keyboard traversal order after worktrees", () => {
  const projectBranch = projectTree.match(
    /const projectKey = `p:\$\{node\.project\.id\}`;[\s\S]*?return out;/
  )?.[0];

  assert.ok(projectBranch, "flattenVisibleTree project branch should exist");
  const worktreePush = projectBranch.indexOf('kind: "worktree"');
  const historyPush = projectBranch.indexOf('kind: "history"');
  assert.notEqual(worktreePush, -1);
  assert.notEqual(historyPush, -1);
  assert.ok(worktreePush < historyPush, "worktree rows must be flattened before history rows");
  // worktree 折叠不能顺带吞掉历史行。
  assert.doesNotMatch(projectBranch, /if \(!isOpen\) continue;/);
});

test("collapsing a project drops its cached sessions and cancels in-flight requests", () => {
  const toggle = historySessions.match(
    /const toggle = useCallback\(\(project: Project\) => \{[\s\S]*?\n  \}, \[/
  )?.[0];

  assert.ok(toggle, "toggle should exist");
  assert.match(toggle, /forget\(\[projectId\]\)/);
  assert.match(
    historySessions,
    /requestSeqRef\.current\.set\(projectId, \(requestSeqRef\.current\.get\(projectId\) \?\? 0\) \+ 1\)/
  );
  // 请求序号守卫：旧结果不能覆盖新状态。
  assert.match(historySessions, /if \(requestSeqRef\.current\.get\(projectId\) !== seq\) return;/);
});

test("history pagination fetches one extra row to detect the next page", () => {
  assert.match(historySessions, /const PAGE_SIZE = 20;/);
  assert.match(historySessions, /limit: PAGE_SIZE \+ 1,/);
  assert.match(historySessions, /hasMore: rows\.length > PAGE_SIZE,/);
});
