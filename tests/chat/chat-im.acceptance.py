from pathlib import Path
from playwright.sync_api import sync_playwright, expect, TimeoutError as PlaywrightTimeoutError
import json
import re
import time


SCREENSHOT = Path("/tmp/openclaw-studio-chat-im-acceptance.png")


def wait_button_enabled(locator, timeout=30000):
    locator.wait_for(state="visible", timeout=timeout)
    locator.page.wait_for_function(
        "(el) => !el.disabled",
        arg=locator.element_handle(),
        timeout=timeout,
    )


def click_enabled(locator, timeout=30000):
    wait_button_enabled(locator, timeout=timeout)
    locator.page.wait_for_timeout(200)
    locator.evaluate("(el) => el.click()")


def fill_editor(page, locator, text):
    locator.click()
    page.keyboard.press("Control+A")
    page.keyboard.press("Backspace")
    page.keyboard.type(text, delay=1)
    page.wait_for_timeout(300)


def open_new_chat(page):
    before_count = page.locator(".chat-shell-session-item").count()
    button = page.locator(".chat-new-chat-trigger").first
    click_enabled(button)
    picker = page.locator(".chat-agent-picker")
    picker.wait_for(state="visible", timeout=15000)
    option = picker.locator(".chat-agent-picker-option").first
    with page.expect_response(lambda resp: "/api/chat/agents/" in resp.url and resp.request.method == "POST", timeout=30000):
        click_enabled(option)
    page.wait_for_function(
        "(before) => document.querySelectorAll('.chat-shell-session-item').length >= before + 1",
        arg=before_count,
        timeout=30000,
    )
    page.wait_for_load_state("networkidle")


def thread_bottom_distance(page):
    return page.evaluate(
        """() => {
            const el = document.querySelector('.chat-conversation-thread');
            if (!el) return Number.POSITIVE_INFINITY;
            return Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight);
        }"""
    )


def bubble_texts(page):
    return page.evaluate(
        """() => Array.from(document.querySelectorAll('.chat-message-bubble'))
            .map((el) => (el.textContent || '').replace(/\\s+/g, ' ').trim())
            .filter(Boolean)"""
    )


def assistant_bubble_contains(page, needle):
    return page.evaluate(
        """(token) => Array.from(document.querySelectorAll('.chat-message-group.role-assistant .chat-message-bubble'))
            .some((el) => (el.textContent || '').includes(token))""",
        needle,
    )


def main() -> None:
    result = {}
    token = f"im-live-smoke-{int(time.time() * 1000)}"
    token_prefix = token[:12]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1600, "height": 1200})

        page.goto("http://127.0.0.1:5176/chat", wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        expect(page.locator(".chat-shell-session-list")).to_be_visible()

        open_new_chat(page)

        textarea = page.locator(".chat-composer-editor").first
        send_btn = page.get_by_role("button", name=re.compile("^发送$|^Send$")).first
        stop_btn = page.get_by_role("button", name=re.compile("^停止$|^Stop$")).first

        prompt = (
            f"Reply in plain text only. Do not use any tools. "
            f"Repeat the exact token {token} 180 times separated by spaces. "
            "No markdown, no code fences, no explanation."
        )
        fill_editor(page, textarea, prompt)
        click_enabled(send_btn)

        wait_button_enabled(stop_btn, timeout=30000)
        page.wait_for_function(
            """(prefix) => Array.from(document.querySelectorAll('.chat-message-group.role-assistant .chat-message-bubble'))
                .some((el) => (el.textContent || '').includes(prefix))""",
            arg=token_prefix,
            timeout=45000,
        )
        result["pure_text_live_stream_visible"] = assistant_bubble_contains(page, token_prefix)

        page.wait_for_function(
            """(token) => {
                const hasToken = Array.from(document.querySelectorAll('.chat-message-group.role-assistant .chat-message-bubble'))
                    .some((el) => (el.textContent || '').includes(token));
                const stop = Array.from(document.querySelectorAll('button'))
                    .find((el) => /^(发送|Send|停止|Stop)$/.test((el.textContent || '').trim()) && /(停止|Stop)/.test((el.textContent || '').trim()));
                return hasToken && !!stop && stop.disabled;
            }""",
            arg=token,
            timeout=90000,
        )
        result["final_bubble_visible"] = assistant_bubble_contains(page, token)
        page.wait_for_timeout(1200)
        result["final_bubble_persists"] = assistant_bubble_contains(page, token)
        result["initial_bottom_anchor"] = thread_bottom_distance(page) <= 100

        bubble_texts_before = bubble_texts(page)
        page.reload(wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        page.wait_for_function(
            """(token) => Array.from(document.querySelectorAll('.chat-message-group.role-assistant .chat-message-bubble'))
                .some((el) => (el.textContent || '').includes(token))""",
            arg=token,
            timeout=60000,
        )
        bubble_texts_after = bubble_texts(page)
        result["reload_restores_final"] = assistant_bubble_contains(page, token)
        result["reload_order_stable"] = bubble_texts_before == bubble_texts_after
        result["reload_bottom_anchor"] = thread_bottom_distance(page) <= 100
        result["no_timestamp_prefix_leakage"] = not bool(
            re.search(r"\[[A-Za-z]{3} \d{4}-\d{2}-\d{2} \d{2}:\d{2}[^\]]*\]", page.locator(".chat-conversation-thread").inner_text())
        )

        page.screenshot(path=str(SCREENSHOT), full_page=True)
        result["screenshot"] = str(SCREENSHOT)

        critical_checks = [
            "pure_text_live_stream_visible",
            "final_bubble_visible",
            "final_bubble_persists",
            "initial_bottom_anchor",
            "reload_restores_final",
            "reload_order_stable",
            "reload_bottom_anchor",
            "no_timestamp_prefix_leakage",
        ]
        failed = [key for key in critical_checks if not result.get(key)]
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if failed:
            raise SystemExit(f"chat IM smoke failed: {', '.join(failed)}")
        browser.close()


if __name__ == "__main__":
    try:
        main()
    except PlaywrightTimeoutError as error:
        raise SystemExit(f"chat IM smoke timed out: {error}") from error
