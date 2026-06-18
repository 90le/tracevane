import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const webIndexPath = path.join(rootDir, "apps/web-vue/index.html");
const faviconPath = path.join(rootDir, "apps/web-vue/public/favicon.svg");

test("studio web entry declares production title and favicon", () => {
  const indexHtml = fs.readFileSync(webIndexPath, "utf8");
  const favicon = fs.readFileSync(faviconPath, "utf8");

  assert.match(indexHtml, /<title>Tracevane<\/title>/);
  assert.doesNotMatch(indexHtml, /Prototype/);
  assert.match(indexHtml, /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg" \/>/);
  assert.match(indexHtml, /<meta name="theme-color" content="#0f766e" \/>/);
  assert.match(favicon, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 48 48">/);
  assert.match(favicon, /OpenClaw|oc-ridge-front|oc-frame/);
});
