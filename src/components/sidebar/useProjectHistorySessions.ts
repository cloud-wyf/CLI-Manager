import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { HistorySessionView, Project } from "../../lib/types";
import { resolveCliToolHistorySourceId } from "../../lib/cliTools";
import { getHistoryPathArgs } from "../../lib/historyPathArgs";
import { resolveHistoryProjectPath } from "../../lib/historyProjectPaths";
import { logError } from "../../lib/logger";
import { decorateHistorySummaries, normalizeSummary, useHistoryStore } from "../../stores/historyStore";

const PAGE_SIZE = 20;

// replace：展开或重试，清空重来。append：加载更多。
// refresh：后台静默重拉，保持已显示内容与已展开条数。
type LoadMode = "replace" | "append" | "refresh";

export interface ProjectHistoryState {
  status: "loading" | "loaded" | "error";
  sessions: HistorySessionView[];
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
async function fetchPage(project: Project, offset: number, limit: number): Promise<HistorySessionView[]> {
  const rows = await invoke<unknown[]>("history_list_sessions", {
    source: resolveCliToolHistorySourceId(project.cli_tool),
    ...(await getHistoryPathArgs()),
    projectPath: resolveHistoryProjectPath(project),
    query: null,
    limit: limit + 1,
    offset,
  });
  return decorateHistorySummaries((rows ?? []).map((row) => normalizeSummary(row)));
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
  // 刷新已展开列表需要 Project 对象，而 expandedIds 只有 id。
  const projectRef = useRef<Map<string, Project>>(new Map());

  const runLoad = useCallback((project: Project, mode: LoadMode) => {
    const projectId = project.id;
    const seq = (requestSeqRef.current.get(projectId) ?? 0) + 1;
    requestSeqRef.current.set(projectId, seq);
    projectRef.current.set(projectId, project);
    const loaded = loadedCountRef.current.get(projectId) ?? 0;
    const offset = mode === "append" ? loaded : 0;
    // 刷新要一次覆盖用户已经翻到的条数，否则自动刷新会把列表打回第一页。
    const limit = mode === "refresh" ? Math.max(PAGE_SIZE, loaded) : PAGE_SIZE;
    if (mode === "replace") loadedCountRef.current.set(projectId, 0);

    setByProject((prev) => {
      const current = prev[projectId];
      if (mode === "append" && current) {
        return { ...prev, [projectId]: { ...current, loadingMore: true } };
      }
      // 刷新期间保持旧内容可见：否则每次别的项目生成标题，这里都要闪一次“加载中”。
      if (mode === "refresh" && current) return prev;
      return {
        ...prev,
        [projectId]: { status: "loading", sessions: [], hasMore: false, loadingMore: false },
      };
    });

    void fetchPage(project, offset, limit)
      .then((rows) => {
        if (requestSeqRef.current.get(projectId) !== seq) return;
        const page = rows.slice(0, limit);
        setByProject((prev) => {
          const current = prev[projectId];
          const sessions = mode === "append" && current ? [...current.sessions, ...page] : page;
          loadedCountRef.current.set(projectId, sessions.length);
          return {
            ...prev,
            [projectId]: {
              status: "loaded",
              sessions,
              hasMore: rows.length > limit,
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
          // 静默刷新失败不能把已经显示的列表换成错误页——用户没发起过这次请求。
          if (mode === "refresh" && current) return prev;
          return {
            ...prev,
            [projectId]: mode === "append" && current
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
      projectRef.current.delete(projectId);
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
    runLoad(project, "replace");
  }, [expandedIds, forget, runLoad]);

  const reload = useCallback((project: Project) => runLoad(project, "replace"), [runLoad]);
  const loadMore = useCallback((project: Project) => runLoad(project, "append"), [runLoad]);

  // 智能标题落库后 store 递增 historyListRevision：展开中的列表要重拉，
  // 否则新会话和新标题都要等用户手动折叠再展开才看得到。
  const historyListRevision = useHistoryStore((s) => s.historyListRevision);
  const handledRevisionRef = useRef(historyListRevision);
  useEffect(() => {
    if (handledRevisionRef.current === historyListRevision) return;
    handledRevisionRef.current = historyListRevision;
    expandedIds.forEach((projectId) => {
      const project = projectRef.current.get(projectId);
      if (project) runLoad(project, "refresh");
    });
  }, [expandedIds, historyListRevision, runLoad]);

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
