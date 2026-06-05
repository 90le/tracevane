import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..", "..");
const pagePath = path.join(
  rootDir,
  "apps/web-vue/src/features/model-gateway/ModelGatewayControlPage.vue",
);
const apiPath = path.join(
  rootDir,
  "apps/web-vue/src/features/model-gateway/api.ts",
);
const routeManifestPath = path.join(
  rootDir,
  "apps/web-vue/src/features/shell/route-manifest.ts",
);

test("Studio Gateway page is mounted as a first-class shell route", () => {
  const manifest = fs.readFileSync(routeManifestPath, "utf8");

  assert.match(manifest, /key:\s*"model-gateway"/);
  assert.match(manifest, /to:\s*"\/model-gateway"/);
  assert.match(manifest, /icon:\s*"gateway"/);
  assert.match(manifest, /labelZh:\s*"模型网关"/);
  assert.match(manifest, /path:\s*"\/model-gateway"/);
});

test("Studio Gateway page uses the new model-gateway API contract", () => {
  const page = fs.readFileSync(pagePath, "utf8");
  const api = fs.readFileSync(apiPath, "utf8");
  const source = `${page}\n${api}`;

  for (const requiredPath of [
    "/api/model-gateway/status",
    "/api/model-gateway/runtime",
    "/api/model-gateway/daemon-service",
    "/api/model-gateway/detect-provider",
    "/api/model-gateway/providers",
    "/api/model-gateway/active-provider",
  ]) {
    assert.match(source, new RegExp(requiredPath.replace(/\//g, "\\/")));
  }

  assert.match(source, /providers\/\$?\{?encodeURIComponent\(providerId\)\}?\/test/);
  assert.match(source, /Base URL/);
  assert.match(source, /Gateway will not append \/v1 automatically/);
});

test("Studio Gateway page keeps provider configuration user-owned", () => {
  const page = fs.readFileSync(pagePath, "utf8");
  const legacyInitialism = ["C", "P", "A"].join("");
  const legacyProxyName = ["Compact", "Proxy"].join(" ");
  const legacyApiPath = `/api/${["codex", "stack"].join("-")}`;
  const legacyComponentPrefix = ["Codex", "Stack"].join("");
  const vendorA = [["Big", "Model"].join(""), "Chat"].join(" ");
  const vendorB = [["Big", "Model"].join(""), "Anthropic"].join(" ");
  const vendorC = ["GMN", "Responses"].join(" ");
  const vendorHostA = `https://${["open", "bigmodel", "cn"].join(".")}/api/coding/paas/v4`;
  const vendorHostB = `https://${["open", "bigmodel", "cn"].join(".")}/api/anthropic`;
  const vendorHostC = `https://${["gmn", "chuangzuoli", "com"].join(".")}/v1`;

  for (const expected of [
    "OpenAI Chat Completions",
    "Anthropic Messages",
    "OpenAI Responses",
    "Provider Center",
    "Active routing",
    "Protocol smoke",
    "Auto-detect protocol and models",
    "detectProviderConfig",
    "applyDetectedProtocol",
    "model-a,Model A",
    "modelListText",
    "normalizedDraftModels",
    "formatModelLine",
    "daemonActionResult",
  ]) {
    assert.match(page, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const forbidden of [
    vendorA,
    vendorB,
    vendorC,
    vendorHostA,
    vendorHostB,
    vendorHostC,
  ]) {
    assert.doesNotMatch(page, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(page, new RegExp(legacyComponentPrefix));
  assert.doesNotMatch(page, new RegExp(legacyApiPath.replace(/\//g, "\\/")));
  assert.doesNotMatch(page, new RegExp(`\\b${legacyInitialism}\\b`));
  assert.doesNotMatch(page, new RegExp(legacyProxyName));
  assert.doesNotMatch(page, /运行矩阵与组件明细/);
  assert.doesNotMatch(page, /安装修复/);
  assert.doesNotMatch(page, /label:\s*'Custom'/);
});
