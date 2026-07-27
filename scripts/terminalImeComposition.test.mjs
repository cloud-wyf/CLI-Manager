import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/lib/terminalIme.ts", import.meta.url),
  "utf8",
).replaceAll("\r\n", "\n");

test("IME composition-end cleanup waits for xterm to commit the textarea value", () => {
  const handler = source.match(
    /const onCompositionEnd = \(\) => \{([\s\S]*?)\n  \};/,
  )?.[1];

  assert.ok(handler, "onCompositionEnd handler was not found");
  assert.match(handler, /lastCompositionEndAt = nowForImeInput\(\);/);
  assert.match(
    handler,
    /compositionEndCleanupTimerId = window\.setTimeout\(\(\) => \{[\s\S]*?onCompositionCommitted\(textarea\?\.value \?\? ""\);[\s\S]*?scheduleHelperTextareaAnchorPin\(\);[\s\S]*?scheduleFit\(true\);[\s\S]*?\}, 0\);/,
  );

  const timerIndex = handler.indexOf("window.setTimeout");
  assert.ok(timerIndex >= 0);
  assert.ok(handler.indexOf("scheduleHelperTextareaAnchorPin()") > timerIndex);
  assert.ok(handler.indexOf("scheduleFit(true)") > timerIndex);
});

test("composition anchoring restores the width from the frozen input cursor", () => {
  const handler = source.match(
    /const applyCompositionAnchorFix = \(\) => \{([\s\S]*?)\n  \};/,
  )?.[1];

  assert.ok(handler, "applyCompositionAnchorFix handler was not found");
  assert.match(
    handler,
    /const maxWidth = String\(Math\.max\(1, terminal\.cols - anchor\.x\) \* cell\.width\) \+ "px";/,
  );

  const maxWidthIndex = handler.indexOf("compositionView.style.maxWidth = maxWidth");
  const boundsIndex = handler.indexOf("compositionView?.getBoundingClientRect()");
  assert.ok(maxWidthIndex >= 0);
  assert.ok(boundsIndex > maxWidthIndex);
});

test("a new composition or disposal cancels stale deferred cleanup", () => {
  assert.match(
    source,
    /const onCompositionStart = \(\) => \{[\s\S]*?window\.clearTimeout\(compositionEndCleanupTimerId\);[\s\S]*?isComposingRef\.current = true;/,
  );
  assert.match(
    source,
    /if \(compositionEndCleanupTimerId !== null\) window\.clearTimeout\(compositionEndCleanupTimerId\);[\s\S]*?\n  \};\n\};/,
  );
});
