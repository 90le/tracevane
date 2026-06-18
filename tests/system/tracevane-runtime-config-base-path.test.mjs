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
        basePath: "/tracevane-gateway",
      },
    },
  };
}

test("standalone runtime config honors TRACEVANE_BASE_PATH for mounted chat routes", async () => {
  const previousBasePath = process.env.TRACEVANE_BASE_PATH;
  process.env.TRACEVANE_BASE_PATH = "/tracevane/";
  try {
    const runtimeConfigModuleUrl = pathToFileURL(
      path.join(rootDir, "dist/apps/api/runtime-config.js"),
    );
    runtimeConfigModuleUrl.search = `?case=${Date.now()}`;
    const { buildTracevaneClientRuntimeConfig } = await import(runtimeConfigModuleUrl.href);

    const standaloneRuntime = buildTracevaneClientRuntimeConfig(
      createServerConfig(),
      "standalone",
    );

    assert.equal(standaloneRuntime.appBasePath, "/tracevane");
    assert.equal(standaloneRuntime.apiBasePath, "/tracevane");
    assert.equal(standaloneRuntime.webSocketBasePath, "/tracevane");

    const gatewayRuntime = buildTracevaneClientRuntimeConfig(
      createServerConfig(),
      "gateway",
    );

    assert.equal(gatewayRuntime.appBasePath, "/tracevane-gateway");
    assert.equal(gatewayRuntime.apiBasePath, "/tracevane-gateway");
    assert.equal(gatewayRuntime.webSocketBasePath, "/tracevane-gateway");
  } finally {
    if (previousBasePath === undefined) {
      delete process.env.TRACEVANE_BASE_PATH;
    } else {
      process.env.TRACEVANE_BASE_PATH = previousBasePath;
    }
  }
});
