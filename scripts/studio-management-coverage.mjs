import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

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

async function loadManagementCoverageSeed() {
  const manifestModuleSource = fs.readFileSync(manifestFile, "utf8");
  const transpiledManifest = ts.transpileModule(manifestModuleSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: manifestFile,
  });
  const manifestModuleUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(transpiledManifest.outputText)}`;
  const manifestModule = await import(manifestModuleUrl);
  const coverageSeed = manifestModule.MANAGEMENT_DOMAIN_COVERAGE_SEED;

  if (!Array.isArray(coverageSeed)) {
    throw new Error(
      "MANAGEMENT_DOMAIN_COVERAGE_SEED export is missing or invalid in management manifest",
    );
  }

  return coverageSeed;
}

function collectMatchedFiles(testPattern) {
  const matcher = globPatternToRegExp(testPattern);
  return fs
    .readdirSync(systemTestsDir)
    .filter((file) => matcher.test(file))
    .sort()
    .map((file) => `tests/system/${file}`);
}

const coverageSeed = await loadManagementCoverageSeed();
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
