import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testFileDir, "..", "..");

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), "utf8");
}

const releasePrd = read(".omx/plans/prd-openclaw-studio-release-grade.md");
const releaseSpec = read(".omx/plans/test-spec-openclaw-studio-release-grade.md");
const designContract = read("DESIGN.md");

test("release-grade goal is tracked as a broad product contract", () => {
  assert.match(releasePrd, /OpenClaw Studio release-grade PRD/);
  assert.match(releasePrd, /latest OpenClaw and supported older versions/);
  assert.match(releasePrd, /Codex Stack release path/);
  assert.match(releasePrd, /Calm Ops OS frontend/);
  assert.match(releasePrd, /CSS ownership cleanup/);
  assert.match(releasePrd, /Backend API stability/);
  assert.match(releasePrd, /Performance and cache safety/);
  assert.match(releasePrd, /Release evidence/);
});

test("release-grade gates protect Codex Stack model and route safety", () => {
  assert.match(releaseSpec, /No required smoke model list may hardcode/);
  assert.match(releaseSpec, /UI default model fields must hydrate from/);
  assert.match(releaseSpec, /CPA attach requires a fresh passing smoke matrix/);
  assert.match(releaseSpec, /Force CPA path must remain explicit/);
  assert.match(releaseSpec, /Official ChatGPT route restore must preserve CPA provider configuration/);
  assert.match(releaseSpec, /Health-check and install output must render in floating output surfaces/);
});

test("release goal stays aligned with the Studio design contract", () => {
  assert.match(designContract, /\*\*Calm Ops OS\*\*/);
  assert.match(releasePrd, /DESIGN\.md/);
  assert.match(releaseSpec, /Setup \/ Repair Wizard, Command Center, Split Inspector, Runtime Console, or Data Review/);
});
