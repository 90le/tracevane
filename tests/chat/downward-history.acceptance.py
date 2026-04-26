from base64 import urlsafe_b64encode
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
import json
import os
import sqlite3


SCREENSHOT = Path("/tmp/openclaw-studio-chat-downward-history-smoke.png")
SESSION_KEY = os.environ.get("CHAT_HEAVY_SESSION_KEY", "").strip()


def encode_session_ref(session_key: str) -> str:
    encoded = urlsafe_b64encode(session_key.encode("utf-8")).decode("ascii").rstrip("=")
    return f"r1_{encoded}"


def wait_for_chat_thread_ready(page) -> None:
    page.wait_for_selector(".chat-conversation-thread", timeout=20000)
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
        timeout=20000,
    )


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
            LIMIT 40
            """
        ).fetchall()
        for session_key, message_count in rows:
            if not session_key or int(message_count or 0) < 50:
                continue
            session_row = conn.execute(
                "SELECT payload_json FROM session_rows WHERE session_key = ? LIMIT 1",
                (session_key,),
            ).fetchone()
            if not session_row:
                return str(session_key)
            try:
                payload = json.loads(session_row[0])
            except Exception:
                payload = {}
            if payload.get("kind") != "studio_managed":
                continue
            permissions = payload.get("permissions") or {}
            presentation = payload.get("presentation") or {}
            if permissions.get("visibleInFrontend") is False or presentation.get("archived") is True:
                continue
            return str(session_key)
    finally:
        conn.close()
    return ""


def read_thread_state(page, label: str):
    return page.evaluate("""(label) => {
      const thread = document.querySelector('.chat-conversation-thread');
      const jump = document.querySelector('.chat-conversation-thread__jump-fab');
      if (!thread) {
        return { label, missingThread: true };
      }
      return {
        label,
        scrollTop: Math.round(thread.scrollTop),
        scrollHeight: Math.round(thread.scrollHeight),
        clientHeight: Math.round(thread.clientHeight),
        bottomDistance: Math.max(0, Math.round(thread.scrollHeight - thread.scrollTop - thread.clientHeight)),
        shellCount: document.querySelectorAll('.chat-conversation-thread__item-shell').length,
        bubbleCount: document.querySelectorAll('.chat-message-bubble').length,
        historicalJumpVisible: !!document.querySelector('.chat-conversation-thread__jump-fab.has-text'),
        jumpText: jump ? (jump.textContent || '').trim() : '',
      };
    }""", label)


def history_urls(urls):
    return [url for url in urls if "/api/chat/sessions/" in url and "/history?" in url]


def main() -> None:
    session_key = SESSION_KEY or discover_heavy_session_key()
    if not session_key:
        print(json.dumps({
            "skipped": True,
            "reason": "No heavy visible session was found and CHAT_HEAVY_SESSION_KEY is not set",
        }, ensure_ascii=False, indent=2))
        return

    result = {"sessionKey": session_key}
    responses = []
    console_errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1100})

        page.on("response", lambda resp: responses.append(resp.url) if "/api/chat/sessions/" in resp.url and "/history?" in resp.url else None)
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        session_ref = encode_session_ref(session_key)
        page.goto(f"http://127.0.0.1:5176/chat/s/{session_ref}", wait_until="domcontentloaded")
        wait_for_chat_thread_ready(page)
        page.wait_for_timeout(2500)

        thread = page.locator(".chat-conversation-thread").first
        thread.hover()

        entered_history = None
        for index in range(36):
            request_count_before = len(history_urls(responses))
            page.mouse.wheel(0, -900)
            page.wait_for_timeout(420)
            if len(history_urls(responses)) != request_count_before:
                page.wait_for_timeout(1200)
            sample = read_thread_state(page, f"upward-{index}")
            if sample.get("bottomDistance", 0) > 1800 and sample.get("historicalJumpVisible"):
                entered_history = sample
                break
        if entered_history is None:
            entered_history = read_thread_state(page, "entered-history-fallback")
        result["enteredHistory"] = entered_history

        downward_samples = []
        after_response_samples = []
        previous_after_count = len([url for url in history_urls(responses) if "history?after=" in url])
        downward_start = read_thread_state(page, "downward-start")
        result["downwardStart"] = downward_start

        for index in range(48):
            before_wheel = read_thread_state(page, f"downward-before-{index}")
            before_count = len([url for url in history_urls(responses) if "history?after=" in url])
            page.mouse.wheel(0, 900)
            page.wait_for_timeout(280)
            current_after_count = len([url for url in history_urls(responses) if "history?after=" in url])
            if current_after_count != before_count:
                page.wait_for_timeout(1100)
            after_wheel = read_thread_state(page, f"downward-after-{index}")
            downward_samples.append(after_wheel)

            if current_after_count != previous_after_count or len([url for url in history_urls(responses) if "history?after=" in url]) != before_count:
                after_response_samples.append({
                    "before": before_wheel,
                    "after": after_wheel,
                    "deltaTop": (after_wheel.get("scrollTop") or 0) - (before_wheel.get("scrollTop") or 0),
                })
                previous_after_count = len([url for url in history_urls(responses) if "history?after=" in url])
                if len(after_response_samples) >= 2:
                    break

            if after_wheel.get("bottomDistance", 999999) <= 80 and not after_wheel.get("historicalJumpVisible"):
                break

        result["downwardSamples"] = downward_samples
        result["afterResponseSamples"] = after_response_samples
        result["historyRequests"] = history_urls(responses)
        result["historyAfterRequests"] = [url for url in result["historyRequests"] if "history?after=" in url]
        result["historyBeforeRequests"] = [url for url in result["historyRequests"] if "history?before=" in url]
        result["consoleErrors"] = console_errors

        page.screenshot(path=str(SCREENSHOT), full_page=True)
        result["screenshot"] = str(SCREENSHOT)

        unique_after_requests = sorted(set(result["historyAfterRequests"]))
        final_sample = downward_samples[-1] if downward_samples else downward_start
        reverse_jumps = []
        previous_sample = downward_start
        for sample in downward_samples:
            client_height = sample.get("clientHeight") or previous_sample.get("clientHeight") or 0
            allowed_reverse = max(480, client_height * 0.8)
            if (sample.get("scrollTop") or 0) < (previous_sample.get("scrollTop") or 0) - allowed_reverse:
                reverse_jumps.append({
                    "previous": previous_sample,
                    "sample": sample,
                    "allowedReverse": allowed_reverse,
                })
            previous_sample = sample
        checks = {
            "entered_history": entered_history.get("bottomDistance", 0) > 1200 and entered_history.get("historicalJumpVisible") is True,
            "downward_progressed": (final_sample.get("scrollTop") or 0) > (downward_start.get("scrollTop") or 0) + max(240, (downward_start.get("clientHeight") or 0) * 0.4),
            "after_request_triggered": len(result["historyAfterRequests"]) > 0,
            "no_duplicate_after_requests": len(result["historyAfterRequests"]) == len(unique_after_requests),
            "downward_no_large_reverse_jump": len(reverse_jumps) == 0,
            "after_response_kept_history_context": all(
                (sample.get("after", {}).get("bottomDistance") or 0) > 160
                or sample.get("after", {}).get("historicalJumpVisible") is False
                for sample in after_response_samples
            ),
            "after_response_no_large_scroll_jump": all(
                abs(sample.get("deltaTop") or 0) <= max(2600, (sample.get("before", {}).get("clientHeight") or 0) * 2.8)
                for sample in after_response_samples
            ),
            "no_console_errors": len(console_errors) == 0,
        }
        result["checks"] = checks
        result["reverseJumps"] = reverse_jumps
        result["uniqueHistoryAfterRequests"] = unique_after_requests
        failed = [name for name, passed in checks.items() if not passed]
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if failed:
            raise SystemExit(f"downward history smoke failed: {', '.join(failed)}")
        browser.close()


if __name__ == "__main__":
    try:
        main()
    except PlaywrightTimeoutError as error:
        raise SystemExit(f"downward history smoke timed out: {error}") from error
