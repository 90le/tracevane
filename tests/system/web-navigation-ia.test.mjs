import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8");

test("primary navigation exposes core operating domains, not legacy aggregation pages", () => {
  const navigation = read("apps/web/src/app/navigation.ts");

  assert.match(navigation, /label: "模型网关"/);
  assert.match(navigation, /label: "IM 渠道"/);
  assert.match(navigation, /label: "CLI 代理"/);
  assert.doesNotMatch(navigation, /path: "\/external"/);
  assert.doesNotMatch(navigation, /label: "外部接入"/);
  assert.doesNotMatch(navigation, /path: "\/long-tasks"/);
  assert.doesNotMatch(navigation, /label: "长任务"/);
  assert.match(navigation, /path: "\/platforms"/);
  assert.doesNotMatch(navigation, /path: "\/recovery"/);
  assert.doesNotMatch(navigation, /label: "恢复"/);
});

test("legacy external, long-tasks and recovery routes remain compatible deep-links", () => {
  const router = read("apps/web/src/app/router.tsx");
  const platforms = read("apps/web/src/features/platforms/PlatformsPage.tsx");
  const sections = read("apps/web/src/features/platforms/sections.ts");

  assert.match(router, /path="\/external" element=\{<Navigate to="\/platforms" replace \/>\}/);
  assert.match(router, /path="\/long-tasks" element=\{<Navigate to="\/cli-agents" replace \/>\}/);
  assert.doesNotMatch(router, /ExternalConnectionsPage/);
  assert.doesNotMatch(router, /LongTasksPage/);
  assert.match(router, /path="\/recovery" element=\{<Navigate to="\/platforms\/openclaw\/guard" replace \/>\}/);
  assert.match(platforms, /<OpenClawWorkspace section=\{section\} \/>/);
  assert.match(sections, /if \(section === "recovery"\) return "guard"/);
});

test("dashboard and platform wording route integration evidence through support surfaces", () => {
  const dashboard = read("apps/web/src/features/dashboard/DashboardPage.tsx");
  const platformAggregate = read("apps/web/src/features/platforms/usePlatformsAggregate.ts");

  assert.doesNotMatch(dashboard, /label: "外部接入"/);
  assert.doesNotMatch(dashboard, /label: "恢复"/);
  assert.doesNotMatch(dashboard, /ROUTES\.external/);
  assert.match(dashboard, /任务监督/);
  assert.match(dashboard, /平台守护日志/);
  assert.doesNotMatch(platformAggregate, /title: "集成证据"/);
  assert.doesNotMatch(platformAggregate, /id: "external-mcp"/);
  assert.match(platformAggregate, /to: "\/platforms\/openclaw\/guard"/);
});

test("authoritative docs record the IA correction and non-core status", () => {
  const product = read("docs/产品需求.md");
  const frontend = read("docs/前端功能架构.md");
  const architecture = read("docs/系统架构.md");
  const research = read("docs/研究先行开发清单.md");

  assert.match(product, /External \/ Long Tasks legacy pages/);
  assert.match(product, /Do not expose as primary domains/);
  assert.match(frontend, /redirect-only compatibility\/deep-links/);
  assert.match(frontend, /Preferred route: `\/platforms\/openclaw\/guard`/);
  assert.match(architecture, /Redirect-only compatibility link to `\/platforms`/);
  assert.match(architecture, /Redirect-only compatibility link to `\/cli-agents`/);
  assert.match(architecture, /Not Tracevane business-data recovery/);
  assert.match(research, /Tracevane 信息架构收敛与一级导航减法/);
  assert.match(research, /Recovery 合并进 Platform \/ OpenClaw 平台守护/);
});
