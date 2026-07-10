import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  channelConnectorIngressDedupeKey,
  feishuIngressEnvelope,
  octoIngressEnvelope,
} from "../../dist/apps/api/modules/channel-connectors/ingress-envelope.js";
import {
  createChannelConnectorIngressQueue,
} from "../../dist/apps/api/modules/channel-connectors/ingress-queue.js";

function tempFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-ingress-v3-")), "ingress.json");
}

function envelope(accountId = "account-a", eventId = "event-1") {
  return {
    eventId,
    eventType: "message",
    messageId: eventId,
    accountId,
    platform: "octo",
    peer: { kind: "private", id: "user-1" },
    senderId: "user-1",
    threadId: null,
    mentions: [],
    content: { text: "hello" },
    attachments: [],
    receivedAt: "2026-07-10T10:00:00.000Z",
    rawRef: null,
  };
}

test("Channel Connectors normalizes Feishu and Octo messages into one ingress contract", () => {
  const octo = octoIngressEnvelope("octo-main", {
    messageId: "m-1",
    fromUid: "user-1",
    channelId: "group-1",
    channelType: 2,
    payload: { type: 1, content: "hello", mention: { uids: ["bot-1"] } },
    metadata: { threadId: "thread-1" },
  }, "2026-07-10T10:00:00.000Z");
  assert.equal(octo.peer.kind, "group");
  assert.equal(octo.threadId, "thread-1");
  assert.deepEqual(octo.mentions, ["bot-1"]);

  const feishu = feishuIngressEnvelope("feishu-main", {
    kind: "message",
    eventType: "im.message.receive_v1",
    eventId: "event-2",
    eventCreateTimeMs: null,
    messageCreateTimeMs: null,
    appId: "cli_app",
    token: null,
    challenge: null,
    bindingId: null,
    actionValue: null,
    eventKey: null,
    fromUid: "ou_user",
    channelId: "oc_group",
    messageId: "om_1",
    rootId: null,
    parentId: null,
    threadId: "omt_thread",
    chatType: "group",
    messageType: "text",
    text: "hello",
    attachments: [],
    mentions: [{ key: "@_user_1", name: "bot", openId: "ou_bot", userId: null, unionId: null }],
    hasAnyMention: true,
    directed: true,
  }, "2026-07-10T10:00:00.000Z");
  assert.equal(feishu.peer.kind, "group");
  assert.deepEqual(feishu.mentions, ["ou_bot"]);
  assert.equal(channelConnectorIngressDedupeKey(feishu), "feishu:feishu-main:event-2");
});

test("Channel Connectors ingress queue deduplicates persistently and serializes one account", async () => {
  const filePath = tempFile();
  const queue = createChannelConnectorIngressQueue(filePath, { maxConcurrentPerAccount: 1 });
  const order = [];
  let release;
  const first = queue.enqueue(envelope(), async () => {
    order.push("first-start");
    await new Promise((resolve) => { release = resolve; });
    order.push("first-end");
  });
  const duplicate = queue.enqueue(envelope(), async () => { order.push("duplicate"); });
  const second = queue.enqueue(envelope("account-a", "event-2"), async () => { order.push("second"); });
  assert.equal(first.accepted, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(second.accepted, true);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(order, ["first-start"]);
  release();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(order, ["first-start", "first-end", "second"]);
  assert.equal(queue.status().completed, 2);
  assert.equal(queue.status().duplicates, 1);

  const afterRestart = createChannelConnectorIngressQueue(filePath);
  assert.equal(afterRestart.enqueue(envelope(), async () => {}).duplicate, true);
});

test("Channel Connectors ingress queue runs different accounts independently", async () => {
  const queue = createChannelConnectorIngressQueue(tempFile());
  const started = [];
  let releaseA;
  let releaseB;
  queue.enqueue(envelope("account-a", "a"), async () => {
    started.push("a");
    await new Promise((resolve) => { releaseA = resolve; });
  });
  queue.enqueue(envelope("account-b", "b"), async () => {
    started.push("b");
    await new Promise((resolve) => { releaseB = resolve; });
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(new Set(started), new Set(["a", "b"]));
  releaseA();
  releaseB();
});
