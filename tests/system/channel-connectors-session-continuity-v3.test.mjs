import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  getChannelConnectorAgentSessionByDeliveryIdentity,
  setChannelConnectorAgentSessionDeliveryIdentity,
  updateChannelConnectorAgentSessionDeliveryIdentity,
  upsertChannelConnectorAgentSession,
} from "../../dist/apps/api/modules/channel-connectors/agent-session-store.js";

function sessionFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-v3-session-")), "channel-sessions.json");
}

function sessionUpdate() {
  return {
    bindingId: "feishu-live:default",
    projectId: "codex-workspace",
    sessionKey: "feishu:chat:user",
    agent: "codex",
    model: null,
    workDir: "/tmp/workspace",
    status: "completed",
  };
}

test("Channel Connectors v3 persists and reuses a delivery identity", () => {
  const filePath = sessionFile();
  const first = upsertChannelConnectorAgentSession(filePath, sessionUpdate());
  const identified = setChannelConnectorAgentSessionDeliveryIdentity(filePath, {
    accountId: "feishu-live",
    targetId: "codex-workspace",
    targetRevision: "target-revision-1",
    session: sessionUpdate(),
  });
  assert.equal(identified?.id, first.id);

  const resolved = getChannelConnectorAgentSessionByDeliveryIdentity(filePath, {
    accountId: "feishu-live",
    targetId: "codex-workspace",
    sessionKey: "feishu:chat:user",
  });
  assert.equal(resolved?.id, first.id);

  const updated = updateChannelConnectorAgentSessionDeliveryIdentity(filePath, first.id, {
    accountId: "feishu-live",
    targetId: "codex-workspace",
    targetRevision: "target-revision-2",
    sessionKey: "feishu:chat:user",
    model: "gpt-5.5",
    agentNativeSessionId: "native-session",
    codexThreadId: "thread-1",
    messageId: "message-1",
    status: "completed",
  });
  assert.equal(updated?.targetRevision, "target-revision-2");
  assert.equal(updated?.model, "gpt-5.5");

  const persisted = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.equal(persisted.version, 3);
  assert.deepEqual(Object.keys(persisted).sort(), ["sessions", "updatedAt", "version"]);
});
