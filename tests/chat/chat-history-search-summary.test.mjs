import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHistorySearchSummary,
  groupHistoryMatchesByDay,
} from "../../dist/apps/api/modules/chat/history-search-summary.js";

test("groupHistoryMatchesByDay buckets matches by day and sorts descending", () => {
  const grouped = groupHistoryMatchesByDay([
    {
      messageId: "m1",
      role: "assistant",
      createdAt: "2026-04-10T10:00:00.000Z",
      day: null,
      snippet: "a",
    },
    {
      messageId: "m2",
      role: "assistant",
      createdAt: "2026-04-11T10:00:00.000Z",
      day: "2026-04-11",
      snippet: "b",
    },
    {
      messageId: "m3",
      role: "user",
      createdAt: null,
      day: null,
      snippet: "c",
    },
  ]);

  assert.deepEqual(
    [...grouped.keys()],
    ["unknown", "2026-04-11", "2026-04-10"],
  );
  assert.deepEqual(
    grouped.get("2026-04-11")?.map((item) => item.messageId),
    ["m2"],
  );
  assert.deepEqual(
    grouped.get("2026-04-10")?.map((item) => item.messageId),
    ["m1"],
  );
  assert.deepEqual(
    grouped.get("unknown")?.map((item) => item.messageId),
    ["m3"],
  );
});

test("buildHistorySearchSummary returns compact search summary seam", () => {
  const summary = buildHistorySearchSummary({
    query: "ledger",
    day: null,
    roleFilter: "all",
    contentFilter: "code",
    matches: [
      {
        messageId: "m1",
        role: "assistant",
        createdAt: "2026-04-12T10:00:00.000Z",
        day: "2026-04-12",
        snippet: "SELECT 1",
      },
      {
        messageId: "m2",
        role: "assistant",
        createdAt: "2026-04-11T10:00:00.000Z",
        day: "2026-04-11",
        snippet: "SELECT 2",
      },
      {
        messageId: "m3",
        role: "assistant",
        createdAt: "2026-04-11T10:00:02.000Z",
        day: "2026-04-11",
        snippet: "SELECT 3",
      },
    ],
  });

  assert.deepEqual(summary, {
    query: "ledger",
    totalMatches: 3,
    day: null,
    roleFilter: "all",
    contentFilter: "code",
    days: [
      { day: "2026-04-12", count: 1 },
      { day: "2026-04-11", count: 2 },
    ],
  });
});
