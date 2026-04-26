from base64 import urlsafe_b64encode
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
import json
import os


SESSION_KEY = os.environ.get("CHAT_HEAVY_SESSION_KEY", "").strip()
SCREENSHOT = Path("/tmp/openclaw-studio-chat-jump-latest-smoke.png")


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
        jumpVisible: !!jump,
        jumpText: jump ? (jump.textContent || '').trim() : '',
        historicalJumpVisible: !!document.querySelector('.chat-conversation-thread__jump-fab.has-text'),
      };
    }""", label)


def main() -> None:
    if not SESSION_KEY:
        print(json.dumps({
            "skipped": True,
            "reason": "CHAT_HEAVY_SESSION_KEY is required for jump latest smoke",
        }, ensure_ascii=False, indent=2))
        return

    result = {"sessionKey": SESSION_KEY}
    responses = []
    console_errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1100})

        page.on("response", lambda resp: responses.append(resp.url) if "/api/chat/sessions/" in resp.url and "/history?" in resp.url else None)
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        session_ref = encode_session_ref(SESSION_KEY)
        page.goto(f"http://127.0.0.1:5176/chat/s/{session_ref}", wait_until="domcontentloaded")
        wait_for_chat_thread_ready(page)
        page.wait_for_timeout(2500)

        thread = page.locator(".chat-conversation-thread").first
        thread.hover()

        before_click = None
        for _ in range(28):
            request_count_before_wheel = len(responses)
            page.mouse.wheel(0, -900)
            page.wait_for_timeout(450)
            if len(responses) != request_count_before_wheel:
                page.wait_for_timeout(1300)
            state = read_thread_state(page, "after-upward-wheel")
            if state.get("bottomDistance", 0) > 1600 and state.get("historicalJumpVisible"):
                before_click = state
                break
        if before_click is None:
            before_click = read_thread_state(page, "before-click-fallback")

        result["beforeClick"] = before_click
        if not before_click.get("historicalJumpVisible"):
            page.screenshot(path=str(SCREENSHOT), full_page=True)
            result["consoleErrors"] = console_errors
            result["screenshot"] = str(SCREENSHOT)
            print(json.dumps(result, ensure_ascii=False, indent=2))
            raise SystemExit("jump latest smoke failed: historical return-to-latest button did not become visible after browsing history")

        request_count_before_click = len(responses)
        page.locator(".chat-conversation-thread__jump-fab").first.click()
        page.wait_for_function(
            """() => {
              const thread = document.querySelector('.chat-conversation-thread');
              if (!thread) return false;
              const bottomDistance = Math.max(0, thread.scrollHeight - thread.scrollTop - thread.clientHeight);
              const historicalJump = document.querySelector('.chat-conversation-thread__jump-fab.has-text');
              return bottomDistance <= 80 && !historicalJump;
            }""",
            timeout=10000,
        )
        page.wait_for_timeout(450)

        after_click = read_thread_state(page, "after-single-click")
        result["afterClick"] = after_click
        result["historyRequestsAfterClick"] = responses[request_count_before_click:]
        result["consoleErrors"] = console_errors
        page.screenshot(path=str(SCREENSHOT), full_page=True)
        result["screenshot"] = str(SCREENSHOT)

        latest_requests_after_click = [
            url for url in result["historyRequestsAfterClick"]
            if "history?limit=24" in url
        ]
        backfill_requests_after_click = [
            url for url in result["historyRequestsAfterClick"]
            if "history?before=" in url or "history?after=" in url
        ]

        checks = {
            "started_from_history": before_click.get("bottomDistance", 0) > 1600 and before_click.get("historicalJumpVisible") is True,
            "single_click_reached_latest": after_click.get("bottomDistance", 999999) <= 80,
            "historical_jump_hidden": after_click.get("historicalJumpVisible") is False,
            "single_click_does_not_backfill_history": (
                len(backfill_requests_after_click) == 0
                and len(latest_requests_after_click) <= 1
                and len(result["historyRequestsAfterClick"]) == len(latest_requests_after_click)
            ),
            "no_console_errors": len(console_errors) == 0,
        }
        result["checks"] = checks
        failed = [name for name, passed in checks.items() if not passed]
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if failed:
            raise SystemExit(f"jump latest smoke failed: {', '.join(failed)}")
        browser.close()


if __name__ == "__main__":
    try:
        main()
    except PlaywrightTimeoutError as error:
        raise SystemExit(f"jump latest smoke timed out: {error}") from error
