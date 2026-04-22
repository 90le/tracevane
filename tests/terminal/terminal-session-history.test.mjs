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

test("terminal replay transcript keeps raw output chunks for xterm restoration", () => {
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
  assert.match(transcript, /\[runtime_unavailable\]/);
  assert.match(transcript, /binbin@host:~\$/);
});
