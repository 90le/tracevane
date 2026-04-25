from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
import json
import os
import sqlite3
from base64 import urlsafe_b64encode


SCREENSHOT = Path("/tmp/openclaw-studio-chat-heavy-history-smoke.png")
SESSION_KEY = os.environ.get("CHAT_HEAVY_SESSION_KEY", "").strip()


def encode_session_ref(session_key: str) -> str:
    encoded = urlsafe_b64encode(session_key.encode("utf-8")).decode("ascii").rstrip("=")
    return f"r1_{encoded}"


def discover_heavy_session_key() -> str:
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
        def candidate(min_count: int) -> str:
            for session_key, message_count in rows:
                if not session_key or int(message_count or 0) < min_count:
                    continue
                session_row = conn.execute(
                    "SELECT payload_json FROM session_rows WHERE session_key = ? LIMIT 1",
                    (session_key,),
                ).fetchone()
                if session_row:
                    try:
                        payload = json.loads(session_row[0])
                    except Exception:
                        payload = {}
                    if payload.get("kind") != "studio_managed":
                        continue
                    permissions = payload.get("permissions") or {}
                    if permissions.get("visibleInFrontend") is False:
                        continue
                    presentation = payload.get("presentation") or {}
                    if presentation.get("archived") is True:
                        continue
                return str(session_key)
            return ""

        for threshold in (500, 100, 20):
            picked = candidate(threshold)
            if picked:
                return picked
    finally:
        conn.close()
    return ""


def main() -> None:
    session_key = SESSION_KEY or discover_heavy_session_key()
    if not session_key:
        print(json.dumps({
            "skipped": True,
            "reason": "No heavy visible session was found and CHAT_HEAVY_SESSION_KEY is not set",
        }, ensure_ascii=False, indent=2))
        return

    result = {}
    responses = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1100})

        def on_response(resp):
            url = resp.url
            if "/api/chat/bootstrap" in url or "/api/chat/sessions/" in url and "/history?" in url:
                responses.append(url)

        page.on("response", on_response)
        result["sessionKey"] = session_key
        session_ref = encode_session_ref(session_key)
        page.goto(f"http://127.0.0.1:5176/chat/s/{session_ref}", wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(5000)

        result.update(page.evaluate("""() => {
          const thread = document.querySelector('.chat-conversation-thread');
          const messageGroups = Array.from(document.querySelectorAll('.chat-message-group'));
          return {
            bubbleCount: document.querySelectorAll('.chat-message-bubble').length,
            placeholders: document.querySelectorAll('.chat-conversation-thread__item-placeholder').length,
            deferredBubbleCount: document.querySelectorAll('.chat-message-bubble-deferred').length,
            deferredMarkdownCount: document.querySelectorAll('.chat-markdown-deferred-card').length,
            contentVisibilityAutoGroups: messageGroups.filter((element) => window.getComputedStyle(element).contentVisibility === 'auto').length,
            scrollTop: thread ? thread.scrollTop : null,
            scrollHeight: thread ? thread.scrollHeight : null,
            clientHeight: thread ? thread.clientHeight : null,
            bottomDistance: thread ? Math.max(0, thread.scrollHeight - thread.scrollTop - thread.clientHeight) : null,
            canScroll: thread ? thread.scrollHeight > thread.clientHeight : false,
            historyBanner: !!document.querySelector('.chat-conversation-thread__history-banner'),
            jumpVisible: !!document.querySelector('.chat-conversation-thread__jump-fab'),
          };
        }"""))
        initial_history_requests = [url for url in responses if "/history?" in url]
        initial_bootstrap_requests = [url for url in responses if "/api/chat/bootstrap" in url]
        initial_unique_history_requests = sorted(set(initial_history_requests))
        initial_unique_bootstrap_requests = sorted(set(initial_bootstrap_requests))
        initial_scroll_height = result.get("scrollHeight") or 0

        thread = page.locator(".chat-conversation-thread").first
        thread.hover()
        page.mouse.wheel(0, -900)
        page.wait_for_timeout(1200)
        bottom_exit = page.evaluate("""() => {
          const thread = document.querySelector('.chat-conversation-thread');
          return {
            scrollTop: thread ? thread.scrollTop : null,
            scrollHeight: thread ? thread.scrollHeight : null,
            clientHeight: thread ? thread.clientHeight : null,
            bottomDistance: thread ? Math.max(0, thread.scrollHeight - thread.scrollTop - thread.clientHeight) : null,
          };
        }""")
        result["bottomExit"] = bottom_exit

        scroll_samples = []
        for _ in range(3):
            thread.evaluate("(el) => { el.scrollTop = 0; }")
            page.wait_for_timeout(2500)
            scroll_samples.append(page.evaluate("""() => {
              const thread = document.querySelector('.chat-conversation-thread');
              return {
                scrollTop: thread ? thread.scrollTop : null,
                scrollHeight: thread ? thread.scrollHeight : null,
                clientHeight: thread ? thread.clientHeight : null,
                bottomDistance: thread ? Math.max(0, thread.scrollHeight - thread.scrollTop - thread.clientHeight) : null,
              };
            }"""))

        continued = page.evaluate("""() => {
          const thread = document.querySelector('.chat-conversation-thread');
          const messageGroups = Array.from(document.querySelectorAll('.chat-message-group'));
          const loadingIndicators = Array.from(document.querySelectorAll('.chat-conversation-thread__loading-indicator')).map((element) => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            return {
              height: rect.height,
              position: style.position,
            };
          });
          return {
            scrollTop: thread ? thread.scrollTop : null,
            scrollHeight: thread ? thread.scrollHeight : null,
            clientHeight: thread ? thread.clientHeight : null,
            bottomDistance: thread ? Math.max(0, thread.scrollHeight - thread.scrollTop - thread.clientHeight) : null,
            loadingIndicators,
            deferredBubbleCount: document.querySelectorAll('.chat-message-bubble-deferred').length,
            deferredMarkdownCount: document.querySelectorAll('.chat-markdown-deferred-card').length,
            contentVisibilityAutoGroups: messageGroups.filter((element) => window.getComputedStyle(element).contentVisibility === 'auto').length,
          };
        }""")
        result["continuedScroll"] = continued
        result["historyScrollSamples"] = scroll_samples
        result["historyRequests"] = [url for url in responses if "/history?" in url]
        result["bootstrapRequests"] = [url for url in responses if "/api/chat/bootstrap" in url]
        unique_history_requests = sorted(set(result["historyRequests"]))
        unique_bootstrap_requests = sorted(set(result["bootstrapRequests"]))
        history_after_requests = [url for url in result["historyRequests"] if "history?after=" in url]
        result["initialUniqueHistoryRequests"] = initial_unique_history_requests
        result["initialUniqueBootstrapRequests"] = initial_unique_bootstrap_requests
        result["historyAfterRequests"] = history_after_requests

        page.screenshot(path=str(SCREENSHOT), full_page=True)
        result["screenshot"] = str(SCREENSHOT)

        critical_checks = {
            "can_scroll": result.get("canScroll") is True,
            "latest_bottom_anchor": isinstance(result.get("bottomDistance"), (int, float)) and result.get("bottomDistance") <= 40,
            "no_history_banner": result.get("historyBanner") is False,
            "no_jump_fab": result.get("jumpVisible") is False,
            "no_placeholders": result.get("placeholders") == 0,
            "no_deferred_cards_in_view": result.get("deferredBubbleCount") == 0 and result.get("deferredMarkdownCount") == 0 and continued.get("deferredBubbleCount") == 0 and continued.get("deferredMarkdownCount") == 0,
            "no_content_visibility_auto_groups": result.get("contentVisibilityAutoGroups") == 0 and continued.get("contentVisibilityAutoGroups") == 0,
            "bottom_exit_not_forced_latest": isinstance(bottom_exit.get("bottomDistance"), (int, float)) and bottom_exit.get("bottomDistance") >= 300,
            "history_loads_keep_browse_position": all(
                isinstance(sample.get("bottomDistance"), (int, float))
                and sample.get("bottomDistance") >= 300
                for sample in scroll_samples
            ) and isinstance(continued.get("bottomDistance"), (int, float)) and continued.get("bottomDistance") >= 300,
            "no_duplicate_history_requests": len(result["historyRequests"]) == len(unique_history_requests),
            "no_after_request_during_upward_browse": len(history_after_requests) == 0,
            "light_request_count": len(initial_unique_history_requests) <= 3 and len(initial_unique_bootstrap_requests) == 1,
            "continued_history_loading": len(unique_history_requests) >= 4 and (continued.get("scrollHeight") or 0) > initial_scroll_height,
            "prepend_anchor_restored": isinstance(continued.get("scrollTop"), (int, float)) and continued.get("scrollTop") > 80,
            "loading_indicator_out_of_flow": all(
                (indicator.get("height") or 0) <= 1 and indicator.get("position") == "sticky"
                for indicator in continued.get("loadingIndicators") or []
            ),
        }
        result["checks"] = critical_checks
        result["uniqueHistoryRequests"] = unique_history_requests
        result["uniqueBootstrapRequests"] = unique_bootstrap_requests

        failed = [key for key, passed in critical_checks.items() if not passed]
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if failed:
            raise SystemExit(f"heavy history smoke failed: {', '.join(failed)}")
        browser.close()


if __name__ == "__main__":
    try:
        main()
    except PlaywrightTimeoutError as error:
        raise SystemExit(f"heavy history smoke timed out: {error}") from error
