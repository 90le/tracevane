#!/usr/bin/env python3
"""Browser smoke for the rebuilt apps/web Chat Agent Operations Workbench (/chat).

Loads the chat workbench (read surface + inspector tabs) at desktop + mobile
widths against the dev server, captures console errors / uncaught page errors,
and checks for horizontal overflow. Exits non-zero on any failure.

The read workbench (session roster, conversation history, evidence inspector,
queue / controls / diagnostics tabs) is exercised here. Live send/stream needs a
real agent + active gateway run, so it is NOT part of this headless smoke; the
send composer + SSE wiring are verified via typecheck/build and render their
pending/streaming states once a run is active.

Usage: python3 scripts/smoke-web-chat.py [--base http://127.0.0.1:5176]
"""
import sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5176"
for i, a in enumerate(sys.argv):
    if a == "--base" and i + 1 < len(sys.argv):
        BASE = sys.argv[i + 1]

# The chat workbench is single-route; the inspector tabs are in-page state, so
# we drive them via clicks after load rather than via URL views.
INSPECTOR_TABS = ["证据", "队列", "控制", "诊断"]
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

        errors.clear()
        url = f"{BASE}/#/chat"
        page.goto(url, wait_until="networkidle")
        page.wait_for_timeout(800)

        root_len = page.eval_on_selector("#root", "el => el.innerText.length")
        overflow = page.evaluate(
            "() => document.documentElement.scrollWidth - document.documentElement.clientWidth"
        )
        tag = f"[{size_name}] /chat"
        if root_len < 5:
            failures.append(f"{tag}: #root nearly empty (len={root_len}) — render failed")
        if overflow > 1:
            failures.append(f"{tag}: horizontal overflow {overflow}px")
        if errors:
            failures.append(f"{tag}: {len(errors)} console/page error(s): {errors[:3]}")
        status = "OK" if not (root_len < 5 or overflow > 1 or errors) else "FAIL"
        print(f"{tag:<26} rootLen={root_len:<5} overflow={overflow:<4} errors={len(errors)}  {status}")

        # Exercise the inspector tabs. On mobile they live behind the 证据 drawer.
        if size_name == "mobile":
            try:
                page.get_by_role("button", name="证据").first.click()
                page.wait_for_timeout(400)
            except Exception:
                pass
        for label in INSPECTOR_TABS:
            errors.clear()
            try:
                page.get_by_role("button", name=label).first.click()
                page.wait_for_timeout(300)
            except Exception as exc:
                failures.append(f"[{size_name}] tab {label}: click failed ({exc})")
                continue
            overflow = page.evaluate(
                "() => document.documentElement.scrollWidth - document.documentElement.clientWidth"
            )
            ttag = f"[{size_name}] tab:{label}"
            if errors:
                failures.append(f"{ttag}: {len(errors)} error(s): {errors[:3]}")
            if overflow > 1:
                failures.append(f"{ttag}: horizontal overflow {overflow}px")
            tstatus = "OK" if not (errors or overflow > 1) else "FAIL"
            print(f"{ttag:<26} overflow={overflow:<4} errors={len(errors)}  {tstatus}")

        ctx.close()
    browser.close()

print("-" * 50)
if failures:
    print(f"SMOKE FAILED ({len(failures)} issue(s)):")
    for f in failures:
        print("  -", f)
    sys.exit(1)
print("SMOKE PASSED — chat workbench renders, no console errors, no overflow.")
