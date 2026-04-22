import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import "tsx/esm";

const terminalService =
  await import("../../apps/api/modules/terminal/service.ts");

function createTestService(tempDir) {
  const configFile = path.join(tempDir, "openclaw-config.json");
  fs.writeFileSync(configFile, JSON.stringify({}), "utf8");

  return terminalService.createTerminalService({
    config: {
      pluginId: "test",
      pluginName: "test",
      version: "0.0.0",
      port: 0,
      autoStart: false,
      openclawRoot: tempDir,
      openclawConfigFile: configFile,
      projectRoot: tempDir,
      webDistDir: tempDir,
      gatewayPort: 0,
      gatewayWsUrl: "ws://127.0.0.1",
      gatewayControlUiBasePath: "/",
      transport: {
        standalone: { enabled: false, port: 0 },
        gateway: { enabled: false, basePath: "/" },
      },
    },
    skills: {
      async getSummary() {
        return {
          skills: [],
          tools: {
            clawhubInstalled: false,
            skillhubInstalled: false,
          },
        };
      },
    },
  });
}

async function waitFor(check, timeoutMs = 8_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("timed out waiting for terminal output");
}

test("terminal service replays backlog for refresh-like reattach without lastSeq", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-terminal-"));
  const service = createTestService(tempDir);
  const marker = "refresh-proof-0422";
  const liveEvents = [];

  try {
    const attached = service.attachGatewayClient(
      { sid: "term-refresh-replay" },
      {
        connId: "conn-live",
        emit(event) {
          liveEvents.push(event);
          return true;
        },
      },
    );

    service.sendGatewayInput(
      {
        sid: attached.sid,
        data: `printf '${marker}\\n'\r`,
      },
      { connId: "conn-live" },
    );

    await waitFor(async () => {
      const ledger = await service.listSessionLedger(attached.sid);
      return ledger.some(
        (event) =>
          event.type === "output"
          && String(event.detail?.data || "").includes(marker),
      );
    });

    await waitFor(() =>
      liveEvents.some(
        (event) =>
          event.type === "output" && String(event.data || "").includes(marker),
      ));

    const latestSeq = Math.max(
      0,
      ...liveEvents
        .filter((event) => event.type === "output")
        .map((event) => Number(event.seq || 0)),
    );

    service.detachGatewayClient(
      { sid: attached.sid },
      { connId: "conn-live" },
    );

    const refreshed = service.attachGatewayClient(
      { sid: attached.sid },
      { connId: "conn-refresh", emit: () => true },
    );
    const refreshBacklog = refreshed.events
      .filter((event) => event.type === "output")
      .map((event) => String(event.data || ""))
      .join("");

    assert.match(refreshBacklog, /refresh-proof-0422/);

    const deltaOnly = service.attachGatewayClient(
      { sid: attached.sid, lastSeq: latestSeq },
      { connId: "conn-delta", emit: () => true },
    );
    const deltaBacklog = deltaOnly.events
      .filter((event) => event.type === "output")
      .map((event) => String(event.data || ""))
      .join("");

    assert.doesNotMatch(deltaBacklog, /refresh-proof-0422/);

    const transcriptOnly = service.attachGatewayClient(
      { sid: attached.sid, skipReplay: true },
      { connId: "conn-transcript", emit: () => true },
    );

    assert.equal(
      transcriptOnly.events.some((event) => event.type === "output"),
      false,
    );
  } finally {
    service.dispose();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
