import assert from "node:assert/strict";
import { once } from "node:events";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ExternalLanguageServerGateway,
  LspMessageFramingParser,
  encodeLspMessage,
} from "../../dist/apps/api/modules/lsp/external/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const mockServerPath = path.join(repoRoot, "tests/fixtures/lsp-mock-server.mjs");

function mockProfile(overrides = {}) {
  return {
    id: "mock",
    label: "Mock external LSP",
    command: process.execPath,
    args: [mockServerPath],
    languages: ["mocklang"],
    capabilities: { hover: true, diagnostics: true },
    budgets: { initializeMs: 500, requestMs: 500, shutdownMs: 300 },
    ...overrides,
  };
}

test("LSP stdio framing encodes and parses chunked messages", () => {
  const messages = [];
  const errors = [];
  const parser = new LspMessageFramingParser((message) => messages.push(message), (error) => errors.push(error));
  const encoded = Buffer.concat([
    encodeLspMessage({ jsonrpc: "2.0", id: 1, method: "echo/request", params: { ok: true } }),
    encodeLspMessage({ jsonrpc: "2.0", id: 1, result: { ok: true } }),
  ]);
  parser.push(encoded.subarray(0, 17));
  parser.push(encoded.subarray(17));
  assert.equal(errors.length, 0);
  assert.equal(messages.length, 2);
  assert.deepEqual(messages[0], { jsonrpc: "2.0", id: 1, method: "echo/request", params: { ok: true } });
  assert.deepEqual(messages[1], { jsonrpc: "2.0", id: 1, result: { ok: true } });
});

test("external LSP gateway starts mock server, sends requests, records diagnostics, and stops", async () => {
  const gateway = new ExternalLanguageServerGateway({ rootPath: repoRoot, profiles: [mockProfile()] });
  const started = await gateway.start("mock");
  assert.equal(started.status, "available");
  assert.ok(started.pid);

  const echoed = await gateway.request("mock", "echo/request", { text: "hello" });
  assert.deepEqual(echoed, { echoed: { text: "hello" }, count: 1 });

  const uri = "file:///workspace/mock.mocklang";
  gateway.notify("mock", "textDocument/didOpen", { textDocument: { uri, languageId: "mocklang", version: 1, text: "mock" } });
  await waitFor(() => gateway.getDiagnostics("mock", uri).length === 1);
  assert.equal(gateway.getDiagnostics("mock", uri)[0].message, "mock diagnostic");

  const stopped = await gateway.stop("mock");
  assert.equal(stopped.status, "stopped");
});

test("external LSP gateway degrades request timeouts without hanging", async () => {
  const gateway = new ExternalLanguageServerGateway({ rootPath: repoRoot, profiles: [mockProfile({ budgets: { initializeMs: 500, requestMs: 50, shutdownMs: 100 } })] });
  await gateway.start("mock");
  await assert.rejects(() => gateway.request("mock", "slow/request", {}, 40), /timed out/);
  assert.equal(gateway.getStatus("mock").status, "degraded");
  assert.equal(gateway.getStatus("mock").reason, "request_timeout");
  await gateway.stop("mock");
});

test("external LSP gateway marks crashed servers", async () => {
  const gateway = new ExternalLanguageServerGateway({ rootPath: repoRoot, profiles: [mockProfile()] });
  await gateway.start("mock");
  await assert.rejects(() => gateway.request("mock", "crash/request", {}, 500), /crashed/);
  await waitFor(() => gateway.getStatus("mock").status === "crashed");
  assert.equal(gateway.getStatus("mock").reason, "crashed");
});

test("external LSP gateway rejects profile cwd outside workspace root", async () => {
  const gateway = new ExternalLanguageServerGateway({ rootPath: repoRoot, profiles: [mockProfile({ cwd: "../../.." })] });
  await assert.rejects(() => gateway.start("mock"), /workspace root/);
});


test("external LSP gateway starts real YAML language server and receives diagnostics", async () => {
  const gateway = new ExternalLanguageServerGateway({ rootPath: repoRoot });
  const yamlProfile = gateway.listProfiles().find((profile) => profile.id === "yaml");
  assert.ok(yamlProfile, "yaml profile should be server-side allowlisted");

  const started = await gateway.start("yaml");
  assert.equal(started.status, "available");

  const uri = `file://${path.join(repoRoot, "tracevane-invalid-yaml-proof.yaml")}`;
  gateway.notify("yaml", "textDocument/didOpen", {
    textDocument: { uri, languageId: "yaml", version: 1, text: "name: tracevane\n  bad-indent: true\n" },
  });
  const diagnostics = await gateway.waitForDiagnostics("yaml", uri, 3_000);
  assert.ok(diagnostics.length >= 1, "invalid YAML should publish diagnostics");
  await gateway.stop("yaml");
});

async function waitFor(predicate, timeoutMs = 500) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(predicate(), "condition was not met before timeout");
}
