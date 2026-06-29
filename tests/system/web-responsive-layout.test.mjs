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
  assert.match(shell, /md:grid-cols-\[64px_minmax\(0,1fr\)\]/);
  assert.match(shell, /xl:grid-cols-\[var\(--sidebar\)_minmax\(0,1fr\)\]/);
  assert.match(shell, /hidden md:grid xl:hidden/);
  assert.match(shell, /hidden xl:grid/);
  assert.match(shell, /TopbarActions/);
  assert.match(shell, /p-3 sm:p-5/);
  assert.doesNotMatch(shell, /overflow-x-auto/);
});

test("shared data tables stack on phones and keep desktop table scrolling only from sm up", () => {
  const table = read("apps/web/src/design/ui/table.tsx");
  const theme = read("apps/web/src/design/theme.css");

  assert.match(table, /tv-table-wrap/);
  assert.match(table, /w-full min-w-0 max-w-full overflow-hidden/);
  assert.match(table, /sm:overflow-x-auto/);
  assert.match(table, /tv-table w-full/);
  assert.match(theme, /@media \(max-width: 640px\)/);
  assert.match(theme, /\.tv-table thead \{ display: none; \}/);
  assert.match(theme, /\.tv-table td/);
  assert.match(theme, /white-space: normal/);
  assert.match(theme, /overflow-wrap: anywhere/);
  assert.match(theme, /\.tv-table td > \*/);
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
  assert.match(cliRuns, /role="table" aria-label="Agent Runs"/);
  assert.match(cliRuns, /lg:grid-cols-\[minmax\(0,2fr\)_minmax\(84px,\.45fr\)_minmax\(0,1fr\)_minmax\(0,1fr\)_minmax\(0,\.8fr\)_minmax\(150px,\.8fr\)\]/);
  assert.match(cliShared, /min-w-0 overflow-hidden rounded-md border border-line bg-panel shadow-sm/);
  assert.match(cliShared, /flex min-w-0 flex-wrap items-center/);
  assert.match(cliShared, /basis-\[128px\] border-b border-line px-3 py-2\.5/);
  assert.doesNotMatch(cliShared, /grid gap-1 rounded-md border border-line bg-panel-2 p-3/);
});

test("file manager fills the routed viewport instead of using hard-coded list heights", () => {
  const page = read("apps/web/src/features/file-manager/FileManagerPage.tsx");
  const list = read("apps/web/src/features/file-manager/FileManagerList.tsx");
  const chrome = read("apps/web/src/features/file-manager/FileManagerChrome.tsx");
  const shell = read("apps/web/src/app/AppShell.tsx");

  assert.match(shell, /"h-full min-h-0 min-w-0 overflow-auto"/);
  assert.match(page, /data-file-manager-shell="true"/);
  assert.match(page, /relative flex h-full min-h-0 min-w-0 flex-col outline-none/);
  assert.match(page, /grid min-h-0 min-w-0 flex-1 grid-rows-\[auto_minmax\(0,1fr\)\]/);
  assert.match(page, /flex min-h-0 min-w-0 flex-1 flex-col gap-3/);
  assert.match(page, /data-file-manager-secondary-dock/);
  assert.match(page, /className="grid min-w-0 gap-2"/);
  assert.match(page, /xl:grid-cols-\[minmax\(0,1fr\)_280px\]/);
  assert.doesNotMatch(page, /xl:fixed xl:bottom-4 xl:right-4/);
  assert.match(list, /data-file-manager-list/);
  assert.match(list, /relative grid min-h-0 min-w-0 flex-1 grid-rows-\[auto_minmax\(0,1fr\)_auto\]/);
  assert.match(list, /className="min-h-0 overflow-y-auto overflow-x-hidden"/);
  assert.doesNotMatch(list, /max-h-\[calc\(100vh-470px\)\]/);
  assert.doesNotMatch(list, /min-h-\[360px\]/);
});
