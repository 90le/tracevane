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
  "terminal",
  "terminal-workspace-manifest.ts",
);
const outputFile = path.join(
  root,
  "docs",
  "superpowers",
  "inventories",
  "studio-terminal-workspace-coverage.json",
);

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

async function loadTerminalWorkspaceCoverageSeed() {
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
  const coverageSeed = manifestModule.TERMINAL_WORKSPACE_COVERAGE_SEED;

  if (!Array.isArray(coverageSeed)) {
    throw new Error(
      "TERMINAL_WORKSPACE_COVERAGE_SEED export is missing or invalid in terminal workspace manifest",
    );
  }

  return coverageSeed;
}

const coverageSeed = await loadTerminalWorkspaceCoverageSeed();
const output = {
  sections: coverageSeed.map((entry) => entry.section),
  frontendFiles: uniqueSorted(coverageSeed.map((entry) => entry.frontendFile)),
  backendFiles: uniqueSorted(coverageSeed.map((entry) => entry.backendFile)),
  tests: uniqueSorted(coverageSeed.map((entry) => entry.testFile)),
};

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
