from __future__ import annotations

import base64
import json
import time
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

from browser_surface import wait_for_active_session, wait_for_chat_surface


SCREENSHOT = Path("/tmp/tracevane-chat-composer-draft-pagehide-acceptance.png")


def wait_button_enabled(locator, timeout=30000):
    locator.wait_for(state="visible", timeout=timeout)
    locator.page.wait_for_function(
        "(el) => !el.disabled",
        arg=locator.element_handle(),
        timeout=timeout,
    )


def click_enabled(locator, timeout=30000):
    wait_button_enabled(locator, timeout=timeout)
    locator.page.wait_for_timeout(80)
    locator.evaluate("(el) => el.click()")


def session_ref(session_key: str) -> str:
    encoded = base64.urlsafe_b64encode(session_key.encode("utf-8")).decode("ascii").rstrip("=")
    return f"r1_{encoded}"


def open_new_chat(page) -> str:
    click_enabled(page.locator(".chat-new-chat-trigger").first)
    picker = page.locator(".chat-agent-picker")
    picker.wait_for(state="visible", timeout=15000)
    option = picker.locator(".chat-agent-picker-option").first
    click_enabled(option)
    create_button = picker.get_by_role("button", name=re.compile("^创建$|^Create$"))
    with page.expect_response(
        lambda resp: "/api/chat/agents/" in resp.url and resp.request.method == "POST",
        timeout=30000,
    ) as response_info:
        click_enabled(create_button)
    payload = response_info.value.json()
    session_key = ((payload.get("session") or {}).get("key") or "").strip()
    if not session_key:
        raise AssertionError(f"create session response missing session.key: {payload}")
    try:
        wait_for_active_session(page, session_key, timeout=15000)
    except PlaywrightTimeoutError:
        page.goto(
            f"http://127.0.0.1:5176/chat/s/{session_ref(session_key)}",
            wait_until="domcontentloaded",
            timeout=30000,
        )
        wait_for_active_session(page, session_key, timeout=60000)
    page.wait_for_load_state("networkidle")
    return session_key


def set_editor_and_fire_pagehide(page, token: str):
    page.locator(".chat-composer-editor").first.wait_for(state="visible", timeout=10000)
    page.evaluate(
        """(value) => {
            const editor = document.querySelector('.chat-composer-editor');
            if (!editor) throw new Error('composer editor missing');
            editor.focus();
            if ('value' in editor) {
                editor.value = value;
            } else {
                editor.replaceChildren();
                const textNode = document.createElement('span');
                textNode.className = 'chat-composer-editor-text';
                textNode.dataset.composerNodeType = 'text';
                textNode.textContent = value;
                editor.appendChild(textNode);
            }
            editor.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                inputType: 'insertText',
                data: value,
            }));
            window.dispatchEvent(new Event('pagehide'));
        }""",
        token,
    )


def read_persisted_draft(page, session_key: str) -> dict[str, object]:
    key = f"tracevane.chat.composer-draft:{session_key}"
    raw = page.evaluate("(keyName) => window.localStorage.getItem(keyName)", key)
    if not raw:
        return {}
    return json.loads(raw)


def wait_for_editor_text(page, token: str):
    page.wait_for_function(
        """(tokenValue) => {
            const editor = document.querySelector('.chat-composer-editor');
            return Boolean(editor && (editor.value || editor.textContent || '').includes(tokenValue));
        }""",
        arg=token,
        timeout=30000,
    )


def main() -> None:
    token = f"composer-pagehide-draft-{int(time.time() * 1000)}"
    result: dict[str, object] = {}
    console_errors: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1500, "height": 900})

        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        wait_for_chat_surface(page, "http://127.0.0.1:5176/chat/workbench")
        session_key = open_new_chat(page)
        set_editor_and_fire_pagehide(page, token)

        persisted = read_persisted_draft(page, session_key)
        persisted_text = json.dumps(persisted, ensure_ascii=False)
        if token not in persisted_text:
            raise AssertionError(f"pagehide must synchronously persist current draft: {persisted}")

        page.reload(wait_until="domcontentloaded", timeout=30000)
        wait_for_active_session(page, session_key, timeout=60000)
        page.wait_for_load_state("networkidle")
        wait_for_editor_text(page, token)
        if console_errors:
            raise AssertionError("browser console errors: " + json.dumps(console_errors, ensure_ascii=False))

        result["sessionKey"] = session_key
        result["persistedImmediately"] = token in persisted_text
        result["restoredAfterReload"] = token in page.locator(".chat-composer-editor").first.inner_text()
        result["draftVersion"] = persisted.get("version")
        result["attachmentCount"] = len(persisted.get("attachments") or [])
        result["screenshot"] = str(SCREENSHOT)
        page.screenshot(path=str(SCREENSHOT), full_page=True)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        browser.close()


if __name__ == "__main__":
    try:
        main()
    except PlaywrightTimeoutError as error:
        raise SystemExit(f"chat composer pagehide draft smoke timed out: {error}") from error
