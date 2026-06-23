#!/usr/bin/env python3
"""Browser smoke for the rebuilt apps/web Long-task supervision console (/long-tasks).

The console is a single List-Detail page with coarse status filters. This loads
`/#/long-tasks` at desktop + mobile widths against the dev server, exercises each
filter tab, opens a row's detail inspector when one is present (which on mobile
slides the detail in as a drawer), captures console errors / uncaught page
errors, and checks for horizontal overflow. Exits non-zero on any failure.

Honest-supervision note: the console synthesizes read sources; with no live
long tasks it renders the empty state, which is still a valid pass (render +
no errors + no overflow). It never fabricates rows.

Usage: python3 scripts/smoke-web-long-tasks.py [--base http://127.0.0.1:5176]
"""
import sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5176"
for i, a in enumerate(sys.argv):
    if a == "--base" and i + 1 < len(sys.argv):
        BASE = sys.argv[i + 1]

FILTERS = ["全部", "运行中", "等待", "需关注", "已完成"]
SIZES = [("desktop", 1440, 900), ("mobile", 390, 844)]

failures = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for size_name, w, h in SIZES:
        ctx = browser.new_context(viewport={"width": w, "height": h})
        page = ctx.new_page()
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

        url = f"{BASE}/#/long-tasks"
        page.goto(url, wait_until="networkidle")
        # Give polling + synthesis a beat to settle.
        page.wait_for_timeout(900)

        # Exercise each filter tab, then try opening a detail row.
        for label in FILTERS:
            errors.clear()
            tab = page.get_by_role("tab", name=label, exact=False)
            try:
                if tab.count() > 0:
                    tab.first.click()
                    page.wait_for_timeout(250)
            except Exception as exc:  # noqa: BLE001
                failures.append(f"[{size_name}] filter '{label}': click failed: {exc}")

            root_len = page.eval_on_selector("#root", "el => el.innerText.length")
            overflow = page.evaluate(
                "() => document.documentElement.scrollWidth - document.documentElement.clientWidth"
            )
            tag = f"[{size_name}] {label}"
            if root_len < 5:
                failures.append(f"{tag}: #root nearly empty (len={root_len}) — render failed")
            if errors:
                failures.append(f"{tag}: {len(errors)} console/page error(s): {errors[:3]}")
            if overflow > 1:
                failures.append(f"{tag}: horizontal overflow {overflow}px")
            status = "OK" if not (root_len < 5 or errors or overflow > 1) else "FAIL"
            print(f"{tag:<26} rootLen={root_len:<5} overflow={overflow:<4} errors={len(errors)}  {status}")

        # Open a detail inspector if any supervised row is present (drawer on mobile).
        errors.clear()
        page.get_by_role("tab", name="全部", exact=False).first.click()
        page.wait_for_timeout(250)
        # Rows are <button> elements rendered by the shared Row helper. Pick the
        # first one inside the list panel that is not a filter tab.
        rows = page.locator("button:has(strong)")
        if rows.count() > 0:
            try:
                rows.first.click()
                page.wait_for_timeout(350)
                overflow = page.evaluate(
                    "() => document.documentElement.scrollWidth - document.documentElement.clientWidth"
                )
                tag = f"[{size_name}] detail-open"
                if errors:
                    failures.append(f"{tag}: {len(errors)} console/page error(s): {errors[:3]}")
                if overflow > 1:
                    failures.append(f"{tag}: horizontal overflow {overflow}px")
                status = "OK" if not (errors or overflow > 1) else "FAIL"
                print(f"{tag:<26} overflow={overflow:<4} errors={len(errors)}  {status}")
            except Exception as exc:  # noqa: BLE001
                failures.append(f"[{size_name}] detail-open: row click failed: {exc}")
        else:
            print(f"[{size_name}] detail-open           (no supervised rows — empty state, OK)")

        ctx.close()
    browser.close()

print("-" * 50)
if failures:
    print(f"SMOKE FAILED ({len(failures)} issue(s)):")
    for f in failures:
        print("  -", f)
    sys.exit(1)
print("SMOKE PASSED — console renders across filters + detail, no console errors, no overflow.")
