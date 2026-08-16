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

test("history expansion lives on the row chevron, never on plain click", () => {
  const clickHandler = sidebar.match(
    /const handleSelectProject = useCallback\(\(e: ReactMouseEvent, project: Project\) => \{[\s\S]*?\n  \}, \[/
  )?.[0];

  assert.ok(clickHandler, "handleSelectProject should exist");
  // 单击一旦也 toggle，就和双击开终端抢同一串 click 事件：想「收起再展开」刷新
  // 必然被识别成双击。detail 计数是那场冲突的补丁，冲突没了它也不该回来。
  assert.doesNotMatch(clickHandler, /projectHistory\.toggle/);
  assert.doesNotMatch(clickHandler, /e\.detail/);
  assert.match(sidebar, /onToggleProjectHistory: projectHistory\.toggle,/);

  const chevron = treeNodeItem.match(
    /\{actions\.canExpandProjectHistory\(p\) && \([\s\S]*?\n {10}\)\}/
  )?.[0];
  assert.ok(chevron, "project row should render a history chevron behind the gate");
  assert.match(chevron, /actions\.onToggleProjectHistory\(p\)/);
  // 点箭头不能冒泡成选中；连点两次不能冒泡成行的双击开终端。
  assert.match(chevron, /onClick=\{\(e\) => \{\s*e\.stopPropagation\(\);/);
  assert.match(chevron, /onDoubleClick=\{\(e\) => e\.stopPropagation\(\)\}/);
  // 双击开终端保留：箭头拆出去之后它不再和展开抢事件。
  assert.match(treeNodeItem, /onDoubleClick=\{\(\) => actions\.onOpenProject\(p\)\}/);
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
