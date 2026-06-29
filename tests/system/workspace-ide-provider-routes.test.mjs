import { EventEmitter } from "node:events";
import { test } from "node:test";
import assert from "node:assert";
import path from "node:path";

import { TracevaneRouter } from "../../dist/apps/api/core/router.js";
import {
  WorkspaceIdeProviderLifecycleController,
  WorkspaceIdeProviderSessionRegistry,
  parseWorkspaceIdeProviderConfig,
} from "../../dist/apps/api/modules/workspace-ide/provider-service.js";
import { registerWorkspaceIdeProviderRoutes } from "../../dist/apps/api/modules/workspace-ide/routes.js";

const projectRoot = path.resolve(".");

function createContext() {
  return {
    config: {},
    logger: { error() {}, info() {}, warn() {}, debug() {} },
    sseClients: new Set(),
    services: {},
  };
}

function createJsonRequest(method, url, payload) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = { host: "127.0.0.1", "content-type": "application/json" };
  req[Symbol.asyncIterator] = async function* () {
    if (payload !== undefined) yield Buffer.from(JSON.stringify(payload));
  };
  return req;
}

function createResponse() {
  const chunks = [];
  return {
    statusCode: 200,
    writableEnded: false,
    headers: {},
    hasHeader(name) {
      return Object.prototype.hasOwnProperty.call(this.headers, name.toLowerCase());
    },
    getHeader(name) {
      return this.headers[name.toLowerCase()];
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(chunk) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      this.writableEnded = true;
    },
    json() {
      return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    },
  };
}

async function dispatch(router, method, url, payload) {
  const req = createJsonRequest(method, url, payload);
  const res = createResponse();
  const handled = await router.handle(req, res, createContext());
  assert.equal(handled, true);
  return res;
}

test("workspace IDE provider routes expose providers and sessions", async () => {
  const config = parseWorkspaceIdeProviderConfig({ kind: "openvscode-server" });
  const registry = new WorkspaceIdeProviderSessionRegistry(39500);
  const controller = new WorkspaceIdeProviderLifecycleController(registry, {
    start(plan) {
      return { pid: 100, stop() {} };
    },
  });
  const router = new TracevaneRouter();
  registerWorkspaceIdeProviderRoutes(router, createContext(), { config, controller });

  const providers = await dispatch(router, "GET", "/api/workspace/ide-providers");
  assert.equal(providers.statusCode, 200);
  assert.equal(providers.json().defaultKind, "openvscode-server");

  const created = await dispatch(router, "POST", "/api/workspace/ide-providers/openvscode-server/sessions", {
    workspaceRoot: projectRoot,
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().session.status, "ready");

  const list = await dispatch(router, "GET", "/api/workspace/ide-provider-sessions");
  assert.equal(list.json().sessions.length, 1);
});

test("workspace IDE provider routes reject provider mismatch and stop sessions", async () => {
  const config = parseWorkspaceIdeProviderConfig({ kind: "code-server" });
  const registry = new WorkspaceIdeProviderSessionRegistry(39600);
  const stopped = [];
  const controller = new WorkspaceIdeProviderLifecycleController(registry, {
    start(plan) {
      return { stop() { stopped.push(plan.session.id); } };
    },
  });
  const router = new TracevaneRouter();
  registerWorkspaceIdeProviderRoutes(router, createContext(), { config, controller });

  const mismatch = await dispatch(router, "POST", "/api/workspace/ide-providers/openvscode-server/sessions", {
    workspaceRoot: projectRoot,
  });
  assert.equal(mismatch.statusCode, 400);
  assert.equal(mismatch.json().error, "workspace_ide_provider_kind_mismatch");

  const created = await dispatch(router, "POST", "/api/workspace/ide-providers/code-server/sessions", {
    workspaceRoot: projectRoot,
  });
  const id = created.json().session.id;
  const stoppedResponse = await dispatch(router, "POST", `/api/workspace/ide-provider-sessions/${id}/stop`);
  assert.equal(stoppedResponse.json().session.status, "stopped");
  assert.deepEqual(stopped, [id]);
});

test("main Tracevane router registers workspace IDE provider routes", async () => {
  const { createTracevaneRouter } = await import("../../dist/apps/api/server.js");
  const config = parseWorkspaceIdeProviderConfig({ kind: "openvscode-server" });
  const registry = new WorkspaceIdeProviderSessionRegistry(39700);
  const controller = new WorkspaceIdeProviderLifecycleController(registry, {
    start() {
      return { stop() {} };
    },
  });
  const ctx = createContext();
  ctx.services = {
    workspaceIde: { config, controller },
  };
  const router = createTracevaneRouter(ctx);
  const res = createResponse();
  const handled = await router.handle(
    createJsonRequest("GET", "/api/workspace/ide-providers"),
    res,
    ctx,
  );
  assert.equal(handled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().defaultKind, "openvscode-server");
});
