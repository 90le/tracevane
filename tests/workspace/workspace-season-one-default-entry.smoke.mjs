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
        const buffer = document.querySelector("[data-season-one-edit-buffer]");
        const bufferValue =
          buffer instanceof HTMLTextAreaElement ? buffer.value.toLowerCase() : "";
        return (
          text.includes("live file preview:") ||
          text.includes("live document loaded from") ||
          bufferValue.includes("live file preview:")
        );
      },
      { timeout: 10_000 },
    );

    await page.click("[data-season-one-open-draft]");
    await page.fill(
      "[data-season-one-edit-buffer]",
      "// smoke draft edit\nconst seasonOne = 'real editable IDE';",
    );
    await page.click("[data-season-one-open-diff]");

    const metrics = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      const buffer = document.querySelector("[data-season-one-edit-buffer]");
      const bufferValue =
        buffer instanceof HTMLTextAreaElement ? buffer.value.toLowerCase() : "";
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
          text.includes("live document loaded from") ||
          bufferValue.includes("live file preview:"),
        hasRealIdeStage: Boolean(
          document.querySelector("[data-season-one-real-ide-stage]"),
        ),
        hasEditorGrid: Boolean(
          document.querySelector("[data-season-one-editor-grid]"),
        ),
        hasLiveEditor: Boolean(
          document.querySelector("[data-season-one-live-editor]"),
        ),
        hasEditBuffer: Boolean(
          document.querySelector("[data-season-one-edit-buffer]"),
        ),
        editMode: document
          .querySelector("[data-season-one-edit-buffer]")
          ?.getAttribute("data-season-one-edit-mode"),
        editDirty: document
          .querySelector("[data-season-one-edit-buffer]")
          ?.getAttribute("data-season-one-edit-dirty"),
        diffShowsDraft: bufferValue.includes("real editable ide"),
        applyLocked: Boolean(
          document.querySelector("[data-season-one-apply-disabled]:disabled"),
        ),
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
        metrics.hasRealIdeStage,
        "real IDE stage should render on /workspace",
      ],
      [metrics.hasEditorGrid, "editor grid should render on /workspace"],
      [metrics.hasLiveEditor, "live editor should render on /workspace"],
      [metrics.hasEditBuffer, "editable buffer should render on /workspace"],
      [metrics.editMode === "diff", "diff mode should be reachable"],
      [metrics.editDirty === "true", "draft dirty state should be tracked"],
      [metrics.diffShowsDraft, "diff preview should include draft edit"],
      [metrics.applyLocked, "apply should stay locked without evidence approval"],
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
