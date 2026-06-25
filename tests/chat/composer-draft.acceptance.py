from __future__ import annotations

import base64
import json
import re
import time
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import expect, sync_playwright


SCREENSHOT = Path("/tmp/tracevane-chat-composer-draft-acceptance.png")
CURRENT_STAGE = "starting"


def set_stage(value: str) -> None:
    global CURRENT_STAGE
    CURRENT_STAGE = value


def wait_button_enabled(locator, timeout=30000):
    locator.wait_for(state="visible", timeout=timeout)
    locator.page.wait_for_function(
        "(el) => !el.disabled",
        arg=locator.element_handle(),
        timeout=timeout,
    )


def click_enabled(locator, timeout=30000):
    wait_button_enabled(locator, timeout=timeout)
    locator.page.wait_for_timeout(100)
    locator.evaluate("(el) => el.click()")


def fill_editor(page, locator, text):
    locator.click()
    page.keyboard.press("Control+A")
    page.keyboard.press("Backspace")
    page.keyboard.type(text, delay=1)
    page.wait_for_timeout(500)


def encode_session_ref(session_key: str) -> str:
    encoded = base64.urlsafe_b64encode(session_key.encode("utf-8")).decode("ascii").rstrip("=")
    return f"r1_{encoded}"


def open_new_chat(page) -> str:
    set_stage("open new chat trigger")
    click_enabled(page.locator(".chat-new-chat-trigger").first)
    picker = page.locator(".chat-agent-picker")
    set_stage("wait agent picker")
    picker.wait_for(state="visible", timeout=15000)
    option = picker.locator(".chat-agent-picker-option").first
    set_stage("select agent option")
    with page.expect_response(
        lambda resp: "/api/chat/agents/" in resp.url and resp.request.method == "POST",
        timeout=30000,
    ) as response_info:
        click_enabled(option)
    payload = response_info.value.json()
    session_key = ((payload.get("session") or {}).get("key") or "").strip()
    if not session_key:
        raise AssertionError(f"create session response missing session.key: {payload}")
    set_stage("wait new chat selected")
    page.wait_for_function(
        """() => (
            document.querySelector('.chat-shell-session-row.active')
            && document.querySelector('.chat-composer-editor')
        )""",
        timeout=30000,
    )
    page.wait_for_load_state("networkidle")
    return session_key


def goto_session(page, session_key: str) -> None:
    set_stage(f"goto session {session_key}")
    session_ref = encode_session_ref(session_key)
    page.goto(f"http://127.0.0.1:5176/chat/s/{session_ref}", wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")
    page.wait_for_function(
        "() => document.querySelector('.chat-composer-editor')",
        timeout=30000,
    )


def editor_text(page) -> str:
    return page.locator(".chat-composer-editor").first.inner_text()


def wait_for_editor_text(page, token: str, timeout=30000) -> None:
    set_stage(f"wait editor text {token}")
    page.wait_for_function(
        """(token) => {
            const editor = document.querySelector('.chat-composer-editor');
            return Boolean(editor && (editor.value || editor.textContent || '').includes(token));
        }""",
        arg=token,
        timeout=timeout,
    )


def collect_diagnostics(page) -> dict[str, object]:
    return page.evaluate(
        """() => {
            const editor = document.querySelector('.chat-composer-editor');
            const draftKeys = [];
            for (let index = 0; index < window.localStorage.length; index += 1) {
                const key = window.localStorage.key(index) || '';
                if (key.includes('composer-draft')) draftKeys.push(key);
            }
            return {
                path: window.location.pathname,
                editorText: editor?.value || editor?.textContent || '',
                draftKeys,
                draftValues: Object.fromEntries(draftKeys.map((key) => [key, window.localStorage.getItem(key)])),
                activeRowText: document.querySelector('.chat-shell-session-row.active')?.textContent || '',
            };
        }"""
    )


def main() -> None:
    now = int(time.time() * 1000)
    first_draft = f"draft-alpha-{now}"
    second_draft = f"draft-beta-{now}"
    result: dict[str, object] = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1500, "height": 1000})

        page.goto("http://127.0.0.1:5176/chat/workbench", wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        expect(page.locator(".chat-shell-session-list")).to_be_visible(timeout=30000)

        set_stage("create first chat")
        first_session_key = open_new_chat(page)
        editor = page.locator(".chat-composer-editor").first
        set_stage("fill first draft")
        fill_editor(page, editor, first_draft)

        set_stage("create second chat")
        second_session_key = open_new_chat(page)
        editor = page.locator(".chat-composer-editor").first
        set_stage("fill second draft")
        fill_editor(page, editor, second_draft)

        goto_session(page, first_session_key)
        try:
            wait_for_editor_text(page, first_draft)
        except PlaywrightTimeoutError:
            result["failure_diagnostics"] = collect_diagnostics(page)
            print(json.dumps(result, ensure_ascii=False, indent=2))
            raise
        first_text = editor_text(page)

        goto_session(page, second_session_key)
        wait_for_editor_text(page, second_draft)
        second_text = editor_text(page)

        page.reload(wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        wait_for_editor_text(page, second_draft)
        reloaded_text = editor_text(page)

        result["first_session_key"] = first_session_key
        result["second_session_key"] = second_session_key
        result["first_draft_restored"] = first_draft in first_text and second_draft not in first_text
        result["second_draft_restored"] = second_draft in second_text and first_draft not in second_text
        result["second_draft_survives_reload"] = second_draft in reloaded_text
        result["screenshot"] = str(SCREENSHOT)

        page.screenshot(path=str(SCREENSHOT), full_page=True)
        print(json.dumps(result, ensure_ascii=False, indent=2))

        failed = [
            key
            for key in [
                "first_draft_restored",
                "second_draft_restored",
                "second_draft_survives_reload",
            ]
            if not result.get(key)
        ]
        if failed:
            raise SystemExit(f"composer draft smoke failed: {', '.join(failed)}")
        browser.close()


if __name__ == "__main__":
    try:
        main()
    except PlaywrightTimeoutError as error:
        raise SystemExit(f"composer draft smoke timed out during {CURRENT_STAGE}: {error}") from error
