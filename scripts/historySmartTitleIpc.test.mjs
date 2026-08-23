import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const storeSource = readFileSync(
  new URL("../src/stores/historyStore.ts", import.meta.url),
  "utf8",
);
const commandSource = readFileSync(
  new URL("../src-tauri/src/commands/history_title.rs", import.meta.url),
  "utf8",
);

function sourceBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test("smart-title IPC sends the Rust struct argument under request", () => {
  const generate = sourceBlock(storeSource, "generateSmartTitle: async", "clearSmartTitle: async");
  const clear = sourceBlock(storeSource, "clearSmartTitle: async", "updateMessage: async");
  const hook = sourceBlock(storeSource, "autoTitleFromHook: async", "generateSmartTitle: async");

  assert.match(commandSource, /fn history_title_generate\(\s*request: HistoryTitleGenerateRequest,/);
  assert.match(commandSource, /fn history_title_clear\(\s*request: HistoryTitleClearRequest,/);
  assert.match(generate, /invoke<unknown>\("history_title_generate", \{\s*request: \{/);
  assert.match(clear, /invoke<unknown>\("history_title_clear", \{\s*request: \{/);
  assert.match(hook, /invoke<unknown>\("history_title_generate", \{\s*request: \{/);
});

test("both generate call sites send the language the Rust request expects", () => {
  const generate = sourceBlock(storeSource, "generateSmartTitle: async", "clearSmartTitle: async");
  const hook = sourceBlock(storeSource, "autoTitleFromHook: async", "generateSmartTitle: async");

  assert.match(commandSource, /#\[serde\(default\)\]\s*language: String,/);
  assert.match(generate, /language: getCurrentLanguage\(\),/);
  assert.match(hook, /language: getCurrentLanguage\(\),/);
});

test("hook-driven titling never touches history workspace selection state", () => {
  const hook = sourceBlock(storeSource, "autoTitleFromHook: async", "generateSmartTitle: async");

  for (const forbidden of ["openSession(", "loadSessions(", "activeSessionKey:", "activeSession:", "loadingSessionDetail:"]) {
    assert.ok(!hook.includes(forbidden), `autoTitleFromHook must not use ${forbidden}`);
  }
  // sessionKey 必须由 summary 派生：detail.file_path 在 Rust 侧被 canonicalize 过，
  // Windows 上会带 \\?\ 前缀，与列表的 sessionKey 不一致会导致静默双写两行记录。
  assert.match(hook, /summarySessionKey\(summary\)/);
  assert.ok(!hook.includes("detail.file_path"), "sessionKey must not derive from detail.file_path");
});

test("hook path skips the enabledAt watermark that blocks resumed sessions", () => {
  const hook = sourceBlock(storeSource, "autoTitleFromHook: async", "generateSmartTitle: async");
  const queue = sourceBlock(storeSource, "function queueAutomaticTitle", "async function cancelAutomaticTitle");

  assert.match(queue, /settings\.enabledAt/);
  assert.ok(!hook.includes("enabledAt"), "hook trigger must not re-apply the backfill watermark");
});

test("a transient failure puts the session on cooldown, never out of reach", () => {
  const hook = sourceBlock(storeSource, "autoTitleFromHook: async", "generateSmartTitle: async");

  // 只记「见过没见过」的话，后端为限流写的冷却重试永远等不到第二次调用：
  // 一次 429 就让这个会话在本进程内永久失去标题。
  assert.match(storeSource, /const hookTitleNextAttemptAt = new Map<string, number>\(\);/);
  assert.doesNotMatch(storeSource, /hookTitleHandledSessionIds/);
  assert.match(hook, /hookTitleNextAttemptAt\.set\(cliSessionId, Date\.now\(\) \+ HOOK_TITLE_RETRY_COOLDOWN_MS\);/);
  // 成功后不再尝试，未入索引则立刻放行下一轮 Stop。
  assert.match(hook, /hookTitleNextAttemptAt\.set\(cliSessionId, HOOK_TITLE_NEVER\);/);
  assert.match(hook, /hookTitleNextAttemptAt\.delete\(cliSessionId\);/);
  // 前后端窗口必须一致：前端先放行，后端只会回 history_title_auto_already_attempted。
  assert.match(storeSource, /const HOOK_TITLE_RETRY_COOLDOWN_MS = 10 \* 60 \* 1000;/);
  assert.match(commandSource, /const TRANSIENT_RETRY_BACKOFF_MS: i64 = 10 \* 60 \* 1000;/);
});

