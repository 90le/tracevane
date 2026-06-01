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
const codexStackPrd = read(".omx/plans/prd-codex-stack-management.md");
const codexStackSpec = read(".omx/plans/test-spec-codex-stack-management.md");
const designContract = read("DESIGN.md");

test("release-grade goal is tracked as a broad product contract", () => {
  assert.match(releasePrd, /OpenClaw Studio release-grade PRD/);
  assert.match(releasePrd, /latest OpenClaw and supported older versions/);
  assert.match(releasePrd, /Codex Stack release path/);
  assert.match(releasePrd, /DuoYuan Studio Ops frontend/);
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

test("codex stack plans keep watchdog as automated infrastructure, not manual service control", () => {
  assert.match(codexStackPrd, /allowlisted manual services: `cli-proxy-api\.service`, `cpa-compact-proxy\.service`, `cc-connect\.service`/);
  assert.match(codexStackPrd, /`codex-stack-watchdog\.timer` is not a manual service-control target/);
  assert.match(codexStackPrd, /automated watchdog state without exposing watchdog as an arbitrary manual control/);
  assert.match(codexStackSpec, /Rejects `codex-stack-watchdog\.timer` from the generic service-control endpoint/);
  assert.match(codexStackSpec, /watchdog state is shown as automated recovery infrastructure/);
  assert.doesNotMatch(codexStackPrd, /allowlisted services: [`\\w., -]*codex-stack-watchdog\.timer/);
  assert.doesNotMatch(codexStackPrd, /start, stop, restart, and enable these units through allowlisted actions/);
});

test("release goal stays aligned with the Studio design contract", () => {
  assert.match(designContract, /\*\*DuoYuan Studio Ops\*\*/);
  assert.match(releasePrd, /DESIGN\.md/);
  assert.match(releaseSpec, /Setup \/ Repair Wizard, Workspace Strip, Health Action Lane, Split Inspector, Runtime Console, Runtime Workspace, Conversation Workspace, or Data Review/);
  assert.doesNotMatch(releaseSpec, /Command Center/);
  assert.doesNotMatch(releasePrd, /command centers/i);
});
