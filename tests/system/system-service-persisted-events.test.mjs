import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createSystemService } from "../../dist/apps/api/modules/system/service.js";

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-system-service-"));
  fs.mkdirSync(path.join(root, "system"), { recursive: true });
  fs.writeFileSync(path.join(root, "config.json"), "{}\n", "utf8");
  return root;
}

function createConfig(root) {
  return {
    pluginId: "studio",
    pluginName: "OpenClaw Studio",
    version: "0.1.21",
    port: 3760,
    autoStart: false,
    openclawRoot: root,
    openclawConfigFile: path.join(root, "config.json"),
    projectRoot: root,
    webDistDir: path.join(root, "dist"),
    gatewayPort: 31879,
    gatewayWsUrl: "ws://127.0.0.1:31879",
    gatewayControlUiBasePath: "/studio",
    transport: {
      standalone: { enabled: false, port: 3760 },
      gateway: { enabled: true, basePath: "/studio" },
    },
  };
}

test("system service persists action events into the system state directory", async () => {
  const root = createTempRoot();
  const service = createSystemService(createConfig(root), () => 0);

  await service.repairBootstrap();

  const jsonlPath = path.join(root, "system", "system-events.jsonl");
  assert.equal(fs.existsSync(jsonlPath), true);
  const lines = fs.readFileSync(jsonlPath, "utf8").trim().split("\n");
  assert.ok(lines.length > 0);
});
