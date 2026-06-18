#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const DEFAULT_ENDPOINT = "http://127.0.0.1:18796";
const DEFAULT_TIMEOUT_MS = 240_000;
const DEFAULT_IMAGE_PROMPT = "A simple blue square on a white background. No text.";

function parseArgs(argv) {
  const options = {
    endpoint: process.env.TRACEVANE_GATEWAY_ENDPOINT || process.env.TRACEVANE_GATEWAY_ENDPOINT || DEFAULT_ENDPOINT,
    json: false,
    runImageGeneration: false,
    requireImageGeneration: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    prompt: DEFAULT_IMAGE_PROMPT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--endpoint") options.endpoint = argv[++index] || options.endpoint;
    else if (arg.startsWith("--endpoint=")) options.endpoint = arg.slice("--endpoint=".length);
    else if (arg === "--json") options.json = true;
    else if (arg === "--run-image-generation") options.runImageGeneration = true;
    else if (arg === "--require-image-generation") {
      options.runImageGeneration = true;
      options.requireImageGeneration = true;
    } else if (arg === "--timeout-ms") options.timeoutMs = positiveInt(argv[++index], DEFAULT_TIMEOUT_MS);
    else if (arg.startsWith("--timeout-ms=")) options.timeoutMs = positiveInt(arg.slice("--timeout-ms=".length), DEFAULT_TIMEOUT_MS);
    else if (arg === "--prompt") options.prompt = argv[++index] || options.prompt;
    else if (arg.startsWith("--prompt=")) options.prompt = arg.slice("--prompt=".length);
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  options.endpoint = options.endpoint.replace(/\/+$/g, "");
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/smoke-model-gateway-account-media.mjs [options]

Checks Tracevane Gateway account-backed media routes against a running daemon.

Default probes are low-cost and do not generate images:
  - /v1/models exposes image/audio/realtime catalog entries
  - Codex account /v1/images/edits returns structured unsupported
  - Codex account /v1/audio/transcriptions and /v1/audio/speech return structured unsupported

Options:
  --endpoint <url>              default: ${DEFAULT_ENDPOINT}
  --run-image-generation        Also call /v1/images/generations with gpt-image-2
  --require-image-generation    Fail if image generation does not return image data
  --prompt <text>               image prompt for --run-image-generation
  --timeout-ms <n>              per-request timeout
  --json                        machine-readable output
  -h, --help                    Show this help

Auth:
  TRACEVANE_GATEWAY_CLIENT_KEY is preferred. If omitted, the script reads
  ~/.openclaw/tracevane/model-gateway/secrets.json locally.`);
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readGatewayKey() {
  const envKey = process.env.TRACEVANE_GATEWAY_CLIENT_KEY || process.env.TRACEVANE_GATEWAY_CLIENT_KEY || process.env.MODEL_GATEWAY_CLIENT_KEY;
  if (envKey?.trim()) return envKey.trim();
  const filePath = path.join(os.homedir(), ".openclaw/tracevane/model-gateway/secrets.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const value = parsed?.secrets?.["gateway:client-api-key"]?.value;
    return typeof value === "string" && value.trim() ? value.trim() : "";
  } catch {
    return "";
  }
}

function authHeaders(key, extra = {}) {
  return {
    authorization: `Bearer ${key}`,
    ...extra,
  };
}

async function requestJson(url, options) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(options.timeoutMs),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return {
    status: response.status,
    headers: response.headers,
    body,
    text,
  };
}

async function requestRaw(url, options) {
  return requestJson(url, options);
}

function status(id, state, details = {}) {
  return {
    id,
    status: state,
    ...details,
  };
}

function errorPreview(result) {
  return result.body?.error || {
    message: result.text ? result.text.slice(0, 240) : `HTTP ${result.status}`,
  };
}

function modelFeature(body, id) {
  return body?.data?.find?.((model) => model?.id === id)?.features || null;
}

async function probeCatalog(options, key) {
  const result = await requestJson(`${options.endpoint}/v1/models`, {
    method: "GET",
    headers: authHeaders(key),
    timeoutMs: options.timeoutMs,
  });
  if (result.status < 200 || result.status >= 300) {
    return status("models-catalog", "failed", {
      statusCode: result.status,
      error: errorPreview(result),
    });
  }
  const image = modelFeature(result.body, "gpt-image-2");
  const audioCount = (result.body?.data || []).filter((model) => model?.features?.audioInput || model?.features?.audioOutput).length;
  const realtimeCount = (result.body?.data || []).filter((model) => /^gpt-realtime/.test(model?.id || "")).length;
  const failures = [];
  if (!image?.imageGeneration) failures.push("gpt-image-2 missing imageGeneration=true");
  if (audioCount < 1) failures.push("audio model catalog is empty");
  if (realtimeCount < 1) failures.push("realtime model catalog is empty");
  return status("models-catalog", failures.length ? "failed" : "passed", {
    statusCode: result.status,
    imageGeneration: Boolean(image?.imageGeneration),
    audioCount,
    realtimeCount,
    failures,
  });
}

async function probeImageEditsUnsupported(options, key) {
  const boundary = "----tracevane-account-media-image-edit";
  const body = Buffer.from([
    `--${boundary}`,
    'Content-Disposition: form-data; name="model"',
    "",
    "gpt-image-2",
    `--${boundary}`,
    'Content-Disposition: form-data; name="prompt"',
    "",
    "make it blue",
    `--${boundary}`,
    'Content-Disposition: form-data; name="image"; filename="square.png"',
    "Content-Type: image/png",
    "",
    "PNG\u0000studio",
    `--${boundary}--`,
    "",
  ].join("\r\n"), "latin1");
  const result = await requestRaw(`${options.endpoint}/v1/images/edits`, {
    method: "POST",
    headers: authHeaders(key, { "content-type": `multipart/form-data; boundary=${boundary}` }),
    body,
    timeoutMs: options.timeoutMs,
  });
  const code = result.body?.error?.code;
  if (result.status === 501 && code === "model_gateway_codex_account_image_edits_unsupported") {
    return status("image-edits-route", "unsupported", {
      statusCode: result.status,
      code,
      provider: result.headers.get("x-openclaw-model-gateway-provider"),
      error: null,
    });
  }
  const structuredProviderError = result.status >= 400
    && result.status < 500
    && Boolean(result.body?.error)
    && Boolean(result.body.error.code || result.body.error.message);
  return status("image-edits-route", structuredProviderError ? "passed" : "failed", {
    statusCode: result.status,
    code,
    provider: result.headers.get("x-openclaw-model-gateway-provider"),
    note: structuredProviderError ? "OpenAI-compatible image edits provider returned a structured client error for the tiny probe file." : undefined,
    error: structuredProviderError ? null : errorPreview(result),
  });
}

async function probeAudioUnsupported(options, key, kind) {
  if (kind === "speech") {
    const result = await requestJson(`${options.endpoint}/v1/audio/speech`, {
      method: "POST",
      headers: authHeaders(key, { "content-type": "application/json" }),
      body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: "alloy", input: "hello" }),
      timeoutMs: options.timeoutMs,
    });
    return audioUnsupportedStatus(kind, result);
  }
  const boundary = "----tracevane-account-media-audio";
  const body = Buffer.from([
    `--${boundary}`,
    'Content-Disposition: form-data; name="model"',
    "",
    "gpt-4o-mini-transcribe",
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="sample.wav"',
    "Content-Type: audio/wav",
    "",
    "RIFF\u0024\u0000\u0000\u0000WAVEfmt ",
    `--${boundary}--`,
    "",
  ].join("\r\n"), "latin1");
  const result = await requestRaw(`${options.endpoint}/v1/audio/transcriptions`, {
    method: "POST",
    headers: authHeaders(key, { "content-type": `multipart/form-data; boundary=${boundary}` }),
    body,
    timeoutMs: options.timeoutMs,
  });
  return audioUnsupportedStatus(kind, result);
}

function audioUnsupportedStatus(kind, result) {
  const code = result.body?.error?.code;
  const passed = result.status === 501 && code === "model_gateway_codex_account_audio_unsupported";
  return status(`codex-audio-${kind}`, passed ? "unsupported" : "failed", {
    statusCode: result.status,
    code,
    error: passed ? null : errorPreview(result),
  });
}

async function probeImageGeneration(options, key) {
  if (!options.runImageGeneration) {
    return status("codex-image-generation", "skipped", {
      reason: "Pass --run-image-generation to call gpt-image-2.",
    });
  }
  const result = await requestJson(`${options.endpoint}/v1/images/generations`, {
    method: "POST",
    headers: authHeaders(key, { "content-type": "application/json" }),
    body: JSON.stringify({
      model: "gpt-image-2",
      prompt: options.prompt,
      size: "1024x1024",
      quality: "low",
      response_format: "b64_json",
    }),
    timeoutMs: options.timeoutMs,
  });
  const imageCount = Array.isArray(result.body?.data)
    ? result.body.data.filter((item) => item?.b64_json || item?.url).length
    : 0;
  if (result.status >= 200 && result.status < 300 && imageCount > 0) {
    return status("codex-image-generation", "passed", {
      statusCode: result.status,
      provider: result.headers.get("x-openclaw-model-gateway-provider"),
      account: result.headers.get("x-openclaw-model-gateway-account"),
      imageCount,
      hasUsage: Boolean(result.body?.usage),
    });
  }
  return status("codex-image-generation", options.requireImageGeneration ? "failed" : "unsupported", {
    statusCode: result.status,
    provider: result.headers.get("x-openclaw-model-gateway-provider"),
    account: result.headers.get("x-openclaw-model-gateway-account"),
    imageCount,
    error: errorPreview(result),
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const key = readGatewayKey();
  if (!key) {
    throw new Error("Missing Gateway client key. Set TRACEVANE_GATEWAY_CLIENT_KEY or save a local Gateway key.");
  }
  const probes = [];
  probes.push(await probeCatalog(options, key));
  probes.push(await probeImageEditsUnsupported(options, key));
  probes.push(await probeAudioUnsupported(options, key, "transcriptions"));
  probes.push(await probeAudioUnsupported(options, key, "speech"));
  probes.push(await probeImageGeneration(options, key));
  const failed = probes.filter((probe) => probe.status === "failed");
  const result = {
    ok: failed.length === 0,
    endpoint: options.endpoint,
    checkedAt: new Date().toISOString(),
    probes,
  };
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${result.ok ? "OK" : "FAIL"} Tracevane Gateway account media smoke`);
    for (const probe of probes) {
      console.log(`- ${probe.id}: ${probe.status}`);
    }
  }
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  const result = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = 1;
});
