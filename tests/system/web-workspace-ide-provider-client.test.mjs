import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const apiSource = fs.readFileSync("apps/web/src/lib/api/workspace-ide.ts", "utf-8");
const querySource = fs.readFileSync("apps/web/src/lib/query/workspace-ide.ts", "utf-8");
const panelSource = fs.readFileSync("apps/web/src/features/workspace/provider/WorkspaceIdeProviderPanel.tsx", "utf-8");

test("workspace IDE provider client binds Tracevane-owned provider endpoints", () => {
  assert.match(apiSource, /\/api\/workspace/);
  assert.match(apiSource, /getWorkspaceIdeProviders/);
  assert.match(apiSource, /createWorkspaceIdeProviderSession/);
  assert.match(apiSource, /stopWorkspaceIdeProviderSession/);
  assert.match(apiSource, /buildWorkspaceIdeProviderProxyUrl/);
  assert.doesNotMatch(apiSource, /baseUrl\s*\+|window\.open\([^)]*baseUrl/);
});

test("workspace IDE provider query hooks invalidate provider sessions after mutations", () => {
  assert.match(querySource, /workspaceIdeKeys/);
  assert.match(querySource, /invalidateQueries\(\{ queryKey: workspaceIdeKeys\.sessions\(\) \}\)/);
  assert.match(querySource, /useCreateWorkspaceIdeProviderSessionMutation/);
  assert.match(querySource, /useStopWorkspaceIdeProviderSessionMutation/);
});

test("workspace IDE provider panel is an iframe POC, not a documentation page", () => {
  assert.match(panelSource, /data-testid="workspace-ide-provider-panel"/);
  assert.match(panelSource, /data-testid="workspace-ide-provider-frame"/);
  assert.match(panelSource, /buildWorkspaceIdeProviderProxyUrl\(activeSession\.id/);
  assert.match(panelSource, /启动 Provider/);
  assert.match(panelSource, /停止/);
  assert.match(panelSource, /手机端先保留 Tracevane 任务流/);
  assert.doesNotMatch(panelSource, /Season One|第一季直播适配器/);
});


test("workspace IDE provider panel tracks startup and manual refresh", () => {
  assert.match(panelSource, /trackedSessionId/);
  assert.match(panelSource, /setTrackedSessionId\(data\.session\.id\)/);
  assert.match(panelSource, /refetchInterval: \(query\)/);
  assert.match(panelSource, /selected\?\.status === "starting" \? 1_000 : 4_000/);
  assert.match(panelSource, /sessions\.refetch\(\)/);
  assert.match(panelSource, /刷新/);
});

test("workspace IDE provider panel surfaces provider readiness and failures", () => {
  assert.match(panelSource, /getProviderStatusTone/);
  assert.match(panelSource, /正在启动真实 IDE provider/);
  assert.match(panelSource, /IDE provider 启动失败/);
  assert.match(panelSource, /activeSession\.failureReason/);
  assert.match(panelSource, /重新启动/);
});
