import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  JsonLineCodexAppServerTransport,
} from "../../dist/apps/api/modules/channel-connectors/codex-app-server-driver.js";

function request(transport, method, params, timeoutMs = 10_000) {
  const id = request.nextId;
  request.nextId += 1;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${method}`));
    }, timeoutMs);
    const onMessage = (message) => {
      if (message.id !== id) return;
      clearTimeout(timer);
      if (message.error) {
        reject(new Error(message.error.message || `${method} failed`));
        return;
      }
      resolve(message.result || {});
    };
    transport.onMessage(onMessage);
    transport.send({ id, method, params });
  });
}
request.nextId = 1;

test("live Codex app-server accepts Studio persistent-session handshake", {
  skip: process.env.STUDIO_CODEX_APP_SERVER_LIVE === "1"
    ? false
    : "set STUDIO_CODEX_APP_SERVER_LIVE=1 to run against the local codex binary",
}, async () => {
  const codexHome = process.env.STUDIO_CODEX_APP_SERVER_LIVE_HOME
    || "/tmp/openclaw-studio-codex-appserver-live-home";
  fs.mkdirSync(codexHome, { recursive: true });
  const cwd = process.env.STUDIO_CODEX_APP_SERVER_LIVE_CWD || process.cwd();
  const transport = new JsonLineCodexAppServerTransport({
    cwd,
    env: {
      CODEX_HOME: codexHome,
    },
  });

  try {
    const initialize = await request(transport, "initialize", {
      clientInfo: {
        name: "openclaw-studio-channel-connectors-live-smoke",
        title: "OpenClaw Studio Channel Connectors Live Smoke",
        version: "0",
      },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
        optOutNotificationMethods: [],
      },
    });
    assert.equal(typeof initialize.userAgent, "string");
    assert.equal(initialize.codexHome, codexHome);

    transport.send({ method: "initialized" });
    const thread = await request(transport, "thread/start", {
      model: process.env.STUDIO_CODEX_APP_SERVER_LIVE_MODEL || "gpt-5",
      cwd,
      approvalPolicy: "never",
      sandbox: "read-only",
      serviceName: "openclaw-studio-channel-connectors-live-smoke",
      ephemeral: true,
      threadSource: "user",
    });
    assert.equal(typeof thread.thread?.id, "string");
    assert.equal(thread.thread.cwd, cwd);
    assert.equal(thread.approvalPolicy, "never");
    assert.equal(thread.sandbox?.type, "readOnly");
  } finally {
    transport.close("dispose");
  }
});
