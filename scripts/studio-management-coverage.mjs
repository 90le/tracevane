import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestFile = path.join(
  root,
  "apps",
  "web-vue",
  "src",
  "features",
  "management",
  "management-domain-manifest.ts",
);
const systemTestsDir = path.join(root, "tests", "system");

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globPatternToRegExp(pattern) {
  const escaped = escapeRegExp(pattern).replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`);
}

function parseCoverageSeed(source) {
  const match = source.match(
    /export const MANAGEMENT_DOMAIN_COVERAGE_SEED:[\s\S]*?=\s*MANAGEMENT_DOMAIN_MANIFEST\.map\(\(domain\) => \(\{([\s\S]*?)\}\)\);/,
  );

  if (!match) {
    throw new Error(
      "Unable to locate MANAGEMENT_DOMAIN_COVERAGE_SEED in management manifest",
    );
  }

  if (!source.includes("routePath: domain.routePath")) {
    throw new Error(
      "Coverage seed no longer derives routePath from MANAGEMENT_DOMAIN_MANIFEST",
    );
  }

  if (
    !source.includes("webViewFile: `apps/web-vue/src/views/${domain.webView}`")
  ) {
    throw new Error(
      "Coverage seed no longer derives webViewFile from MANAGEMENT_DOMAIN_MANIFEST",
    );
  }

  if (
    !source.includes("apiModuleDir: `apps/api/modules/${domain.apiModule}`")
  ) {
    throw new Error(
      "Coverage seed no longer derives apiModuleDir from MANAGEMENT_DOMAIN_MANIFEST",
    );
  }

  if (!source.includes("testPattern: domain.testPattern")) {
    throw new Error(
      "Coverage seed no longer derives testPattern from MANAGEMENT_DOMAIN_MANIFEST",
    );
  }

  const objectMatches = [
    ...source.matchAll(
      /\{\s*id:\s*['"]([^'"]+)['"],[\s\S]*?routePath:\s*['"]([^'"]+)['"],[\s\S]*?webView:\s*['"]([^'"]+)['"],[\s\S]*?apiModule:\s*['"]([^'"]+)['"],[\s\S]*?testPattern:\s*['"]([^'"]+)['"][\s\S]*?\}/g,
    ),
  ];

  return objectMatches.map(
    ([, domainId, routePath, webView, apiModule, testPattern]) => ({
      domainId,
      routePath,
      webViewFile: `apps/web-vue/src/views/${webView}`,
      apiModuleDir: `apps/api/modules/${apiModule}`,
      testPattern,
    }),
  );
}

function collectMatchedFiles(testPattern) {
  const matcher = globPatternToRegExp(testPattern);
  return fs
    .readdirSync(systemTestsDir)
    .filter((file) => matcher.test(file))
    .sort()
    .map((file) => `tests/system/${file}`);
}

const manifestSource = fs.readFileSync(manifestFile, "utf8");
const coverageSeed = parseCoverageSeed(manifestSource);
const output = {
  domains: coverageSeed.map((entry) => entry.domainId),
  webViews: coverageSeed.map((entry) => ({
    domainId: entry.domainId,
    routePath: entry.routePath,
    file: entry.webViewFile,
  })),
  apiModules: coverageSeed.map((entry) => ({
    domainId: entry.domainId,
    dir: entry.apiModuleDir,
  })),
  tests: coverageSeed.map((entry) => ({
    domainId: entry.domainId,
    testPattern: entry.testPattern,
    matchedFiles: collectMatchedFiles(entry.testPattern),
  })),
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
