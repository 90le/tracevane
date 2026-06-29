import { chromium } from "@playwright/test";

const BASE_URL = process.env.TRACEVANE_WEB_SMOKE_URL || "http://127.0.0.1:5176";
const CHROME =
  process.env.PLAYWRIGHT_CHROME_EXECUTABLE ||
  "/home/binbin/.local/bin/google-chrome";

const VIEWPORTS = [
  {
    name: "desktop",
    width: 1440,
    height: 900,
    expected: {
      activityVisible: true,
      resourcesVisible: true,
      contextVisible: true,
      mobileSwitcherVisible: false,
    },
  },
  {
    name: "tablet",
    width: 1024,
    height: 768,
    expected: {
      activityVisible: true,
      resourcesVisible: true,
      contextVisible: false,
      mobileSwitcherVisible: false,
    },
  },
  {
    name: "phone",
    width: 390,
    height: 844,
    isMobile: true,
    expected: {
      activityVisible: false,
      resourcesVisible: false,
      contextVisible: false,
      mobileSwitcherVisible: true,
    },
  },
];

async function run() {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox"],
  });
  const failures = [];

  try {
    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage({
        viewport: {
          width: viewport.width,
          height: viewport.height,
          isMobile: Boolean(viewport.isMobile),
        },
      });
      const logs = [];
      page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
      page.on("pageerror", (error) =>
        logs.push(`[pageerror] ${error.stack || error.message}`),
      );

      try {
        await page.goto(`${BASE_URL}/#/workspace/season-one`, {
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
          const visible = (selector) => {
            const node = document.querySelector(selector);
            if (!node) return false;
            const rect = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return (
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              rect.width > 0 &&
              rect.height > 0
            );
          };
          const doc = document.documentElement;
          const body = document.body;
          const text = body.innerText;
          const normalizedText = text.toLowerCase();
          return {
            title: document.title,
            scrollWidth: Math.max(doc.scrollWidth, body.scrollWidth),
            innerWidth: window.innerWidth,
            frameVisible: visible("[data-workspace-season-one-frame]"),
            topbarVisible: visible("[data-workspace-season-one-topbar]"),
            stageVisible: visible("[data-workspace-season-one-stage]"),
            bottomVisible: visible("[data-workspace-season-one-bottom-panel]"),
            activityVisible: visible("[data-workspace-season-one-activity]"),
            resourcesVisible: visible("[data-workspace-season-one-resources]"),
            contextVisible: visible("[data-workspace-season-one-context]"),
            mobileSwitcherVisible: visible(
              "[data-workspace-season-one-mobile-switcher]",
            ),
            hasSeasonOneText: text.includes("Tracevane Season One"),
            hasIdeStage: normalizedText.includes("ide stage"),
            hasEvidence: Boolean(
              document.querySelector("[data-season-one-evidence-rail]"),
            ),
            hasRunPanel: text.includes("Run panel"),
            hasLiveAdapterStatus: text.includes("Season One Live Adapter"),
            hasLiveFocusedPath: text.includes("DESIGN.md"),
            hasLiveEvidenceCount: text.includes("3 evidence items"),
            hasLiveTerminalRun: text.includes("Season One browser smoke"),
            hasLiveFilePreview:
              normalizedText.includes("live file preview:") ||
              normalizedText.includes("live document loaded from"),
            hasRebuildStudio: normalizedText.includes("rebuild studio"),
            hasLegacyReplacement: normalizedText.includes(
              "legacy shell replacement",
            ),
            hasCommandDeck: normalizedText.includes("command deck"),
            hasWorkbenchBanner: Boolean(
              document.querySelector("[data-season-one-workbench-banner]"),
            ),
            hasRealIdeStage: Boolean(
              document.querySelector("[data-season-one-real-ide-stage]"),
            ),
            hasEditorGrid: Boolean(
              document.querySelector("[data-season-one-editor-grid]"),
            ),
            hasLiveEditor: Boolean(
              document.querySelector("[data-season-one-live-editor]"),
            ),
            hasRedesignManifest: Boolean(
              document.querySelector("[data-season-one-redesign-manifest]"),
            ),
            hasCommandCenter: Boolean(
              document.querySelector("[data-season-one-command-center]"),
            ),
            hasResourceMap: Boolean(
              document.querySelector("[data-season-one-resource-map]"),
            ),
            hasPrimaryWorkstage: Boolean(
              document.querySelector("[data-season-one-primary-workstage]"),
            ),
            hasAiCopilot: Boolean(
              document.querySelector("[data-season-one-ai-copilot]"),
            ),
            hasWorkCanvas: Boolean(
              document.querySelector("[data-season-one-work-canvas]"),
            ),
            hasEvidenceRail: Boolean(
              document.querySelector("[data-season-one-evidence-rail]"),
            ),
            hasRunPanelRegion: Boolean(
              document.querySelector("[data-season-one-run-panel]"),
            ),
            hasMobileNavigation: Boolean(
              document.querySelector("[data-season-one-mobile-navigation]"),
            ),
            pageErrors: [],
          };
        });

        const expected = viewport.expected;
        const checks = [
          [metrics.frameVisible, "frame should be visible"],
          [metrics.topbarVisible, "topbar should be visible"],
          [metrics.stageVisible, "primary stage should be visible"],
          [metrics.bottomVisible, "bottom panel should be visible"],
          [metrics.hasSeasonOneText, "Season One title should render"],
          [metrics.hasIdeStage, "IDE Stage copy should render"],
          [metrics.hasEvidence, "Evidence text should render"],
          [metrics.hasRunPanel, "Run panel text should render"],
          [metrics.hasLiveAdapterStatus, "live adapter status should render"],
          [metrics.hasLiveFocusedPath, "live focused path should render"],
          [metrics.hasLiveEvidenceCount, "live evidence count should render"],
          [metrics.hasLiveTerminalRun, "live terminal run should render"],
          [
            metrics.hasLiveFilePreview,
            "live active file preview should render",
          ],
          [
            metrics.hasRebuildStudio,
            "visible rebuild studio marker should render",
          ],
          [
            metrics.hasLegacyReplacement,
            "legacy replacement marker should render",
          ],
          [metrics.hasCommandDeck, "command deck copy should render"],
          [metrics.hasWorkbenchBanner, "workbench banner should render"],
          [metrics.hasRealIdeStage, "real IDE stage region should render"],
          [metrics.hasEditorGrid, "editor grid region should render"],
          [metrics.hasLiveEditor, "live editor region should render"],
          [
            metrics.hasRedesignManifest,
            "redesign manifest region should render",
          ],
          [metrics.hasCommandCenter, "command center region should render"],
          [metrics.hasResourceMap, "resource map region should render"],
          [
            metrics.hasPrimaryWorkstage,
            "primary workstage region should render",
          ],
          [metrics.hasAiCopilot, "AI copilot region should render"],
          [metrics.hasWorkCanvas, "work canvas region should render"],
          [metrics.hasEvidenceRail, "evidence rail region should render"],
          [metrics.hasRunPanelRegion, "run panel region should render"],
          [
            metrics.hasMobileNavigation,
            "mobile navigation region should render",
          ],
          [
            metrics.scrollWidth <= metrics.innerWidth + 24,
            "no horizontal overflow",
          ],
          [
            metrics.activityVisible === expected.activityVisible,
            "activity visibility matches viewport",
          ],
          [
            metrics.resourcesVisible === expected.resourcesVisible,
            "resources visibility matches viewport",
          ],
          [
            metrics.contextVisible === expected.contextVisible,
            "context visibility matches viewport",
          ],
          [
            metrics.mobileSwitcherVisible === expected.mobileSwitcherVisible,
            "mobile switcher visibility matches viewport",
          ],
          [
            !logs.some((line) => line.includes("[pageerror]")),
            "no page errors",
          ],
        ];
        const failed = checks.filter(([ok]) => !ok).map(([, label]) => label);
        if (failed.length) {
          failures.push({ viewport: viewport.name, failed, metrics, logs });
        }
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }

  if (failures.length) {
    throw new Error(
      `Season One responsive smoke failed:\n${JSON.stringify(failures, null, 2)}`,
    );
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
