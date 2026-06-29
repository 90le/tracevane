import * as React from "react";

import {
  createWorkspaceSeasonOneLiveModel,
  type WorkspaceSeasonOneLiveAdapterInput,
} from "../shared/WorkspaceSeasonOneLiveAdapter";
import type { WorkspaceSeasonOneProductModel } from "../shared/WorkspaceSeasonOneProductModel";

export interface WorkspaceSeasonOneSourceSnapshot {
  rootLabel?: string;
  activePath?: string | null;
  openFiles?: string[];
  gitChanges?: number;
  evidenceItems?: number;
  terminalState?: WorkspaceSeasonOneLiveAdapterInput["terminalState"];
  agentState?: WorkspaceSeasonOneLiveAdapterInput["agentState"];
  lastRunLabel?: string;
  viewportCoverage?: string;
}

const DEFAULT_SEASON_ONE_SOURCE_SNAPSHOT: WorkspaceSeasonOneSourceSnapshot = {
  rootLabel: "project-root",
  activePath: "docs/DESIGN.md",
  openFiles: [
    "docs/DESIGN.md",
    "apps/web/src/features/workspace/shared/WorkspaceSeasonOneLiveAdapter.ts",
    "tests/workspace/workspace-season-one-responsive.smoke.mjs",
  ],
  gitChanges: 4,
  evidenceItems: 3,
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
  const sourceSnapshot = React.useMemo(
    () => createWorkspaceSeasonOneDemoSourceSnapshot(),
    [],
  );
  const adapterInput = React.useMemo(
    () => createWorkspaceSeasonOneAdapterInputFromSnapshot(sourceSnapshot),
    [sourceSnapshot],
  );
  const model = React.useMemo(
    () => createWorkspaceSeasonOneLiveModel(adapterInput),
    [adapterInput],
  );

  return {
    model,
    adapterInput,
    sourceSnapshot,
    source: "demo",
  };
}

export function createWorkspaceSeasonOneDemoSourceSnapshot(): WorkspaceSeasonOneSourceSnapshot {
  return cloneWorkspaceSeasonOneSourceSnapshot(DEFAULT_SEASON_ONE_SOURCE_SNAPSHOT);
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
