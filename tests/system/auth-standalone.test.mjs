import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const apiIndex = pathToFileUrl(path.join(rootDir, "dist/apps/api/index.js"));
function pathToFileUrl(p) {
  let resolved = path.resolve(p).replace(/\\/g, "/");
  if (!resolved.startsWith("/")) resolved = `/${resolved}`;
  return `file://${resolved}`;
}

const logger = { info() {}, warn() {}, error() {}, debug() {} };

function makeScratchRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-auth-test-"));
  const openclawRoot = path.join(root, ".openclaw");
  const webDistDir = path.join(root, "web-dist");
  fs.mkdirSync(openclawRoot, { recursive: true });
  fs.mkdirSync(webDistDir, { recursive: true });
  fs.writeFileSync(
    path.join(webDistDir, "index.html"),
    "<!doctype html><html><head><title>t</title></head><body>test</body></html>",
  );
  return { root, openclawRoot, webDistDir };
}

function getSetCookies(res) {
  if (typeof res.headers.getSetCookie === "function") return res.headers.getSetCookie();
  const raw = res.headers.get("set-cookie");
  return raw ? [raw] : [];
}

async function bootServer({ authEnv }) {
  const previous = process.env.TRACEVANE_AUTH;
  if (authEnv === undefined) delete process.env.TRACEVANE_AUTH;
  else process.env.TRACEVANE_AUTH = authEnv;
  try {
    const { createStandaloneTracevaneConfig, createTracevaneContext, createTracevaneServer } =
      await import(apiIndex);
    const scratch = makeScratchRoot();
    const port = 30000 + Math.floor(Math.random() * 20000);
    const config = createStandaloneTracevaneConfig({
      port,
      openclawRoot: scratch.openclawRoot,
      projectRoot: scratch.root,
      webDistDir: scratch.webDistDir,
    });
    const ctx = createTracevaneContext({ config, logger });
    const server = createTracevaneServer(ctx);
    await server.start();
    return {
      ...scratch,
      config,
      server,
      base: `http://127.0.0.1:${port}`,
      async stop() {
        await server.stop();
        fs.rmSync(scratch.root, { recursive: true, force: true });
      },
    };
  } finally {
    if (previous === undefined) delete process.env.TRACEVANE_AUTH;
    else process.env.TRACEVANE_AUTH = previous;
  }
}

test("standalone auth on: gates /api, unlock flow, session cookie, ws gate, password, logout", async () => {
  const env = await bootServer({ authEnv: "on" });
  try {
    assert.equal(env.config.security.bindHost, "127.0.0.1");
    assert.equal(env.config.security.auth, "on");

    // Static GET stays open so the SPA can render the unlock screen.
    const staticRes = await fetch(`${env.base}/`);
    assert.equal(staticRes.status, 200);
    assert.equal(staticRes.headers.get("access-control-allow-origin"), null);

    // CORS: only the localhost dev allowlist is echoed.
    const devOrigin = await fetch(`${env.base}/api/auth/status`, {
      headers: { Origin: "http://localhost:5176" },
    });
    assert.equal(
      devOrigin.headers.get("access-control-allow-origin"),
      "http://localhost:5176",
    );
    const foreignOrigin = await fetch(`${env.base}/api/auth/status`, {
      headers: { Origin: "http://evil.example.com" },
    });
    assert.equal(foreignOrigin.headers.get("access-control-allow-origin"), null);

    // OPTIONS preflight stays ungated.
    const preflight = await fetch(`${env.base}/api/system/health`, { method: "OPTIONS" });
    assert.equal(preflight.status, 204);

    // /api is gated without a session.
    const gated = await fetch(`${env.base}/api/system/health`);
    assert.equal(gated.status, 401);
    assert.deepEqual(await gated.json(), {
      error: { code: "auth_required", message: "需要解锁后访问" },
    });

    // Status is never gated.
    const status = await fetch(`${env.base}/api/auth/status`);
    assert.equal(status.status, 200);
    const statusBody = await status.json();
    assert.equal(statusBody.required, true);
    assert.equal(statusBody.hasPassword, false);
    assert.deepEqual(statusBody.methods, ["token", "password"]);
    assert.equal(statusBody.authenticated, false);

    // Wrong credential rejected.
    const wrong = await fetch(`${env.base}/api/auth/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: "wrong-credential" }),
    });
    assert.equal(wrong.status, 401);
    assert.equal((await wrong.json())?.error?.code, "auth_invalid_credential");

    // Token persisted Jupyter-style in the state dir.
    const authFile = path.join(env.openclawRoot, "tracevane", "auth.json");
    assert.ok(fs.existsSync(authFile), authFile);
    const authState = JSON.parse(fs.readFileSync(authFile, "utf-8"));
    assert.equal(authState.version, 1);
    assert.match(authState.token, /^[0-9a-f]{48}$/);
    if (process.platform !== "win32") {
      assert.equal(fs.statSync(authFile).mode & 0o777, 0o600);
    }

    // Unlock with the token issues the session cookie.
    const unlock = await fetch(`${env.base}/api/auth/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: authState.token }),
    });
    assert.equal(unlock.status, 200);
    const sessionCookie = getSetCookies(unlock).find((c) =>
      c.startsWith("tracevane_session="),
    );
    assert.ok(sessionCookie, "expected tracevane_session cookie");
    assert.ok(sessionCookie.includes("HttpOnly"));
    assert.ok(sessionCookie.includes("SameSite=Lax"));
    assert.ok(sessionCookie.includes("Path=/"));
    assert.ok(sessionCookie.includes(`Max-Age=${30 * 24 * 60 * 60}`));
    const cookiePair = sessionCookie.split(";")[0];

    // Session cookie opens /api and flips status.authenticated.
    const authed = await fetch(`${env.base}/api/system/health`, {
      headers: { Cookie: cookiePair },
    });
    assert.equal(authed.status, 200);
    assert.equal((await authed.json()).authEnabled, true);
    const statusAuthed = await (
      await fetch(`${env.base}/api/auth/status`, { headers: { Cookie: cookiePair } })
    ).json();
    assert.equal(statusAuthed.authenticated, true);

    // WS upgrades are gated by the same session cookie.
    const wsNoAuth = await new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${env.config.port}/ws/terminal`);
      ws.on("open", () => { ws.close(); resolve("opened"); });
      ws.on("error", (err) => resolve(`error:${err.message}`));
    });
    assert.match(String(wsNoAuth), /401/);
    const wsAuthed = await new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${env.config.port}/ws/terminal`, {
        headers: { Cookie: cookiePair },
      });
      ws.on("open", () => { ws.close(); resolve("opened"); });
      ws.on("error", (err) => resolve(`error:${err.message}`));
    });
    assert.equal(wsAuthed, "opened");

    // Set a password with the valid session; old sessions die, new one issued.
    const setPw = await fetch(`${env.base}/api/auth/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookiePair },
      body: JSON.stringify({ currentCredential: authState.token, newPassword: "测试密码123" }),
    });
    assert.equal(setPw.status, 200);
    const pwCookie = getSetCookies(setPw)
      .find((c) => c.startsWith("tracevane_session="))
      ?.split(";")[0];
    const oldSession = await fetch(`${env.base}/api/system/health`, {
      headers: { Cookie: cookiePair },
    });
    assert.equal(oldSession.status, 401);
    const newSession = await fetch(`${env.base}/api/system/health`, {
      headers: { Cookie: pwCookie },
    });
    assert.equal(newSession.status, 200);

    // Password now unlocks too.
    const unlockPw = await fetch(`${env.base}/api/auth/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: "测试密码123" }),
    });
    assert.equal(unlockPw.status, 200);
    const statusAfterPw = await (await fetch(`${env.base}/api/auth/status`)).json();
    assert.equal(statusAfterPw.hasPassword, true);

    // Logout clears the cookie.
    const logout = await fetch(`${env.base}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: pwCookie },
    });
    assert.equal(logout.status, 200);
    const logoutCookie = getSetCookies(logout).find((c) =>
      c.startsWith("tracevane_session="),
    );
    assert.ok(logoutCookie?.includes("Max-Age=0"));
  } finally {
    await env.stop();
  }
});

test("standalone auth off (dev default): everything open, no state file written", async () => {
  const env = await bootServer({ authEnv: undefined });
  try {
    assert.equal(env.config.security.auth, "off");
    const health = await fetch(`${env.base}/api/system/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).authEnabled, false);
    const status = await (await fetch(`${env.base}/api/auth/status`)).json();
    assert.equal(status.required, false);
    assert.equal(
      fs.existsSync(path.join(env.openclawRoot, "tracevane", "auth.json")),
      false,
      "auth state file must not be created while auth is off",
    );
  } finally {
    await env.stop();
  }
});
