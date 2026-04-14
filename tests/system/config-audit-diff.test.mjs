import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "tsx/esm";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const modulePath = path.join(
  rootDir,
  "apps/api/modules/config/config-audit-diff.ts",
);
const moduleUrl = `${pathToFileURL(modulePath).href}?t=${Date.now()}`;

test("diffConfigAuditChanges only reports whitelist changes", async () => {
  const { diffConfigAuditChanges } = await import(moduleUrl);

  const before = {
    transport: {
      gateway: {
        basePath: "/api/gateway",
      },
      extra: {
        untouched: "x",
      },
    },
    deviceTrust: {
      autoApproveLocalHelper: false,
      internalOnly: true,
    },
    nonWhitelistRoot: {
      foo: "bar",
    },
  };

  const after = {
    transport: {
      gateway: {
        basePath: "/api/gateway/v2",
      },
      extra: {
        untouched: "changed-but-ignored",
      },
    },
    deviceTrust: {
      autoApproveLocalHelper: true,
      internalOnly: false,
    },
    nonWhitelistRoot: {
      foo: "baz",
    },
  };

  const changes = diffConfigAuditChanges({ before, after });

  assert.equal(changes.length, 2);

  assert.deepEqual(changes[0], {
    module: "system",
    path: "transport.gateway.basePath",
    label: "Gateway basePath",
    before: "/api/gateway",
    after: "/api/gateway/v2",
    changeType: "updated",
  });

  assert.deepEqual(changes[1], {
    module: "system",
    path: "deviceTrust.autoApproveLocalHelper",
    label: "Local helper auto-approve",
    before: false,
    after: true,
    changeType: "updated",
  });
});

test("diffConfigAuditChanges skips unchanged whitelist values", async () => {
  const { diffConfigAuditChanges } = await import(moduleUrl);

  const before = {
    transport: {
      gateway: {
        basePath: "/api/gateway",
      },
    },
    deviceTrust: {
      autoApproveLocalHelper: true,
    },
  };

  const after = {
    transport: {
      gateway: {
        basePath: "/api/gateway",
      },
    },
    deviceTrust: {
      autoApproveLocalHelper: true,
    },
  };

  const changes = diffConfigAuditChanges({ before, after });
  assert.deepEqual(changes, []);
});

test("diffConfigAuditChanges treats object values with different key order as unchanged", async () => {
  const { diffConfigAuditChanges } = await import(moduleUrl);

  const before = {
    transport: {
      gateway: {
        basePath: "/api/gateway",
      },
      standalone: {
        enabled: true,
        port: { a: 1, b: 2 },
      },
    },
  };

  const after = {
    transport: {
      gateway: {
        basePath: "/api/gateway",
      },
      standalone: {
        enabled: true,
        port: { b: 2, a: 1 },
      },
    },
  };

  const changes = diffConfigAuditChanges({ before, after });
  assert.deepEqual(changes, []);
});
