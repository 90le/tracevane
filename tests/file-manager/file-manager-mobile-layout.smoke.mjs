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
    viewport: { width: 390, height: 844, isMobile: true },
  });
  const logs = [];
  page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (error) =>
    logs.push(`[pageerror] ${error.stack || error.message}`),
  );
  try {
    await page.goto(`${BASE_URL}/#/file-manager`, {
      waitUntil: "domcontentloaded",
    });
    await page.evaluate(() =>
      window.localStorage.removeItem("tracevane:file-manager:session-state:v1"),
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-file-manager-header-title]", {
      timeout: 30_000,
    });
    await page.waitForSelector("[data-file-manager-list]", { timeout: 30_000 });
    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const body = document.body;
      const header = document
        .querySelector("[data-file-manager-header-title]")
        ?.getBoundingClientRect();
      const navActions = document.querySelector(
        "[data-file-manager-actions-menu]",
      );
      const list = document
        .querySelector("[data-file-manager-list]")
        ?.getBoundingClientRect();
      const pathInput = document
        .querySelector('[aria-label="编辑文件夹路径，按 Enter 跳转"]')
        ?.getBoundingClientRect();
      const oversized = Array.from(document.querySelectorAll("body *"))
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            tag: node.tagName,
            width: rect.width,
            left: rect.left,
            right: rect.right,
            attr:
              node.getAttribute("data-file-manager-actions-menu") ??
              node.getAttribute("data-file-manager-list") ??
              node.getAttribute("data-file-manager-header-title") ??
              "",
          };
        })
        .filter(
          (item) =>
            item.width > window.innerWidth + 24 &&
            item.right > window.innerWidth + 24,
        )
        .slice(0, 8);
      return {
        innerWidth: window.innerWidth,
        scrollWidth: Math.max(doc.scrollWidth, body.scrollWidth),
        header: header ? { width: header.width, height: header.height } : null,
        list: list ? { width: list.width, height: list.height } : null,
        pathInput: pathInput
          ? { width: pathInput.width, height: pathInput.height }
          : null,
        desktopActionsDisplay: navActions
          ? getComputedStyle(navActions).display
          : null,
        oversized,
        bodyText: body.innerText.slice(0, 800),
      };
    });
    if (!metrics.header || metrics.header.height > 72)
      throw new Error(
        `Mobile header is stacked or missing: ${JSON.stringify(metrics.header)}`,
      );
    if (!metrics.list || metrics.list.width < 300 || metrics.list.height < 240)
      throw new Error(
        `Mobile file list has invalid size: ${JSON.stringify(metrics.list)}`,
      );
    if (!metrics.pathInput || metrics.pathInput.width < 220)
      throw new Error(
        `Mobile path input is too narrow: ${JSON.stringify(metrics.pathInput)}`,
      );
    if (metrics.desktopActionsDisplay === "none")
      throw new Error("Mobile action menu should stay reachable");
    if (metrics.scrollWidth > metrics.innerWidth + 24)
      throw new Error(
        `Page has horizontal overflow on mobile: ${JSON.stringify(metrics)}`,
      );
    if (!metrics.bodyText.includes("文件管理器"))
      throw new Error(
        `Mobile file manager body looks blank: ${JSON.stringify(metrics)}`,
      );

    await page.locator("[data-file-manager-actions-menu] summary").click();
    await page
      .locator("[data-file-manager-actions-popover]")
      .waitFor({ timeout: 10_000 });
    const actionSheet = await page.evaluate(() => {
      const sheet = document.querySelector(
        "[data-file-manager-actions-popover]",
      );
      const duplicateDock = document.querySelector(
        "[data-file-manager-mobile-action-dock]",
      );
      const rect = sheet?.getBoundingClientRect();
      return {
        position: sheet ? getComputedStyle(sheet).position : null,
        hasDuplicateDock: Boolean(duplicateDock),
        innerWidth: window.innerWidth,
        scrollWidth: Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ),
        rect: rect
          ? {
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
            }
          : null,
        text: sheet?.textContent?.slice(0, 400) ?? "",
      };
    });
    if (actionSheet.hasDuplicateDock)
      throw new Error(
        `Mobile should not render duplicate action docks: ${JSON.stringify(actionSheet)}`,
      );
    if (actionSheet.position !== "fixed")
      throw new Error(
        `Mobile action sheet should be fixed: ${JSON.stringify(actionSheet)}`,
      );
    if (
      !actionSheet.rect ||
      actionSheet.rect.left < 0 ||
      actionSheet.rect.right > actionSheet.innerWidth + 1
    ) {
      throw new Error(
        `Mobile action sheet is out of viewport: ${JSON.stringify(actionSheet)}`,
      );
    }
    if (actionSheet.scrollWidth > actionSheet.innerWidth + 24) {
      throw new Error(
        `Mobile action sheet caused horizontal overflow: ${JSON.stringify(actionSheet)}`,
      );
    }
    if (
      !actionSheet.text.includes("上传到当前目录") ||
      !actionSheet.text.includes("显示隐藏文件")
    ) {
      throw new Error(
        `Mobile action sheet content is incomplete: ${JSON.stringify(actionSheet)}`,
      );
    }
    if (logs.some((line) => line.includes("[pageerror]"))) {
      throw new Error(
        `Browser page error during mobile layout smoke:\n${logs.join("\n")}`,
      );
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
