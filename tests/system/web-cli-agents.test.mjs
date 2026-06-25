import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "../..");
const read = (relative) => readFileSync(path.join(rootDir, relative), "utf8");

test("CLI Agents page keeps only the two useful workbench entries", () => {
  const page = read("apps/web/src/features/cli-agents/CliAgentsPage.tsx");
  const types = read("apps/web/src/features/cli-agents/types.ts");

  assert.match(types, /CLI_AGENTS_VIEWS = \["runs", "cli"\]/);
  assert.match(page, /label: "运行台"/);
  assert.match(page, /label: "启动 \/ 修复"/);
  assert.match(page, /: "runs"/);
  assert.doesNotMatch(page, /label: "概览"|label: "证据索引"/);
  assert.doesNotMatch(page, /Persona|OpenClaw generic|通用频道 CRUD/);
});

test("Runs view is table-first and only exposes proven terminal controls", () => {
  const source = read("apps/web/src/features/cli-agents/views/RunsView.tsx");

  assert.match(source, /TableHeader/);
  assert.match(source, /FILTERS/);
  assert.match(source, /placeholder="搜索 run \/ 模型 \/ 目录 \/ 错误 \/ session"/);
  assert.match(source, /rowMatchesSearch/);
  assert.match(source, /run\.actionReason/);
  assert.match(source, /run\.canStop/);
  assert.match(source, /run\.canDelete/);
  assert.match(source, /DialogTitle>停止 Agent 终端会话/);
  assert.match(source, /DialogTitle>删除终端会话记录/);
  assert.match(source, /useEndTerminalSessionMutation/);
  assert.match(source, /useDeleteTerminalSessionMutation/);
  assert.match(source, /待处理操作/);
  assert.doesNotMatch(source, /边界说明|为什么不是把三个域硬合并/);
  assert.doesNotMatch(source, /grid-cols-3.*card/i);
});

test("CLI Runtime view owns launch and install repair without provider or IM editing", () => {
  const source = read("apps/web/src/features/cli-agents/views/CliRuntimeView.tsx");

  assert.match(source, /Agent CLI 启动 \/ 修复/);
  assert.match(source, /useLaunchTerminalMutation/);
  assert.match(source, /useInstallTerminalCliMutation/);
  assert.match(source, /Agent CLI 启动 \/ 修复/);
  assert.match(source, /修复队列/);
  assert.match(source, /确认安装/);
  assert.match(source, /安装结果/);
  assert.match(source, /复制提示/);
  assert.match(source, /navigator\.clipboard\?\.writeText/);
  assert.match(source, /document\.execCommand\("copy"\)/);
  assert.match(source, /void gateway\.refetch\(\)/);
  assert.match(source, /window\.location\.hash = "#\/ide"/);
  assert.match(source, /window\.location\.hash = "#\/model-gateway"/);
  assert.match(source, /不会登录你的 OpenAI \/ Anthropic \/ OpenCode 账号/);
  assert.match(source, /不自动写 shell/);
  assert.doesNotMatch(source, /title="依赖引用"|这里只显示 CLI 运行必须知道的最小依赖/);
  assert.doesNotMatch(source, /apiKey|secret|botId|绑定路由/);
});

test("Terminal data layer exposes install as an explicit mutation", () => {
  const api = read("apps/web/src/lib/api/terminal.ts");
  const query = read("apps/web/src/lib/query/terminal.ts");

  assert.match(api, /installTerminalCli/);
  assert.match(api, /\/api\/terminal\/install|`\$\{BASE\}\/install`/);
  assert.match(query, /useInstallTerminalCliMutation/);
  assert.match(query, /TerminalInstallResponse/);
});
