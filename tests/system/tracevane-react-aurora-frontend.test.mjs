import test from "node:test";
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const webDir = path.join(rootDir, "apps/web-vue");
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8");

test("web workspace is React/Vite/Tailwind, not Vue", () => {
  const packageJson = JSON.parse(read("apps/web-vue/package.json"));
  assert.equal(packageJson.dependencies.react.startsWith("^"), true);
  assert.equal(packageJson.dependencies["react-dom"].startsWith("^"), true);
  assert.equal(packageJson.dependencies["react-router-dom"].startsWith("^"), true);
  assert.equal(packageJson.dependencies["@tanstack/react-query"].startsWith("^"), true);
  assert.equal(packageJson.devDependencies["@vitejs/plugin-react"].startsWith("^"), true);
  assert.equal(packageJson.devDependencies["@tailwindcss/vite"].startsWith("^"), true);
  assert.equal(packageJson.dependencies.vue, undefined);
  assert.equal(packageJson.dependencies["vue-router"], undefined);
  assert.equal(packageJson.devDependencies["@vitejs/plugin-vue"], undefined);
  assert.equal(packageJson.dependencies["@nuxt/ui"], undefined);

  const viteConfig = read("apps/web-vue/vite.config.ts");
  assert.match(viteConfig, /from '@vitejs\/plugin-react'/);
  assert.match(viteConfig, /from '@tailwindcss\/vite'/);
  assert.doesNotMatch(viteConfig, /@vitejs\/plugin-vue/);
  assert.doesNotMatch(viteConfig, /@nuxt\/ui/);
});

test("React entry uses the Aurora app root", () => {
  const indexHtml = read("apps/web-vue/index.html");
  const main = read("apps/web-vue/src/main.tsx");
  const favicon = read("apps/web-vue/public/favicon.svg");

  assert.match(indexHtml, /<title>Tracevane<\/title>/);
  assert.match(indexHtml, /<div id="root" class="isolate"><\/div>/);
  assert.match(indexHtml, /src="\/src\/main\.tsx"/);
  assert.match(main, /ReactDOM\.createRoot\(document\.getElementById\("root"\)!/);
  assert.match(main, /<HashRouter>/);
  assert.match(favicon, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 48 48">/);
});

test("Aurora route manifest maps all prototype fragments", () => {
  const manifest = read("apps/web-vue/src/app/route-manifest.ts");
  const expectedRoutes = [
    "external",
    "files",
    "approvals",
  ];

  for (const route of expectedRoutes) {
    assert.match(manifest, new RegExp(`path: "${route}"`));
    assert.match(manifest, new RegExp(`docs/prototypes/pages/${route}\\.html\\?raw`));
  }

  for (const group of ["总览", "运行", "连接", "证据", "系统", "平台"]) {
    assert.match(manifest, new RegExp(`label: "${group}"`));
  }

  assert.equal((manifest.match(/surface: "prototype", html:/g) || []).length, 3);
  assert.match(manifest, /path: "dashboard"/);
  assert.match(manifest, /path: "chat"/);
  assert.match(manifest, /path: "ide"/);
  assert.match(manifest, /path: "long-tasks"[\s\S]*surface: "react"/);
  assert.match(manifest, /path: "cli-agents"/);
  assert.match(manifest, /path: "model-gateway"/);
  assert.match(manifest, /path: "im-channels"/);
  assert.match(manifest, /path: "platforms"/);
  assert.match(manifest, /path: "recovery"[\s\S]*surface: "react"/);
  assert.match(manifest, /surface: "react"/);
  assert.match(manifest, /openClawPlatformSections/);
});

test("Aurora frontend coverage script records prototype-backed routes", () => {
  const output = childProcess.execFileSync(
    process.execPath,
    [path.join(rootDir, "scripts/tracevane-frontend-coverage.mjs")],
    { cwd: rootDir, encoding: "utf8" },
  );
  const parsed = JSON.parse(output);

  assert.equal(parsed.frontend, "react-aurora");
  assert.equal(parsed.routes.length, 12);
  assert.deepEqual(
    parsed.routes.filter((route) => route.surface === "prototype").map((route) => route.path),
    [
      "external",
      "files",
      "approvals",
    ],
  );
  assert.deepEqual(
    parsed.routes.filter((route) => route.surface === "react").map((route) => route.path),
    ["dashboard", "chat", "ide", "long-tasks", "cli-agents", "model-gateway", "im-channels", "recovery", "platforms"],
  );
  assert.ok(parsed.coreFiles.includes("apps/web-vue/src/app/AuroraShell.tsx"));
  assert.ok(parsed.coreFiles.includes("apps/web-vue/src/app/ChatWorkbenchPage.tsx"));
  assert.ok(parsed.coreFiles.includes("apps/web-vue/src/app/CliAgentsPage.tsx"));
  assert.ok(parsed.coreFiles.includes("apps/web-vue/src/app/DashboardPage.tsx"));
  assert.ok(parsed.coreFiles.includes("apps/web-vue/src/app/ImChannelsPage.tsx"));
  assert.ok(parsed.coreFiles.includes("apps/web-vue/src/app/LongTasksPage.tsx"));
  assert.ok(parsed.coreFiles.includes("apps/web-vue/src/app/ModelGatewayPage.tsx"));
  assert.ok(parsed.coreFiles.includes("apps/web-vue/src/app/PlatformIntegrationsPage.tsx"));
  assert.ok(parsed.coreFiles.includes("apps/web-vue/src/app/OpenClawPlatformPage.tsx"));
  assert.ok(parsed.coreFiles.includes("apps/web-vue/src/app/RecoveryPage.tsx"));
  assert.ok(parsed.coreFiles.includes("apps/web-vue/src/app/WorkspaceIdePage.tsx"));
  assert.ok(parsed.verification.includes("tests/system/tracevane-react-aurora-frontend.test.mjs"));
  assert.ok(
    parsed.routes
      .filter((route) => route.surface === "prototype")
      .every((route) => route.prototype?.startsWith("docs/prototypes/pages/")),
  );
});

test("Long Tasks is a real React supervision page backed by read-only runtime evidence APIs", () => {
  const app = read("apps/web-vue/src/app/App.tsx");
  const manifest = read("apps/web-vue/src/app/route-manifest.ts");
  const page = read("apps/web-vue/src/app/LongTasksPage.tsx");

  assert.match(app, /LongTasksPage/);
  assert.match(manifest, /path: "long-tasks"[\s\S]*surface: "react"/);
  assert.doesNotMatch(manifest, /longTasksHtml/);
  assert.doesNotMatch(manifest, /docs\/prototypes\/pages\/long-tasks\.html\?raw/);
  for (const endpoint of [
    "/api/chat/bootstrap?recentLimit=40&historyLimit=30",
    "/api/channel-connectors/agent-sessions",
    "/api/terminal/sessions",
    "/api/openclaw-recovery/status",
  ]) {
    assert.match(page, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const label of ["长任务", "无输出超时", "只读", "任务空闲判定", "Chat / IM / Terminal / Recovery"]) {
    assert.match(page, new RegExp(label));
  }
  assert.doesNotMatch(page, /\/api\/terminal\/end/);
  assert.doesNotMatch(page, /\/api\/channel-connectors\/agent-sessions[\\s\\S]*method:\\s*"POST"/);
  assert.doesNotMatch(page, /\/api\/chat\/abort/);
  assert.doesNotMatch(page, /openclaw-recovery\/run/);
  assert.doesNotMatch(page, /method:\s*"POST"/);
});

test("Recovery is a real React system guard backed by read-only recovery APIs", () => {
  const app = read("apps/web-vue/src/app/App.tsx");
  const manifest = read("apps/web-vue/src/app/route-manifest.ts");
  const page = read("apps/web-vue/src/app/RecoveryPage.tsx");

  assert.match(app, /RecoveryPage/);
  assert.match(manifest, /path: "recovery"[\s\S]*surface: "react"/);
  assert.doesNotMatch(manifest, /recoveryHtml/);
  assert.doesNotMatch(manifest, /docs\/prototypes\/pages\/recovery\.html\?raw/);
  for (const endpoint of [
    "/api/openclaw-recovery/status",
    "/api/openclaw-recovery/events?page=1&pageSize=20",
    "/api/openclaw-recovery/backups?page=1&pageSize=8",
    "/api/openclaw-recovery/daemon-service",
    "/api/system/health",
  ]) {
    assert.match(page, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const label of ["自愈守护", "System Guard", "守护事件", "备份与回滚证据", "锁定动作矩阵", "待确认流"]) {
    assert.match(page, new RegExp(label));
  }
  assert.doesNotMatch(page, /openclaw-recovery\/run/);
  assert.doesNotMatch(page, /restore-backup/);
  assert.doesNotMatch(page, /apiJson\("\/api\/openclaw-recovery\/daemon-service"[\s\S]*method:\s*"POST"/);
  assert.doesNotMatch(page, /method:\s*"POST"/);
});

test("Aurora React shell owns navigation, overlays, command palette and page mounts", () => {
  const shell = read("apps/web-vue/src/app/AuroraShell.tsx");
  const page = read("apps/web-vue/src/app/PrototypePage.tsx");
  const mounts = read("apps/web-vue/src/app/page-mounts.ts");
  const css = read("apps/web-vue/src/styles/app.css");

  assert.match(shell, /className="app"/);
  assert.match(shell, /className="sidebar"/);
  assert.match(shell, /className=\{`cmd-mask/);
  assert.match(shell, /className=\{`sheet/);
  assert.match(shell, /className=\{`dlg-mask/);
  assert.match(shell, /document\.body\.dataset\.theme/);
  assert.match(shell, /document\.body\.dataset\.palette/);
  assert.match(shell, /\/api\/system\/health/);

  assert.match(page, /dangerouslySetInnerHTML=\{\{ __html: route\.html \|\| "" \}\}/);
  assert.match(page, /mountAuroraPage\(route\.path, stage, shell\)/);

  for (const mountName of [
    "dashboardMount",
    "modelGatewayMount",
    "ideMount",
    "chatMount",
    "approvalsMount",
    "recoveryMount",
  ]) {
    assert.match(mounts, new RegExp(`function ${mountName}`));
  }

  assert.match(css, /@import "tailwindcss";/);
  assert.match(css, /docs\/prototypes\/app\/styles\.css/);
});

test("Platform integrations and OpenClaw are real React subdomains backed by existing APIs", () => {
  const app = read("apps/web-vue/src/app/App.tsx");
  const platforms = read("apps/web-vue/src/app/PlatformIntegrationsPage.tsx");
  const page = read("apps/web-vue/src/app/OpenClawPlatformPage.tsx");
  const api = read("apps/web-vue/src/app/api-client.ts");

  assert.match(app, /PlatformIntegrationsPage/);
  assert.match(app, /OpenClawPlatformPage/);
  assert.match(app, /path="\/platforms\/openclaw\/:section"/);
  assert.match(app, /path="\/runtime-admin\/:section"/);
  assert.match(app, /LegacyRuntimeRedirect/);
  assert.match(platforms, /primaryRoute: "\/platforms\/openclaw"/);
  assert.match(platforms, /primaryRoute: "\/model-gateway"/);
  assert.match(platforms, /primaryRoute: "\/im-channels"/);
  for (const endpoint of [
    "/api/config",
    "/api/agents",
    "/api/channels",
    "/api/skills",
    "/api/model-gateway/daemon-service",
    "/api/channel-connectors/daemon/service",
    "/api/openclaw-recovery/status",
    "/api/openclaw-recovery/run",
  ]) {
    assert.match(page, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const section of ["overview", "config", "extensions", "agents-channels", "services", "recovery"]) {
    assert.match(page, new RegExp(section));
  }
  for (const guardedCopy of ["写入策略", "安全动作", "Config repair", "Full repair", "Restore backup", "待确认流"]) {
    assert.match(page, new RegExp(guardedCopy));
  }
  assert.match(page, /action:\s*"probe"/);
  assert.doesNotMatch(page, /action:\s*"repair"/);
  assert.doesNotMatch(page, /action:\s*"config-repair"/);
  assert.match(api, /class ApiError/);
  assert.match(api, /JSON\.stringify\(body\)/);
});

test("Dashboard is a real React cockpit backed by read-only core status APIs", () => {
  const app = read("apps/web-vue/src/app/App.tsx");
  const manifest = read("apps/web-vue/src/app/route-manifest.ts");
  const page = read("apps/web-vue/src/app/DashboardPage.tsx");

  assert.match(app, /DashboardPage/);
  assert.match(manifest, /path: "dashboard"[\s\S]*surface: "react"/);
  for (const endpoint of [
    "/api/dashboard/summary",
    "/api/system/health",
    "/api/model-gateway/status",
    "/api/chat/bootstrap?recentLimit=12&historyLimit=1",
    "/api/channel-connectors/status",
    "/api/channel-connectors/agent-sessions",
    "/api/terminal/status",
    "/api/openclaw-recovery/status",
  ]) {
    assert.match(page, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const label of ["仪表盘", "Tracevane 运行态驾驶舱", "主线工作域", "需要关注", "OpenClaw 仍是平台支撑"]) {
    assert.match(page, new RegExp(label));
  }
  assert.doesNotMatch(page, /\/api\/stream\/dashboard/);
  assert.doesNotMatch(page, /openclaw-recovery\/run/);
  assert.doesNotMatch(page, /method:\\s*"POST"/);
});

test("Model Gateway is a real React page backed by read-only existing APIs", () => {
  const app = read("apps/web-vue/src/app/App.tsx");
  const manifest = read("apps/web-vue/src/app/route-manifest.ts");
  const page = read("apps/web-vue/src/app/ModelGatewayPage.tsx");

  assert.match(app, /ModelGatewayPage/);
  assert.match(manifest, /path: "model-gateway"[\s\S]*surface: "react"/);
  for (const endpoint of [
    "/api/model-gateway/status",
    "/api/model-gateway/runtime",
    "/api/model-gateway/providers",
    "/api/model-gateway/app-connections",
    "/api/model-gateway/usage",
    "/api/model-gateway/daemon-service",
  ]) {
    assert.match(page, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const label of ["概览", "Provider", "模型", "用量", "写入动作进入下钻确认流"]) {
    assert.match(page, new RegExp(label));
  }
  assert.doesNotMatch(page, /active-route-smoke/);
  assert.doesNotMatch(page, /app-connections\/apply/);
  assert.doesNotMatch(page, /rollback/);
});

test("IM Channels is a real React page backed by read-only existing APIs", () => {
  const app = read("apps/web-vue/src/app/App.tsx");
  const manifest = read("apps/web-vue/src/app/route-manifest.ts");
  const page = read("apps/web-vue/src/app/ImChannelsPage.tsx");

  assert.match(app, /ImChannelsPage/);
  assert.match(manifest, /path: "im-channels"[\s\S]*surface: "react"/);
  for (const endpoint of [
    "/api/channels",
    "/api/channel-connectors/status",
    "/api/channel-connectors/daemon/config",
    "/api/channel-connectors/agent-sessions",
    "/api/channel-connectors/daemon/logs",
  ]) {
    assert.match(page, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const label of ["概览", "渠道", "绑定", "会话", "日志", "kill/reap 属写动作"]) {
    assert.match(page, new RegExp(label));
  }
  assert.doesNotMatch(page, /transport-smoke/);
  assert.doesNotMatch(page, /commands\/action/);
  assert.doesNotMatch(page, /agent-sessions[\\s\\S]*method:\\s*"POST"/);
});

test("Workspace IDE is a real React page backed by read-only workspace APIs", () => {
  const app = read("apps/web-vue/src/app/App.tsx");
  const manifest = read("apps/web-vue/src/app/route-manifest.ts");
  const page = read("apps/web-vue/src/app/WorkspaceIdePage.tsx");

  assert.match(app, /WorkspaceIdePage/);
  assert.match(manifest, /path: "ide"[\s\S]*surface: "react"/);
  for (const endpoint of [
    "/api/files/summary",
    "/api/files/browse",
    "/api/files/read",
    "/api/git/status",
    "/api/git/diff",
    "/api/terminal/status",
    "/api/terminal/sessions",
  ]) {
    assert.match(page, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const label of ["工作区 IDE", "编辑", "预览", "Diff", "资源", "Git", "终端", "证据", "AI", "只读"]) {
    assert.match(page, new RegExp(label));
  }
  assert.doesNotMatch(page, /\/api\/files\/content/);
  assert.doesNotMatch(page, /\/api\/git\/commit/);
  assert.doesNotMatch(page, /\/api\/terminal\/launch/);
  assert.doesNotMatch(page, /method:\\s*"POST"/);
});

test("CLI Agents is a real React page backed by read-only runtime APIs", () => {
  const app = read("apps/web-vue/src/app/App.tsx");
  const manifest = read("apps/web-vue/src/app/route-manifest.ts");
  const page = read("apps/web-vue/src/app/CliAgentsPage.tsx");

  assert.match(app, /CliAgentsPage/);
  assert.match(manifest, /path: "cli-agents"[\s\S]*surface: "react"/);
  for (const endpoint of [
    "/api/agents",
    "/api/terminal/status",
    "/api/terminal/sessions",
    "/api/channel-connectors/agent-sessions",
    "/api/model-gateway/status",
    "/api/chat/bootstrap?recentLimit=20&historyLimit=1",
  ]) {
    assert.match(page, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const label of ["CLI Agents", "概览", "Agents", "CLI", "会话", "IM 证据", "只读", "kill/reap"]) {
    assert.match(page, new RegExp(label));
  }
  assert.doesNotMatch(page, /\/api\/channel-connectors\/commands\/action/);
  assert.doesNotMatch(page, /\/api\/channel-connectors\/agent-sessions[\\s\\S]*method:\\s*"POST"/);
  assert.doesNotMatch(page, /\/api\/terminal\/launch/);
  assert.doesNotMatch(page, /\/api\/terminal\/end/);
  assert.doesNotMatch(page, /method:\\s*"POST"/);
});

test("Chat workbench is a real React page backed by read-only chat bootstrap", () => {
  const app = read("apps/web-vue/src/app/App.tsx");
  const manifest = read("apps/web-vue/src/app/route-manifest.ts");
  const page = read("apps/web-vue/src/app/ChatWorkbenchPage.tsx");

  assert.match(app, /ChatWorkbenchPage/);
  assert.match(manifest, /path: "chat"[\s\S]*surface: "react"/);
  assert.match(page, /\/api\/chat\/bootstrap/);
  for (const label of ["会话任务", "Tracevane Agent 工作台", "消息", "运行", "队列", "诊断", "发送入口暂时锁定"]) {
    assert.match(page, new RegExp(label));
  }
  assert.doesNotMatch(page, /\/api\/chat\/send/);
  assert.doesNotMatch(page, /\/api\/chat\/abort/);
  assert.doesNotMatch(page, /\/api\/chat\/reset/);
  assert.doesNotMatch(page, /\/api\/chat\/sessions[\\s\\S]*method:\\s*"POST"/);
  assert.doesNotMatch(page, /method:\\s*"POST"/);
});

test("old Vue source tree is removed from the active web source", () => {
  const srcFiles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(filePath);
      else srcFiles.push(filePath);
    }
  };
  walk(path.join(webDir, "src"));

  assert.equal(srcFiles.some((file) => file.endsWith(".vue")), false);
  assert.equal(srcFiles.some((file) => file.endsWith("shims-vue.d.ts")), false);
  assert.equal(srcFiles.some((file) => file.includes(`${path.sep}features${path.sep}`)), false);
  assert.equal(srcFiles.some((file) => file.includes(`${path.sep}views${path.sep}`)), false);
});
