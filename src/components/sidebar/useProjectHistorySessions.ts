import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { HistorySessionSummary, Project } from "../../lib/types";
import { resolveCliToolHistorySourceId } from "../../lib/cliTools";
import { getHistoryPathArgs } from "../../lib/historyPathArgs";
import { resolveHistoryProjectPath } from "../../lib/historyProjectPaths";
import { logError } from "../../lib/logger";
import { normalizeSummary } from "../../stores/historyStore";

const PAGE_SIZE = 20;

export interface ProjectHistoryState {
  status: "loading" | "loaded" | "error";
  sessions: HistorySessionSummary[];
  hasMore: boolean;
  loadingMore: boolean;
}

export interface ProjectHistoryController {
  byProject: Record<string, ProjectHistoryState>;
  expandedIds: Set<string>;
  toggle: (project: Project) => void;
  reload: (project: Project) => void;
  loadMore: (project: Project) => void;
}

// 多取一条用来判断还有没有下一页，展示时切掉。
// 后端序列化用 camelCase，必须过 normalizeSummary 才能拿到 session_id/project_key 等 snake_case 字段。
async function fetchPage(project: Project, offset: number): Promise<HistorySessionSummary[]> {
  const rows = await invoke<unknown[]>("history_list_sessions", {
    source: resolveCliToolHistorySourceId(project.cli_tool),
    ...(await getHistoryPathArgs()),
    projectPath: resolveHistoryProjectPath(project),
    query: null,
    limit: PAGE_SIZE + 1,
    offset,
  });
  return (rows ?? []).map((row) => normalizeSummary(row));
}

/**
 * 侧边栏项目行内联展开的历史会话缓存。
 * 折叠即丢弃缓存，再展开重新拉取——索引更新后不需要额外的失效通道。
 */
export function useProjectHistorySessions(validProjectIds: Set<string>): ProjectHistoryController {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [byProject, setByProject] = useState<Record<string, ProjectHistoryState>>({});
  // 每个项目一个请求序号：快速展开/折叠时旧结果不能覆盖新状态。
  const requestSeqRef = useRef<Map<string, number>>(new Map());
  // 已加载条数，供“加载更多”算 offset；放 ref 里避免 runLoad 依赖 byProject。
  const loadedCountRef = useRef<Map<string, number>>(new Map());

  const runLoad = useCallback((project: Project, append: boolean) => {
    const projectId = project.id;
    const seq = (requestSeqRef.current.get(projectId) ?? 0) + 1;
    requestSeqRef.current.set(projectId, seq);
    const offset = append ? loadedCountRef.current.get(projectId) ?? 0 : 0;
    if (!append) loadedCountRef.current.set(projectId, 0);

    setByProject((prev) => {
      const current = prev[projectId];
      return {
        ...prev,
        [projectId]: append && current
          ? { ...current, loadingMore: true }
          : { status: "loading", sessions: [], hasMore: false, loadingMore: false },
      };
    });

    void fetchPage(project, offset)
      .then((rows) => {
        if (requestSeqRef.current.get(projectId) !== seq) return;
        const page = rows.slice(0, PAGE_SIZE);
        setByProject((prev) => {
          const current = prev[projectId];
          const sessions = append && current ? [...current.sessions, ...page] : page;
          loadedCountRef.current.set(projectId, sessions.length);
          return {
            ...prev,
            [projectId]: {
              status: "loaded",
              sessions,
              hasMore: rows.length > PAGE_SIZE,
              loadingMore: false,
            },
          };
        });
      })
      .catch((err) => {
        if (requestSeqRef.current.get(projectId) !== seq) return;
        logError("Failed to load sidebar project history sessions", { projectId, err });
        setByProject((prev) => {
          const current = prev[projectId];
          return {
            ...prev,
            [projectId]: append && current
              ? { ...current, loadingMore: false }
              : { status: "error", sessions: [], hasMore: false, loadingMore: false },
          };
        });
      });
  }, []);

  const forget = useCallback((projectIds: string[]) => {
    if (projectIds.length === 0) return;
    projectIds.forEach((projectId) => {
      requestSeqRef.current.set(projectId, (requestSeqRef.current.get(projectId) ?? 0) + 1);
      loadedCountRef.current.delete(projectId);
    });
    setByProject((prev) => {
      const hit = projectIds.filter((projectId) => projectId in prev);
      if (hit.length === 0) return prev;
      const next = { ...prev };
      hit.forEach((projectId) => delete next[projectId]);
      return next;
    });
  }, []);

  const toggle = useCallback((project: Project) => {
    const projectId = project.id;
    if (expandedIds.has(projectId)) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
      forget([projectId]);
      return;
    }
    setExpandedIds((prev) => new Set(prev).add(projectId));
    runLoad(project, false);
  }, [expandedIds, forget, runLoad]);

  const reload = useCallback((project: Project) => runLoad(project, false), [runLoad]);
  const loadMore = useCallback((project: Project) => runLoad(project, true), [runLoad]);

  // 自愈清理：项目被删除或被同步覆盖后，移除残留的展开态与缓存。
  useEffect(() => {
    if (validProjectIds.size === 0) return;
    const stale = [...expandedIds].filter((id) => !validProjectIds.has(id));
    if (stale.length === 0) return;
    setExpandedIds((prev) => new Set([...prev].filter((id) => validProjectIds.has(id))));
    forget(stale);
  }, [expandedIds, forget, validProjectIds]);

  // 稳定引用：这个对象会进 TreeContext 的 useMemo 依赖，每次 render 新建会击穿整树 memo。
  return useMemo(
    () => ({ byProject, expandedIds, toggle, reload, loadMore }),
    [byProject, expandedIds, loadMore, reload, toggle]
  );
}
