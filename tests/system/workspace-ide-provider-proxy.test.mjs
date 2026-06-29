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

import { EventEmitter } from "node:events";
import {
  handleWorkspaceIdeProviderUpgrade,
  proxyWorkspaceIdeProviderUpgrade,
} from "../../dist/apps/api/modules/workspace-ide/proxy.js";

class FakeDuplex extends EventEmitter {
  constructor() {
    super();
    this.writes = [];
    this.pipes = [];
    this.destroyed = false;
  }

  write(chunk) {
    this.writes.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    return true;
  }

  pipe(target) {
    this.pipes.push(target);
    return target;
  }

  destroy() {
    this.destroyed = true;
    this.emit("close");
  }

  text() {
    return Buffer.concat(this.writes).toString("utf-8");
  }
}

function createUpgradeRequest(url) {
  const req = new EventEmitter();
  req.method = "GET";
  req.url = url;
  req.headers = {
    host: "tracevane.local",
    connection: "Upgrade",
    upgrade: "websocket",
    "sec-websocket-key": "test-key",
    "sec-websocket-version": "13",
  };
  return req;
}

test("workspace IDE provider upgrade proxy tunnels websocket requests", async () => {
  const downstream = new FakeDuplex();
  const upstream = new FakeDuplex();
  const calls = [];
  const handled = proxyWorkspaceIdeProviderUpgrade({
    session,
    path: "/socket",
    search: "q=1",
    req: createUpgradeRequest("/ignored"),
    socket: downstream,
    head: Buffer.from("head"),
    connect(options) {
      calls.push(options);
      queueMicrotask(() => upstream.emit("connect"));
      return upstream;
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(handled, true);
  assert.deepEqual(calls, [{ host: "127.0.0.1", port: 39999 }]);
  const requestText = upstream.text();
  assert.match(requestText, /^GET \/socket\?q=1 HTTP\/1\.1\r\n/);
  assert.match(requestText, /host: 127\.0\.0\.1:39999\r\n/i);
  assert.match(requestText, /connection: Upgrade\r\n/i);
  assert.match(requestText, /upgrade: websocket\r\n/i);
  assert.match(requestText, /sec-websocket-key: test-key\r\n/i);
  assert.ok(upstream.writes.some((chunk) => chunk.equals(Buffer.from("head"))));
  assert.equal(downstream.pipes[0], upstream);
  assert.equal(upstream.pipes[0], downstream);
});

test("workspace IDE provider upgrade handler matches only provider proxy paths", () => {
  const socket = new FakeDuplex();
  const handled = handleWorkspaceIdeProviderUpgrade(
    createUpgradeRequest("/api/terminal/ws"),
    socket,
    Buffer.alloc(0),
    { getSession() { return session; } },
  );
  assert.equal(handled, false);
  assert.equal(socket.destroyed, false);
});

test("workspace IDE provider upgrade handler rejects missing and non-ready sessions", () => {
  const missingSocket = new FakeDuplex();
  const missingHandled = handleWorkspaceIdeProviderUpgrade(
    createUpgradeRequest("/api/workspace/ide-provider-sessions/missing/proxy?path=%2Fsocket"),
    missingSocket,
    Buffer.alloc(0),
    { getSession() { return null; } },
  );
  assert.equal(missingHandled, true);
  assert.match(missingSocket.text(), /^HTTP\/1\.1 404 Not Found/);
  assert.equal(missingSocket.destroyed, true);

  const stoppedSocket = new FakeDuplex();
  const stoppedHandled = handleWorkspaceIdeProviderUpgrade(
    createUpgradeRequest(`/api/workspace/ide-provider-sessions/${session.id}/proxy?path=%2Fsocket`),
    stoppedSocket,
    Buffer.alloc(0),
    { getSession() { return { ...session, status: "stopped" }; } },
  );
  assert.equal(stoppedHandled, true);
  assert.match(stoppedSocket.text(), /^HTTP\/1\.1 409 Conflict/);
  assert.equal(stoppedSocket.destroyed, true);
});
