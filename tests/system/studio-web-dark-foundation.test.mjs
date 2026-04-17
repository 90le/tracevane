import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testFileDir, "..", "..");

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), "utf8");
}

const styleCss = read("apps/web-vue/src/style.css");
const appVue = read("apps/web-vue/src/App.vue");
const sidebarRail = read("apps/web-vue/src/components/StudioSidebarRail.vue");

test("dark theme tokens use the muted blue-gray foundation palette", () => {
  assert.match(styleCss, /--shell-bg-start:\s*#06101a;/);
  assert.match(styleCss, /--shell-bg-end:\s*#1b3448;/);
  assert.match(
    styleCss,
    /--shell-stage-fill:\s*linear-gradient\(180deg,\s*rgba\(9,\s*19,\s*31,\s*0\.88\),\s*rgba\(11,\s*24,\s*38,\s*0\.74\)\);/,
  );
  assert.match(
    styleCss,
    /--shell-rail-fill:\s*linear-gradient\(180deg,\s*rgba\(6,\s*15,\s*25,\s*0\.94\),\s*rgba\(9,\s*18,\s*29,\s*0\.84\)\);/,
  );
  assert.match(
    styleCss,
    /--shell-panel-fill:\s*linear-gradient\(180deg,\s*rgba\(255,\s*255,\s*255,\s*0\.11\),\s*rgba\(255,\s*255,\s*255,\s*0\.035\)\);/,
  );
  assert.match(
    styleCss,
    /--body-glow-a:\s*rgba\(111,\s*167,\s*255,\s*0\.17\);/,
  );
  assert.match(styleCss, /--body-glow-b:\s*rgba\(255,\s*201,\s*141,\s*0\.1\);/);
});

test("semantic visual token aliases stay wired to shell primitives", () => {
  assert.match(styleCss, /--bg-app:\s*var\(--shell-bg-start\);/);
  assert.match(styleCss, /--surface-base:\s*var\(--shell-panel-fill\);/);
  assert.match(
    styleCss,
    /--surface-raised:\s*var\(--shell-panel-fill-strong\);/,
  );
  assert.match(
    styleCss,
    /--surface-overlay:\s*color-mix\(in srgb, var\(--shell-stage-fill-strong\) 96%, transparent\);/,
  );
  assert.match(styleCss, /--text-primary:\s*var\(--text\);/);
  assert.match(styleCss, /--text-secondary:\s*var\(--muted\);/);
  assert.match(styleCss, /--border-subtle:\s*var\(--shell-panel-border\);/);
  assert.match(styleCss, /--border-strong:\s*var\(--shell-stage-border\);/);
  assert.match(styleCss, /--accent-primary:\s*var\(--acc\);/);
  assert.match(styleCss, /--focus-ring:\s*rgba\(91,\s*150,\s*255,\s*0\.24\);/);
  assert.match(
    styleCss,
    /html\[data-theme="light"\]\s*\{[\s\S]*--surface-overlay:/,
  );
});

test("shell chrome reduces ambient noise and keeps the content frame primary", () => {
  assert.match(styleCss, /\.ambient-orb\s*\{[\s\S]*filter:\s*blur\(72px\);/);
  assert.match(styleCss, /\.ambient-orb\s*\{[\s\S]*opacity:\s*0\.16;/);
  assert.match(styleCss, /\.app-container\s*\{[\s\S]*gap:\s*0;/);
  assert.match(styleCss, /\.app-container\s*\{[\s\S]*padding:\s*0;/);
  assert.match(styleCss, /\.sidebar\s*\{[\s\S]*top:\s*0;/);
  assert.match(styleCss, /\.sidebar\s*\{[\s\S]*height:\s*100dvh;/);
  assert.match(styleCss, /\.sidebar\s*\{[\s\S]*border-radius:\s*0;/);
  assert.match(styleCss, /\.sidebar-toggle\s*\{[\s\S]*border-radius:\s*8px;/);
  assert.match(styleCss, /\.nav-link\s*\{[\s\S]*border-radius:\s*8px;/);
  assert.match(styleCss, /\.theme-switch\s*\{[\s\S]*padding:\s*3px;/);
  assert.match(styleCss, /\.theme-switch\s*\{[\s\S]*border-radius:\s*12px;/);
  assert.match(
    styleCss,
    /\.theme-switch-button\s*\{[\s\S]*min-height:\s*26px;/,
  );
  assert.match(
    styleCss,
    /\.theme-switch-button\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(styleCss, /\.sidebar-utility-cluster\s*\{/);
  assert.match(styleCss, /\.mobile-nav-trigger\s*\{/);
  assert.match(styleCss, /\.main-content\s*\{[\s\S]*min-height:\s*100dvh;/);
  assert.match(styleCss, /\.shell-route-stage\s*\{/);
  assert.doesNotMatch(styleCss, /\.shell-command-dock\s*\{/);
  assert.doesNotMatch(styleCss, /\.shell-stage-surface\s*\{/);
});

test("shared cards avoid the rainbow nth-child treatment from the previous pass", () => {
  assert.doesNotMatch(
    styleCss,
    /\.stats-grid \.metric-card:nth-child\(4n \+ 1\)/,
  );
  assert.doesNotMatch(
    styleCss,
    /\.stats-grid \.metric-card:nth-child\(4n \+ 2\)/,
  );
  assert.doesNotMatch(
    styleCss,
    /\.stats-grid \.metric-card:nth-child\(4n \+ 3\)/,
  );
  assert.doesNotMatch(
    styleCss,
    /\.stats-grid \.metric-card:nth-child\(4n \+ 4\)/,
  );
});

test("app shell renders the decluttered rail layout without the bulky shared top dock", () => {
  assert.match(appVue, /class="ambient-orb ambient-orb-a"/);
  assert.match(appVue, /class="sidebar sidebar-rail"/);
  assert.match(appVue, /class="mobile-nav-trigger"/);
  assert.match(appVue, /StudioSidebarRail/);
  assert.match(sidebarRail, /class="sidebar-utility-cluster"/);
  assert.match(appVue, /class="shell-route-stage"/);
  assert.doesNotMatch(appVue, /class="shell-command-dock"/);
  assert.doesNotMatch(appVue, /class="shell-stage-surface"/);
  assert.doesNotMatch(appVue, /class="shell-canvas"/);
  assert.doesNotMatch(appVue, /class="topbar"/);
  assert.doesNotMatch(appVue, /class="route-frame"/);
  assert.doesNotMatch(appVue, /class="shell-utility-bar"/);
});

test("sidebar release footer exposes a clear upgrade affordance instead of a bare status dot", () => {
  const versionInfoMatches =
    styleCss.match(/(?:^|\n)\.version-info\s*\{/g) ?? [];
  assert.equal(versionInfoMatches.length, 1);
  assert.match(sidebarRail, /class="gateway-status-label"/);
  assert.match(appVue, /const studioReleaseCheckBusy = ref\(false\);/);
  assert.match(
    appVue,
    /const versionActionBusy = computed\(\(\) => studioUpgradeBusy.value \|\| studioReleaseCheckBusy.value\);/,
  );
  assert.match(appVue, /const versionActionLabel = computed\(\(\) => \{/);
  assert.match(
    appVue,
    /text\('当前已是最新版本，点击重新检查', 'Already up to date, click to check again'\)/,
  );
  assert.match(styleCss, /\.gateway-status-label\s*\{/);
  assert.match(styleCss, /\.gateway-status\.is-checking\s*\{/);
  assert.match(styleCss, /\.gateway-status\.is-latest\s*\{/);
  assert.match(
    styleCss,
    /\.gateway-status\.is-upgrade-ready\s*\{[\s\S]*color:\s*var\(--gateway-status-upgrade-text\);/,
  );
  assert.match(styleCss, /\.gateway-status\.is-upgrade-ready\s*\{/);
  assert.match(
    styleCss,
    /\.version-info\s*\{[\s\S]*background:\s*var\(--version-chip-bg\);/,
  );
  assert.match(
    styleCss,
    /\.version-info\s*\{[\s\S]*border:\s*1px solid var\(--version-chip-border\);/,
  );
  assert.match(styleCss, /\.version-info\.is-checking\s*\{/);
  assert.match(styleCss, /\.version-info\.is-latest\s*\{/);
  assert.match(
    styleCss,
    /\.version-info\.is-upgrade-ready\s*\{[\s\S]*background:\s*var\(--version-chip-upgrade-bg\);/,
  );
  assert.match(styleCss, /\.version-info\.is-upgrade-ready\s*\{/);
});

test("sidebar docs entry points to the Studio site instead of the old GitHub repository", () => {
  assert.match(sidebarRail, /class="docs-link"/);
  assert.match(sidebarRail, /href="https:\/\/studio\.90le\.cn"/);
  assert.doesNotMatch(
    sidebarRail,
    /href="https:\/\/github\.com\/binbin\/openclaw-studio"/,
  );
});
