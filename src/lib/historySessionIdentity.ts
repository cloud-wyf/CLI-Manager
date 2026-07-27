import type { HistorySessionSummary } from "./types";

type HistorySessionIdentity = Pick<
  HistorySessionSummary,
  "source" | "session_id" | "file_path"
>;

function normalizeIdentityPath(value: string): string {
  let normalized = value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/\/\?\/UNC\//i, "//")
    .replace(/^\/\/\?\//, "")
    .replace(/\/+$/g, "");
  if (/^[a-z]:\//i.test(normalized) || normalized.startsWith("//")) {
    normalized = normalized.toLowerCase();
  }
  return normalized;
}

export function sameHistorySessionIdentity(
  left: HistorySessionIdentity,
  right: HistorySessionIdentity
): boolean {
  const source = left.source.trim().toLowerCase();
  const sessionId = left.session_id.trim().toLowerCase();
  const filePath = normalizeIdentityPath(left.file_path);
  return Boolean(source && sessionId && filePath)
    && source === right.source.trim().toLowerCase()
    && sessionId === right.session_id.trim().toLowerCase()
    && filePath === normalizeIdentityPath(right.file_path);
}
