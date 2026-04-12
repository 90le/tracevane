import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routerFilePath = path.join(rootDir, 'apps/web-vue/src/router.ts');
const apiModulesDir = path.join(rootDir, 'apps/api/modules');
const webFeaturesDir = path.join(rootDir, 'apps/web-vue/src/features');
const testsDir = path.join(rootDir, 'tests');
const outputPath = path.join(rootDir, 'docs/superpowers/inventories/studio-domain-inventory.json');

function listDirectoryNames(targetDir) {
  if (!fs.existsSync(targetDir)) {
    return [];
  }

  return fs
    .readdirSync(targetDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function listTestSuites(targetDir) {
  if (!fs.existsSync(targetDir)) {
    return [];
  }

  const suites = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (!/\.test\.(mjs|ts)$/.test(entry.name)) {
        continue;
      }

      suites.push(path.relative(rootDir, absolutePath).split(path.sep).join('/'));
    }
  }

  walk(targetDir);
  return suites.sort((a, b) => a.localeCompare(b));
}

function extractPathsFromSource(source) {
  const paths = [];
  const routePathPattern = /path\s*:\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = routePathPattern.exec(source)) !== null) {
    paths.push(match[1]);
  }
  return paths;
}

function resolveLocalTypeScriptImport(fromFile, importSpecifier) {
  const fromDir = path.dirname(fromFile);
  const candidate = path.resolve(fromDir, importSpecifier);
  const candidates = [candidate, `${candidate}.ts`, `${candidate}.tsx`, path.join(candidate, 'index.ts')];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return filePath;
    }
  }
  return null;
}

function extractWebRoutes(routerPath) {
  if (!fs.existsSync(routerPath)) {
    return [];
  }

  const collected = new Set();
  const routerSource = fs.readFileSync(routerPath, 'utf8');
  for (const routePath of extractPathsFromSource(routerSource)) {
    if (routePath.startsWith('/')) {
      collected.add(routePath);
    }
  }

  const routeManifestImport = routerSource.match(/from\s+['"](\.\/features\/shell\/route-manifest)['"]/);
  if (routeManifestImport) {
    const manifestPath = resolveLocalTypeScriptImport(routerPath, routeManifestImport[1]);
    if (manifestPath) {
      const manifestSource = fs.readFileSync(manifestPath, 'utf8');
      for (const routePath of extractPathsFromSource(manifestSource)) {
        if (routePath.startsWith('/')) {
          collected.add(routePath);
        }
      }
    }
  }

  return Array.from(collected).sort((a, b) => a.localeCompare(b));
}

function main() {
  const payload = {
    generatedAt: new Date().toISOString(),
    webRoutes: extractWebRoutes(routerFilePath),
    apiModules: listDirectoryNames(apiModulesDir),
    webFeatures: listDirectoryNames(webFeaturesDir),
    testSuites: listTestSuites(testsDir),
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

main();
