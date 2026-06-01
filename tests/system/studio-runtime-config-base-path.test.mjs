import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function createServerConfig() {
  return {
    gatewayControlUiBasePath: "",
    transport: {
      standalone: {
        enabled: true,
        port: 3911,
      },
      gateway: {
        enabled: true,
        basePath: "/studio-gateway",
      },
    },
  };
}

test("standalone runtime config honors STUDIO_BASE_PATH for mounted chat routes", async () => {
  const previousBasePath = process.env.STUDIO_BASE_PATH;
  process.env.STUDIO_BASE_PATH = "/studio/";
  try {
    const runtimeConfigModuleUrl = pathToFileURL(
      path.join(rootDir, "dist/apps/api/runtime-config.js"),
    );
    runtimeConfigModuleUrl.search = `?case=${Date.now()}`;
    const { buildStudioClientRuntimeConfig } = await import(runtimeConfigModuleUrl.href);

    const standaloneRuntime = buildStudioClientRuntimeConfig(
      createServerConfig(),
      "standalone",
    );

    assert.equal(standaloneRuntime.appBasePath, "/studio");
    assert.equal(standaloneRuntime.apiBasePath, "/studio");
    assert.equal(standaloneRuntime.webSocketBasePath, "/studio");

    const gatewayRuntime = buildStudioClientRuntimeConfig(
      createServerConfig(),
      "gateway",
    );

    assert.equal(gatewayRuntime.appBasePath, "/studio-gateway");
    assert.equal(gatewayRuntime.apiBasePath, "/studio-gateway");
    assert.equal(gatewayRuntime.webSocketBasePath, "/studio-gateway");
  } finally {
    if (previousBasePath === undefined) {
      delete process.env.STUDIO_BASE_PATH;
    } else {
      process.env.STUDIO_BASE_PATH = previousBasePath;
    }
  }
});
