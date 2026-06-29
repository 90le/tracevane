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
          waitUntil: "networkidle",
        });
        await page.waitForSelector("[data-workspace-season-one-frame]", {
          timeout: 30_000,
        });

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
            hasPrimaryStage: text.includes("Primary Stage"),
            hasEvidence: text.includes("Evidence"),
            hasRunPanel: text.includes("Run panel"),
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
          [metrics.hasPrimaryStage, "Primary Stage copy should render"],
          [metrics.hasEvidence, "Evidence text should render"],
          [metrics.hasRunPanel, "Run panel text should render"],
          [metrics.scrollWidth <= metrics.innerWidth + 24, "no horizontal overflow"],
          [metrics.activityVisible === expected.activityVisible, "activity visibility matches viewport"],
          [metrics.resourcesVisible === expected.resourcesVisible, "resources visibility matches viewport"],
          [metrics.contextVisible === expected.contextVisible, "context visibility matches viewport"],
          [metrics.mobileSwitcherVisible === expected.mobileSwitcherVisible, "mobile switcher visibility matches viewport"],
          [!logs.some((line) => line.includes("[pageerror]")), "no page errors"],
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
