import test from "node:test";
import assert from "node:assert/strict";
import "tsx/esm";

const historyModule =
  await import("../../apps/web-vue/src/features/terminal/terminal-session-history.ts");

function makeEvent(partial = {}) {
  return {
    eventId: "event-1",
    sessionId: "term-1",
    type: "output",
    timestamp: "2026-04-22T00:00:00.000Z",
    actorClientId: null,
    detail: {},
    ...partial,
  };
}

test("terminal session history groups typed command input into one command entry", () => {
  const entries = historyModule.buildTerminalSessionHistory([
    makeEvent({ eventId: "i1", type: "input", detail: { data: "n" } }),
    makeEvent({ eventId: "i2", type: "input", detail: { data: "p" } }),
    makeEvent({ eventId: "i3", type: "input", detail: { data: "m test\r" } }),
  ]);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, "command");
  assert.equal(entries[0].text, "npm test");
});

test("terminal session history strips ansi control sequences from output", () => {
  const entries = historyModule.buildTerminalSessionHistory([
    makeEvent({
      eventId: "o1",
      type: "output",
      detail: { data: "\u001b[31mhello\u001b[0m\r\n" },
    }),
  ]);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, "output");
  assert.equal(entries[0].text, "hello");
});

test("terminal session history keeps ended reason as a system entry", () => {
  const entries = historyModule.buildTerminalSessionHistory([
    makeEvent({
      eventId: "e1",
      type: "ended",
      detail: { reason: "runtime_unavailable" },
    }),
  ]);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, "system");
  assert.equal(entries[0].text, "runtime_unavailable");
});

test("terminal replay transcript keeps raw output chunks and hides lifecycle markers", () => {
  const transcript = historyModule.buildTerminalSessionReplayTranscript([
    makeEvent({
      eventId: "o1",
      type: "output",
      detail: {
        data: "binbin@host:~$ 1\r\n1: command not found\r\nbinbin@host:~$ ",
      },
    }),
    makeEvent({
      eventId: "e1",
      type: "ended",
      detail: { reason: "runtime_unavailable" },
    }),
  ]);

  assert.match(transcript, /1: command not found/);
  assert.doesNotMatch(transcript, /\[runtime_unavailable\]/);
  assert.doesNotMatch(transcript, /runtime_unavailable/);
  assert.match(transcript, /binbin@host:~\$/);
});

test("terminal replay transcript does not synthesize system-only lifecycle text", () => {
  const transcript = historyModule.buildTerminalSessionReplayTranscript([
    makeEvent({
      eventId: "e1",
      type: "ended",
      detail: { reason: "session_ended" },
    }),
    makeEvent({
      eventId: "x1",
      type: "exit",
      detail: { code: 0 },
    }),
  ]);

  assert.equal(transcript, "");
});
test("terminal replay transcript starts after the latest clear marker", () => {
  const transcript = historyModule.buildTerminalSessionReplayTranscript([
    makeEvent({
      eventId: "old-output",
      type: "output",
      detail: { data: "before clear\r\n" },
    }),
    makeEvent({
      eventId: "clear-1",
      type: "clear",
      detail: { outputSeq: 1 },
    }),
    makeEvent({
      eventId: "new-output",
      type: "output",
      detail: { data: "after clear\r\n" },
    }),
  ]);

  assert.doesNotMatch(transcript, /before clear/);
  assert.match(transcript, /after clear/);
});

test("terminal visible history starts after the latest clear marker", () => {
  const entries = historyModule.buildTerminalSessionHistory([
    makeEvent({
      eventId: "old-output",
      type: "output",
      detail: { data: "before clear\r\n" },
    }),
    makeEvent({
      eventId: "clear-1",
      type: "clear",
      detail: { outputSeq: 1 },
    }),
    makeEvent({
      eventId: "new-output",
      type: "output",
      detail: { data: "after clear\r\n" },
    }),
  ]);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].text, "after clear");
});
