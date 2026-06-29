import { chromium } from "@playwright/test";

const BASE_URL = process.env.TRACEVANE_WEB_SMOKE_URL || "http://127.0.0.1:5176";
const CHROME =
  process.env.PLAYWRIGHT_CHROME_EXECUTABLE ||
  "/home/binbin/.local/bin/google-chrome";

async function api(pathname, options = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(
      `${options.method ?? "GET"} ${pathname} failed ${response.status}: ${text}`,
    );
  }
  return data;
}

async function cleanup(rootId, smokeDir) {
  await api("/api/files", {
    method: "DELETE",
    body: JSON.stringify({ rootId, paths: [smokeDir], permanent: true }),
  }).catch(() => undefined);
  await api("/api/files/content-index/clean", {
    method: "POST",
    body: JSON.stringify({ rootId }),
  }).catch(() => undefined);
}

async function run() {
  const summary = await api("/api/files/summary");
  const rootId = summary.defaultRootId ?? summary.roots?.[0]?.id;
  if (!rootId) throw new Error("No file-manager root is available");

  const smokeDir = `tracevane-index-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fileName = "content-index-smoke.md";
  const filePath = `${smokeDir}/${fileName}`;
  const content = [
    "# Tracevane content index smoke",
    "",
    `- directory: ${smokeDir}`,
    "- verifies paginated content-index records, current-page CSV export, and mobile card layout.",
  ].join("\n");

  await api("/api/files/directories", {
    method: "POST",
    body: JSON.stringify({ rootId, directoryPath: "", name: smokeDir }),
  });
  await api("/api/files/files", {
    method: "POST",
    body: JSON.stringify({
      rootId,
      directoryPath: smokeDir,
      name: fileName,
      content,
      overwrite: true,
    }),
  });

  const rebuild = await api("/api/files/content-index/rebuild", {
    method: "POST",
    body: JSON.stringify({ rootId }),
  });
  if (
    !Number.isFinite(rebuild.rebuiltRecordCount) ||
    rebuild.rebuiltRecordCount < 1
  ) {
    throw new Error(
      `Content index rebuild did not report records: ${JSON.stringify(rebuild)}`,
    );
  }

  const recordSearch = new URLSearchParams({
    rootId,
    status: "valid",
    query: smokeDir,
    offset: "0",
    limit: "10",
  });
  const indexed = await api(
    `/api/files/content-index/records?${recordSearch.toString()}`,
  );
  const createdRecord = indexed.records?.find(
    (record) => record.path === filePath && record.status === "valid",
  );
  if (!createdRecord) {
    throw new Error(
      `Created smoke file is missing from content index: ${JSON.stringify(indexed)}`,
    );
  }

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const logs = [];
  page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (error) =>
    logs.push(`[pageerror] ${error.stack || error.message}`),
  );

  try {
    await page.goto(`${BASE_URL}/#/file-manager`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("button", { name: /内容索引/ })
      .click({ timeout: 30_000 });
    await page.getByText("全局内容索引").waitFor({ timeout: 30_000 });
    await page.waitForSelector("[data-content-index-records-table]", {
      timeout: 30_000,
    });
    await page.getByLabel("搜索索引记录").fill(smokeDir);
    await page
      .locator("[data-content-index-records-table]")
      .getByText(filePath)
      .waitFor({ timeout: 30_000 });
    await page.getByText("后端分页").waitFor({ timeout: 30_000 });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("[data-content-index-export-current-page]").click(),
    ]);
    const suggestedName = download.suggestedFilename();
    if (!/^tracevane-content-index-.*\.csv$/.test(suggestedName)) {
      throw new Error(`Unexpected CSV filename: ${suggestedName}`);
    }
    await download.delete().catch(() => undefined);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForSelector("[data-content-index-records-scrollport]", {
      timeout: 30_000,
    });
    await page.waitForSelector("[data-content-index-record-card]", {
      timeout: 30_000,
    });
    await page
      .locator("[data-content-index-records-scrollport]")
      .getByText(filePath)
      .waitFor({ timeout: 30_000 });

    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const body = document.body;
      const recordsScrollport = document
        .querySelector("[data-content-index-records-scrollport]")
        ?.getBoundingClientRect();
      const table = document.querySelector(
        "[data-content-index-records-table]",
      );
      const scrollport = document.querySelector(
        "[data-content-index-records-scrollport]",
      );
      const oversized = Array.from(document.querySelectorAll("body *"))
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            tag: node.tagName,
            width: rect.width,
            left: rect.left,
            right: rect.right,
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
        recordsScrollport: recordsScrollport
          ? { width: recordsScrollport.width, height: recordsScrollport.height }
          : null,
        tableDisplay: table ? getComputedStyle(table).display : null,
        scrollportDisplay: scrollport
          ? getComputedStyle(scrollport).display
          : null,
        oversized,
        bodyText: body.innerText.slice(0, 1200),
      };
    });
    if (
      !metrics.recordsScrollport ||
      metrics.recordsScrollport.width < 300 ||
      metrics.recordsScrollport.height < 80
    ) {
      throw new Error(
        `Content-index records scrollport has invalid size: ${JSON.stringify(metrics)}`,
      );
    }
    if (metrics.scrollportDisplay === "none") {
      throw new Error(
        `Content-index records scrollport is hidden on mobile: ${JSON.stringify(metrics)}`,
      );
    }
    if (metrics.scrollWidth > metrics.innerWidth + 24) {
      throw new Error(
        `Content-index page overflows horizontally on mobile: ${JSON.stringify(metrics)}`,
      );
    }
    if (
      !metrics.bodyText.includes("全局内容索引") ||
      !metrics.bodyText.includes(filePath)
    ) {
      throw new Error(
        `Content-index mobile page looks blank or unfiltered: ${JSON.stringify(metrics)}`,
      );
    }
    if (metrics.oversized.length) {
      throw new Error(
        `Content-index mobile page has oversized elements: ${JSON.stringify(metrics)}`,
      );
    }
    if (logs.some((line) => line.includes("[pageerror]"))) {
      throw new Error(
        `Browser page error during content-index smoke:\n${logs.join("\n")}`,
      );
    }
  } finally {
    await browser.close().catch(() => undefined);
    await cleanup(rootId, smokeDir);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
