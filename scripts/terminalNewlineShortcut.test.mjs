import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const tempDir = mkdtempSync(join(tmpdir(), "cli-manager-terminal-newline-"));
process.on("exit", () => rmSync(tempDir, { recursive: true, force: true }));

writeFileSync(join(tempDir, "terminalTui.mjs"), `
export const TUI_BORDER_PREFIX_PATTERN = /^$/;
export const TUI_COMPOSER_PROMPT_PATTERN = /^$/;
`);

const source = readFileSync(new URL("../src/lib/terminalTuiDisplay.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: "terminalTuiDisplay.ts",
}).outputText.replace('from "./terminalTui"', 'from "./terminalTui.mjs"');
const modulePath = join(tempDir, "terminalTuiDisplay.mjs");
writeFileSync(modulePath, transpiled, "utf8");

const { hasCodexTuiViewport, normalizeTerminalTuiComposerBackground } = await import(pathToFileURL(modulePath).href);

const XTERM_BG_COLOR_MASK = 0x03ffffff;
const XTERM_INVERSE_FLAG = 0x04000000;

function createMutableTerminal(cellAttrs) {
  const cells = cellAttrs.map(({ fg = 0, bg = 0 }) => ({ fg, bg }));
  const probe = {
    fg: 0,
    bg: 0,
    getBgColorMode() {
      return this.bg & 0x03000000;
    },
    isInverse() {
      return (this.fg & XTERM_INVERSE_FLAG) === 0 ? 0 : 1;
    },
  };
  const loadCell = (index, target) => {
    target.fg = cells[index].fg;
    target.bg = cells[index].bg;
    return target;
  };
  const line = {
    length: cells.length,
    translateToString: () => "Claude Code",
    getCell: loadCell,
    _line: {
      length: cells.length,
      loadCell,
      setCell: (index, cell) => {
        cells[index] = { fg: cell.fg, bg: cell.bg };
      },
    },
  };
  const refreshes = [];
  return {
    cells,
    refreshes,
    terminal: {
      cols: cells.length,
      rows: 1,
      buffer: {
        active: {
          viewportY: 0,
          getNullCell: () => probe,
          getLine: () => line,
        },
      },
      refresh: (start, end) => refreshes.push([start, end]),
    },
  };
}

function createTerminal(lines, viewportY = 0, rows = lines.length, type = "normal") {
  const bufferLines = lines.map((text) => ({
    translateToString: () => text,
  }));
  return {
    rows,
    buffer: {
      active: {
        type,
        viewportY,
        getLine: (row) => bufferLines[row],
      },
    },
  };
}

test("detects a manually launched Codex TUI from its visible viewport", () => {
  assert.equal(hasCodexTuiViewport(createTerminal(["OpenAI Codex", "› prompt"])), true);
  assert.equal(hasCodexTuiViewport(createTerminal(["› prompt", "/model to change"])), true);
  assert.equal(hasCodexTuiViewport(createTerminal(["OpenAI Codex", "› prompt"], 0, 2, "alternate")), true);
});

test("does not classify ordinary shells or Claude Code as Codex", () => {
  assert.equal(hasCodexTuiViewport(createTerminal(["PS F:\\\\github\\\\CLI-Manager>"])), false);
  assert.equal(hasCodexTuiViewport(createTerminal(["Claude Code", "› prompt"])), false);
});

test("only scans the current viewport", () => {
  const terminal = createTerminal(["OpenAI Codex", "PS F:\\\\github>", "ready"], 1, 2);
  assert.equal(hasCodexTuiViewport(terminal), false);
});

test("transparent Claude normalization preserves an isolated inverse software cursor", () => {
  const fixture = createMutableTerminal([
    { bg: 0x03010203 },
    { fg: XTERM_INVERSE_FLAG },
    {},
    {},
    {},
    {},
    {},
    {},
  ]);

  normalizeTerminalTuiComposerBackground(fixture.terminal, {
    shouldNormalize: true,
    isTransparent: true,
    isLightTheme: false,
    isCodexSession: false,
    isClaudeSession: true,
  });

  assert.equal(fixture.cells[0].bg & XTERM_BG_COLOR_MASK, 0);
  assert.equal(fixture.cells[1].fg & XTERM_INVERSE_FLAG, XTERM_INVERSE_FLAG);
  assert.deepEqual(fixture.refreshes, [[0, 0]]);
});

test("transparent TUI normalization still clears wide inverse backgrounds", () => {
  const fixture = createMutableTerminal([
    { fg: XTERM_INVERSE_FLAG },
    { fg: XTERM_INVERSE_FLAG },
    { fg: XTERM_INVERSE_FLAG },
    { fg: XTERM_INVERSE_FLAG },
    {},
    {},
    {},
    {},
  ]);

  normalizeTerminalTuiComposerBackground(fixture.terminal, {
    shouldNormalize: true,
    isTransparent: true,
    isLightTheme: false,
    isCodexSession: true,
    isClaudeSession: false,
  });

  assert.equal(fixture.cells.some((cell) => (cell.fg & XTERM_INVERSE_FLAG) !== 0), false);
  assert.deepEqual(fixture.refreshes, [[0, 0]]);
});

test("shared CLI context includes immutable session metadata for XTermTerminal", () => {
  const componentSource = readFileSync(new URL("../src/components/XTermTerminal.tsx", import.meta.url), "utf8");
  const contextSource = readFileSync(new URL("../src/terminal/browser/TerminalCliContext.ts", import.meta.url), "utf8");
  assert.match(componentSource, /createTerminalCliContext\(session, project\)/u);
  assert.match(contextSource, /sessionTool:\s*session\?\.cliTool/u);
  assert.match(contextSource, /sessionTool\s*===\s*"codex"/u);
  assert.match(componentSource, /isCodexSession\(getSessionToolContext\(\), terminal\)/u);
});
