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
  "chat",
  "chat-runtime-domain-manifest.ts",
);
const chatTestsDir = path.join(root, "tests", "chat");
const outputFile = path.join(
  root,
  "docs",
  "superpowers",
  "inventories",
  "studio-chat-runtime-coverage.json",
);

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globPatternToRegExp(pattern) {
  const escaped = escapeRegExp(pattern).replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`);
}

async function loadChatRuntimeCoverageSeed() {
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
  const coverageSeed = manifestModule.CHAT_RUNTIME_COVERAGE_SEED;

  if (!Array.isArray(coverageSeed)) {
    throw new Error(
      "CHAT_RUNTIME_COVERAGE_SEED export is missing or invalid in chat runtime manifest",
    );
  }

  return coverageSeed;
}

function collectMatchedFiles(testPattern) {
  const matcher = globPatternToRegExp(testPattern);
  return fs
    .readdirSync(chatTestsDir)
    .filter((file) => matcher.test(file))
    .sort()
    .map((file) => `tests/chat/${file}`);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

const coverageSeed = await loadChatRuntimeCoverageSeed();
const output = {
  sections: coverageSeed.map((entry) => entry.section),
  frontendFiles: uniqueSorted(coverageSeed.map((entry) => entry.frontendFile)),
  backendFiles: uniqueSorted(coverageSeed.map((entry) => entry.backendFile)),
  tests: uniqueSorted(
    coverageSeed.flatMap((entry) => collectMatchedFiles(entry.testPattern)),
  ),
};

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
