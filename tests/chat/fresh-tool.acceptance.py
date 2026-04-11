from pathlib import Path
from playwright.sync_api import sync_playwright, expect, TimeoutError as PlaywrightTimeoutError
import json
import re


SCREENSHOT = Path("/tmp/openclaw-studio-chat-fresh-tool-smoke.png")
TOKEN = "fresh-tool-smoke"


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


def visible_inline_process_count(page):
    return page.locator(".chat-inline-process:visible").count()


def main() -> None:
    result = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1600, "height": 1200})

        page.goto("http://127.0.0.1:5176/chat", wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        expect(page.locator(".chat-shell-session-list")).to_be_visible()

        open_new_chat(page)

        textarea = page.locator(".chat-composer-editor[contenteditable='true']").first
        send_btn = page.get_by_role("button", name=re.compile("^发送$|^Send$")).first
        search_input = page.locator(".chat-conversation-pane__search-input").first
        search_btn = page.locator(".chat-conversation-pane__search button").first
        toggle_tool_btn = page.get_by_role("button", name=re.compile("工具过程|tool previews")).first

        prompt = (
            f"Use exactly one local tool call to run `printf {TOKEN}` and then reply with exactly {TOKEN}. "
            "Do not explain the command."
        )
        fill_editor(page, textarea, prompt)
        click_enabled(send_btn)

        page.wait_for_function(
            "() => Array.from(document.querySelectorAll('.chat-inline-process')).some((el) => (el.textContent || '').trim().length > 0)",
            timeout=90000,
        )
        result["tool_process_visible"] = visible_inline_process_count(page) > 0

        page.wait_for_function(
            "(token) => Array.from(document.querySelectorAll('.chat-message-bubble')).some((el) => (el.textContent || '').includes(token))",
            arg=TOKEN,
            timeout=90000,
        )
        result["final_reply_visible"] = TOKEN in page.locator(".chat-conversation-thread").inner_text()

        page.reload(wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        page.wait_for_function(
            "(token) => Array.from(document.querySelectorAll('.chat-message-bubble')).some((el) => (el.textContent || '').includes(token))",
            arg=TOKEN,
            timeout=60000,
        )
        result["reload_restores_tool_process"] = visible_inline_process_count(page) > 0

        search_input.fill(TOKEN)
        click_enabled(search_btn)
        page.wait_for_load_state("networkidle")
        page.wait_for_function(
            "(token) => Array.from(document.querySelectorAll('.chat-message-bubble')).some((el) => (el.textContent || '').includes(token))",
            arg=TOKEN,
            timeout=60000,
        )
        result["search_preserves_tool_process"] = visible_inline_process_count(page) > 0

        click_enabled(toggle_tool_btn)
        page.wait_for_timeout(400)
        result["tool_toggle_hides_process"] = visible_inline_process_count(page) == 0

        click_enabled(toggle_tool_btn)
        page.wait_for_timeout(400)
        result["tool_toggle_restores_process"] = visible_inline_process_count(page) > 0

        page.screenshot(path=str(SCREENSHOT), full_page=True)
        result["screenshot"] = str(SCREENSHOT)

        critical_checks = [
            "tool_process_visible",
            "final_reply_visible",
            "reload_restores_tool_process",
            "search_preserves_tool_process",
            "tool_toggle_hides_process",
            "tool_toggle_restores_process",
        ]
        failed = [key for key in critical_checks if not result.get(key)]
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if failed:
            raise SystemExit(f"fresh tool smoke failed: {', '.join(failed)}")
        browser.close()


if __name__ == "__main__":
    try:
        main()
    except PlaywrightTimeoutError as error:
        raise SystemExit(f"fresh tool smoke timed out: {error}") from error
