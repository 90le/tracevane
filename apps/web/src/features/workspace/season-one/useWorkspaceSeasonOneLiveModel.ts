import * as React from "react";

import {
  useFileReadQuery,
  useFilesSummaryQuery,
} from "../../../lib/query/files";
import { WORKSPACE_AI_CONTEXT_BASKET_STORAGE_KEY } from "../shared/WorkspaceAiContextBasket";
import { WORKSPACE_EVIDENCE_BASKET_STORAGE_KEY } from "../shared/WorkspaceEvidenceBasket";

import {
  createWorkspaceSeasonOneLiveModel,
  type WorkspaceSeasonOneLiveAdapterInput,
} from "../shared/WorkspaceSeasonOneLiveAdapter";
import type { WorkspaceSeasonOneProductModel } from "../shared/WorkspaceSeasonOneProductModel";
import type {
  FilesReadPayload,
  FilesSummaryPayload,
} from "../../../../../../types/files";

export interface WorkspaceSeasonOneSourceSnapshot {
  rootLabel?: string;
  activePath?: string | null;
  openFiles?: string[];
  gitChanges?: number;
  evidenceItems?: number;
  aiContextItems?: number;
  activeContent?: string | null;
  activeContentLanguage?: string | null;
  activeContentLabel?: string;
  activeContentEditable?: boolean;
  terminalState?: WorkspaceSeasonOneLiveAdapterInput["terminalState"];
  agentState?: WorkspaceSeasonOneLiveAdapterInput["agentState"];
  lastRunLabel?: string;
  viewportCoverage?: string;
}

interface WorkspaceSeasonOneStorageReader {
  getItem(key: string): string | null;
}

const WORKSPACE_SESSION_STORAGE_KEY = "tracevane.workspace.session.v1";

const DEFAULT_SEASON_ONE_SOURCE_SNAPSHOT: WorkspaceSeasonOneSourceSnapshot = {
  rootLabel: "project-root",
  activePath: "DESIGN.md",
  openFiles: [
    "DESIGN.md",
    "apps/web/src/features/workspace/shared/WorkspaceSeasonOneLiveAdapter.ts",
    "tests/workspace/workspace-season-one-responsive.smoke.mjs",
  ],
  gitChanges: 4,
  evidenceItems: 3,
  aiContextItems: 2,
  terminalState: "passed",
  agentState: "waiting-review",
  lastRunLabel: "Season One browser smoke",
  viewportCoverage: "desktop · tablet · phone live",
};

export interface WorkspaceSeasonOneLiveModelState {
  model: WorkspaceSeasonOneProductModel;
  adapterInput: WorkspaceSeasonOneLiveAdapterInput;
  sourceSnapshot: WorkspaceSeasonOneSourceSnapshot;
  source: "demo" | "workspace-hooks";
}

export function useWorkspaceSeasonOneLiveModel(): WorkspaceSeasonOneLiveModelState {
  const filesSummary = useFilesSummaryQuery();
  const storedSnapshot = React.useMemo(
    () => createWorkspaceSeasonOneStoredSessionSnapshot(),
    [],
  );
  const evidenceSnapshot = React.useMemo(
    () => createWorkspaceSeasonOneEvidenceSnapshot(),
    [],
  );
  const aiContextSnapshot = React.useMemo(
    () => createWorkspaceSeasonOneAiContextSnapshot(),
    [],
  );
  const liveState = React.useMemo(() => {
    const baseSnapshot = mergeWorkspaceSeasonOneSourceSnapshots(
      mergeWorkspaceSeasonOneSourceSnapshots(
        storedSnapshot ?? createWorkspaceSeasonOneDemoSourceSnapshot(),
        aiContextSnapshot,
      ),
      evidenceSnapshot,
    );
    const filesSnapshot = createWorkspaceSeasonOneFilesSummarySnapshot(
      filesSummary.data,
      baseSnapshot,
    );
    return {
      sourceSnapshot: filesSnapshot ?? baseSnapshot,
      source:
        storedSnapshot || aiContextSnapshot || evidenceSnapshot || filesSnapshot
          ? "workspace-hooks"
          : "demo",
    } as const;
  }, [aiContextSnapshot, evidenceSnapshot, filesSummary.data, storedSnapshot]);
  const activeFileRead = useFileReadQuery(
    createWorkspaceSeasonOneActiveFileReadParams(liveState.sourceSnapshot),
    { staleTime: 30_000, refetchOnWindowFocus: false },
  );
  const contentSnapshot = React.useMemo(
    () =>
      createWorkspaceSeasonOneActiveFileContentSnapshot(
        activeFileRead.data,
        liveState.sourceSnapshot,
      ),
    [activeFileRead.data, liveState.sourceSnapshot],
  );
  const adapterInput = React.useMemo(
    () => createWorkspaceSeasonOneAdapterInputFromSnapshot(contentSnapshot),
    [contentSnapshot],
  );
  const model = React.useMemo(
    () => createWorkspaceSeasonOneLiveModel(adapterInput),
    [adapterInput],
  );

  return {
    model,
    adapterInput,
    sourceSnapshot: contentSnapshot,
    source: liveState.source,
  };
}

export function createWorkspaceSeasonOneActiveFileReadParams(
  snapshot: WorkspaceSeasonOneSourceSnapshot,
): { rootId: string; path: string; limit?: number } | null {
  const rootId = normalizeText(snapshot.rootLabel);
  const path = normalizeText(snapshot.activePath);
  if (!rootId || !path) return null;
  return { rootId, path, limit: 16_000 };
}

export function createWorkspaceSeasonOneActiveFileContentSnapshot(
  file: FilesReadPayload | undefined,
  baseSnapshot: WorkspaceSeasonOneSourceSnapshot,
): WorkspaceSeasonOneSourceSnapshot {
  const snapshot = cloneWorkspaceSeasonOneSourceSnapshot(baseSnapshot);
  if (!file) return snapshot;
  return {
    ...snapshot,
    activePath: file.path || snapshot.activePath,
    activeContent: file.content,
    activeContentLanguage:
      file.ext || inferWorkspaceSeasonOneLanguage(file.path),
    activeContentLabel: file.truncated
      ? `${file.name} · preview truncated at ${file.contentBytes} bytes`
      : `${file.name} · ${file.contentBytes} bytes`,
    activeContentEditable: file.editable,
  };
}

export function createWorkspaceSeasonOneDemoSourceSnapshot(): WorkspaceSeasonOneSourceSnapshot {
  return cloneWorkspaceSeasonOneSourceSnapshot(
    DEFAULT_SEASON_ONE_SOURCE_SNAPSHOT,
  );
}

export function createWorkspaceSeasonOneFilesSummarySnapshot(
  summary: FilesSummaryPayload | undefined,
  baseSnapshot: WorkspaceSeasonOneSourceSnapshot | null = null,
): WorkspaceSeasonOneSourceSnapshot | null {
  const fallbackSnapshot = baseSnapshot
    ? cloneWorkspaceSeasonOneSourceSnapshot(baseSnapshot)
    : createWorkspaceSeasonOneDemoSourceSnapshot();
  const root = selectWorkspaceSeasonOneRoot(
    summary,
    fallbackSnapshot.rootLabel,
  );
  if (!root) return baseSnapshot ? fallbackSnapshot : null;

  return {
    ...fallbackSnapshot,
    rootLabel: root.id,
    viewportCoverage:
      fallbackSnapshot.viewportCoverage ?? "desktop · tablet · phone live",
  };
}

export function createWorkspaceSeasonOneAiContextSnapshot(
  storage:
    | WorkspaceSeasonOneStorageReader
    | undefined = getWorkspaceSeasonOneBrowserStorage(),
): WorkspaceSeasonOneSourceSnapshot | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(WORKSPACE_AI_CONTEXT_BASKET_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const aiContextItems = parsed.filter(
      isWorkspaceSeasonOneAiContextBasketItem,
    ).length;
    return {
      aiContextItems,
      agentState: aiContextItems > 0 ? "drafting" : "idle",
      lastRunLabel: aiContextItems > 0 ? "AI context basket ready" : undefined,
    };
  } catch {
    return null;
  }
}

export function createWorkspaceSeasonOneEvidenceSnapshot(
  storage:
    | WorkspaceSeasonOneStorageReader
    | undefined = getWorkspaceSeasonOneBrowserStorage(),
): WorkspaceSeasonOneSourceSnapshot | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(WORKSPACE_EVIDENCE_BASKET_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const evidenceItems = parsed.filter(
      isWorkspaceSeasonOneEvidenceRecord,
    ).length;
    return {
      evidenceItems,
      agentState: evidenceItems > 0 ? "waiting-review" : "idle",
    };
  } catch {
    return null;
  }
}

export function mergeWorkspaceSeasonOneSourceSnapshots(
  baseSnapshot: WorkspaceSeasonOneSourceSnapshot,
  overrideSnapshot: WorkspaceSeasonOneSourceSnapshot | null,
): WorkspaceSeasonOneSourceSnapshot {
  if (!overrideSnapshot)
    return cloneWorkspaceSeasonOneSourceSnapshot(baseSnapshot);
  return {
    ...cloneWorkspaceSeasonOneSourceSnapshot(baseSnapshot),
    ...overrideSnapshot,
    openFiles: overrideSnapshot.openFiles
      ? [...overrideSnapshot.openFiles]
      : [...(baseSnapshot.openFiles ?? [])],
  };
}

export function createWorkspaceSeasonOneStoredSessionSnapshot(
  storage:
    | WorkspaceSeasonOneStorageReader
    | undefined = getWorkspaceSeasonOneBrowserStorage(),
): WorkspaceSeasonOneSourceSnapshot | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(WORKSPACE_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const rootLabel = readString(parsed.rootId);
    const activePath = readString(parsed.activePath);
    if (!rootLabel && !activePath) return null;

    return {
      rootLabel,
      activePath,
      openFiles: activePath ? [activePath] : [],
      gitChanges: isGitDiffTarget(parsed.gitDiffTarget) ? 1 : 0,
      evidenceItems: 0,
      aiContextItems: 0,
      terminalState: "idle",
      agentState: "idle",
      lastRunLabel: "Workspace session restore",
      viewportCoverage: "desktop · tablet · phone live",
    };
  } catch {
    return null;
  }
}

export function createWorkspaceSeasonOneDemoAdapterInput(): WorkspaceSeasonOneLiveAdapterInput {
  return createWorkspaceSeasonOneAdapterInputFromSnapshot(
    createWorkspaceSeasonOneDemoSourceSnapshot(),
  );
}

export function createWorkspaceSeasonOneAdapterInputFromSnapshot(
  snapshot: WorkspaceSeasonOneSourceSnapshot,
): WorkspaceSeasonOneLiveAdapterInput {
  const openFiles = normalizeOpenFiles(snapshot.openFiles, snapshot.activePath);

  return {
    rootLabel: normalizeText(snapshot.rootLabel),
    activePath: normalizeText(snapshot.activePath) ?? openFiles[0] ?? undefined,
    openFiles,
    gitChanges: normalizeCount(snapshot.gitChanges),
    evidenceItems: normalizeCount(snapshot.evidenceItems),
    aiContextItems: normalizeCount(snapshot.aiContextItems),
    activeContent: normalizeText(snapshot.activeContent),
    activeContentLanguage: normalizeText(snapshot.activeContentLanguage),
    activeContentLabel: normalizeText(snapshot.activeContentLabel),
    activeContentEditable: snapshot.activeContentEditable,
    terminalState: snapshot.terminalState ?? "idle",
    agentState: snapshot.agentState ?? "idle",
    lastRunLabel: normalizeText(snapshot.lastRunLabel),
    viewportCoverage: normalizeText(snapshot.viewportCoverage),
  };
}

function cloneWorkspaceSeasonOneSourceSnapshot(
  snapshot: WorkspaceSeasonOneSourceSnapshot,
): WorkspaceSeasonOneSourceSnapshot {
  return {
    ...snapshot,
    openFiles: [...(snapshot.openFiles ?? [])],
  };
}

function normalizeOpenFiles(openFiles?: string[], activePath?: string | null) {
  const normalized = (openFiles ?? [])
    .map((path) => path.trim())
    .filter(Boolean);
  const active = normalizeText(activePath);
  if (!active) return normalized;
  return [active, ...normalized.filter((path) => path !== active)];
}

function normalizeText(value?: string | null) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function normalizeCount(value?: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value ?? 0));
}

function getWorkspaceSeasonOneBrowserStorage():
  WorkspaceSeasonOneStorageReader | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isGitDiffTarget(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const target = value as Record<string, unknown>;
  return (
    typeof target.path === "string" &&
    typeof target.staged === "boolean" &&
    typeof target.untracked === "boolean" &&
    typeof target.kind === "string"
  );
}

function inferWorkspaceSeasonOneLanguage(path?: string | null) {
  const ext = path?.split(".").pop()?.toLowerCase();
  if (!ext || ext === path) return undefined;
  return ext;
}

function selectWorkspaceSeasonOneRoot(
  summary: FilesSummaryPayload | undefined,
  preferredRootId?: string,
) {
  const roots = summary?.roots ?? [];
  if (roots.length === 0) return null;
  return (
    roots.find((root) => root.id === preferredRootId) ??
    roots.find((root) => root.id === summary?.defaultRootId) ??
    roots.find((root) => root.preferred) ??
    roots[0] ??
    null
  );
}

function isWorkspaceSeasonOneAiContextBasketItem(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    item.kind === "document" &&
    typeof item.id === "string" &&
    typeof item.path === "string" &&
    typeof item.title === "string" &&
    typeof item.context === "string" &&
    typeof item.addedAt === "string"
  );
}

function isWorkspaceSeasonOneEvidenceRecord(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.source === "string" &&
    typeof record.kind === "string" &&
    typeof record.title === "string" &&
    typeof record.summary === "string" &&
    typeof record.createdAt === "string" &&
    Boolean(record.refs) &&
    typeof record.refs === "object"
  );
}
