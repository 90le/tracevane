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


def wait_for_run_to_settle(page, timeout=90000):
    deadline = time.monotonic() + timeout / 1000
    while time.monotonic() < deadline:
        stop_button = page.get_by_role("button", name=re.compile("^停止$|^Stop$")).first
        running_status = page.locator(".chat-conversation-pane__status").first
        stop_visible = stop_button.count() > 0 and stop_button.is_visible()
        status_visible = running_status.count() > 0 and running_status.is_visible()
        composer_running = page.evaluate(
            """() => {
                const editor = document.querySelector('.chat-composer-editor[contenteditable="true"]');
                const placeholder = editor?.getAttribute('data-placeholder') || '';
                return /reply is still running|回复生成中|生成中/i.test(placeholder);
            }"""
        )
        if not stop_visible and not status_visible and not composer_running:
            return True
        page.wait_for_timeout(250)
    return False


def open_new_chat(page):
    button = page.locator(".chat-new-chat-trigger").first
    click_enabled(button)
    picker = page.locator(".chat-agent-picker")
    picker.wait_for(state="visible", timeout=15000)
    option = picker.locator(".chat-agent-picker-option").first
    with page.expect_response(lambda resp: "/api/chat/agents/" in resp.url and resp.request.method == "POST", timeout=30000) as response_info:
        click_enabled(option)
    payload = response_info.value.json()
    session_key = ((payload.get("session") or {}).get("key") or "").strip()
    if not session_key:
        raise AssertionError(f"create session response missing session.key: {payload}")
    page.wait_for_function(
        """() => (
            document.querySelector('.chat-shell-session-row.active')
            && document.querySelector('.chat-composer-editor[contenteditable="true"]')
        )""",
        timeout=30000,
    )
    page.wait_for_load_state("networkidle")
    return session_key


def thread_bottom_distance(page):
    return page.evaluate(
        """() => {
            const el = document.querySelector('.chat-conversation-thread');
            if (!el) return Number.POSITIVE_INFINITY;
            return Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight);
        }"""
    )


def message_group_roles(page):
    return page.evaluate(
        """() => Array.from(document.querySelectorAll('.chat-message-group'))
            .map((group) => Array.from(group.classList).find((name) => name.startsWith('role-')) || 'role-unknown')
            .filter((value) => value !== 'role-unknown')"""
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
        prompt = (
            f"Reply in plain text only. Do not use any tools. "
            f"Repeat the exact token {token} 60 times separated by spaces. "
            "No markdown, no code fences, no explanation."
        )
        fill_editor(page, textarea, prompt)
        click_enabled(send_btn)

        page.wait_for_function(
            """(prefix) => Array.from(document.querySelectorAll('.chat-message-group.role-assistant .chat-message-bubble'))
                .some((el) => (el.textContent || '').includes(prefix))""",
            arg=token_prefix,
            timeout=90000,
        )
        result["pure_text_live_stream_visible"] = assistant_bubble_contains(page, token_prefix)

        page.wait_for_function(
            """(token) => Array.from(document.querySelectorAll('.chat-message-group.role-assistant .chat-message-bubble'))
                .some((el) => (el.textContent || '').includes(token))""",
            arg=token,
            timeout=90000,
        )
        result["final_bubble_visible"] = assistant_bubble_contains(page, token)
        page.wait_for_timeout(1200)
        result["final_bubble_persists"] = assistant_bubble_contains(page, token)
        result["initial_bottom_anchor"] = thread_bottom_distance(page) <= 100
        result["run_settled_before_reload"] = wait_for_run_to_settle(page)

        role_order_before = message_group_roles(page)
        page.reload(wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        page.wait_for_function(
            """(token) => Array.from(document.querySelectorAll('.chat-message-group.role-assistant .chat-message-bubble'))
                .some((el) => (el.textContent || '').includes(token))""",
            arg=token,
            timeout=120000,
        )
        role_order_after = message_group_roles(page)
        result["reload_restores_final"] = assistant_bubble_contains(page, token)
        result["reload_order_stable"] = role_order_before == role_order_after
        result["role_order_before_reload"] = role_order_before
        result["role_order_after_reload"] = role_order_after
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
            "run_settled_before_reload",
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
