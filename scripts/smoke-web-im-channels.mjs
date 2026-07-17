#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const base = argument("--base", "http://127.0.0.1:5176");
const screenshotsDir = argument("--screenshots-dir");
const executablePath = process.env.PLAYWRIGHT_CHROME_EXECUTABLE
  || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || chromium.executablePath();
if (!fs.existsSync(executablePath)) {
  throw new Error(
    `Playwright Chromium is not installed at ${JSON.stringify(executablePath)}. `
      + "Run `npx playwright install chromium` before this smoke.",
  );
}
const views = ["overview", "workspaces", "accounts", "sessions", "runtime"];
const sizes = [
  ["desktop", 1440, 900],
  ["mobile", 390, 844],
];
const failures = [];

if (screenshotsDir) fs.mkdirSync(screenshotsDir, { recursive: true });
const browser = await chromium.launch({ executablePath });
try {
  for (const [sizeName, width, height] of sizes) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    for (const view of views) {
      errors.length = 0;
      await page.goto(`${base}/#/im-channels?view=${view}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      const rootLength = await page.locator("#root").evaluate((element) => element.innerText.length);
      const overflow = await page.evaluate(() => (
        document.documentElement.scrollWidth - document.documentElement.clientWidth
      ));
      const tag = `[${sizeName}] ${view}`;
      if (rootLength < 5) failures.push(`${tag}: #root nearly empty (${rootLength})`);
      if (errors.length) failures.push(`${tag}: console/page errors: ${errors.slice(0, 3).join(" | ")}`);
      if (overflow > 1) failures.push(`${tag}: horizontal overflow ${overflow}px`);
      if (screenshotsDir) {
        await page.screenshot({
          path: path.join(screenshotsDir, `${sizeName}-${view}.png`),
          fullPage: true,
        });
      }
      const ok = rootLength >= 5 && errors.length === 0 && overflow <= 1;
      console.log(`${tag.padEnd(24)} root=${String(rootLength).padEnd(5)} overflow=${String(overflow).padEnd(4)} errors=${errors.length} ${ok ? "OK" : "FAIL"}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`SMOKE FAILED (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("SMOKE PASSED: all Channel Connector views render without console errors or horizontal overflow.");
