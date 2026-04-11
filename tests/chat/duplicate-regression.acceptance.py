from playwright.sync_api import sync_playwright
import json
import re
import time
import urllib.parse
import urllib.request


BASE_URL = "http://127.0.0.1:5176"


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
    page.keyboard.type(text, delay=2)
    page.wait_for_timeout(300)


def close_inspector_if_open(page):
    close_button = page.locator(".chat-inspector-panel__close").first
    if close_button.count() == 0:
        return
    close_button.evaluate("(el) => el.click()")
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
    page.wait_for_timeout(800)


def matching_user_bubble_count(page, needle):
    return page.evaluate(
        """(needle) => Array.from(document.querySelectorAll('.chat-message-group'))
            .filter((group) => group.classList.contains('role-user'))
            .flatMap((group) => Array.from(group.querySelectorAll('.chat-message-bubble')))
            .filter((bubble) => (bubble.textContent || '').includes(needle))
            .length""",
        needle,
    )


def fetch_history(session_key):
    url = f"{BASE_URL}/api/chat/sessions/{urllib.parse.quote(session_key, safe='')}/history?limit=50"
    with urllib.request.urlopen(url, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def wait_for_single_history_user(session_key, needle, timeout_ms=30000):
    started = time.time()
    while (time.time() - started) * 1000 < timeout_ms:
        payload = fetch_history(session_key)
        matches = [
            message
            for message in payload["messages"]
            if message.get("role") == "user" and needle in (message.get("text") or "")
        ]
        if len(matches) == 1 and matches[0].get("source") == "history" and matches[0].get("text") == needle:
            return payload, matches
        time.sleep(0.25)
    raise AssertionError("timed out waiting for a single canonical history user message")


def main():
    prompt = f"browser-user-dedupe-{int(time.time())} 请只回复 ok"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1600, "height": 1200})

        page.goto(f"{BASE_URL}/chat/workbench", wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        close_inspector_if_open(page)

        open_new_chat(page)

        editor = page.locator(".chat-composer-editor[contenteditable='true']").first
        send_btn = page.get_by_role("button", name=re.compile("^发送$|^Send$")).first

        fill_editor(page, editor, prompt)
        with page.expect_response(lambda resp: "/send" in resp.url and resp.request.method == "POST", timeout=30000) as send_info:
            click_enabled(send_btn)

        send_payload = json.loads(send_info.value.text())
        session_key = send_payload["sessionKey"]

        page.wait_for_function(
            """(needle) => Array.from(document.querySelectorAll('.chat-message-group'))
                .filter((group) => group.classList.contains('role-user'))
                .flatMap((group) => Array.from(group.querySelectorAll('.chat-message-bubble')))
                .some((bubble) => (bubble.textContent || '').includes(needle))""",
            arg=prompt,
            timeout=30000,
        )
        _live_history, live_matches = wait_for_single_history_user(session_key, prompt)
        page.wait_for_timeout(1500)
        live_bubble_count = matching_user_bubble_count(page, prompt)

        assert live_bubble_count == 1, f"expected one live user bubble, got {live_bubble_count}"
        assert len(live_matches) == 1, f"expected one live history match, got {len(live_matches)}"
        assert live_matches[0]["text"] == prompt
        assert live_matches[0]["source"] == "history"

        page.reload(wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1200)
        if matching_user_bubble_count(page, prompt) == 0:
            page.goto(f"{BASE_URL}/chat/workbench", wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1200)
        page.wait_for_timeout(1200)

        reload_history, reload_matches = wait_for_single_history_user(session_key, prompt)
        reload_bubble_count = matching_user_bubble_count(page, prompt)

        assert reload_bubble_count == 1, f"expected one user bubble after reload, got {reload_bubble_count}"
        assert len(reload_matches) == 1, f"expected one history match after reload, got {len(reload_matches)}"
        assert reload_matches[0]["text"] == prompt
        assert reload_matches[0]["source"] == "history"

        print(json.dumps({
            "sessionKey": session_key,
            "prompt": prompt,
            "liveBubbleCount": live_bubble_count,
            "reloadBubbleCount": reload_bubble_count,
            "reloadHistoryMessageCount": len(reload_history["messages"]),
        }, ensure_ascii=False, indent=2))

        browser.close()


if __name__ == "__main__":
    main()
