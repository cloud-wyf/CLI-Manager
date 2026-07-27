import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const tempDir = mkdtempSync(join(tmpdir(), "cli-manager-history-session-identity-"));
process.on("exit", () => rmSync(tempDir, { recursive: true, force: true }));

const source = readFileSync(
  new URL("../src/lib/historySessionIdentity.ts", import.meta.url),
  "utf8"
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const outputPath = join(tempDir, "historySessionIdentity.mjs");
writeFileSync(outputPath, output, "utf8");

const { sameHistorySessionIdentity } = await import(pathToFileURL(outputPath).href);

function identity(sourceName, sessionId, filePath) {
  return { source: sourceName, session_id: sessionId, file_path: filePath };
}

test("matches equivalent Windows history paths", () => {
  assert.equal(
    sameHistorySessionIdentity(
      identity("Claude", "ABC", "C:\\Users\\me\\.claude\\projects\\p\\s.jsonl"),
      identity("claude", "abc", "c:/Users/me/.claude/projects/p/s.jsonl")
    ),
    true
  );
});

test("rejects stale source, session, or file identities", () => {
  const current = identity("claude", "target", "/home/me/.claude/projects/p/target.jsonl");

  assert.equal(sameHistorySessionIdentity(current, identity("codex", "target", current.file_path)), false);
  assert.equal(sameHistorySessionIdentity(current, identity("claude", "old", current.file_path)), false);
  assert.equal(
    sameHistorySessionIdentity(current, identity("claude", "target", "/home/me/.claude/projects/p/old.jsonl")),
    false
  );
});

test("requires a complete identity", () => {
  assert.equal(sameHistorySessionIdentity(identity("claude", "", "session.jsonl"), identity("claude", "", "session.jsonl")), false);
  assert.equal(sameHistorySessionIdentity(identity("claude", "id", ""), identity("claude", "id", "")), false);
});
