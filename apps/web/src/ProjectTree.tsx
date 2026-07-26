import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ClaudeColor from "@lobehub/icons/es/Claude/components/Color";
import OpenAI from "@lobehub/icons/es/OpenAI/components/Mono";
import { ChevronRight, Folder, Terminal } from "lucide-react";
import { useEffect, useMemo, useState, type SVGProps } from "react";
import type { JsonObject, Operation, ProjectContext, WorkspaceGroup, WorkspaceProject, WorkspaceSnapshot, WorkspaceWorktree } from "./domain";
import type { TranslationKey } from "./i18n";

type T = (key: TranslationKey) => string;
type TreeNode =
  | { type: "group"; group: WorkspaceGroup; children: TreeNode[] }
  | { type: "project"; project: WorkspaceProject };

type Props = {
  t: T;
  workspace: WorkspaceSnapshot | null;
  projectContexts: ProjectContext[];
  selectedProjectContext?: ProjectContext;
  dragEnabled: boolean;
  onSelectProjectContext: (key: string) => void;
  onSubmit: (kind: string, payload: JsonObject) => Promise<Operation>;
  onReload: () => void;
};

const DND_TRANSITION = { duration: 100, easing: "cubic-bezier(0.2, 0, 0, 1)" };

function nodeId(node: TreeNode): string {
  return node.type === "group" ? node.group.id : node.project.id;
}

function buildTree(workspace: WorkspaceSnapshot): TreeNode[] {
  const groupIds = new Set(workspace.groups.map((group) => group.id));
  const groupsByParent = new Map<string | null, WorkspaceGroup[]>();
  const projectsByGroup = new Map<string | null, WorkspaceProject[]>();
  for (const group of workspace.groups) {
    const parentId = group.parentId && groupIds.has(group.parentId) ? group.parentId : null;
    groupsByParent.set(parentId, [...(groupsByParent.get(parentId) ?? []), group]);
  }
  for (const project of workspace.projects) {
    const groupId = project.groupId && groupIds.has(project.groupId) ? project.groupId : null;
    projectsByGroup.set(groupId, [...(projectsByGroup.get(groupId) ?? []), project]);
  }
  const buildLevel = (parentId: string | null, ancestors: Set<string>): TreeNode[] => {
    const groups = (groupsByParent.get(parentId) ?? []).flatMap((group): TreeNode[] => {
      if (ancestors.has(group.id)) return [];
      return [{ type: "group", group, children: buildLevel(group.id, new Set(ancestors).add(group.id)) }];
    });
    const projects = (projectsByGroup.get(parentId) ?? []).map((project): TreeNode => ({ type: "project", project }));
    return [...groups, ...projects].sort((left, right) => {
      const a = left.type === "group" ? left.group : left.project;
      const b = right.type === "group" ? right.group : right.project;
      return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
    });
  };
  return buildLevel(null, new Set());
}

function findLevel(nodes: TreeNode[], targetId: string, parentId: string | null = null): { parentId: string | null; nodes: TreeNode[] } | null {
  if (nodes.some((node) => nodeId(node) === targetId)) return { parentId, nodes };
  for (const node of nodes) {
    if (node.type !== "group") continue;
    const found = findLevel(node.children, targetId, node.group.id);
    if (found) return found;
  }
  return null;
}

const collisionDetection: CollisionDetection = (args) => {
  const collisions = closestCenter(args).filter((collision) => collision.id !== args.active.id);
  if (collisions.length === 0) return [];
  const pointer = args.pointerCoordinates;
  if (pointer) {
    const containingGroup = collisions.find((collision) => {
      if (typeof collision.id !== "string" || !collision.id.startsWith("into:")) return false;
      const rect = collision.data?.droppableContainer?.rect?.current;
      return Boolean(rect && pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y <= rect.bottom);
    });
    if (containingGroup) return [containingGroup];
  }
  const sibling = collisions.find((collision) => typeof collision.id !== "string" || !collision.id.startsWith("into:"));
  if (sibling && pointer) {
    const rect = sibling.data?.droppableContainer?.rect?.current;
    if (rect) {
      const ratio = (pointer.y - rect.top) / Math.max(1, rect.height);
      const intoId = `into:${String(sibling.id)}`;
      if (ratio >= 0.3 && ratio <= 0.7) {
        const into = collisions.find((collision) => collision.id === intoId);
        if (into) return [into];
      }
      return [sibling];
    }
  }
  return [collisions.find((collision) => typeof collision.id === "string" && collision.id.startsWith("into:")) ?? collisions[0]!];
};

function WorktreeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M6.5 5.5v5.25A4.75 4.75 0 0 0 11.25 15.5H17M6.5 10.5h5.25A4.75 4.75 0 0 0 16.5 5.75V5.5M14.75 13.25 17 15.5l-2.25 2.25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6.5" cy="5.5" r="2" fill="var(--surface-raised)" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16.5" cy="5.5" r="2" fill="var(--surface-raised)" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17" cy="15.5" r="2" fill="var(--surface-raised)" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function ProjectIcon({ source }: { source: WorkspaceProject["source"] }) {
  if (source === "claude") return <ClaudeColor size={15} />;
  if (source === "codex") return <OpenAI size={15} />;
  return <Terminal size={15} strokeWidth={1.5} />;
}

type ItemProps = {
  node: TreeNode;
  depth: number;
  collapsed: Set<string>;
  contexts: ProjectContext[];
  worktrees: WorkspaceWorktree[];
  selected?: ProjectContext;
  dragEnabled: boolean;
  onToggle: (id: string) => void;
  onSelect: (key: string) => void;
};

function SortableTreeItem(props: ItemProps) {
  const id = nodeId(props.node);
  const sortable = useSortable({ id, disabled: !props.dragEnabled, transition: DND_TRANSITION });
  const into = useDroppable({ id: `into:${id}`, disabled: !props.dragEnabled || props.node.type !== "group" });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.isDragging ? undefined : sortable.transition,
    opacity: sortable.isDragging ? 0.45 : 1,
  };
  const paddingLeft = 8 + props.depth * 16;

  if (props.node.type === "project") {
    const project = props.node.project;
    const context = props.contexts.find((item) => item.projectId === project.id && !item.worktreeId);
    const worktrees = props.worktrees.filter((item) => item.projectId === project.id);
    const open = !props.collapsed.has(project.id);
    const selected = props.selected?.projectId === project.id;
    return (
      <div ref={sortable.setNodeRef} style={style} {...sortable.attributes} role="treeitem" aria-selected={selected} aria-expanded={worktrees.length ? open : undefined}>
        <div className={`web-tree-project${selected ? " active" : ""}`} style={{ paddingLeft }} {...sortable.listeners}>
          {worktrees.length ? <button className="web-tree-chevron" type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => props.onToggle(project.id)} aria-expanded={open}><ChevronRight size={12} /></button> : <span className="web-tree-chevron" />}
          <ProjectIcon source={project.source} />
          <button className="web-tree-label" type="button" disabled={!context} onClick={() => context && props.onSelect(context.key)} title={project.cwd ?? project.name}>
            <strong>{project.name}</strong><small>{project.source ?? project.environmentType}</small>
          </button>
          {context && <span className="freshness-dot live" />}
        </div>
        {open && worktrees.length > 0 && <div className="web-tree-worktrees" role="group">{worktrees.map((worktree) => {
          const worktreeContext = props.contexts.find((item) => item.worktreeId === worktree.id);
          return <button className={`web-tree-worktree${props.selected?.worktreeId === worktree.id ? " active" : ""}`} style={{ paddingLeft: paddingLeft + 29 }} type="button" key={worktree.id} disabled={!worktreeContext} onClick={() => worktreeContext && props.onSelect(worktreeContext.key)} title={worktree.cwd}>
            <WorktreeIcon /><span><strong>{worktree.name}</strong><small>{worktree.branch}</small></span>
          </button>;
        })}</div>}
      </div>
    );
  }

  const group = props.node.group;
  const open = !props.collapsed.has(group.id);
  return (
    <div ref={sortable.setNodeRef} style={style} {...sortable.attributes} role="treeitem" aria-expanded={open}>
      <div ref={into.setNodeRef} className={`web-tree-group${into.isOver ? " drop-target" : ""}`} style={{ paddingLeft }} {...sortable.listeners}>
        <button className="web-tree-chevron" type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => props.onToggle(group.id)} aria-expanded={open}><ChevronRight size={12} /></button>
        <Folder size={16} strokeWidth={1.5} />
        <button className="web-tree-label" type="button" onClick={() => props.onToggle(group.id)}><strong>{group.name}</strong></button>
      </div>
      {open && <SortableContext items={props.node.children.map(nodeId)} strategy={verticalListSortingStrategy}>
        <div role="group">{props.node.children.map((child) => <SortableTreeItem key={`${child.type}:${nodeId(child)}`} {...props} node={child} depth={props.depth + 1} />)}</div>
      </SortableContext>}
    </div>
  );
}

function previewWorkspace(workspace: WorkspaceSnapshot, itemType: "group" | "project", itemId: string, targetParentId: string | null, orderedIds: string[]): WorkspaceSnapshot {
  const order = new Map(orderedIds.map((id, index) => [id, index]));
  return {
    ...workspace,
    groups: workspace.groups.map((group) => ({
      ...group,
      parentId: itemType === "group" && group.id === itemId ? targetParentId : group.parentId,
      sortOrder: order.get(group.id) ?? group.sortOrder,
    })),
    projects: workspace.projects.map((project) => ({
      ...project,
      groupId: itemType === "project" && project.id === itemId ? targetParentId : project.groupId,
      sortOrder: order.get(project.id) ?? project.sortOrder,
    })),
  };
}

export function ProjectTree(props: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [preview, setPreview] = useState<WorkspaceSnapshot | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const workspace = preview ?? props.workspace;
  const tree = useMemo(() => workspace ? buildTree(workspace) : [], [workspace]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 3 } }));

  useEffect(() => setPreview(null), [props.workspace?.updatedAt]);

  const toggle = (id: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    if (!workspace || !event.over || event.active.id === event.over.id) return;
    const itemId = String(event.active.id);
    const itemType = workspace.groups.some((group) => group.id === itemId) ? "group" : workspace.projects.some((project) => project.id === itemId) ? "project" : null;
    if (!itemType) return;
    const overId = String(event.over.id);
    let targetParentId: string | null;
    let orderedIds: string[];
    if (overId.startsWith("into:")) {
      targetParentId = overId.slice(5);
      if (targetParentId === itemId) return;
      const target = findLevel(tree, targetParentId);
      const group = target?.nodes.find((node) => node.type === "group" && node.group.id === targetParentId);
      if (!group || group.type !== "group") return;
      orderedIds = [...group.children.map(nodeId).filter((id) => id !== itemId), itemId];
    } else {
      const level = findLevel(tree, overId);
      if (!level) return;
      targetParentId = level.parentId;
      orderedIds = level.nodes.map(nodeId).filter((id) => id !== itemId);
      const index = orderedIds.indexOf(overId);
      if (index < 0) return;
      orderedIds.splice(index, 0, itemId);
    }
    setPreview(previewWorkspace(workspace, itemType, itemId, targetParentId, orderedIds));
    void props.onSubmit("project.tree.reorder", { itemType, itemId, targetParentId, orderedIds }).then(
      () => props.onReload(),
      () => { setPreview(null); props.onReload(); },
    );
  };

  if (!workspace || tree.length === 0) return <p className="empty-copy">{props.t("noProjectContext")}</p>;
  return (
    <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={(event) => setActiveId(String(event.active.id))} onDragCancel={() => setActiveId(null)} onDragEnd={handleDragEnd}>
      <SortableContext items={tree.map(nodeId)} strategy={verticalListSortingStrategy}>
        <div className="web-project-tree" role="tree" aria-label={props.t("projects")}>{tree.map((node) => (
          <SortableTreeItem key={`${node.type}:${nodeId(node)}`} node={node} depth={0} collapsed={collapsed} contexts={props.projectContexts} worktrees={workspace.worktrees} selected={props.selectedProjectContext} dragEnabled={props.dragEnabled} onToggle={toggle} onSelect={props.onSelectProjectContext} />
        ))}</div>
      </SortableContext>
      <DragOverlay>{activeId ? <div className="web-tree-drag-overlay">{workspace.groups.find((group) => group.id === activeId)?.name ?? workspace.projects.find((project) => project.id === activeId)?.name}</div> : null}</DragOverlay>
    </DndContext>
  );
}
