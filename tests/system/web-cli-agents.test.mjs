import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "../..");
const read = (relative) => readFileSync(path.join(rootDir, relative), "utf8");
const exists = (relative) => existsSync(path.join(rootDir, relative));

test("CLI Agents page is a single install/configure/repair management surface", () => {
  const page = read("apps/web/src/features/cli-agents/CliAgentsPage.tsx");
  const types = read("apps/web/src/features/cli-agents/types.ts");

  assert.match(page, /return <CliRuntimeView \/>/);
  assert.match(types, /CLI_AGENT_MANAGEMENT_SCOPE = \[/);
  assert.match(types, /"install"/);
  assert.match(types, /"configure"/);
  assert.match(types, /"reinstall"/);
  assert.match(types, /"repair"/);
  assert.doesNotMatch(
    page,
    /useSearchParams|label: "运行台"|ListChecks|TABS|VIEW_COMPONENTS/,
  );
  assert.doesNotMatch(
    types,
    /CLI_AGENTS_VIEWS|CliAgentsView|AgentRuntimeRunsResponse/,
  );
  assert.equal(
    exists("apps/web/src/features/cli-agents/views/RunsView.tsx"),
    false,
  );
  assert.equal(
    exists("apps/web/src/features/cli-agents/views/OverviewView.tsx"),
    false,
  );
  assert.equal(
    exists("apps/web/src/features/cli-agents/views/EvidenceView.tsx"),
    false,
  );
});

test("CLI management view renders static roster before status probes settle", () => {
  const source = read(
    "apps/web/src/features/cli-agents/views/CliRuntimeView.tsx",
  );

  assert.match(source, /AGENT_CLI_ROSTER/);
  assert.match(source, /Static first-paint roster/);
  assert.match(source, /Codex/);
  assert.match(source, /Claude Code/);
  assert.match(source, /OpenCode/);
  assert.match(source, /statusPending/);
  assert.match(source, /检测中/);
  assert.match(source, /列表已可操作/);
  assert.match(source, /安装、配置、重装与修复/);
  assert.match(source, /重装\/修复/);
  assert.match(source, /配置 Codex 路由/);
  assert.match(source, /复制全部安装命令/);
  assert.match(source, /navigator\.clipboard\?\.writeText/);
  assert.match(source, /document\.execCommand\("copy"\)/);
  assert.match(
    source,
    /useTerminalStatusQuery\(\{[\s\S]*staleTime: 30_000,[\s\S]*retry: false,[\s\S]*\}\)/,
  );
  assert.match(
    source,
    /useModelGatewayStatusQuery\(\{[\s\S]*staleTime: 30_000,[\s\S]*retry: false,[\s\S]*\}\)/,
  );
  assert.match(source, /useInstallTerminalCliMutation/);
  assert.doesNotMatch(
    source,
    /useLaunchTerminalMutation|启动命令|Agent Runs|运行台/,
  );
  assert.doesNotMatch(source, /apiKey|secret|botId|绑定路由/);
});

test("runtime run projection and launch command endpoints are removed from this domain", () => {
  const agentsRoutes = read("apps/api/modules/agents/routes.ts");
  const terminalRoutes = read("apps/api/modules/terminal/routes.ts");
  const terminalService = read("apps/api/modules/terminal/service.ts");
  const terminalApi = read("apps/web/src/lib/api/terminal.ts");
  const terminalQuery = read("apps/web/src/lib/query/terminal.ts");
  const agentsApi = read("apps/web/src/lib/api/agents.ts");
  const agentsQuery = read("apps/web/src/lib/query/agents.ts");

  assert.equal(exists("apps/api/modules/agents/runtime-runs.ts"), false);
  assert.doesNotMatch(
    agentsRoutes,
    /\/api\/agents\/runs|buildAgentRuntimeRunsPayload/,
  );
  assert.doesNotMatch(
    agentsApi,
    /getAgentRuntimeRuns|AgentRuntimeRunsResponse|\/runs/,
  );
  assert.doesNotMatch(
    agentsQuery,
    /useAgentRuntimeRunsQuery|runtimeRuns|getAgentRuntimeRuns/,
  );
  assert.doesNotMatch(
    terminalRoutes,
    /\/api\/terminal\/launch|TerminalLaunchPayload/,
  );
  assert.doesNotMatch(
    terminalService,
    /getLaunchCommand|TerminalLaunchPayload|TerminalLaunchResponse/,
  );
  assert.doesNotMatch(
    terminalApi,
    /launchTerminal|TerminalLaunchPayload|TerminalLaunchResponse|`\$\{BASE\}\/launch`|"\/api\/terminal\/launch"/,
  );
  assert.doesNotMatch(
    terminalQuery,
    /useLaunchTerminalMutation|launchTerminal|TerminalLaunchPayload|TerminalLaunchResponse/,
  );
});

test("Terminal data layer keeps install as an explicit mutation", () => {
  const api = read("apps/web/src/lib/api/terminal.ts");
  const query = read("apps/web/src/lib/query/terminal.ts");

  assert.match(api, /installTerminalCli/);
  assert.match(api, /\/api\/terminal\/install|`\$\{BASE\}\/install`/);
  assert.match(query, /useInstallTerminalCliMutation/);
  assert.match(query, /TerminalInstallResponse/);
});
