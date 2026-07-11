import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import "tsx/esm";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "../..");

// The pure normalizer lives in a runtime-loadable .mjs so node:test can import
// it directly (no TS loader needed). The TS api client re-exports it.
const { normalizeApiError } = await import(
  pathToFileURL(path.join(rootDir, "apps/web/src/lib/api/normalize-error.mjs")).href
);

const modelGatewayApi = await import(
  pathToFileURL(path.join(rootDir, "apps/web/src/lib/api/model-gateway.ts")).href
);
const channelConnectorsApi = await import(
  pathToFileURL(path.join(rootDir, "apps/web/src/lib/api/channel-connectors.ts")).href
);
const recoveryApi = await import(
  pathToFileURL(path.join(rootDir, "apps/web/src/lib/api/recovery.ts")).href
);

test("2xx responses are not errors", () => {
  assert.equal(normalizeApiError(200, { ok: true }), null);
  assert.equal(normalizeApiError(204, undefined), null);
  assert.equal(normalizeApiError(299, { anything: 1 }), null);
});

test("nested {error:{code,message}} body normalizes", () => {
  const result = normalizeApiError(400, {
    error: { code: "bad_request", message: "Bad request" },
  });
  assert.deepEqual(result, {
    code: "bad_request",
    message: "Bad request",
    unsupported: false,
  });
});

test("flat {code,message} body normalizes", () => {
  const result = normalizeApiError(409, {
    code: "conflict",
    message: "Conflict happened",
  });
  assert.deepEqual(result, {
    code: "conflict",
    message: "Conflict happened",
    unsupported: false,
  });
});

test("code matching /_unsupported$/ sets unsupported:true", () => {
  const result = normalizeApiError(400, {
    error: { code: "feature_unsupported", message: "nope" },
  });
  assert.equal(result.unsupported, true);
});

test("model_gateway_*_unsupported sets unsupported:true", () => {
  const result = normalizeApiError(400, {
    code: "model_gateway_routes_unsupported",
    message: "nope",
  });
  assert.equal(result.unsupported, true);
});

test("non-2xx with no parseable code still yields an error", () => {
  const result = normalizeApiError(500, undefined);
  assert.equal(result.unsupported, false);
  assert.equal(typeof result.code, "string");
  assert.equal(typeof result.message, "string");
});

function jsonResponse(body = { ok: true }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function assertStatusTransport(t, invoke, expectedPath) {
  let captured = null;
  t.mock.method(globalThis, "fetch", async (requestPath, init) => {
    captured = { requestPath, init };
    return jsonResponse();
  });
  const controller = new AbortController();

  await invoke(controller.signal);

  assert.equal(captured.requestPath, expectedPath);
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.signal, controller.signal);
  assert.deepEqual(JSON.parse(captured.init.body), {
    action: "status",
    mode: "persistent",
    apply: true,
  });
}

test("Model Gateway lifecycle transport forwards mode-aware status AbortSignal", async (t) => {
  await assertStatusTransport(
    t,
    (signal) => modelGatewayApi.manageModelGatewayDaemonService(
      { action: "status", mode: "persistent", apply: true },
      signal,
    ),
    "/api/model-gateway/daemon-service",
  );
});

test("Channel Connectors lifecycle transport forwards mode-aware status AbortSignal", async (t) => {
  await assertStatusTransport(
    t,
    (signal) => channelConnectorsApi.manageChannelConnectorsDaemonService(
      { action: "status", mode: "persistent", apply: true },
      signal,
    ),
    "/api/channel-connectors/daemon/service",
  );
});

test("Recovery lifecycle transport forwards mode-aware status AbortSignal", async (t) => {
  await assertStatusTransport(
    t,
    (signal) => recoveryApi.manageOpenClawRecoveryDaemonService(
      { action: "status", mode: "persistent", apply: true },
      signal,
    ),
    "/api/openclaw-recovery/daemon-service",
  );
});
