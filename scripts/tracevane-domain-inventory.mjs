import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routeManifestPath = path.join(rootDir, "apps/web-vue/src/app/route-manifest.ts");
const apiModulesDir = path.join(rootDir, "apps/api/modules");
const webSrcDir = path.join(rootDir, "apps/web-vue/src");
const testsDir = path.join(rootDir, "tests");
const outputPath = path.join(
  rootDir,
  "docs/superpowers/inventories/tracevane-domain-inventory.json",
);

function listDirectoryNames(targetDir) {
  if (!fs.existsSync(targetDir)) return [];
  return fs
    .readdirSync(targetDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function listTestSuites(targetDir) {
  if (!fs.existsSync(targetDir)) return [];
  const suites = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (entry.isFile() && /\.test\.(mjs|ts)$/.test(entry.name)) {
        suites.push(path.relative(rootDir, absolutePath).split(path.sep).join("/"));
      }
    }
  }

  walk(targetDir);
  return suites.sort((a, b) => a.localeCompare(b));
}

function readInventoryFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function extractAuroraRoutes() {
  if (!fs.existsSync(routeManifestPath)) return [];
  const source = fs.readFileSync(routeManifestPath, "utf8");
  const routes = [];
  const routePattern =
    /\{\s*path:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*group:\s*"([^"]+)",\s*icon:\s*"([^"]+)",\s*shape:\s*"([^"]+)"/g;
  let match;
  while ((match = routePattern.exec(source)) !== null) {
    const [, routePath, label, group, icon, shape] = match;
    routes.push({
      path: `/${routePath}`,
      label,
      group,
      icon,
      shape,
    });
  }
  return routes.sort((a, b) => a.path.localeCompare(b.path));
}

function createStructuralPayload() {
  const routes = extractAuroraRoutes();
  return {
    webRoutes: routes.map((route) => route.path),
    apiModules: listDirectoryNames(apiModulesDir),
    webSurfaces: {
      sourceDirs: listDirectoryNames(webSrcDir),
      routes,
    },
    testSuites: listTestSuites(testsDir),
  };
}

function areStructuralPayloadsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function serializePayload(payload) {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function main() {
  const structuralPayload = createStructuralPayload();
  const previousPayload = readInventoryFile(outputPath);
  const previousUsesCurrentSchema = previousPayload && "webSurfaces" in previousPayload;
  const previousStructuralPayload = previousPayload
    ? {
        webRoutes: previousPayload.webRoutes || [],
        apiModules: previousPayload.apiModules || [],
        webSurfaces: previousPayload.webSurfaces || { sourceDirs: [], routes: [] },
        testSuites: previousPayload.testSuites || [],
      }
    : null;

  if (
    previousUsesCurrentSchema &&
    previousPayload &&
    previousStructuralPayload &&
    areStructuralPayloadsEqual(previousStructuralPayload, structuralPayload)
  ) {
    return;
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    ...structuralPayload,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serializePayload(payload), "utf8");
}

main();
