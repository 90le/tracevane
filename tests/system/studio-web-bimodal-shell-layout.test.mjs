import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const appVue = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/App.vue"),
  "utf8",
);
const styleCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/style.css"),
  "utf8",
);
const dashboardView = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/views/DashboardView.vue"),
  "utf8",
);

test("app shell now uses a lighter rail-plus-route layout instead of a boxed top-dock shell", () => {
  assert.match(appVue, /class="sidebar sidebar-rail"/);
  assert.match(appVue, /class="mobile-nav-trigger"/);
  assert.match(appVue, /StudioSidebarRail/);
  assert.match(appVue, /<RouterView v-slot="\{ Component, route: routedView \}">/);
  assert.match(appVue, /class="shell-main-stage"/);
  assert.match(appVue, /class="shell-route-stage"/);
  assert.doesNotMatch(appVue, /class="shell-command-dock"/);
  assert.doesNotMatch(appVue, /class="shell-stage-surface"/);
  assert.doesNotMatch(appVue, /class="shell-canvas"/);
});

test("style foundation defines mirrored light theme shell surfaces", () => {
  assert.match(
    styleCss,
    /html\[data-theme="light"\]\s*\{[\s\S]*--shell-bg-start:\s*#f5f7fb;/,
  );
  assert.match(
    styleCss,
    /html\[data-theme="light"\]\s*\{[\s\S]*--shell-bg-end:\s*#dce5ef;/,
  );
  assert.match(
    styleCss,
    /html\[data-theme="light"\]\s*\{[\s\S]*--shell-stage-fill:\s*linear-gradient\(180deg,\s*rgba\(255,\s*255,\s*255,\s*0\.92\),\s*rgba\(243,\s*247,\s*251,\s*0\.84\)\);/,
  );
  assert.match(
    styleCss,
    /html\[data-theme="light"\]\s*\{[\s\S]*--shell-rail-fill:\s*linear-gradient\(180deg,\s*rgba\(253,\s*254,\s*255,\s*0\.97\),\s*rgba\(240,\s*245,\s*250,\s*0\.9\)\);/,
  );
  assert.match(styleCss, /\.app-container\s*\{[\s\S]*gap:\s*0;/);
  assert.match(styleCss, /\.mobile-nav-trigger\s*\{/);
  assert.match(styleCss, /\.mobile-nav-trigger\s*\{[\s\S]*width:\s*34px;/);
  assert.match(styleCss, /\.mobile-nav-trigger\s*\{[\s\S]*height:\s*34px;/);
  assert.match(
    styleCss,
    /\.mobile-nav-trigger\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(styleCss, /\.sidebar\s*\{[\s\S]*border-radius:\s*0;/);
  assert.match(styleCss, /\.shell-route-stage\s*\{[\s\S]*width:\s*100%;/);
  assert.doesNotMatch(styleCss, /\.shell-command-dock\s*\{/);
  assert.doesNotMatch(styleCss, /\.shell-stage-surface\s*\{/);
});

test("dashboard adopts the new home control surface vocabulary", () => {
  assert.match(dashboardView, /class="home-control-surface home-stage-rhythm"/);
  assert.match(dashboardView, /class="home-situation-band"/);
  assert.match(dashboardView, /class="home-risk-stage"/);
  assert.match(dashboardView, /class="home-compact-visual-strip"/);
  assert.match(dashboardView, /class="home-mini-chart-grid"/);
  assert.match(dashboardView, /class="home-system-snapshot"/);
  assert.match(dashboardView, /class="home-resource-signals"/);
  assert.doesNotMatch(dashboardView, /class="dashboard-hero-stage"/);
  assert.doesNotMatch(dashboardView, /class="dashboard-overview-river"/);
});
