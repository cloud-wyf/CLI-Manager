import type { Terminal } from "@xterm/xterm";
import {
  TUI_BORDER_CHAR_PATTERN,
  TUI_BORDER_PREFIX_PATTERN,
  TUI_COMPOSER_PROMPT_PATTERN,
  TUI_HORIZONTAL_RULE_PATTERN,
} from "./terminalTui";

const SHELL_INPUT_PROMPT_PATTERN = /^(?:[$#]|PS(?:\s|>))/u;

export interface TerminalImeAnchor {
  x: number;
  y: number;
}

export type TerminalImeAnchorResolver = (
  terminal: Terminal,
  anchor: TerminalImeAnchor,
) => TerminalImeAnchor;

export type TerminalImeTextareaAnchorResolver = TerminalImeAnchorResolver;

export function resolveTerminalImeCompositionAnchor(terminal: Terminal): TerminalImeAnchor {
  const buffer = terminal.buffer.active;
  const clampX = (x: number) => Math.min(Math.max(0, x), Math.max(0, terminal.cols - 1));
  const clampY = (y: number) => Math.min(Math.max(0, y), Math.max(0, terminal.rows - 1));
  const cursor = {
    x: clampX(buffer.cursorX),
    y: clampY(buffer.cursorY),
  };
  const rowText = (row: number) => {
    const line = buffer.getLine(buffer.viewportY + row);
    return line ? line.translateToString(true) : null;
  };
  const rowIsPromptRow = (row: number) => {
    const text = rowText(row);
    if (text === null) return false;
    const trimmed = text.trimStart().replace(TUI_BORDER_PREFIX_PATTERN, "");
    return Boolean(trimmed)
      && (TUI_COMPOSER_PROMPT_PATTERN.test(trimmed) || SHELL_INPUT_PROMPT_PATTERN.test(trimmed));
  };
  const rowIsHorizontalRule = (row: number) => {
    const text = rowText(row);
    if (text === null) return false;
    const trimmed = text.trim();
    return trimmed.length > 0 && TUI_HORIZONTAL_RULE_PATTERN.test(trimmed);
  };
  const anchorAtRowTextEnd = (row: number) => {
    const line = buffer.getLine(buffer.viewportY + row);
    if (!line) return { x: 0, y: clampY(row) };
    for (let x = Math.min(terminal.cols, line.length) - 1; x >= 0; x -= 1) {
      const cell = line.getCell(x);
      const chars = cell?.getChars().trim();
      if (!cell || !chars || TUI_BORDER_CHAR_PATTERN.test(chars)) continue;
      return { x: clampX(x + Math.max(1, cell.getWidth())), y: clampY(row) };
    }
    const text = line.translateToString(true);
    const indent = text.length - text.replace(/^\s+/u, "").length;
    return { x: clampX(indent > 0 ? indent : 1), y: clampY(row) };
  };

  for (let row = terminal.rows - 1; row >= 0; row -= 1) {
    if (!rowIsPromptRow(row)) continue;

    let ruleRow = terminal.rows;
    for (let nextRow = row + 1; nextRow < terminal.rows; nextRow += 1) {
      if (rowIsHorizontalRule(nextRow)) {
        ruleRow = nextRow;
        break;
      }
    }
    const boxBottom = Math.max(row, ruleRow - 1);

    if (cursor.y >= row && cursor.y <= boxBottom) return cursor;
    if (ruleRow >= terminal.rows && cursor.y >= row) return cursor;

    let lastContentRow = row;
    for (let nextRow = row + 1; nextRow <= boxBottom; nextRow += 1) {
      if ((rowText(nextRow) ?? "").trim().length > 0) lastContentRow = nextRow;
    }
    const anchorRow = lastContentRow === row ? row : boxBottom;
    return anchorAtRowTextEnd(anchorRow);
  }

  return cursor;
}
