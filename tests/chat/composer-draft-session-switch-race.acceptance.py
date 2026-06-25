from __future__ import annotations

import base64
import json
import time
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

from browser_surface import wait_for_active_session, wait_for_chat_surface


SCREENSHOT = Path("/tmp/tracevane-chat-composer-draft-session-switch-race-acceptance.png")


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
    with page.expect_response(
        lambda resp: "/api/chat/agents/" in resp.url and resp.request.method == "POST",
        timeout=30000,
    ) as response_info:
        click_enabled(option)
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


def goto_session(page, session_key: str) -> None:
    page.goto(
        f"http://127.0.0.1:5176/chat/s/{session_ref(session_key)}",
        wait_until="domcontentloaded",
        timeout=30000,
    )
    wait_for_active_session(page, session_key, timeout=60000)
    page.wait_for_load_state("networkidle")


def read_draft_storage(page, session_key: str) -> dict[str, object]:
    key = f"tracevane.chat.composer-draft:{session_key}"
    raw = page.evaluate("(keyName) => window.localStorage.getItem(keyName)", key)
    if not raw:
        return {}
    return json.loads(raw)


def serialized(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def editor_text(page) -> str:
    return page.locator(".chat-composer-editor").first.inner_text()


def inject_draft_and_click_session_without_frame_gap(page, token: str, target_session_key: str) -> None:
    page.evaluate(
        """([tokenValue, targetSessionKey]) => {
            const editor = document.querySelector('.chat-composer-editor');
            const targetRow = document.querySelector(`.chat-shell-session-row[data-session-key="${CSS.escape(targetSessionKey)}"]`);
            const targetButton = targetRow?.querySelector('.chat-shell-session-item');
            if (!editor) {
                throw new Error('missing composer editor');
            }
            if (!targetRow) {
                throw new Error(`missing target session row ${targetSessionKey}`);
            }
            if (!targetButton) {
                throw new Error(`missing target session primary button ${targetSessionKey}`);
            }
            editor.focus();
            if ('value' in editor) {
                editor.value = tokenValue;
            } else {
                editor.replaceChildren();
                const textNode = document.createElement('span');
                textNode.className = 'chat-composer-editor-text';
                textNode.dataset.composerNodeType = 'text';
                textNode.textContent = tokenValue;
                editor.appendChild(textNode);
            }
            editor.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                inputType: 'insertText',
                data: tokenValue,
            }));
            targetButton.dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window,
            }));
        }""",
        [token, target_session_key],
    )


def collect_diagnostics(page, first_session_key: str, second_session_key: str) -> dict[str, object]:
    return page.evaluate(
        """([firstKey, secondKey]) => {
            const draftKey = (sessionKey) => `tracevane.chat.composer-draft:${sessionKey}`;
            return {
                path: window.location.pathname,
                activeSessionKey: document.querySelector('.chat-shell-session-row.active')?.getAttribute('data-session-key') || '',
                editorText: document.querySelector('.chat-composer-editor')?.value || document.querySelector('.chat-composer-editor')?.textContent || '',
                firstDraft: window.localStorage.getItem(draftKey(firstKey)),
                secondDraft: window.localStorage.getItem(draftKey(secondKey)),
                activeRowText: document.querySelector('.chat-shell-session-row.active')?.textContent || '',
            };
        }""",
        [first_session_key, second_session_key],
    )


def main() -> None:
    token = f"composer-switch-race-{int(time.time() * 1000)}"
    result: dict[str, object] = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1500, "height": 1000})

        wait_for_chat_surface(
            page,
            "http://127.0.0.1:5176/chat/workbench",
            selectors=(".chat-shell-session-list", ".chat-new-chat-trigger"),
        )

        first_session_key = open_new_chat(page)
        second_session_key = open_new_chat(page)
        goto_session(page, first_session_key)

        inject_draft_and_click_session_without_frame_gap(page, token, second_session_key)
        wait_for_active_session(page, second_session_key, timeout=60000)
        page.wait_for_timeout(500)

        first_draft = read_draft_storage(page, first_session_key)
        second_draft = read_draft_storage(page, second_session_key)
        second_editor_text = editor_text(page)

        goto_session(page, first_session_key)
        try:
            page.wait_for_function(
                """(tokenValue) => {
                    const editor = document.querySelector('.chat-composer-editor');
                    return Boolean(editor && (editor.value || editor.textContent || '').includes(tokenValue));
                }""",
                arg=token,
                timeout=8000,
            )
        except PlaywrightTimeoutError:
            pass
        first_editor_text = editor_text(page)

        page.screenshot(path=str(SCREENSHOT), full_page=True)

        first_draft_serialized = serialized(first_draft)
        second_draft_serialized = serialized(second_draft)
        result["firstSessionKey"] = first_session_key
        result["secondSessionKey"] = second_session_key
        result["firstDraftHasToken"] = token in first_draft_serialized
        result["secondDraftClean"] = token not in second_draft_serialized
        result["secondEditorCleanAfterFastSwitch"] = token not in second_editor_text
        result["firstEditorRestored"] = token in first_editor_text
        result["screenshot"] = str(SCREENSHOT)

        print(json.dumps(result, ensure_ascii=False, indent=2))

        failed = [
            key
            for key in [
                "firstDraftHasToken",
                "secondDraftClean",
                "secondEditorCleanAfterFastSwitch",
                "firstEditorRestored",
            ]
            if not result.get(key)
        ]
        if failed:
            result["diagnostics"] = collect_diagnostics(page, first_session_key, second_session_key)
            print(json.dumps(result, ensure_ascii=False, indent=2))
            raise SystemExit(f"composer draft session switch race smoke failed: {', '.join(failed)}")

        browser.close()


if __name__ == "__main__":
    try:
        main()
    except PlaywrightTimeoutError as error:
        raise SystemExit(f"composer draft session switch race smoke timed out: {error}") from error
