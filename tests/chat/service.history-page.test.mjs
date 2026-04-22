import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { WebSocketServer } from "ws";

import {
  createStandaloneStudioConfig,
  createStudioContext,
} from "../../dist/apps/api/index.js";

function createLogger() {
  return {
    info() {},
    warn() {},
    error() {},
    debug() {},
  };
}

function writeGatewayIdentity(root) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const deviceId = "device-test-history-1";
  fs.mkdirSync(path.join(root, "identity"), { recursive: true });
  fs.mkdirSync(path.join(root, "devices"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "identity", "device-auth.json"),
    JSON.stringify(
      {
        deviceId,
        tokens: {
          operator: {
            scopes: ["operator.read", "operator.write"],
          },
        },
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(root, "identity", "device.json"),
    JSON.stringify(
      {
        privateKeyPem: privateKey
          .export({ format: "pem", type: "pkcs8" })
          .toString(),
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(root, "devices", "paired.json"),
    JSON.stringify(
      {
        [deviceId]: {
          publicKey: publicKey
            .export({ format: "pem", type: "spki" })
            .toString(),
        },
      },
      null,
      2,
    ),
  );
}

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function startFakeGateway() {
  const port = await getFreePort();
  const requests = [];
  const wss = new WebSocketServer({ host: "127.0.0.1", port });

  wss.on("connection", (socket) => {
    socket.send(
      JSON.stringify({
        type: "event",
        event: "connect.challenge",
        payload: { nonce: "nonce-history-test-1" },
      }),
    );

    socket.on("message", (raw) => {
      let frame = null;
      try {
        frame = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (frame?.type !== "req") {
        return;
      }
      if (frame.method === "connect") {
        socket.send(
          JSON.stringify({
            type: "res",
            id: frame.id,
            ok: true,
            payload: { connected: true },
          }),
        );
        return;
      }
      requests.push({
        method: frame.method,
        params: frame.params,
      });
      socket.send(
        JSON.stringify({
          type: "res",
          id: frame.id,
          ok: true,
          payload: {
            ok: true,
            status: "started",
            runId: frame.params?.idempotencyKey || "fake-run-id",
          },
        }),
      );
    });
  });

  return {
    port,
    requests,
    async close() {
      for (const client of wss.clients) {
        try {
          client.close();
        } catch {}
      }
      await new Promise((resolve, reject) =>
        wss.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

test("history page API windows messages and exposes search/date helpers", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "openclaw-studio-history-page-"),
  );
  try {
    const workspace = path.join(root, "workspace");
    const transcriptFile = path.join(root, "transcripts", "session-1.jsonl");
    const runShadowFile = path.join(root, "studio", "chat-run-shadows.json");
    const sessionKey = "agent:main:webchat:direct:external-1";

    fs.mkdirSync(workspace, { recursive: true });
    fs.mkdirSync(path.dirname(transcriptFile), { recursive: true });
    fs.mkdirSync(path.join(root, "agents", "main", "sessions"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(root, "studio"), { recursive: true });

    fs.writeFileSync(
      path.join(root, "openclaw.json"),
      JSON.stringify(
        {
          gateway: {
            auth: {
              token: "gateway-token-test",
            },
          },
          agents: {
            defaults: { workspace },
            list: [{ id: "main", workspace, default: true }],
          },
        },
        null,
        2,
      ),
    );

    fs.writeFileSync(
      transcriptFile,
      [
        JSON.stringify({
          id: "m1",
          role: "user",
          text: "older hello",
          timestamp: "2026-03-20T09:00:00.000Z",
        }),
        JSON.stringify({
          id: "m2",
          role: "assistant",
          runId: "run-alpha",
          text: "contains keyword alpha",
          timestamp: "2026-03-20T09:01:00.000Z",
        }),
        JSON.stringify({
          id: "m3",
          role: "assistant",
          text: "invoice diagram attached\n```sql\nJOIN ledger ON invoice_id = ledger.invoice_id;\n```",
          blocks: [
            {
              type: "image",
              url: "https://example.com/invoice-diagram.png",
            },
          ],
          timestamp: "2026-03-21T10:00:00.000Z",
        }),
        JSON.stringify({
          id: "m4",
          role: "assistant",
          text: "```sql\nSELECT ledger_id FROM invoices;\n```",
          timestamp: "2026-03-21T10:05:00.000Z",
        }),
      ].join("\n"),
    );

    fs.writeFileSync(
      path.join(root, "agents", "main", "sessions", "sessions.json"),
      JSON.stringify(
        {
          [sessionKey]: {
            sessionId: "session-1",
            sessionFile: transcriptFile,
            label: "Observed transcript",
            updatedAt: "2026-03-21T10:00:00.000Z",
            origin: {
              provider: "wechat",
              surface: "webchat",
              label: "Observed transcript",
            },
          },
        },
        null,
        2,
      ),
    );

    fs.writeFileSync(
      runShadowFile,
      JSON.stringify(
        {
          sessions: {
            [sessionKey]: [
              {
                sessionKey,
                runId: "run-alpha",
                finalMessageId: "m2",
                finalCreatedAt: "2026-03-20T09:01:00.000Z",
                toolCalls: [
                  {
                    toolCallId: "tool-alpha",
                    runId: "run-alpha",
                    name: "browser",
                    status: "completed",
                    startedAt: "2026-03-20T09:00:30.000Z",
                    updatedAt: "2026-03-20T09:00:59.000Z",
                    argsPreview: '{"url":"https://example.com"}',
                    resultPreview: '{"summary":"done"}',
                    isError: false,
                  },
                ],
                lastAssistantText: "contains keyword alpha",
                lifecycle: "completed",
                savedAt: "2026-03-20T09:01:01.000Z",
              },
            ],
          },
        },
        null,
        2,
      ),
    );

    const config = createStandaloneStudioConfig({
      port: await getFreePort(),
      openclawRoot: root,
      gatewayWsUrl: "ws://127.0.0.1:1",
    });
    const context = createStudioContext({
      config,
      logger: createLogger(),
    });

    const page1 = await context.services.chat.getHistory(sessionKey, {
      limit: 2,
    });
    assert.deepEqual(
      page1.messages.map((message) => message.id),
      ["m3", "m4"],
    );
    assert.equal(page1.pageInfo.hasMoreBefore, true);
    assert.equal(typeof page1.pageInfo.beforeCursor, "string");
    // hasMoreAfter / afterCursor must exist in pageInfo for windowed-ledger compat
    assert.equal(page1.pageInfo.hasMoreAfter, false);
    assert.equal(page1.pageInfo.afterCursor, null);
    assert.deepEqual(page1.overlays, []);
    assert.equal(fs.existsSync(path.join(root, "studio", "chat-index")), true);

    const bootstrap = await context.services.chat.getBootstrap({
      sessionKey,
      recentLimit: 10,
      historyLimit: 2,
    });
    assert.equal(bootstrap.selectedSessionKey, sessionKey);
    assert.deepEqual(
      bootstrap.sessions.map((session) => session.key),
      [sessionKey],
    );
    assert.deepEqual(
      bootstrap.history?.messages.map((message) => message.id),
      ["m3", "m4"],
    );
    assert.equal(bootstrap.queue?.items.length, 0);
    assert.equal(bootstrap.controls?.controls.allowHostManagementExec, false);
    assert.match(
      bootstrap.diagnostics.notes.join("\n"),
      /local-first/i,
    );

    const originalReadFileSync = fs.readFileSync;
    let cachedTranscriptReads = 0;
    let bootstrapTranscriptReads = 0;
    let onlyCode = null;
    fs.readFileSync = ((filePath, ...args) => {
      if (String(filePath) === transcriptFile) {
        cachedTranscriptReads += 1;
      }
      return originalReadFileSync.call(fs, filePath, ...args);
    });

    try {
      cachedTranscriptReads = 0;
      const coldContext = createStudioContext({
        config,
        logger: createLogger(),
      });
      let bootstrapHealthChecks = 0;
      const originalColdGetHealth = coldContext.services.system.getHealth.bind(coldContext.services.system);
      coldContext.services.system.getHealth = async (...args) => {
        bootstrapHealthChecks += 1;
        return originalColdGetHealth(...args);
      };
      const bootstrapReplay = await coldContext.services.chat.getBootstrap({
        sessionKey,
        recentLimit: 10,
        historyLimit: 2,
      });
      bootstrapTranscriptReads = cachedTranscriptReads;
      assert.deepEqual(
        bootstrapReplay.history?.messages.map((message) => message.id),
        ["m3", "m4"],
      );
      assert.match(
        bootstrapReplay.history?.diagnostics.notes.join("\n") || "",
        /transcript-aligned Studio durable mirror/i,
      );
      assert.equal(bootstrapTranscriptReads, 0);
      assert.equal(bootstrapHealthChecks, 1);

      cachedTranscriptReads = 0;
      const coldHistoryContext = createStudioContext({
        config,
        logger: createLogger(),
      });
      const coldPage = await coldHistoryContext.services.chat.getHistory(sessionKey, {
        limit: 2,
      });
      assert.deepEqual(
        coldPage.messages.map((message) => message.id),
        ["m3", "m4"],
      );
      assert.match(
        coldPage.diagnostics.notes.join("\n"),
        /transcript-aligned Studio durable mirror/i,
      );
      assert.equal(cachedTranscriptReads, 0);

      cachedTranscriptReads = 0;
      const page2 = await context.services.chat.getHistory(sessionKey, {
        limit: 2,
        before: page1.pageInfo.beforeCursor,
      });
      assert.deepEqual(
        page2.messages.map((message) => message.id),
        ["m1", "m2"],
      );
      assert.equal(page2.pageInfo.hasMoreBefore, false);
      assert.equal(page2.pageInfo.hasMoreAfter, true);
      assert.equal(typeof page2.pageInfo.afterCursor, "string");
      // Overlays remain windowed independently of the history page bounds.
      assert.equal(page2.overlays.length, 1);
      assert.equal(page2.overlays[0]?.runId, "run-alpha");

      const filteredDay = await context.services.chat.getHistory(sessionKey, {
        limit: 10,
        day: "2026-03-20",
      });
      assert.deepEqual(
        filteredDay.messages.map((message) => message.id),
        ["m1", "m2"],
      );
      assert.equal(filteredDay.day, "2026-03-20");

      const search = await context.services.chat.searchHistory(sessionKey, {
        query: "keyword alpha",
        limit: 10,
      });
      assert.deepEqual(
        search.messages.map((message) => message.id),
        ["m2"],
      );
      assert.equal(search.overlays.length, 1);
      assert.equal(search.overlays[0]?.runId, "run-alpha");
      assert.equal(search.pageInfo.hasMoreBefore, false);
      assert.equal(search.pageInfo.hasMoreAfter, false);
      assert.equal(search.pageInfo.afterCursor, null);
      const searchSummaryNotes = search.diagnostics.notes.filter((note) =>
        note.startsWith("History search summary:"),
      );
      assert.deepEqual(searchSummaryNotes, [
        "History search summary: 1 matches across 1 day(s).",
      ]);

      const onlyAssistant = await context.services.chat.searchHistory(
        sessionKey,
        {
          query: "keyword",
          role: "assistant",
          content: "all",
          limit: 10,
        },
      );
      assert.deepEqual(
        onlyAssistant.messages.map((message) => message.id),
        ["m2"],
      );
      assert.equal(onlyAssistant.roleFilter, "assistant");
      assert.equal(onlyAssistant.contentFilter, "all");

      onlyCode = await context.services.chat.searchHistory(sessionKey, {
        query: "SELECT",
        role: "all",
        content: "code",
        limit: 10,
      });
      assert.deepEqual(
        onlyCode.messages.map((message) => message.id),
        ["m4"],
      );
    } finally {
      fs.readFileSync = originalReadFileSync;
    }
    assert.equal(cachedTranscriptReads, 0);
    assert.equal(onlyCode.roleFilter, "all");
    assert.equal(onlyCode.contentFilter, "code");
    assert.equal(onlyCode.matches[0]?.messageId, "m4");
    assert.equal(onlyCode.matches[0]?.role, "assistant");
    assert.equal(onlyCode.matches[0]?.createdAt, "2026-03-21T10:05:00.000Z");
    assert.equal(onlyCode.matches[0]?.day, "2026-03-21");
    assert.match(onlyCode.matches[0]?.snippet || "", /SELECT/);

    const resourceLedger = await context.services.chat.searchHistory(
      sessionKey,
      {
        query: "ledger",
        role: "all",
        content: "resource",
        limit: 10,
      },
    );
    assert.deepEqual(
      resourceLedger.messages.map((message) => message.id),
      ["m3"],
    );

    const codeLedger = await context.services.chat.searchHistory(sessionKey, {
      query: "ledger",
      role: "all",
      content: "code",
      limit: 10,
    });
    assert.deepEqual(
      codeLedger.messages.map((message) => message.id),
      ["m3", "m4"],
    );
    assert.equal(codeLedger.day, null);

    const codeLedgerMarch20 = await context.services.chat.searchHistory(
      sessionKey,
      {
        query: "ledger",
        role: "all",
        content: "code",
        day: "2026-03-20",
        limit: 10,
      },
    );
    assert.deepEqual(
      codeLedgerMarch20.messages.map((message) => message.id),
      [],
    );
    assert.equal(codeLedgerMarch20.day, "2026-03-20");
    assert.equal(codeLedgerMarch20.matches.length, 0);

    const codeLedgerMarch21 = await context.services.chat.searchHistory(
      sessionKey,
      {
        query: "ledger",
        role: "all",
        content: "code",
        day: "2026-03-21",
        limit: 10,
      },
    );
    assert.deepEqual(
      codeLedgerMarch21.messages.map((message) => message.id),
      ["m3", "m4"],
    );
    assert.equal(codeLedgerMarch21.day, "2026-03-21");
    assert.deepEqual(
      codeLedgerMarch21.matches.map((match) => match.messageId),
      ["m3", "m4"],
    );
    assert.deepEqual(
      codeLedgerMarch21.matches.map((match) => match.day),
      ["2026-03-21", "2026-03-21"],
    );

    const codeLedgerPage1 = await context.services.chat.searchHistory(
      sessionKey,
      {
        query: "ledger",
        role: "all",
        content: "code",
        limit: 1,
      },
    );
    assert.deepEqual(
      codeLedgerPage1.messages.map((message) => message.id),
      ["m4"],
    );
    assert.equal(codeLedgerPage1.roleFilter, "all");
    assert.equal(codeLedgerPage1.contentFilter, "code");
    assert.equal(codeLedgerPage1.pageInfo.hasMoreBefore, true);
    assert.equal(typeof codeLedgerPage1.pageInfo.beforeCursor, "string");

    const codeLedgerPage2 = await context.services.chat.searchHistory(
      sessionKey,
      {
        query: "ledger",
        role: "all",
        content: "code",
        before: codeLedgerPage1.pageInfo.beforeCursor,
        limit: 1,
      },
    );
    assert.deepEqual(
      codeLedgerPage2.messages.map((message) => message.id),
      ["m3"],
    );
    assert.equal(codeLedgerPage2.pageInfo.hasMoreAfter, true);
    assert.equal(typeof codeLedgerPage2.pageInfo.afterCursor, "string");

    const codeLedgerPage3 = await context.services.chat.searchHistory(
      sessionKey,
      {
        query: "ledger",
        role: "all",
        content: "code",
        after: codeLedgerPage2.pageInfo.afterCursor,
        limit: 1,
      },
    );
    assert.deepEqual(
      codeLedgerPage3.messages.map((message) => message.id),
      ["m4"],
    );
    assert.equal(codeLedgerPage3.roleFilter, "all");
    assert.equal(codeLedgerPage3.contentFilter, "code");

    const legacyLedgerBeforeCursor = Buffer.from(
      JSON.stringify({
        source: "history_search",
        anchorIndex: 1,
        anchorMessageId: "m4",
        anchorCreatedAt: "2026-03-21T10:05:00.000Z",
        day: null,
        query: "ledger",
      }),
      "utf-8",
    ).toString("base64url");
    const legacyLedgerPage = await context.services.chat.searchHistory(
      sessionKey,
      {
        query: "ledger",
        before: legacyLedgerBeforeCursor,
        limit: 1,
      },
    );
    assert.deepEqual(
      legacyLedgerPage.messages.map((message) => message.id),
      ["m3"],
    );
    assert.equal(legacyLedgerPage.roleFilter, "all");
    assert.equal(legacyLedgerPage.contentFilter, "all");
    assert.equal(legacyLedgerPage.pageInfo.hasMoreBefore, false);
    assert.equal(legacyLedgerPage.pageInfo.hasMoreAfter, true);

    const dates = await context.services.chat.getHistoryDates(sessionKey);
    assert.deepEqual(
      dates.days.map((entry) => `${entry.day}:${entry.count}`),
      ["2026-03-21:2", "2026-03-20:2"],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("history page resyncs local transcript after rewrite and truncation without duplicating assistant steps", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "openclaw-studio-history-resync-"),
  );
  try {
    const workspace = path.join(root, "workspace");
    const transcriptFile = path.join(root, "transcripts", "session-2.jsonl");
    const sessionKey = "agent:main:webchat:direct:external-2";

    fs.mkdirSync(workspace, { recursive: true });
    fs.mkdirSync(path.dirname(transcriptFile), { recursive: true });
    fs.mkdirSync(path.join(root, "agents", "main", "sessions"), {
      recursive: true,
    });

    fs.writeFileSync(
      path.join(root, "openclaw.json"),
      JSON.stringify(
        {
          gateway: {
            auth: {
              token: "gateway-token-test",
            },
          },
          agents: {
            defaults: { workspace },
            list: [{ id: "main", workspace, default: true }],
          },
        },
        null,
        2,
      ),
    );

    const writeTranscript = (lines) => {
      fs.writeFileSync(
        transcriptFile,
        lines.map((line) => JSON.stringify(line)).join("\n"),
      );
    };

    writeTranscript([
      {
        id: "user-1",
        role: "user",
        text: "first question",
        timestamp: "2026-03-22T09:00:00.000Z",
      },
      {
        id: "assistant-1",
        role: "assistant",
        text: "first answer",
        timestamp: "2026-03-22T09:00:01.000Z",
      },
      {
        id: "assistant-2-old",
        role: "assistant",
        text: "second answer",
        timestamp: "2026-03-22T09:00:02.000Z",
      },
    ]);

    fs.writeFileSync(
      path.join(root, "agents", "main", "sessions", "sessions.json"),
      JSON.stringify(
        {
          [sessionKey]: {
            sessionId: "session-2",
            sessionFile: transcriptFile,
            label: "Observed transcript rewrite",
            updatedAt: "2026-03-22T09:00:02.000Z",
            origin: {
              provider: "wechat",
              surface: "webchat",
              label: "Observed transcript rewrite",
            },
          },
        },
        null,
        2,
      ),
    );

    const config = createStandaloneStudioConfig({
      port: await getFreePort(),
      openclawRoot: root,
      gatewayWsUrl: "ws://127.0.0.1:1",
    });
    const context = createStudioContext({
      config,
      logger: createLogger(),
    });

    const initial = await context.services.chat.getHistory(sessionKey, {
      limit: 10,
    });
    assert.deepEqual(
      initial.messages.map((message) => `${message.id}:${message.text}`),
      [
        "user-1:first question",
        "assistant-1:first answer",
        "assistant-2-old:second answer",
      ],
    );

    writeTranscript([
      {
        id: "user-1",
        role: "user",
        text: "first question",
        timestamp: "2026-03-22T09:00:00.000Z",
      },
      {
        id: "assistant-1-rewritten",
        role: "assistant",
        text: "first answer",
        timestamp: "2026-03-22T09:00:01.000Z",
      },
      {
        id: "assistant-2-rewritten",
        role: "assistant",
        text: "second answer revised",
        timestamp: "2026-03-22T09:00:02.000Z",
      },
    ]);

    const rewritten = await context.services.chat.getHistory(sessionKey, {
      limit: 10,
    });
    assert.deepEqual(
      rewritten.messages.map((message) => `${message.id}:${message.text}`),
      [
        "user-1:first question",
        "assistant-1-rewritten:first answer",
        "assistant-2-rewritten:second answer revised",
      ],
    );
    assert.equal(
      rewritten.messages.filter((message) => message.text === "first answer")
        .length,
      1,
    );

    writeTranscript([
      {
        id: "user-1",
        role: "user",
        text: "first question",
        timestamp: "2026-03-22T09:00:00.000Z",
      },
      {
        id: "assistant-2-compacted",
        role: "assistant",
        text: "compacted final answer",
        timestamp: "2026-03-22T09:00:03.000Z",
      },
    ]);

    const truncated = await context.services.chat.getHistory(sessionKey, {
      limit: 10,
    });
    assert.deepEqual(
      truncated.messages.map((message) => `${message.id}:${message.text}`),
      ["user-1:first question", "assistant-2-compacted:compacted final answer"],
    );
    assert.equal(truncated.pageInfo.hasMoreBefore, false);
    assert.equal(truncated.pageInfo.hasMoreAfter, false);
    assert.equal(truncated.pageInfo.afterCursor, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("history page collapses inject user with shadow-restored transcript user even when transcript lacks runId", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "openclaw-studio-history-user-dedupe-"),
  );
  let gateway = null;
  try {
    const workspace = path.join(root, "workspace");
    const sessionsStorePath = path.join(
      root,
      "agents",
      "main",
      "sessions",
      "sessions.json",
    );
    const transcriptFile = path.join(
      root,
      "transcripts",
      "session-user-dedupe.jsonl",
    );

    fs.mkdirSync(workspace, { recursive: true });
    fs.mkdirSync(path.dirname(transcriptFile), { recursive: true });
    fs.mkdirSync(path.join(root, "agents", "main", "sessions"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(root, "studio"), { recursive: true });

    fs.writeFileSync(
      path.join(root, "openclaw.json"),
      JSON.stringify(
        {
          gateway: {
            auth: {
              token: "gateway-token-test",
            },
          },
          agents: {
            defaults: { workspace },
            list: [{ id: "main", workspace, default: true }],
          },
        },
        null,
        2,
      ),
    );
    writeGatewayIdentity(root);

    gateway = await startFakeGateway();
    const config = createStandaloneStudioConfig({
      port: await getFreePort(),
      openclawRoot: root,
      gatewayWsUrl: `ws://127.0.0.1:${gateway.port}`,
    });
    const context = createStudioContext({
      config,
      logger: createLogger(),
    });

    const created = await context.services.chat.createSession("main", {});
    const sessionKey = created.session.key;
    const clientRequestId = "req-user-dedupe-1";
    const ack = await context.services.chat.send(sessionKey, {
      text: "history dedupe should restore the pure user text",
      clientRequestId,
    });
    const transcriptTimestamp = new Date(Date.now() - 60_000).toISOString();
    const transcriptEnvelope = [
      "Sender (untrusted metadata):",
      "```json",
      "{",
      '  "label": "cli",',
      '  "id": "cli"',
      "}",
      "```",
      "",
      "[Wed 2026-03-25 21:03 GMT+8] history dedupe should restore the pure user text",
    ].join("\n");

    fs.writeFileSync(
      sessionsStorePath,
      JSON.stringify(
        {
          [sessionKey]: {
            sessionId: created.session.sessionId,
            sessionFile: transcriptFile,
            label: created.session.label,
            updatedAt: transcriptTimestamp,
            origin: {
              provider: "webchat",
              surface: "webchat",
              chatType: "direct",
            },
          },
        },
        null,
        2,
      ),
    );

    fs.writeFileSync(
      transcriptFile,
      [
        JSON.stringify({
          id: "history-user-1",
          role: "user",
          text: transcriptEnvelope,
          timestamp: transcriptTimestamp,
        }),
      ].join("\n"),
    );

    const history = await context.services.chat.getHistory(sessionKey, {
      limit: 20,
    });
    const userMessages = history.messages.filter(
      (message) => message.role === "user",
    );

    assert.equal(userMessages.length, 1);
    assert.equal(
      userMessages[0]?.text,
      "history dedupe should restore the pure user text",
    );
    assert.equal(userMessages[0]?.source, "history");
    assert.equal(userMessages[0]?.runId, ack.runId);
    assert.equal(
      history.messages.some(
        (message) => message.role === "user" && message.source === "inject",
      ),
      false,
    );
  } finally {
    await gateway?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
