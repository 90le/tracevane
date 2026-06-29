import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const pageSource = fs.readFileSync("apps/web/src/features/workspace/WorkspacePage.tsx", "utf-8");

test("workspace page exposes provider iframe mode without replacing the native workbench", () => {
  assert.match(pageSource, /WorkspaceIdeProviderPanel/);
  assert.match(pageSource, /provider === "ide" \|\| provider === "vscode"/);
  assert.match(pageSource, /data-testid="workspace-provider-mode"/);
  assert.match(pageSource, /return legacyMode \? <WorkspaceWorkbench \/> : <WorkspaceIdeShell \/>/);
});

test("workspace provider mode accepts explicit provider kinds and workspace root", () => {
  assert.match(pageSource, /openvscode-server/);
  assert.match(pageSource, /code-server/);
  assert.match(pageSource, /theia/);
  assert.match(pageSource, /workspaceRoot: params\.get\("workspaceRoot"\) \|\| undefined/);
});

test("workspace provider mode keeps mobile limitation detection at the page boundary", () => {
  assert.match(pageSource, /max-width: 768px/);
  assert.match(pageSource, /mobile=\{providerMode\.mobile\}/);
});
