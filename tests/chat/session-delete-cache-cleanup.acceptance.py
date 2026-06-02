from __future__ import annotations

import base64
import json
import re
import time
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

from browser_surface import wait_for_active_session, wait_for_chat_surface


SCREENSHOT = Path("/tmp/openclaw-studio-chat-session-delete-cache-cleanup-acceptance.png")


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


def fill_editor(page, token: str) -> None:
    page.evaluate(
        """(tokenValue) => {
            const editor = document.querySelector('.chat-composer-editor[contenteditable="true"]');
            if (!editor) throw new Error('missing composer editor');
            editor.focus();
            editor.replaceChildren();
            const textNode = document.createElement('span');
            textNode.className = 'chat-composer-editor-text';
            textNode.dataset.composerNodeType = 'text';
            textNode.textContent = tokenValue;
            editor.append(textNode);
            editor.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                inputType: 'insertText',
                data: tokenValue,
            }));
        }""",
        token,
    )


def wait_for_persisted_draft(page, session_key: str, token: str) -> None:
    key = f"openclaw-studio.chat.composer-draft:{session_key}"
    page.wait_for_function(
        """([keyName, tokenValue]) => {
            const raw = window.localStorage.getItem(keyName);
            return Boolean(raw && raw.includes(tokenValue));
        }""",
        arg=[key, token],
        timeout=15000,
    )


def seed_session_caches(page, session_key: str) -> None:
    page.evaluate(
        """(sessionKey) => {
            window.localStorage.setItem('openclaw-studio.chat.last-session-key', sessionKey);
            window.localStorage.setItem('openclaw-studio.chat.last-agent', 'main');
            window.localStorage.setItem(
                `openclaw-studio.chat.last-stream-seq:${sessionKey}`,
                JSON.stringify({ streamSeq: 9, updatedAtMs: Date.now() }),
            );
            window.localStorage.setItem(
                `openclaw-studio.chat.session-viewport:${sessionKey}`,
                JSON.stringify({
                    anchorItemId: 'msg-delete-cache',
                    anchorMessageId: 'delete-cache',
                    anchorOffset: 12,
                    bottomDistance: 300,
                    timelineItemCount: 3,
                    timelineVersion: 'delete-cache-v1',
                    capturedAtMs: Date.now(),
                }),
            );
            window.sessionStorage.setItem(
                `openclaw-studio.chat.runtime-snapshot.${sessionKey}`,
                JSON.stringify({ sessionKey, marker: 'delete-cache-runtime-snapshot' }),
            );
        }""",
        session_key,
    )


def read_session_caches(page, session_key: str) -> dict[str, object]:
    return page.evaluate(
        """(sessionKey) => ({
            draft: window.localStorage.getItem(`openclaw-studio.chat.composer-draft:${sessionKey}`),
            streamSeq: window.localStorage.getItem(`openclaw-studio.chat.last-stream-seq:${sessionKey}`),
            viewport: window.localStorage.getItem(`openclaw-studio.chat.session-viewport:${sessionKey}`),
            runtimeSnapshot: window.sessionStorage.getItem(`openclaw-studio.chat.runtime-snapshot.${sessionKey}`),
            lastSessionKey: window.localStorage.getItem('openclaw-studio.chat.last-session-key'),
            lastAgentId: window.localStorage.getItem('openclaw-studio.chat.last-agent'),
            rowExists: Boolean(document.querySelector(`.chat-shell-session-row[data-session-key="${CSS.escape(sessionKey)}"]`)),
            activeSessionKey: document.querySelector('.chat-shell-session-row.active')?.getAttribute('data-session-key') || '',
        })""",
        session_key,
    )


def open_menu_from_row(page, session_key: str):
    row = page.locator(f'.chat-shell-session-row[data-session-key="{session_key}"]').first
    row.wait_for(state="visible", timeout=30000)
    more_button = row.locator(".chat-shell-session-more").first
    if more_button.count() > 0 and more_button.is_visible():
        click_enabled(more_button)
    else:
        row.click(button="right")
    menu = page.locator(".cascade-menu").first
    menu.wait_for(state="visible", timeout=10000)
    return menu


def delete_session_via_ui(page, session_key: str) -> None:
    menu = open_menu_from_row(page, session_key)
    delete_item = menu.locator(".cascade-menu-item").filter(has_text=re.compile("删除|Delete")).first
    click_enabled(delete_item)
    dialog = page.locator(".confirm-dialog__surface").first
    dialog.wait_for(state="visible", timeout=10000)
    confirm_button = dialog.locator(".primary-button").first
    click_enabled(confirm_button)
    page.wait_for_function(
        """(sessionKey) => !document.querySelector(`.chat-shell-session-row[data-session-key="${CSS.escape(sessionKey)}"]`)""",
        arg=session_key,
        timeout=30000,
    )


def main() -> None:
    token = f"delete-cache-draft-{int(time.time() * 1000)}"
    result: dict[str, object] = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1500, "height": 1000})

        wait_for_chat_surface(
            page,
            "http://127.0.0.1:5176/chat/workbench",
            selectors=(".chat-shell-session-list", ".chat-new-chat-trigger"),
        )

        session_key = open_new_chat(page)
        fill_editor(page, token)
        wait_for_persisted_draft(page, session_key, token)
        seed_session_caches(page, session_key)
        before = read_session_caches(page, session_key)

        delete_session_via_ui(page, session_key)
        page.wait_for_timeout(500)
        after = read_session_caches(page, session_key)
        page.screenshot(path=str(SCREENSHOT), full_page=True)

        result["sessionKey"] = session_key
        result["draftSeeded"] = token in str(before.get("draft") or "")
        result["streamSeqSeeded"] = before.get("streamSeq") is not None
        result["viewportSeeded"] = before.get("viewport") is not None
        result["runtimeSnapshotSeeded"] = before.get("runtimeSnapshot") is not None
        result["lastSessionSeeded"] = before.get("lastSessionKey") == session_key
        result["rowRemoved"] = not after.get("rowExists")
        result["draftCleared"] = after.get("draft") is None
        result["streamSeqCleared"] = after.get("streamSeq") is None
        result["viewportCleared"] = after.get("viewport") is None
        result["runtimeSnapshotCleared"] = after.get("runtimeSnapshot") is None
        result["lastSessionRepaired"] = after.get("lastSessionKey") != session_key
        result["screenshot"] = str(SCREENSHOT)

        print(json.dumps(result, ensure_ascii=False, indent=2))

        failed = [
            key
            for key in [
                "draftSeeded",
                "streamSeqSeeded",
                "viewportSeeded",
                "runtimeSnapshotSeeded",
                "lastSessionSeeded",
                "rowRemoved",
                "draftCleared",
                "streamSeqCleared",
                "viewportCleared",
                "runtimeSnapshotCleared",
                "lastSessionRepaired",
            ]
            if not result.get(key)
        ]
        if failed:
            raise SystemExit(f"session delete cache cleanup smoke failed: {', '.join(failed)}")

        browser.close()


if __name__ == "__main__":
    try:
        main()
    except PlaywrightTimeoutError as error:
        raise SystemExit(f"session delete cache cleanup smoke timed out: {error}") from error
