from base64 import urlsafe_b64encode
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
import os
import re
import sqlite3


SESSION_KEY = os.environ.get("CHAT_HEAVY_SESSION_KEY", "").strip()
GATEWAY_TOKEN = os.environ.get("STUDIO_GATEWAY_TOKEN", "").strip()
SCREENSHOT = Path("/tmp/openclaw-studio-chat-session-rail-smoke.png")


def encode_session_ref(session_key: str) -> str:
    encoded = urlsafe_b64encode(session_key.encode("utf-8")).decode("ascii").rstrip("=")
    return f"r1_{encoded}"


def discover_session_key() -> str:
    root = Path(os.environ.get("OPENCLAW_ROOT", str(Path.home() / ".openclaw")))
    sqlite_path = root / "studio" / "chat.sqlite"
    if not sqlite_path.exists():
        return ""

    conn = sqlite3.connect(str(sqlite_path))
    try:
        row = conn.execute(
            """
            SELECT session_key
            FROM session_rows
            WHERE payload_json LIKE '%"kind":"studio_managed"%'
               OR payload_json LIKE '%"kind": "studio_managed"%'
            ORDER BY updated_at DESC
            LIMIT 1
            """
        ).fetchone()
        return str(row[0]) if row and row[0] else ""
    finally:
        conn.close()


def parse_hidden_count(text: str) -> int | None:
    match = re.search(r"(?:还有|Show)\s*(\d+)", text or "")
    return int(match.group(1)) if match else None


def read_rail_state(page, label: str) -> dict:
    return page.evaluate(
        """(label) => {
          const body = document.querySelector('.chat-shell-session-list__body');
          const button = document.querySelector('.chat-shell-session-show-more');
          return {
            label,
            missingBody: !body,
            scrollTop: body ? Math.round(body.scrollTop) : 0,
            scrollHeight: body ? Math.round(body.scrollHeight) : 0,
            clientHeight: body ? Math.round(body.clientHeight) : 0,
            rowCount: document.querySelectorAll('.chat-shell-session-row').length,
            showMoreVisible: !!button,
            showMoreText: button ? (button.textContent || '').trim() : '',
          };
        }""",
        label,
    )


def main() -> None:
    session_key = SESSION_KEY or discover_session_key()
    if not session_key:
        print(json.dumps({
            "skipped": True,
            "reason": "No visible chat session was found and CHAT_HEAVY_SESSION_KEY is not set",
        }, ensure_ascii=False, indent=2))
        return

    console_errors: list[str] = []
    result: dict = {"sessionKey": session_key}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1100})
        if GATEWAY_TOKEN:
            page.add_init_script(
                f"""() => {{
                  try {{
                    const token = {json.dumps(GATEWAY_TOKEN)};
                    window.localStorage.setItem('openclaw.studio.gatewayToken', token);
                    window.localStorage.setItem('openclaw-studio.gateway-token', token);
                    window.localStorage.removeItem('openclaw-studio.chat.shell-warm-cache');
                  }} catch {{}}
                }}"""
            )
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        page.goto(f"http://127.0.0.1:5176/chat/s/{encode_session_ref(session_key)}", wait_until="domcontentloaded")
        page.wait_for_selector(".chat-shell-session-list__body", timeout=20000)
        page.wait_for_timeout(5000)

        before = read_rail_state(page, "before-scroll")
        before_hidden_count = parse_hidden_count(before["showMoreText"])
        body = page.locator(".chat-shell-session-list__body")
        for _ in range(4):
            body.evaluate(
                """(el) => {
                  el.scrollTop = el.scrollHeight;
                  el.dispatchEvent(new Event('scroll', { bubbles: true }));
                }"""
            )
            page.wait_for_timeout(250)
        after = read_rail_state(page, "after-scroll")
        after_hidden_count = parse_hidden_count(after["showMoreText"])

        result.update({
            "before": before,
            "after": after,
            "beforeHiddenCount": before_hidden_count,
            "afterHiddenCount": after_hidden_count,
            "consoleErrors": console_errors,
            "checks": {
                "rail_present": not before.get("missingBody"),
                "no_console_errors": len(console_errors) == 0,
                "auto_revealed_when_hidden": (
                    before_hidden_count is None
                    or after["rowCount"] > before["rowCount"]
                    or after_hidden_count is None
                    or after_hidden_count < before_hidden_count
                ),
            },
        })

        if not all(result["checks"].values()):
            page.screenshot(path=str(SCREENSHOT), full_page=True)
            result["screenshot"] = str(SCREENSHOT)
            print(json.dumps(result, ensure_ascii=False, indent=2))
            raise SystemExit("session rail smoke failed")

        browser.close()

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
