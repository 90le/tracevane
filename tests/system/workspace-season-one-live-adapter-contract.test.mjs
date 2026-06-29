import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const readWeb = (rel) =>
  fs.readFileSync(new URL(`../../apps/web/src/${rel}`, import.meta.url), "utf-8");

test("Season One has a live adapter seam for production workspace state", () => {
  const adapter = readWeb("features/workspace/shared/WorkspaceSeasonOneLiveAdapter.ts");
  const barrel = readWeb("features/workspace/shared/index.ts");

  assert.match(adapter, /interface WorkspaceSeasonOneLiveAdapterInput/);
  assert.match(adapter, /createWorkspaceSeasonOneLiveModel/);
  assert.match(adapter, /rootLabel\?: string/);
  assert.match(adapter, /activePath\?: string \| null/);
  assert.match(adapter, /openFiles\?: string\[\]/);
  assert.match(adapter, /gitChanges\?: number/);
  assert.match(adapter, /evidenceItems\?: number/);
  assert.match(adapter, /terminalState\?: "idle" \| "running" \| "failed" \| "passed"/);
  assert.match(adapter, /agentState\?: "idle" \| "drafting" \| "waiting-review" \| "approved"/);
  assert.match(adapter, /createLiveResources/);
  assert.match(adapter, /WorkspaceSeasonOneFramePreview/);
  assert.match(barrel, /WorkspaceSeasonOneLiveAdapter/);
});
