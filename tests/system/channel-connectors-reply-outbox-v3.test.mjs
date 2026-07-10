import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  enqueueChannelConnectorReply,
  listDueChannelConnectorReplies,
  markChannelConnectorReplyDelivered,
  markChannelConnectorReplyFailed,
  markChannelConnectorReplySending,
  readChannelConnectorReplyOutbox,
} from "../../dist/apps/api/modules/channel-connectors/reply-outbox-store.js";
import {
  replayDueChannelConnectorReplies,
} from "../../dist/apps/api/modules/channel-connectors/reply-outbox-worker.js";

function tempFile() {
  return path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-reply-outbox-")),
    "reply-outbox.json",
  );
}

const input = {
  platform: "feishu",
  accountId: "feishu-main",
  bindingId: "feishu-route",
  sourceMessageId: "om_source",
  destinationId: "oc_group",
  replyToMessageId: "om_source",
  text: "final answer",
};

test("Channel Connectors reply outbox deduplicates the same final reply", () => {
  const filePath = tempFile();
  const first = enqueueChannelConnectorReply(filePath, input, new Date("2026-07-10T10:00:00.000Z"));
  const second = enqueueChannelConnectorReply(filePath, input, new Date("2026-07-10T10:01:00.000Z"));
  assert.equal(first.id, second.id);
  assert.equal(Object.keys(readChannelConnectorReplyOutbox(filePath).records).length, 1);
  assert.equal(listDueChannelConnectorReplies(filePath, new Date("2026-07-10T10:00:00.000Z")).length, 1);
});

test("Channel Connectors reply outbox records delivery attempts and completion", () => {
  const filePath = tempFile();
  const pending = enqueueChannelConnectorReply(filePath, input, new Date("2026-07-10T10:00:00.000Z"));
  const sending = markChannelConnectorReplySending(filePath, pending.id, new Date("2026-07-10T10:00:01.000Z"));
  assert.equal(sending.status, "sending");
  assert.equal(sending.attempts, 1);
  const delivered = markChannelConnectorReplyDelivered(
    filePath,
    pending.id,
    "om_reply",
    new Date("2026-07-10T10:00:02.000Z"),
  );
  assert.equal(delivered.status, "delivered");
  assert.equal(delivered.platformMessageId, "om_reply");
  assert.equal(delivered.lastError, null);
  assert.deepEqual(listDueChannelConnectorReplies(filePath, new Date("2026-07-10T11:00:00.000Z")), []);
});

test("Channel Connectors reply outbox retries transient failures with bounded backoff", () => {
  const filePath = tempFile();
  const pending = enqueueChannelConnectorReply(filePath, input, new Date("2026-07-10T10:00:00.000Z"));
  markChannelConnectorReplySending(filePath, pending.id, new Date("2026-07-10T10:00:01.000Z"));
  const failed = markChannelConnectorReplyFailed(filePath, pending.id, "temporary", {
    now: new Date("2026-07-10T10:00:02.000Z"),
  });
  assert.equal(failed.status, "pending");
  assert.equal(failed.nextAttemptAt, "2026-07-10T10:00:03.000Z");
  assert.equal(listDueChannelConnectorReplies(filePath, new Date("2026-07-10T10:00:02.500Z")).length, 0);
  assert.equal(listDueChannelConnectorReplies(filePath, new Date("2026-07-10T10:00:03.000Z")).length, 1);
});

test("Channel Connectors reply outbox moves permanent failures to dead letter", () => {
  const filePath = tempFile();
  const pending = enqueueChannelConnectorReply(filePath, input);
  markChannelConnectorReplySending(filePath, pending.id);
  const failed = markChannelConnectorReplyFailed(filePath, pending.id, "invalid destination", {
    retryable: false,
  });
  assert.equal(failed.status, "dead-letter");
  assert.equal(failed.nextAttemptAt, null);
  assert.equal(failed.lastError, "invalid destination");
});

test("Channel Connectors reply outbox recovers interrupted sending records as pending", () => {
  const filePath = tempFile();
  const pending = enqueueChannelConnectorReply(filePath, input);
  markChannelConnectorReplySending(filePath, pending.id);
  const recovered = readChannelConnectorReplyOutbox(filePath).records[pending.id];
  assert.equal(recovered.status, "pending");
  assert.equal(recovered.attempts, 1);
});

test("Channel Connectors reply outbox persists Octo destination type", () => {
  const filePath = tempFile();
  const octo = enqueueChannelConnectorReply(filePath, {
    ...input,
    platform: "octo",
    destinationType: 2,
  });
  assert.equal(octo.destinationType, 2);
  assert.equal(readChannelConnectorReplyOutbox(filePath).version, 2);
});

test("Channel Connectors reply outbox worker replays due records and classifies failures", async () => {
  const filePath = tempFile();
  const now = new Date("2026-07-10T10:00:00.000Z");
  const delivered = enqueueChannelConnectorReply(filePath, input, now);
  const rejected = enqueueChannelConnectorReply(filePath, {
    ...input,
    sourceMessageId: "om_rejected",
  }, now);
  const summary = await replayDueChannelConnectorReplies({
    filePath,
    now,
    deliver: async (record) => record.id === delivered.id
      ? { ok: true, platformMessageId: "om_replayed" }
      : { ok: false, statusCode: 400, error: "invalid destination" },
  });
  assert.deepEqual(summary, { attempted: 2, delivered: 1, failed: 1 });
  const state = readChannelConnectorReplyOutbox(filePath);
  assert.equal(state.records[delivered.id].status, "delivered");
  assert.equal(state.records[delivered.id].platformMessageId, "om_replayed");
  assert.equal(state.records[rejected.id].status, "dead-letter");
});
