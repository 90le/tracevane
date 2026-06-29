import { test } from "node:test";
import assert from "node:assert";

import {
  buildWorkspaceIdeProviderProxyUrl,
  filterWorkspaceIdeProviderProxyHeaders,
  proxyWorkspaceIdeProviderHttpRequest,
} from "../../dist/apps/api/modules/workspace-ide/proxy.js";

const session = {
  id: "ide_proxy_test",
  kind: "openvscode-server",
  workspaceRoot: process.cwd(),
  baseUrl: "http://127.0.0.1:39999/base",
  status: "ready",
  createdAt: new Date(0).toISOString(),
};

test("workspace IDE provider proxy builds loopback target URL", () => {
  const url = buildWorkspaceIdeProviderProxyUrl(session, "workbench/index.html", "v=1");
  assert.equal(url.href, "http://127.0.0.1:39999/workbench/index.html?v=1");
});

test("workspace IDE provider proxy rejects public provider URLs", () => {
  assert.throws(() =>
    buildWorkspaceIdeProviderProxyUrl({ ...session, baseUrl: "http://example.com:39999" }, "/"),
  );
});

test("workspace IDE provider proxy filters hop-by-hop headers", () => {
  const headers = filterWorkspaceIdeProviderProxyHeaders({
    host: "tracevane.local",
    connection: "upgrade",
    upgrade: "websocket",
    authorization: "Bearer test",
    "x-custom": "1",
  });
  assert.equal(headers.has("host"), false);
  assert.equal(headers.has("connection"), false);
  assert.equal(headers.has("upgrade"), false);
  assert.equal(headers.get("authorization"), "Bearer test");
  assert.equal(headers.get("x-custom"), "1");
});

test("workspace IDE provider proxy forwards request through fetch", async () => {
  const calls = [];
  const response = await proxyWorkspaceIdeProviderHttpRequest(
    {
      session,
      path: "/api/status",
      search: "q=1",
      method: "POST",
      headers: { host: "tracevane.local", "content-type": "application/json" },
      body: undefined,
    },
    async (input, init) => {
      calls.push({ input: String(input), init });
      return new Response("ok", {
        status: 202,
        headers: {
          "content-type": "text/plain",
          connection: "close",
        },
      });
    },
  );
  assert.equal(calls[0].input, "http://127.0.0.1:39999/api/status?q=1");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.get("host"), null);
  assert.equal(response.status, 202);
  assert.equal(response.headers["content-type"], "text/plain");
  assert.equal(response.headers.connection, undefined);
  assert.equal(Buffer.from(response.body).toString("utf-8"), "ok");
});
