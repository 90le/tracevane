#!/usr/bin/env python3
"""Browser smoke for the rebuilt apps/web Recovery (System Guard) console.

Loads each Recovery data-view at desktop + mobile widths against the dev
server, captures console errors / uncaught page errors, and checks for
horizontal overflow. Also asserts the live recovery status endpoint returns
data. Exits non-zero on any failure.

Usage: python3 scripts/smoke-web-recovery.py [--base http://127.0.0.1:5176]
"""
import json
import sys
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5176"
for i, a in enumerate(sys.argv):
    if a == "--base" and i + 1 < len(sys.argv):
        BASE = sys.argv[i + 1]

VIEWS = ["overview", "issues", "events", "backups"]
SIZES = [("desktop", 1440, 900), ("mobile", 390, 844)]

failures = []

# Live data check: /api/openclaw-recovery/status must return a status field.
try:
    with urllib.request.urlopen(f"{BASE}/api/openclaw-recovery/status", timeout=10) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    if not isinstance(payload, dict) or "status" not in payload:
        failures.append(f"status endpoint returned unexpected payload: {payload!r}")
    else:
        print(f"live /status OK — status={payload.get('status')!r} daemon={payload.get('daemon', {}).get('version')!r}")
except Exception as exc:  # noqa: BLE001
    failures.append(f"live /api/openclaw-recovery/status request failed: {exc}")

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
            url = f"{BASE}/#/recovery?view={view}"
            page.goto(url, wait_until="networkidle")
            page.wait_for_timeout(700)
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
print("SMOKE PASSED — all views render, no console errors, no overflow, live status OK.")
