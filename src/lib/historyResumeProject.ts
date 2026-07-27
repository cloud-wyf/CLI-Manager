import type { HistorySessionSummary, Project } from "./types";

function normalizePathKey(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/\/+$/g, "");
}

export function findLocalHistoryCwdProjects(
  session: Pick<HistorySessionSummary, "cwd">,
  projects: Project[]
): Project[] {
  const cwd = session.cwd?.trim();
  if (!cwd) return [];

  const normalizedCwd = normalizePathKey(cwd);
  return projects.filter(
    (project) =>
      project.environment_type !== "ssh" &&
      normalizePathKey(project.path) === normalizedCwd
  );
}
