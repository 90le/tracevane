import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const routerFilePath = path.join(rootDir, "apps/web-vue/src/router.ts");
const apiModulesDir = path.join(rootDir, "apps/api/modules");
const webFeaturesDir = path.join(rootDir, "apps/web-vue/src/features");
const testsDir = path.join(rootDir, "tests");
const outputPath = path.join(
  rootDir,
  "docs/superpowers/inventories/tracevane-domain-inventory.json",
);

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

      suites.push(
        path.relative(rootDir, absolutePath).split(path.sep).join("/"),
      );
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
  const candidates = [
    candidate,
    `${candidate}.ts`,
    `${candidate}.tsx`,
    path.join(candidate, "index.ts"),
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return filePath;
    }
  }
  return null;
}

function parseNamedImports(source) {
  const imports = new Map();
  const importPattern = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = importPattern.exec(source)) !== null) {
    const [, rawBindings, importSpecifier] = match;
    for (const part of rawBindings.split(",")) {
      const binding = part.trim();
      if (!binding) {
        continue;
      }

      const aliasMatch = binding.match(
        /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/,
      );
      if (!aliasMatch) {
        continue;
      }

      const importedName = aliasMatch[1];
      const localName = aliasMatch[2] || importedName;
      imports.set(localName, importSpecifier);
    }
  }
  return imports;
}

function extractRoutesBindingName(source) {
  const routesPropertyMatch = source.match(/routes\s*:\s*([A-Za-z_$][\w$]*)/);
  return routesPropertyMatch ? routesPropertyMatch[1] : null;
}

function readInventoryFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function createStructuralPayload() {
  return {
    webRoutes: extractWebRoutes(routerFilePath),
    apiModules: listDirectoryNames(apiModulesDir),
    webFeatures: listDirectoryNames(webFeaturesDir),
    testSuites: listTestSuites(testsDir),
  };
}

function areStructuralPayloadsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function serializePayload(payload) {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function extractWebRoutes(routerPath) {
  if (!fs.existsSync(routerPath)) {
    return [];
  }

  const collected = new Set();
  const routerSource = fs.readFileSync(routerPath, "utf8");
  for (const routePath of extractPathsFromSource(routerSource)) {
    if (routePath.startsWith("/")) {
      collected.add(routePath);
    }
  }

  const routesBindingName = extractRoutesBindingName(routerSource);
  if (!routesBindingName) {
    return Array.from(collected).sort((a, b) => a.localeCompare(b));
  }

  const imports = parseNamedImports(routerSource);
  const routeModuleImport = imports.get(routesBindingName);
  if (!routeModuleImport || !routeModuleImport.startsWith(".")) {
    return Array.from(collected).sort((a, b) => a.localeCompare(b));
  }

  const routeModulePath = resolveLocalTypeScriptImport(
    routerPath,
    routeModuleImport,
  );
  if (!routeModulePath) {
    return Array.from(collected).sort((a, b) => a.localeCompare(b));
  }

  const routeModuleSource = fs.readFileSync(routeModulePath, "utf8");
  for (const routePath of extractPathsFromSource(routeModuleSource)) {
    if (routePath.startsWith("/")) {
      collected.add(routePath);
    }
  }

  return Array.from(collected).sort((a, b) => a.localeCompare(b));
}

function main() {
  const structuralPayload = createStructuralPayload();
  const previousPayload = readInventoryFile(outputPath);
  const previousStructuralPayload = previousPayload
    ? {
        webRoutes: previousPayload.webRoutes || [],
        apiModules: previousPayload.apiModules || [],
        webFeatures: previousPayload.webFeatures || [],
        testSuites: previousPayload.testSuites || [],
      }
    : null;

  if (
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
