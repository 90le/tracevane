import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8");

test("application shell gives phones a compact main stage instead of desktop padding", () => {
  const shell = read("apps/web/src/app/AppShell.tsx");

  assert.match(shell, /<Sheet open=\{mobileNavOpen\}/);
  assert.match(shell, /SheetContent side="left"/);
  assert.match(shell, /p-3 sm:p-5/);
  assert.doesNotMatch(shell, /overflow-x-auto/);
});

test("shared data tables stack on phones and keep desktop table scrolling only from sm up", () => {
  const table = read("apps/web/src/design/ui/table.tsx");
  const theme = read("apps/web/src/design/theme.css");

  assert.match(table, /tv-table-wrap/);
  assert.match(table, /overflow-hidden/);
  assert.match(table, /sm:overflow-x-auto/);
  assert.match(table, /tv-table w-full/);
  assert.match(theme, /@media \(max-width: 640px\)/);
  assert.match(theme, /\.tv-table thead \{ display: none; \}/);
  assert.match(theme, /\.tv-table td/);
  assert.match(theme, /white-space: normal/);
  assert.match(theme, /justify-content: flex-start/);
});

test("core feature viewbars use mobile selectors and desktop tabs", () => {
  const modelGateway = read("apps/web/src/features/model-gateway/ModelGatewayPage.tsx");
  const channels = read("apps/web/src/features/channel-connectors/ChannelConnectorsPage.tsx");
  const cliAgents = read("apps/web/src/features/cli-agents/CliAgentsPage.tsx");

  for (const source of [modelGateway, channels, cliAgents]) {
    assert.match(source, /sm:hidden/);
    assert.match(source, /<select/);
    assert.match(source, /hidden flex-wrap gap-1 border-b border-line pb-2 sm:flex/);
  }

  assert.match(modelGateway, /model-gateway-mobile-view/);
  assert.match(channels, /channel-connectors-mobile-view/);
  assert.match(cliAgents, /cli-agents-mobile-view/);
});

test("CLI operational queues can shrink on phones without forcing page-wide drag", () => {
  const runs = read("apps/web/src/features/cli-agents/views/RunsView.tsx");
  const runtime = read("apps/web/src/features/cli-agents/views/CliRuntimeView.tsx");

  assert.match(runs, /min-w-0 flex-1 basis-\[220px\]/);
  assert.doesNotMatch(runs, /min-w-\[240px\] flex-1 sm:max-w-\[420px\]/);
  assert.equal((runtime.match(/min-w-0 flex-1 basis-\[180px\]/g) || []).length, 3);
  assert.doesNotMatch(runtime, /min-w-\[220px\] flex-1/);
});

test("overview surfaces use metric rails and route tables instead of card walls", () => {
  const gatewayOverview = read("apps/web/src/features/model-gateway/views/OverviewView.tsx");
  const channelOverview = read("apps/web/src/features/channel-connectors/views/OverviewView.tsx");
  const cliShared = read("apps/web/src/features/cli-agents/views/_shared.tsx");
  const cliRuns = read("apps/web/src/features/cli-agents/views/RunsView.tsx");

  assert.match(gatewayOverview, /<dl className="mt-4 grid overflow-hidden rounded-sm border border-line bg-panel sm:grid-cols-3">/);
  assert.match(gatewayOverview, /<Table>/);
  assert.doesNotMatch(gatewayOverview, /md:grid-cols-2 xl:grid-cols-4/);
  assert.doesNotMatch(gatewayOverview, /grid min-w-0 gap-3 rounded-md border border-line bg-panel p-3 shadow-sm/);
  assert.match(channelOverview, /<dl className="mt-4 grid overflow-hidden rounded-sm border border-line bg-panel sm:grid-cols-4">/);
  assert.doesNotMatch(channelOverview, /mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4/);
  assert.match(cliRuns, /flex flex-wrap overflow-hidden border-b border-line bg-panel-2\/40/);
  assert.match(cliShared, /basis-\[128px\] border-b border-line px-3 py-2\.5/);
  assert.doesNotMatch(cliShared, /grid gap-1 rounded-md border border-line bg-panel-2 p-3/);
});
