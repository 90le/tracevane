#!/usr/bin/env python3
"""Browser smoke for the rebuilt apps/web Approvals hub (/approvals).

Tracevane has NO dedicated approvals backend: approvals happen in-context (chat
tool-approval toolbar + IM permission-card threads). This page is an honest
aggregation of the real approval-adjacent signals that ARE queryable (chat
host-management-exec policy, active chat runs with tool calls, channel
permission posture, recent channel turn failures) plus deep-links. An EMPTY
roster is the common, correct state — it is still a valid pass.

This loads `/#/approvals` at desktop + mobile widths against the dev server,
exercises each risk filter tab, opens an item's detail inspector when one is
present (drawer on mobile), captures console / page errors, and checks for
horizontal overflow. It never fabricates rows and never asserts that rows must
exist. Exits non-zero on any failure.

Usage: python3 scripts/smoke-web-approvals.py [--base http://127.0.0.1:5176]
"""
import sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5176"
for i, a in enumerate(sys.argv):
    if a == "--base" and i + 1 < len(sys.argv):
        BASE = sys.argv[i + 1]

FILTERS = ["全部", "待处理", "建议复核", "提示"]
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

        url = f"{BASE}/#/approvals"
        page.goto(url, wait_until="networkidle")
        # Give polling + synthesis a beat to settle.
        page.wait_for_timeout(900)

        # Exercise each risk filter tab.
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

        # Open a detail inspector if any approval item is present (drawer on mobile).
        errors.clear()
        page.get_by_role("tab", name="全部", exact=False).first.click()
        page.wait_for_timeout(250)
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
            print(f"[{size_name}] detail-open           (no approval items — in-context empty state, OK)")

        ctx.close()
    browser.close()

print("-" * 50)
if failures:
    print(f"SMOKE FAILED ({len(failures)} issue(s)):")
    for f in failures:
        print("  -", f)
    sys.exit(1)
print("SMOKE PASSED — approvals hub renders across filters + detail, no console errors, no overflow.")
