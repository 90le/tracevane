import { chromium } from "@playwright/test";

const BASE_URL = process.env.TRACEVANE_WEB_SMOKE_URL || "http://127.0.0.1:5176";
const CHROME =
  process.env.PLAYWRIGHT_CHROME_EXECUTABLE ||
  "/home/binbin/.local/bin/google-chrome";

async function run() {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const logs = [];
  page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (error) =>
    logs.push(`[pageerror] ${error.stack || error.message}`),
  );

  try {
    await page.goto(`${BASE_URL}/#/workspace`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("[data-workspace-season-one-frame]", {
      timeout: 30_000,
    });
    await page.waitForFunction(
      () => {
        const text = document.body.innerText.toLowerCase();
        return (
          text.includes("live file preview:") ||
          text.includes("live document loaded from")
        );
      },
      { timeout: 10_000 },
    );

    const metrics = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return {
        title: document.title,
        hasFrame: Boolean(
          document.querySelector("[data-workspace-season-one-frame]"),
        ),
        hasRedesignManifest: Boolean(
          document.querySelector("[data-season-one-redesign-manifest]"),
        ),
        hasRebuildStudio: text.includes("rebuild studio"),
        hasLegacyReplacement: text.includes("legacy shell replacement"),
        hasCommandDeck: text.includes("command deck"),
        hasLiveFilePreview:
          text.includes("live file preview:") ||
          text.includes("live document loaded from"),
        hasOldWorkbenchOnlyTitle: text.includes("工作区 · tracevane"),
      };
    });

    const failed = [
      [
        metrics.title.includes("Workspace Season One"),
        "document title should be Season One",
      ],
      [metrics.hasFrame, "Season One frame should render on /workspace"],
      [
        metrics.hasRedesignManifest,
        "redesign manifest should render on /workspace",
      ],
      [
        metrics.hasRebuildStudio,
        "Rebuild Studio marker should render on /workspace",
      ],
      [
        metrics.hasLegacyReplacement,
        "legacy replacement marker should render on /workspace",
      ],
      [
        metrics.hasCommandDeck,
        "Command Deck marker should render on /workspace",
      ],
      [
        !metrics.hasOldWorkbenchOnlyTitle,
        "old Workbench title should not be the default entry",
      ],
      [!logs.some((line) => line.includes("[pageerror]")), "no page errors"],
    ]
      .filter(([ok]) => !ok)
      .map(([, label]) => label);

    if (failed.length) {
      throw new Error(
        `Default Workspace Season One smoke failed:\n${JSON.stringify({ failed, metrics, logs }, null, 2)}`,
      );
    }
  } finally {
    await page.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
