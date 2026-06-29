import * as React from "react";

import {
  createWorkspaceSeasonOneLiveModel,
  type WorkspaceSeasonOneLiveAdapterInput,
} from "../shared/WorkspaceSeasonOneLiveAdapter";
import type { WorkspaceSeasonOneProductModel } from "../shared/WorkspaceSeasonOneProductModel";

const DEFAULT_SEASON_ONE_LIVE_INPUT: WorkspaceSeasonOneLiveAdapterInput = {
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
  source: "demo" | "workspace-hooks";
}

export function useWorkspaceSeasonOneLiveModel(): WorkspaceSeasonOneLiveModelState {
  const adapterInput = React.useMemo(
    () => createWorkspaceSeasonOneDemoAdapterInput(),
    [],
  );
  const model = React.useMemo(
    () => createWorkspaceSeasonOneLiveModel(adapterInput),
    [adapterInput],
  );

  return {
    model,
    adapterInput,
    source: "demo",
  };
}

export function createWorkspaceSeasonOneDemoAdapterInput(): WorkspaceSeasonOneLiveAdapterInput {
  return {
    ...DEFAULT_SEASON_ONE_LIVE_INPUT,
    openFiles: [...(DEFAULT_SEASON_ONE_LIVE_INPUT.openFiles ?? [])],
  };
}
