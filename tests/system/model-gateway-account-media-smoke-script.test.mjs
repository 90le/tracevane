import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const scriptPath = path.join(repoRoot, "scripts/smoke-model-gateway-account-media.mjs");
const execFileAsync = promisify(execFile);

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, body) {
  const raw = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(raw),
  });
  res.end(raw);
}

async function startMockGateway() {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const body = await readRequestBody(req);
    const url = new URL(req.url || "/", "http://127.0.0.1");
    requests.push({
      method: req.method,
      path: url.pathname,
      authorization: req.headers.authorization || null,
      body: body.toString("utf8"),
    });
    if (req.headers.authorization !== "Bearer test-gateway-key") {
      sendJson(res, 401, { error: { code: "model_gateway_client_auth_required" } });
      return;
    }
    if (req.method === "GET" && url.pathname === "/v1/models") {
      sendJson(res, 200, {
        object: "list",
        data: [
          { id: "gpt-image-2", features: { imageGeneration: true } },
          { id: "gpt-4o-mini-transcribe", features: { audioInput: true } },
          { id: "gpt-4o-mini-tts", features: { audioOutput: true } },
          { id: "gpt-realtime", features: { audioInput: true, audioOutput: true } },
        ],
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/v1/images/edits") {
      sendJson(res, 501, {
        error: { code: "model_gateway_codex_account_image_edits_unsupported" },
      });
      return;
    }
    if (req.method === "POST" && (url.pathname === "/v1/audio/transcriptions" || url.pathname === "/v1/audio/speech")) {
      sendJson(res, 501, {
        error: { code: "model_gateway_codex_account_audio_unsupported" },
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/v1/images/generations") {
      sendJson(res, 200, {
        created: 1710000001,
        data: [{ b64_json: "BASE64_IMAGE" }],
        usage: { total_tokens: 1 },
      });
      return;
    }
    sendJson(res, 404, { error: { code: "not_found" } });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address !== "object") throw new Error("mock server did not bind");
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function runScript(args, env = {}) {
  const result = await execFileAsync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      STUDIO_GATEWAY_CLIENT_KEY: "test-gateway-key",
      ...env,
    },
    encoding: "utf8",
  });
  return JSON.parse(result.stdout);
}

test("model gateway account media smoke validates low-cost unsupported probes", async () => {
  const gateway = await startMockGateway();
  try {
    const parsed = await runScript(["--endpoint", gateway.endpoint, "--json"]);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.probes.map((probe) => [probe.id, probe.status]), [
      ["models-catalog", "passed"],
      ["image-edits-route", "unsupported"],
      ["codex-audio-transcriptions", "unsupported"],
      ["codex-audio-speech", "unsupported"],
      ["codex-image-generation", "skipped"],
    ]);
    assert.equal(gateway.requests.some((request) => request.path === "/v1/images/generations"), false);
  } finally {
    await gateway.close();
  }
});

test("model gateway account media smoke can require image generation", async () => {
  const gateway = await startMockGateway();
  try {
    const parsed = await runScript(["--endpoint", gateway.endpoint, "--require-image-generation", "--json"]);
    assert.equal(parsed.ok, true);
    const imageProbe = parsed.probes.find((probe) => probe.id === "codex-image-generation");
    assert.equal(imageProbe.status, "passed");
    assert.equal(imageProbe.imageCount, 1);
    assert.equal(gateway.requests.some((request) => request.path === "/v1/images/generations"), true);
  } finally {
    await gateway.close();
  }
});
