from __future__ import annotations

import json
import os
import sqlite3
from base64 import urlsafe_b64encode
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


def encode_session_ref(session_key: str) -> str:
    encoded = urlsafe_b64encode(session_key.encode("utf-8")).decode("ascii").rstrip("=")
    return f"r1_{encoded}"


def discover_history_session_key() -> str:
    root = Path(os.environ.get("OPENCLAW_ROOT", str(Path.home() / ".openclaw")))
    sqlite_path = root / "studio" / "chat.sqlite"
    if not sqlite_path.exists():
        return ""

    conn = sqlite3.connect(str(sqlite_path))
    try:
        rows = conn.execute(
            """
            SELECT session_key, COUNT(*) AS message_count
            FROM mirror_messages
            GROUP BY session_key
            ORDER BY message_count DESC
            LIMIT 50
            """
        ).fetchall()

        def is_visible_studio_session(session_key: str) -> bool:
            session_row = conn.execute(
                "SELECT payload_json FROM session_rows WHERE session_key = ? LIMIT 1",
                (session_key,),
            ).fetchone()
            if not session_row:
                return True
            try:
                payload = json.loads(session_row[0])
            except Exception:
                payload = {}
            if payload.get("kind") != "studio_managed":
                return False
            permissions = payload.get("permissions") or {}
            if permissions.get("visibleInFrontend") is False:
                return False
            presentation = payload.get("presentation") or {}
            if presentation.get("archived") is True:
                return False
            return True

        for min_count in (100, 20, 1):
            for session_key, message_count in rows:
                if (
                    session_key
                    and int(message_count or 0) >= min_count
                    and is_visible_studio_session(str(session_key))
                ):
                    return str(session_key)
    finally:
        conn.close()
    return ""


def wait_for_chat_thread_ready(page) -> None:
    page.wait_for_selector(".chat-conversation-thread", timeout=30000)
    page.wait_for_function(
        """() => {
          const thread = document.querySelector('.chat-conversation-thread');
          const empty = document.querySelector('.chat-conversation-empty');
          const emptyText = (empty?.textContent || '').trim();
          const stillLoading = emptyText.includes('正在读取') || emptyText.includes('Loading conversation');
          return !!thread && (
            document.querySelectorAll('.chat-message-bubble').length > 0
            || (!!empty && !stillLoading)
          );
        }""",
        timeout=30000,
    )


def read_thread_state(page, label: str) -> dict[str, object]:
    return page.evaluate(
        """(label) => {
          const thread = document.querySelector('.chat-conversation-thread');
          return {
            label,
            url: window.location.href,
            scrollTop: thread ? Math.round(thread.scrollTop) : null,
            scrollHeight: thread ? Math.round(thread.scrollHeight) : null,
            clientHeight: thread ? Math.round(thread.clientHeight) : null,
            bottomDistance: thread ? Math.max(0, Math.round(thread.scrollHeight - thread.scrollTop - thread.clientHeight)) : null,
            jumpVisible: !!document.querySelector('.chat-conversation-thread__jump-fab'),
            historyBannerVisible: !!document.querySelector('.chat-conversation-thread__history-banner'),
            activeSessionKey: document.querySelector('.chat-shell-session-row.active')?.getAttribute('data-session-key') || '',
          };
        }""",
        label,
    )


def read_viewport_storage(page, session_key: str) -> str | None:
    return page.evaluate(
        """(sessionKey) => {
          return window.localStorage.getItem(`openclaw-studio.chat.session-viewport:${sessionKey}`);
        }""",
        session_key,
    )


def click_first_other_visible_session(page, current_session_key: str) -> str:
    return page.evaluate(
        """(currentSessionKey) => {
          const row = Array.from(document.querySelectorAll('.chat-shell-session-row')).find((item) => {
            const key = item.getAttribute('data-session-key') || '';
            return key && key !== currentSessionKey;
          });
          if (!row) {
            return '';
          }
          const button = row.querySelector('.chat-shell-session-item');
          button?.click();
          return row.getAttribute('data-session-key') || '';
        }""",
        current_session_key,
    )


def main() -> None:
    session_key = discover_history_session_key()
    if not session_key:
        print(json.dumps({
            "skipped": True,
            "reason": "No persisted chat history session was found",
        }, ensure_ascii=False, indent=2))
        return

    console_errors: list[str] = []
    result: dict[str, object] = {
        "sessionKey": session_key,
    }

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 1000})
            page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)

            page.goto(
                f"http://127.0.0.1:5176/chat/s/{encode_session_ref(session_key)}",
                wait_until="domcontentloaded",
                timeout=30000,
            )
            wait_for_chat_thread_ready(page)
            page.wait_for_timeout(3500)

            thread = page.locator(".chat-conversation-thread").first
            thread.hover()
            for _ in range(4):
                page.mouse.wheel(0, -900)
                page.wait_for_timeout(350)
            page.wait_for_timeout(1300)
            before_switch = read_thread_state(page, "before-switch")
            result["before"] = before_switch
            result["storageBeforeReload"] = read_viewport_storage(page, session_key)

            page.reload(wait_until="domcontentloaded", timeout=30000)
            wait_for_chat_thread_ready(page)
            page.wait_for_timeout(2200)
            after_reload = read_thread_state(page, "after-reload")
            result["afterReload"] = after_reload

            other_session_key = click_first_other_visible_session(page, session_key)
            result["otherSessionKey"] = other_session_key
            if not other_session_key:
                print(json.dumps({
                    "skipped": True,
                    "reason": "No second visible session row was available for session switch testing",
                    **result,
                }, ensure_ascii=False, indent=2))
                browser.close()
                return

            page.wait_for_function(
                """(sessionKey) => document.querySelector('.chat-shell-session-row.active')?.getAttribute('data-session-key') === sessionKey""",
                arg=other_session_key,
                timeout=30000,
            )
            page.wait_for_timeout(1000)

            page.go_back(wait_until="domcontentloaded", timeout=30000)
            wait_for_chat_thread_ready(page)
            page.wait_for_timeout(2200)
            after_return = read_thread_state(page, "after-return")
            result["after"] = after_return
            browser.close()
    except PlaywrightTimeoutError as error:
        raise AssertionError(f"session viewport smoke timed out: {error}") from error

    client_height = int(result.get("before", {}).get("clientHeight") or 1)  # type: ignore[union-attr]
    before_bottom_distance = int(result.get("before", {}).get("bottomDistance") or 0)  # type: ignore[union-attr]
    reload_bottom_distance = int(result.get("afterReload", {}).get("bottomDistance") or 0)  # type: ignore[union-attr]
    after_bottom_distance = int(result.get("after", {}).get("bottomDistance") or 0)  # type: ignore[union-attr]
    try:
        storage_before_reload = json.loads(str(result.get("storageBeforeReload") or "{}"))
    except Exception:
        storage_before_reload = {}
    stored_anchor_offset = int(storage_before_reload.get("anchorOffset") or 0)
    checks = {
        "browse_established_before_switch": before_bottom_distance > client_height,
        "stored_anchor_prefers_in_view_message": stored_anchor_offset >= -32,
        "reload_returned_to_same_session": encode_session_ref(session_key) in str(result.get("afterReload", {}).get("url") or ""),  # type: ignore[union-attr]
        "reload_not_reset_to_latest": bool(result.get("afterReload", {}).get("jumpVisible") or result.get("afterReload", {}).get("historyBannerVisible")),  # type: ignore[union-attr]
        "reload_retained_history_context": (
            reload_bottom_distance >= before_bottom_distance * 0.35
            or bool(result.get("afterReload", {}).get("jumpVisible") or result.get("afterReload", {}).get("historyBannerVisible"))  # type: ignore[union-attr]
        ),
        "returned_to_same_session": encode_session_ref(session_key) in str(result.get("after", {}).get("url") or ""),  # type: ignore[union-attr]
        "not_reset_to_latest": bool(result.get("after", {}).get("jumpVisible") or result.get("after", {}).get("historyBannerVisible")),  # type: ignore[union-attr]
        "retained_history_context": (
            after_bottom_distance >= before_bottom_distance * 0.35
            or bool(result.get("after", {}).get("jumpVisible") or result.get("after", {}).get("historyBannerVisible"))  # type: ignore[union-attr]
        ),
        "no_console_errors": not console_errors,
    }
    result["consoleErrors"] = console_errors
    result["checks"] = checks

    print(json.dumps(result, ensure_ascii=False, indent=2))
    if not all(checks.values()):
        raise AssertionError("session viewport restore checks failed")


if __name__ == "__main__":
    main()
