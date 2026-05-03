import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import "tsx/esm";

const ledgerModule =
  await import("../../apps/api/modules/terminal/terminal-session-ledger.ts");

function makeEvent(overrides = {}) {
  return {
    eventId: "evt-1",
    sessionId: "term-1",
    type: "output",
    timestamp: "2026-04-14T00:00:00.000Z",
    actorClientId: null,
    detail: { data: "hello" },
    ...overrides,
  };
}

test("append 会追加写入 terminal-session-ledger.jsonl", () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "terminal-ledger-"));
  const ledger = ledgerModule.createTerminalSessionLedger({ stateDir });

  ledger.append(makeEvent());

  const filePath = path.join(stateDir, "terminal-session-ledger.jsonl");
  assert.equal(fs.existsSync(filePath), true);
  const lines = fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  assert.equal(lines.length, 1);
  assert.equal(lines[0].eventId, "evt-1");
  assert.equal(lines[0].sessionId, "term-1");
});

test("appendMany 用单次批量追加保持事件顺序", () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "terminal-ledger-"));
  const ledger = ledgerModule.createTerminalSessionLedger({ stateDir });

  ledger.appendMany([
    makeEvent({
      eventId: "evt-batch-1",
      timestamp: "2026-04-14T00:00:01.000Z",
      detail: { data: "one" },
    }),
    makeEvent({
      eventId: "evt-batch-2",
      timestamp: "2026-04-14T00:00:02.000Z",
      detail: { data: "two" },
    }),
  ]);

  assert.deepEqual(
    ledger.listBySession("term-1").map((item) => item.eventId),
    ["evt-batch-1", "evt-batch-2"],
  );
});

test("listBySession 只返回指定 session 的事件并保持时间顺序", () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "terminal-ledger-"));
  const ledger = ledgerModule.createTerminalSessionLedger({ stateDir });

  ledger.append(
    makeEvent({
      eventId: "evt-a",
      sessionId: "term-a",
      timestamp: "2026-04-14T00:00:01.000Z",
    }),
  );
  ledger.append(
    makeEvent({
      eventId: "evt-b",
      sessionId: "term-b",
      timestamp: "2026-04-14T00:00:02.000Z",
    }),
  );
  ledger.append(
    makeEvent({
      eventId: "evt-c",
      sessionId: "term-a",
      timestamp: "2026-04-14T00:00:03.000Z",
    }),
  );

  const sessionEvents = ledger.listBySession("term-a");
  assert.deepEqual(
    sessionEvents.map((item) => item.eventId),
    ["evt-a", "evt-c"],
  );
});

test("重新初始化会从已有 jsonl 恢复并可按 session 查询", () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "terminal-ledger-"));
  const filePath = path.join(stateDir, "terminal-session-ledger.jsonl");
  fs.writeFileSync(
    filePath,
    [
      JSON.stringify(
        makeEvent({ eventId: "evt-1", sessionId: "term-recover" }),
      ),
      JSON.stringify(
        makeEvent({
          eventId: "evt-2",
          sessionId: "term-recover",
          timestamp: "2026-04-14T00:00:01.000Z",
        }),
      ),
      JSON.stringify(makeEvent({ eventId: "evt-3", sessionId: "term-other" })),
    ].join("\n") + "\n",
    "utf8",
  );

  const ledger = ledgerModule.createTerminalSessionLedger({ stateDir });
  assert.deepEqual(
    ledger.listBySession("term-recover").map((item) => item.eventId),
    ["evt-1", "evt-2"],
  );
});
