import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const FEATURE_DIR = "apps/web/src/features/model-gateway";
const VIEWS_DIR = `${FEATURE_DIR}/views`;

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

// The 7 views that make up the Model Gateway feature slice.
const VIEW_FILES = [
  "OverviewView.tsx",
  "ProvidersView.tsx",
  "ProviderConfigView.tsx",
  "ModelsView.tsx",
  "AccountPoolView.tsx",
  "AppConnectionsView.tsx",
  "UsageView.tsx",
];

// The exact `data-view` set the page state machine drives over.
const DATA_VIEWS = [
  "overview",
  "providers",
  "providercfg",
  "models",
  "accounts",
  "apps",
  "usage",
];

test("model-gateway views/ contains the 7 view files", () => {
  for (const file of VIEW_FILES) {
    assert.equal(
      exists(`${VIEWS_DIR}/${file}`),
      true,
      `${VIEWS_DIR}/${file} should exist`,
    );
  }
});

test("ModelGatewayPage references the exact data-view set", () => {
  const page = read(`${FEATURE_DIR}/ModelGatewayPage.tsx`);
  // Every view key must be present in the VIEW_COMPONENTS / parent maps.
  for (const view of DATA_VIEWS) {
    assert.match(
      page,
      new RegExp(`\\b${view}\\b`),
      `ModelGatewayPage should reference the "${view}" view`,
    );
  }
  // And it must not reference any view key outside the contract set.
  const componentKeys = [...page.matchAll(/^\s{2}(\w+):\s*\w+View,?$/gm)].map(
    (m) => m[1],
  );
  for (const key of componentKeys) {
    assert.ok(
      DATA_VIEWS.includes(key),
      `unexpected view key "${key}" in ModelGatewayPage VIEW_COMPONENTS`,
    );
  }
});

test("every view consumes the real query hooks via @/lib/query/model-gateway", () => {
  for (const file of VIEW_FILES) {
    const source = read(`${VIEWS_DIR}/${file}`);
    assert.match(
      source,
      /@\/lib\/query\/model-gateway/,
      `${file} should import from @/lib/query/model-gateway`,
    );
  }
});

test("Usage view derives rows from live usage/status queries (no fabricated placeholders)", () => {
  const usage = read(`${VIEWS_DIR}/UsageView.tsx`);
  assert.match(usage, /useModelGatewayUsageQuery/);
  assert.match(usage, /useModelGatewayStatusQuery/);
  // Rows come from the API payload, not a hard-coded array.
  assert.match(usage, /usage(Query)?\.data/);
  assert.match(usage, /\.models\b/);
});

test("Overview view derives content from live status/providers/connections queries", () => {
  const overview = read(`${VIEWS_DIR}/OverviewView.tsx`);
  assert.match(overview, /useModelGatewayStatusQuery/);
  assert.match(overview, /useModelGatewayProvidersQuery/);
  assert.match(overview, /useModelGatewayAppConnectionsQuery/);
  // Attention/health lists are filtered from live provider data.
  assert.match(overview, /providersQuery\.data|providerList/);
});
