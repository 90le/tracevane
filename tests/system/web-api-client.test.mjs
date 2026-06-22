import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "../..");

// The pure normalizer lives in a runtime-loadable .mjs so node:test can import
// it directly (no TS loader needed). The TS api client re-exports it.
const { normalizeApiError } = await import(
  path.join(rootDir, "apps/web/src/lib/api/normalize-error.mjs")
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
