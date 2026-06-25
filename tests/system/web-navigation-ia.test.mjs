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
});

test("legacy external and long-tasks routes remain compatible deep-links", () => {
  const router = read("apps/web/src/app/router.tsx");
  const external = read("apps/web/src/features/external/ExternalConnectionsPage.tsx");
  const longTasks = read("apps/web/src/features/long-tasks/LongTasksPage.tsx");

  assert.match(router, /path="\/external"/);
  assert.match(router, /path="\/long-tasks"/);
  assert.match(external, /compatibility deep-link/);
  assert.match(external, /read-only AGGREGATION/);
  assert.match(longTasks, /compatibility deep-link for supervised work/);
  assert.match(longTasks, /CLI Agents owns Agent Runs/);
});

test("dashboard and platform wording route integration evidence through support surfaces", () => {
  const dashboard = read("apps/web/src/features/dashboard/DashboardPage.tsx");
  const platformAggregate = read("apps/web/src/features/platforms/usePlatformsAggregate.ts");

  assert.doesNotMatch(dashboard, /label: "外部接入"/);
  assert.doesNotMatch(dashboard, /ROUTES\.external/);
  assert.match(dashboard, /任务监督/);
  assert.match(platformAggregate, /title: "集成证据"/);
  assert.match(platformAggregate, /查看集成证据/);
  assert.doesNotMatch(platformAggregate, /查看外部接入/);
});

test("authoritative docs record the IA correction and non-core status", () => {
  const product = read("docs/产品需求.md");
  const frontend = read("docs/前端功能架构.md");
  const architecture = read("docs/系统架构.md");
  const research = read("docs/研究先行开发清单.md");

  assert.match(product, /External \/ Long Tasks legacy pages/);
  assert.match(product, /Do not expose as primary domains/);
  assert.match(frontend, /\/external` and `\/long-tasks` are no longer first-class sidebar entries/);
  assert.match(architecture, /not a primary owner domain/);
  assert.match(research, /Tracevane 信息架构收敛与一级导航减法/);
});
