import type { HistorySessionView } from "./types";

/**
 * 从会话文件路径推断 subagent 转录的父会话 ID；非 subagent 转录返回 null。
 * 判定需与后端 is_subagent_transcript_path 保持一致：subagents/ 目录下的 agent-*.jsonl。
 */
export function inferSubagentParentSessionId(session: HistorySessionView): string | null {
  const parts = (session.file_path ?? "").replace(/\\/g, "/").split("/").filter(Boolean);
  const subagentsIndex = parts.findIndex((part) => part.toLowerCase() === "subagents");
  if (subagentsIndex <= 0) return null;

  const fileName = parts[subagentsIndex + 1] ?? "";
  if (!/^agent-[^/]+\.jsonl$/i.test(fileName)) return null;

  const parentSessionId = parts[subagentsIndex - 1] ?? "";
  if (!parentSessionId || parentSessionId === session.session_id) return null;
  return parentSessionId;
}
