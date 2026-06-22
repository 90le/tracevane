#!/usr/bin/env python3
"""Browser smoke for the rebuilt apps/web Channel Connectors (/im-channels).

Loads each Channel Connectors data-view at desktop + mobile widths against the
dev server, captures console errors / uncaught page errors, and checks for
horizontal overflow. Exits non-zero on any failure.

Usage: python3 scripts/smoke-web-im-channels.py [--base http://127.0.0.1:5176]
"""
import sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5176"
for i, a in enumerate(sys.argv):
    if a == "--base" and i + 1 < len(sys.argv):
        BASE = sys.argv[i + 1]

VIEWS = ["overview", "bindings", "sessions", "logs"]
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
        for view in VIEWS:
            errors.clear()
            url = f"{BASE}/#/im-channels?view={view}"
            page.goto(url, wait_until="networkidle")
            page.wait_for_timeout(700)
            # rendered something inside #root?
            root_len = page.eval_on_selector("#root", "el => el.innerText.length")
            overflow = page.evaluate(
                "() => document.documentElement.scrollWidth - document.documentElement.clientWidth"
            )
            tag = f"[{size_name}] {view}"
            if root_len < 5:
                failures.append(f"{tag}: #root nearly empty (len={root_len}) — render failed")
            if errors:
                failures.append(f"{tag}: {len(errors)} console/page error(s): {errors[:3]}")
            if overflow > 1:
                failures.append(f"{tag}: horizontal overflow {overflow}px")
            status = "OK" if not (root_len < 5 or errors or overflow > 1) else "FAIL"
            print(f"{tag:<26} rootLen={root_len:<5} overflow={overflow:<4} errors={len(errors)}  {status}")
        ctx.close()
    browser.close()

print("-" * 50)
if failures:
    print(f"SMOKE FAILED ({len(failures)} issue(s)):")
    for f in failures:
        print("  -", f)
    sys.exit(1)
print("SMOKE PASSED — all views render, no console errors, no overflow.")
