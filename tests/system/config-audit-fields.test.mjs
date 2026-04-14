import test from "node:test";
import assert from "node:assert/strict";

import { CONFIG_AUDIT_WHITELIST_FIELDS } from "../../dist/apps/api/modules/config/config-audit-fields.js";

test("config audit whitelist defines required metadata for each entry", () => {
  assert.ok(Array.isArray(CONFIG_AUDIT_WHITELIST_FIELDS));
  assert.ok(CONFIG_AUDIT_WHITELIST_FIELDS.length > 0);

  for (const entry of CONFIG_AUDIT_WHITELIST_FIELDS) {
    assert.equal(typeof entry.path, "string");
    assert.ok(entry.path.length > 0);
    assert.equal(typeof entry.module, "string");
    assert.ok(entry.module.length > 0);
    assert.equal(typeof entry.label, "string");
    assert.ok(entry.label.length > 0);
    assert.equal(typeof entry.severity, "string");
    assert.ok(entry.severity.length > 0);
    assert.equal(typeof entry.actionKey, "string");
    assert.ok(entry.actionKey.length > 0);
  }
});

test("config audit whitelist includes core transport and device trust paths", () => {
  const paths = new Set(
    CONFIG_AUDIT_WHITELIST_FIELDS.map((entry) => entry.path),
  );

  assert.equal(paths.has("transport.gateway.basePath"), true);
  assert.equal(paths.has("deviceTrust.autoApproveLocalHelper"), true);
});
