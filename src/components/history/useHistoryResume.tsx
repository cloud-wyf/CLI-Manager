import { useCallback, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import type {
  HistorySessionSummary,
  Project,
  SshRemoteResumePreflight,
  WorktreeRecord,
} from "../../lib/types";
import { useI18n } from "../../lib/i18n";
import { logError, logInfo } from "../../lib/logger";
import {
  findLocalHistoryCwdProjects,
  matchesHistoryProjectSource,
  selectLocalHistoryResumeProject,
} from "../../lib/historyResumeProject";
import { buildHistoryResumeCommand } from "../../lib/historyResumeCommand";
import { findWorktreeByPath, projectWithWorktreeProviderOverrides } from "../../lib/terminalProject";
import { projectSupportsCapability } from "../../lib/projectCapabilities";
import { useHistoryStore } from "../../stores/historyStore";
import { useProjectStore } from "../../stores/projectStore";
import { useTerminalStore } from "../../stores/terminalStore";
import { useWorktreeStore } from "../../stores/worktreeStore";
import { HistoryResumeProjectDialog } from "./HistoryResumeProjectDialog";

// HistorySessionView 与 HistorySessionDetail 都继承自 HistorySessionSummary，
// resume 只读基类字段，取最宽的类型让侧边栏可以直接传后端原始摘要。
type ResumeSession = HistorySessionSummary;

type ResumeIntent = {
  session: ResumeSession;
  title: string;
  worktree: WorktreeRecord | null;
  projects: Project[];
  allowNewWindow: boolean;
  remote: boolean;
};

function normalizePathKey(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/\/+$/g, "");
}

function isAbsolutePathLike(value: string): boolean {
  const trimmed = value.trim();
  return /^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith("\\\\") || trimmed.startsWith("/");
}

function parseProjectEnvVars(project?: Project | null): Record<string, string> | undefined {
  if (!project) return undefined;
  try {
    const parsed = JSON.parse(project.env_vars || "{}");
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const entries = Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string");
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  } catch {
    return undefined;
  }
}

function findRemoteHistoryProjects(
  session: ResumeSession,
  projects: Project[],
  hostId: string,
): Project[] {
  const sourceProjects = projects.filter((project) => (
    project.environment_type === "ssh"
    && project.ssh_host_id === hostId
    && matchesHistoryProjectSource(project, session.source)
  ));
  const cwd = "cwd" in session ? session.cwd?.trim() : null;
  if (!cwd) return [];
  const normalizedCwd = normalizePathKey(cwd);
  return sourceProjects.filter((project) => normalizePathKey(project.remote_path) === normalizedCwd);
}

function findHistoryWorktree(session: ResumeSession, worktrees: WorktreeRecord[]): WorktreeRecord | null {
  const cwd = "cwd" in session ? session.cwd?.trim() : null;
  return findWorktreeByPath(worktrees, cwd) ?? findWorktreeByPath(worktrees, session.project_key);
}

function resolveHistoryResumeCwd(
  session: ResumeSession,
  project?: Project | null,
  worktree?: WorktreeRecord | null
): string | undefined {
  const cwd = "cwd" in session ? session.cwd?.trim() : null;
  if (cwd) return cwd;
  if (worktree) return worktree.path;
  if (project) return project.path;
  return isAbsolutePathLike(session.project_key) ? session.project_key.trim() : undefined;
}

export interface HistoryResume {
  /**
   * projectIdHint 用于调用方已经知道会话归属项目的场景（如侧边栏项目行内联展开）；
   * 缺省回落到历史面板当前的 projectIdFilter，保持面板内行为不变。
   */
  requestResume: (session: ResumeSession, title: string, projectIdHint?: string | null) => void;
  resumeDialog: React.ReactNode;
}

export function useHistoryResume(): HistoryResume {
  const { t } = useI18n();
  const remoteContext = useHistoryStore((s) => s.remoteContext);
  const projectIdFilter = useHistoryStore((s) => s.projectIdFilter);
  const closeHistory = useHistoryStore((s) => s.closeHistory);
  const projects = useProjectStore((s) => s.projects);
  const groups = useProjectStore((s) => s.groups);
  const worktrees = useWorktreeStore((s) => s.worktrees);
  const createSession = useTerminalStore((s) => s.createSession);
  const terminalSessions = useTerminalStore((s) => s.sessions);
  const setActiveTerminalSession = useTerminalStore((s) => s.setActive);
  const [resumeIntent, setResumeIntent] = useState<ResumeIntent | null>(null);

  const historyProjects = useMemo(
    () => projects.filter((project) => projectSupportsCapability(project, "history")),
    [projects]
  );

  const resumeSession = useCallback(async (
    session: ResumeSession,
    title: string,
    project: Project | null,
    worktree: WorktreeRecord | null,
    unscopedShell?: string
  ) => {
    const isRemote = session.session_ref?.transportKind === "ssh";
    if (isRemote) {
      const context = remoteContext;
      const sourceSessionId = session.session_ref?.sourceSessionId?.trim() || session.session_id.trim();
      if (!context || context.source !== session.source || !context.sourceInstanceId || !sourceSessionId) {
        toast.error(t("history.toast.resumeTerminalFailed"), { description: t("history.resumeProject.remoteUnavailable") });
        return;
      }
      const activeTerminal = terminalSessions.find((item) => (
        item.environmentType === "ssh"
        && item.sshHostId === context.hostId
        && item.cliSessionId === sourceSessionId
        && item.remoteHistorySourceInstanceId === context.sourceInstanceId
      ));
      if (activeTerminal) {
        setActiveTerminalSession(activeTerminal.id);
        setResumeIntent(null);
        closeHistory();
        return;
      }
      const projectPaths = project?.environment_type === "ssh" ? [project.remote_path] : context.projectPaths;
      try {
        const preflight = await invoke<SshRemoteResumePreflight>("history_remote_resume_preflight", {
          consumerId: context.consumerId,
          sshLaunch: context.launch,
          source: context.source,
          configuredConfigRoot: context.configuredConfigRoot,
          projectPaths,
          sourceInstanceId: context.sourceInstanceId,
          sourceSessionId,
        });
        const launchProject = project && worktree ? projectWithWorktreeProviderOverrides(project, worktree) : project;
        const env = {
          ...(parseProjectEnvVars(launchProject) ?? {}),
          ...preflight.environmentOverrides,
        };
        await createSession(
          project?.id,
          preflight.remoteCwd,
          worktree?.name ?? (project?.name.trim() || title),
          preflight.resumeCommand,
          env,
          undefined,
          undefined,
          worktree?.id,
          context.hostId,
          preflight.sourceSessionId,
          context.consumerId,
          context.sourceInstanceId,
        );
        setResumeIntent(null);
        closeHistory({ preserveRemoteConsumer: true });
      } catch (err) {
        void invoke("history_remote_close", {
          hostId: context.hostId,
          consumerId: context.consumerId,
        }).catch(() => undefined);
        const code = String(err);
        const description = code.includes("remote_session_source_missing")
          ? t("history.resumeProject.remoteSourceMissing")
          : code.includes("remote_session_cwd_")
            ? t("history.resumeProject.remoteCwdUnavailable")
            : code.includes("unsupported_resume_tool")
              ? t("history.resumeProject.remoteToolUnavailable")
              : code.includes("history_remote_identity_changed")
                ? t("history.resumeProject.remoteIdentityChanged")
                : code.includes("remote_session_active_elsewhere")
                  ? t("history.resumeProject.remoteActiveElsewhere")
                : code;
        toast.error(t("history.toast.resumeTerminalFailed"), { description });
      }
      return;
    }
    const launchProject = project && worktree ? projectWithWorktreeProviderOverrides(project, worktree) : project;
    const command = buildHistoryResumeCommand(session, launchProject);
    if (!command) {
      logError("history resume: no command built", { source: session.source, sessionId: session.session_id });
      toast.error(t("history.toast.resumeTerminalFailed"), { description: t("history.resumeProject.invalidSession") });
      return;
    }

    const cwd = resolveHistoryResumeCwd(session, project, worktree);
    if (!cwd) {
      logError("history resume: no cwd resolved", { source: session.source, sessionId: session.session_id });
      toast.error(t("history.toast.resumeTerminalFailed"), { description: t("history.resumeProject.missingCwd") });
      return;
    }

    try {
      const requestedShell = launchProject ? launchProject.shell : unscopedShell;
      const shell = requestedShell && requestedShell !== "powershell" ? requestedShell : undefined;
      logInfo("history resume: creating terminal", {
        projectId: project?.id ?? null,
        cwd,
        command,
        shell: shell ?? null,
        worktreeId: worktree?.id ?? null,
      });
      await createSession(
        project?.id,
        cwd,
        worktree?.name ?? (project?.name.trim() || title),
        command,
        launchProject ? parseProjectEnvVars(launchProject) : undefined,
        shell,
        undefined,
        worktree?.id,
        undefined,
        session.session_id.trim(),
      );
      setResumeIntent(null);
      closeHistory();
    } catch (err) {
      logError("history resume: createSession failed", { projectId: project?.id ?? null, cwd, err });
      toast.error(t("history.toast.resumeTerminalFailed"), { description: String(err) });
    }
  }, [closeHistory, createSession, remoteContext, setActiveTerminalSession, t, terminalSessions]);

  // resumeSession 是 async，`void` 调用会让同步抛出变成无人处理的 rejection——
  // 点击后既没终端也没提示。所有调用点统一走这里，异常必须落到日志和 toast。
  const startResume = useCallback((
    session: ResumeSession,
    title: string,
    project: Project | null,
    worktree: WorktreeRecord | null,
    unscopedShell?: string
  ) => {
    void resumeSession(session, title, project, worktree, unscopedShell).catch((err) => {
      logError("history resume: unexpected failure", {
        source: session.source,
        sessionId: session.session_id,
        projectId: project?.id ?? null,
        err: String(err),
      });
      toast.error(t("history.toast.resumeTerminalFailed"), { description: String(err) });
    });
  }, [resumeSession, t]);

  const requestResume = useCallback((
    session: ResumeSession,
    title: string,
    projectIdHint?: string | null,
  ) => {
    if (session.session_ref?.transportKind === "ssh") {
      if (!remoteContext) {
        toast.error(t("history.toast.resumeTerminalFailed"), { description: t("history.resumeProject.remoteUnavailable") });
        return;
      }
      const hostProjects = projects.filter((project) => (
        project.environment_type === "ssh"
        && project.ssh_host_id === remoteContext.hostId
        && matchesHistoryProjectSource(project, session.source)
        && (project.cli_config_root.trim()
          ? project.cli_config_root.trim() === remoteContext.configuredConfigRoot.trim()
          : remoteContext.scopeKind === "hostPrimary")
      ));
      const candidates = findRemoteHistoryProjects(session, hostProjects, remoteContext.hostId);
      if (candidates.length === 1) {
        startResume(session, title, candidates[0], null);
        return;
      }
      setResumeIntent({
        session,
        title,
        worktree: null,
        projects: candidates.length > 1 ? candidates : hostProjects,
        allowNewWindow: candidates.length === 0,
        remote: true,
      });
      return;
    }
    const worktree = findHistoryWorktree(session, worktrees);
    const selection = selectLocalHistoryResumeProject(
      session,
      historyProjects,
      worktree,
      projectIdHint ?? projectIdFilter,
    );
    const cwdProjects = findLocalHistoryCwdProjects(session, historyProjects);
    const candidates = selection.candidates;

    logInfo("history resume requested", {
      source: session.source,
      sessionId: session.session_id,
      cwd: session.cwd ?? null,
      projectKey: session.project_key,
      projectIdHint: projectIdHint ?? projectIdFilter,
      matchedProjectId: selection.project?.id ?? null,
      candidateCount: candidates.length,
      cwdProjectCount: cwdProjects.length,
      historyProjectCount: historyProjects.length,
    });

    if (selection.project) {
      startResume(session, title, selection.project, selection.worktree);
      return;
    }

    if (candidates.length === 0) {
      if (cwdProjects.length === 1) {
        startResume(session, title, null, null, cwdProjects[0].shell);
        return;
      }
      setResumeIntent({ session, title, worktree: null, projects, allowNewWindow: true, remote: false });
      return;
    }
    setResumeIntent({ session, title, worktree: null, projects: candidates, allowNewWindow: false, remote: false });
  }, [historyProjects, projectIdFilter, projects, remoteContext, startResume, t, worktrees]);

  const resumeDialog = (
    <HistoryResumeProjectDialog
      open={resumeIntent !== null}
      projects={resumeIntent?.projects ?? []}
      groups={groups}
      useOriginalRemoteLocation={resumeIntent?.remote ?? false}
      onUseNewWindow={resumeIntent?.allowNewWindow ? () => {
        if (!resumeIntent) return;
        startResume(resumeIntent.session, resumeIntent.title, null, null);
      } : undefined}
      onSelect={(project) => {
        if (!resumeIntent) return;
        startResume(resumeIntent.session, resumeIntent.title, project, resumeIntent.worktree);
      }}
      onClose={() => setResumeIntent(null)}
    />
  );

  return { requestResume, resumeDialog };
}
