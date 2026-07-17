#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { createNpmInvocation } from "./dev-runtime.mjs";

export const RELEASE_CATEGORIES = [
  "build",
  "supervisor",
  "gateway",
  "channel",
  "files",
  "terminal",
  "ide",
];

const QUICK_GATE = [
  { category: "build", script: "build" },
  { category: "supervisor", script: "test:supervisor" },
  { category: "gateway", script: "test:cross-platform:gateway" },
  { category: "channel", script: "test:cross-platform:channel" },
  { category: "files", script: "test:cross-platform:files" },
  { category: "terminal", script: "test:cross-platform:terminal" },
  { category: "ide", script: "ide:rc:quick" },
];

const NATIVE_SUPERVISOR = {
  win32: { category: "supervisor", script: "smoke:supervisor:windows", env: { TRACEVANE_WINDOWS_SUPERVISOR_LIVE: "1" } },
  darwin: { category: "supervisor", script: "smoke:supervisor:macos", env: { TRACEVANE_MACOS_SUPERVISOR_LIVE: "1" } },
  linux: { category: "supervisor", script: "smoke:supervisor:linux", env: { TRACEVANE_LINUX_SUPERVISOR_LIVE: "1" } },
};

export function releaseGateForPlatform(platform = process.platform, { full = false } = {}) {
  const supervisor = NATIVE_SUPERVISOR[platform];
  if (!supervisor) throw new Error(`Unsupported release platform: ${platform}`);
  const capabilityGate = full
    ? QUICK_GATE.map((entry) => entry.category === "ide" ? { ...entry, script: "ide:rc:full" } : entry)
    : QUICK_GATE;
  return full
    ? [...capabilityGate, supervisor]
    : [...capabilityGate];
}

function runNpmScript(entry) {
  const invocation = createNpmInvocation(["run", entry.script]);
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      ...invocation.options,
      cwd: process.cwd(),
      env: { ...process.env, ...entry.env },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${entry.script} failed (${signal ?? `exit ${code}`})`));
    });
  });
}

async function main() {
  const full = process.argv.includes("--full");
  for (const entry of releaseGateForPlatform(process.platform, { full })) {
    console.log(`\n[cross-platform:${entry.category}] npm run ${entry.script}`);
    await runNpmScript(entry);
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
