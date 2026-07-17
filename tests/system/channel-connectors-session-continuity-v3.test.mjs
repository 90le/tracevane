import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  deleteChannelConnectorAgentSession,
  getChannelConnectorAgentSession,
  getChannelConnectorAgentSessionByDeliveryIdentity,
  getChannelConnectorAgentSessionByDeliveryExecutionIdentity,
  setChannelConnectorAgentSessionDeliveryIdentity,
  updateChannelConnectorAgentSessionDeliveryIdentity,
  upsertChannelConnectorAgentSession,
} from "../../dist/apps/api/modules/channel-connectors/agent-session-store.js";
import * as channelConnectorsDaemonModule from "../../dist/apps/api/modules/channel-connectors/daemon.js";

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

test("delivery continuity resumes only the same native execution identity", () => {
  const record = {
    ...sessionUpdate(),
    id: "session-record",
    name: null,
    model: "gpt-5.6-sol",
    agentNativeSessionId: "native-sol",
    codexThreadId: "thread-sol",
    turnCount: 3,
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
    lastMessageId: "message-sol",
    lastStatus: "completed",
  };
  const matches = channelConnectorsDaemonModule.channelConnectorSessionMatchesExecutionIdentity;

  assert.equal(typeof matches, "function");
  assert.equal(matches?.(record, { ...sessionUpdate(), model: "gpt-5.6-sol" }), true);
  assert.equal(matches?.(record, { ...sessionUpdate(), model: "gpt-5.6-luna" }), false);
  assert.equal(matches?.(record, {
    ...sessionUpdate(),
    model: "gpt-5.6-sol",
    workDir: "C:\\different-workspace",
  }), false);
});

test("legacy session identity keeps different models in separate native records", () => {
  const filePath = sessionFile();
  const sol = upsertChannelConnectorAgentSession(filePath, {
    ...sessionUpdate(),
    model: "gpt-5.6-sol",
    codexThreadId: "thread-sol",
  });
  const luna = upsertChannelConnectorAgentSession(filePath, {
    ...sessionUpdate(),
    model: "gpt-5.6-luna",
    codexThreadId: "thread-luna",
  });

  assert.notEqual(sol.id, luna.id);
  assert.equal(getChannelConnectorAgentSession(filePath, { ...sessionUpdate(), model: "gpt-5.6-sol" })?.codexThreadId, "thread-sol");
  assert.equal(getChannelConnectorAgentSession(filePath, { ...sessionUpdate(), model: "gpt-5.6-luna" })?.codexThreadId, "thread-luna");
});

test("same-model continuity reads records written before model joined the session key", () => {
  const filePath = sessionFile();
  const lookup = { ...sessionUpdate(), model: "gpt-5.6-luna" };
  const current = upsertChannelConnectorAgentSession(filePath, {
    ...lookup,
    codexThreadId: "thread-before-key-migration",
  });
  const state = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const legacyId = [
    lookup.bindingId,
    lookup.projectId,
    lookup.sessionKey,
    lookup.agent,
    lookup.workDir,
  ].map(encodeURIComponent).join("|");
  state.sessions = {
    [legacyId]: { ...current, id: legacyId },
  };
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`);

  assert.equal(getChannelConnectorAgentSession(filePath, lookup)?.codexThreadId, "thread-before-key-migration");
  const migrated = upsertChannelConnectorAgentSession(filePath, {
    ...lookup,
    codexThreadId: "thread-before-key-migration",
  });
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(filePath, "utf8")).sessions).length, 1);
  assert.equal(deleteChannelConnectorAgentSession(filePath, {
    bindingId: lookup.bindingId,
    sessionKey: lookup.sessionKey,
    sessionId: migrated.id,
  })?.id, migrated.id);
  assert.equal(getChannelConnectorAgentSession(filePath, lookup), null);
});

test("delivery execution continuity survives a binding change", () => {
  const filePath = sessionFile();
  upsertChannelConnectorAgentSession(filePath, {
    ...sessionUpdate(),
    bindingId: "old-binding",
    model: "gpt-5.6-luna",
    codexThreadId: "thread-luna",
  });
  setChannelConnectorAgentSessionDeliveryIdentity(filePath, {
    accountId: "feishu-live",
    targetId: "codex-workspace",
    targetRevision: "revision-1",
    session: { ...sessionUpdate(), bindingId: "old-binding", model: "gpt-5.6-luna" },
  });

  const resolved = getChannelConnectorAgentSessionByDeliveryExecutionIdentity(filePath, {
    accountId: "feishu-live",
    targetId: "codex-workspace",
    sessionKey: "feishu:chat:user",
    agent: "codex",
    model: "gpt-5.6-luna",
    workDir: "/tmp/workspace",
  });
  assert.equal(resolved?.bindingId, "old-binding");
  assert.equal(resolved?.codexThreadId, "thread-luna");
});
