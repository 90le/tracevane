import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routeManifestPath = path.join(rootDir, "apps/web-vue/src/app/route-manifest.ts");
const outputPath = path.join(
  rootDir,
  "docs/superpowers/inventories/tracevane-frontend-coverage.json",
);

function extractPrototypeImports(source) {
  const imports = new Map();
  const importPattern =
    /import\s+([A-Za-z_$][\w$]*)\s+from\s+"..\/..\/..\/..\/docs\/prototypes\/pages\/([^"]+\.html)\?raw";/g;
  let match;
  while ((match = importPattern.exec(source)) !== null) {
    imports.set(match[1], `docs/prototypes/pages/${match[2]}`);
  }
  return imports;
}

function extractRoutes(source, prototypeImports) {
  const routes = [];
  const routePattern =
    /\{\s*path:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*group:\s*"([^"]+)",\s*icon:\s*"([^"]+)",\s*shape:\s*"([^"]+)",\s*surface:\s*"([^"]+)"(?:,\s*html:\s*([A-Za-z_$][\w$]*))?/g;
  let match;
  while ((match = routePattern.exec(source)) !== null) {
    const [, routePath, label, group, icon, shape, surface, htmlImport] = match;
    routes.push({
      path: routePath,
      hashRoute: `#/${routePath}`,
      label,
      group,
      icon,
      shape,
      surface,
      prototype: htmlImport ? prototypeImports.get(htmlImport) || null : null,
    });
  }
  return routes;
}

const source = fs.readFileSync(routeManifestPath, "utf8");
const prototypeImports = extractPrototypeImports(source);
const payload = {
  frontend: "react-aurora",
  routeManifest: "apps/web-vue/src/app/route-manifest.ts",
  coreFiles: [
    "apps/web-vue/src/main.tsx",
    "apps/web-vue/src/app/App.tsx",
    "apps/web-vue/src/app/AuroraShell.tsx",
    "apps/web-vue/src/app/RuntimeAdminPage.tsx",
    "apps/web-vue/src/app/PrototypePage.tsx",
    "apps/web-vue/src/app/api-client.ts",
    "apps/web-vue/src/app/page-mounts.ts",
    "apps/web-vue/src/app/shell-context.tsx",
    "apps/web-vue/src/styles/app.css",
  ],
  routes: extractRoutes(source, prototypeImports),
  verification: [
    "tests/system/tracevane-react-aurora-frontend.test.mjs",
  ],
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
