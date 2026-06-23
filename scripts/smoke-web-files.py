#!/usr/bin/env python3
"""Browser smoke for the rebuilt apps/web File & Git evidence browser (/files).

Loads /#/files at desktop + mobile widths against the dev server, captures
console errors / uncaught page errors, checks for horizontal overflow, and
asserts the live read APIs (/api/files/browse + /api/files/search) return data
against the real repo. Exits non-zero on any failure.

Usage: python3 scripts/smoke-web-files.py [--base http://127.0.0.1:5176]
"""
import sys
import urllib.request
import urllib.parse
import json
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5176"
for i, a in enumerate(sys.argv):
    if a == "--base" and i + 1 < len(sys.argv):
        BASE = sys.argv[i + 1]

SIZES = [("desktop", 1440, 900), ("mobile", 390, 844)]

failures = []


def get_json(path):
    with urllib.request.urlopen(f"{BASE}{path}", timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


# --- Live API checks (real repo data) --------------------------------------
try:
    summary = get_json("/api/files/summary")
    roots = summary.get("roots", [])
    if not roots:
        failures.append("api: /api/files/summary returned no roots")
    root_id = ""
    for r in roots:
        if r.get("id") == "project-root":
            root_id = r["id"]
            break
    if not root_id and roots:
        root_id = roots[0].get("id", "")
    if root_id:
        browse = get_json(f"/api/files/browse?rootId={root_id}&hidden=false&pageSize=50")
        entries = browse.get("entries", [])
        print(f"api: /api/files/browse rootId={root_id} entries={len(entries)}")
        if not entries:
            failures.append("api: /api/files/browse returned no entries")

        q = urllib.parse.urlencode(
            {"rootId": root_id, "q": "package", "recursive": "true", "hidden": "false"}
        )
        search = get_json(f"/api/files/search?{q}")
        results = search.get("results", [])
        print(f"api: /api/files/search q=package results={len(results)}")
        if "results" not in search:
            failures.append("api: /api/files/search missing 'results' field")

        status = get_json(f"/api/git/status?rootId={root_id}")
        print(
            f"api: /api/git/status branch={status.get('branch')} "
            f"available={status.get('available')} changes={len(status.get('changes', []))}"
        )
        if not status.get("available"):
            failures.append("api: /api/git/status reports repo unavailable")
    else:
        failures.append("api: could not resolve a file root id")
except Exception as e:
    failures.append(f"api: live read API check failed: {e}")

# --- Browser render checks --------------------------------------------------
with sync_playwright() as p:
    browser = p.chromium.launch()
    for size_name, w, h in SIZES:
        ctx = browser.new_context(viewport={"width": w, "height": h})
        page = ctx.new_page()
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        url = f"{BASE}/#/files"
        page.goto(url, wait_until="networkidle")
        page.wait_for_timeout(900)
        root_len = page.eval_on_selector("#root", "el => el.innerText.length")
        overflow = page.evaluate(
            "() => document.documentElement.scrollWidth - document.documentElement.clientWidth"
        )
        tag = f"[{size_name}] /files"
        if root_len < 5:
            failures.append(f"{tag}: #root nearly empty (len={root_len}) — render failed")
        if errors:
            failures.append(f"{tag}: {len(errors)} console/page error(s): {errors[:3]}")
        if overflow > 1:
            failures.append(f"{tag}: horizontal overflow {overflow}px")
        status = "OK" if not (root_len < 5 or errors or overflow > 1) else "FAIL"
        print(f"{tag:<24} rootLen={root_len:<5} overflow={overflow:<4} errors={len(errors)}  {status}")
        ctx.close()
    browser.close()

print("-" * 50)
if failures:
    print(f"SMOKE FAILED ({len(failures)} issue(s)):")
    for f in failures:
        print("  -", f)
    sys.exit(1)
print("SMOKE PASSED — /files renders, live read APIs return data, no console errors, no overflow.")
