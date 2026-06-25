from __future__ import annotations

import json
import time
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

from browser_surface import wait_for_active_session, wait_for_chat_surface


SCREENSHOT = Path("/tmp/tracevane-chat-composer-keyboard-acceptance.png")


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


def fill_editor(page, locator, text: str):
    locator.wait_for(state="visible", timeout=10000)
    locator.evaluate(
        """(editor, value) => {
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
        }""",
        text,
    )
    page.wait_for_timeout(100)


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
    wait_for_active_session(page, session_key)
    page.wait_for_load_state("networkidle")
    return session_key


def assert_send_count(page, expected: int, label: str):
    actual = page.evaluate("() => window.__keyboardSendRequests?.length || 0")
    if actual != expected:
        raise AssertionError(f"{label}: expected {expected} /send request(s), got {actual}")


def install_delayed_send_fetch(page):
    page.add_init_script(
        """(() => {
            const originalFetch = window.fetch.bind(window);
            window.__keyboardSendRequests = [];
            window.__keyboardSendDelayMs = 900;
            window.fetch = async (input, init = {}) => {
                const rawUrl = typeof input === 'string'
                    ? input
                    : (input && input.url ? input.url : '');
                const requestUrl = new URL(rawUrl, window.location.href);
                const method = String(init?.method || input?.method || 'GET').toUpperCase();
                const isChatSend = method === 'POST'
                    && requestUrl.pathname.startsWith('/api/chat/sessions/')
                    && requestUrl.pathname.endsWith('/send');
                if (!isChatSend) {
                    return originalFetch(input, init);
                }

                let payload = {};
                try {
                    payload = JSON.parse(init?.body || '{}');
                } catch (_error) {
                    payload = {};
                }
                window.__keyboardSendRequests.push({
                    url: requestUrl.pathname,
                    payload,
                    at: Date.now(),
                });
                await new Promise((resolve) => setTimeout(resolve, window.__keyboardSendDelayMs));

                const encodedSessionKey = requestUrl.pathname
                    .slice('/api/chat/sessions/'.length)
                    .replace(/\\/send$/, '');
                const sessionKey = decodeURIComponent(encodedSessionKey);
                const now = new Date().toISOString();
                const requestId = payload.clientRequestId || 'composer-keyboard-send';
                return new Response(JSON.stringify({
                    accepted: true,
                    sessionKey,
                    sessionId: null,
                    requestId,
                    runId: 'composer-keyboard-active-run',
                    status: 'started',
                    runtime: {
                        gatewayConnected: true,
                        sessionWritable: true,
                        activeRunId: 'composer-keyboard-active-run',
                        state: 'running',
                        lastEventAt: now,
                        lastAckAt: now,
                        lastErrorCode: null,
                        lastErrorMessage: null,
                    },
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            };
        })();"""
    )


def main() -> None:
    first_token = f"composer-keyboard-send-{int(time.time() * 1000)}"
    busy_token = f"composer-keyboard-busy-{int(time.time() * 1000)}"
    console_errors: list[str] = []
    result: dict[str, object] = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1500, "height": 900})
        page.on(
            "console",
            lambda msg: console_errors.append(msg.text) if msg.type == "error" else None,
        )
        install_delayed_send_fetch(page)

        wait_for_chat_surface(page, "http://127.0.0.1:5176/chat/workbench")
        open_new_chat(page)

        editor = page.locator(".chat-composer-editor").first
        send_button = page.locator(".chat-composer-send").first
        send_button.wait_for(state="visible", timeout=30000)
        fill_editor(page, editor, first_token)
        wait_button_enabled(send_button)

        page.keyboard.press("Enter")
        page.wait_for_timeout(120)
        assert_send_count(page, 0, "plain Enter must keep editing instead of sending")

        page.keyboard.press("Shift+Enter")
        page.wait_for_timeout(120)
        assert_send_count(page, 0, "Shift+Enter must keep editing instead of sending")

        page.keyboard.press("Control+Enter")
        page.wait_for_function(
            "() => window.__keyboardSendRequests?.length === 1",
            timeout=5000,
        )
        page.wait_for_function(
            "() => document.querySelector('.chat-composer-send')?.disabled === true",
            timeout=5000,
        )

        send_payload = page.evaluate("() => window.__keyboardSendRequests[0].payload")
        if first_token not in str(send_payload.get("text") or ""):
            raise AssertionError(f"send payload text missing token: {send_payload}")

        fill_editor(page, page.locator(".chat-composer-editor").first, busy_token)
        page.keyboard.press("Control+Enter")
        page.wait_for_timeout(180)
        assert_send_count(page, 1, "sendBusy keyboard reentry must not issue a second direct send")
        busy_draft_retained = page.evaluate(
            "(token) => (document.querySelector('.chat-composer-editor')?.value || document.querySelector('.chat-composer-editor')?.textContent || '').includes(token)",
            busy_token,
        )
        if not busy_draft_retained:
            raise AssertionError("busy draft should remain in the composer after sendBusy reentry is blocked")

        page.wait_for_function(
            "() => window.__keyboardSendRequests?.length === 1"
            " && document.querySelector('.chat-composer-send')?.disabled === false",
            timeout=10000,
        )

        if console_errors:
            raise AssertionError("browser console errors: " + json.dumps(console_errors, ensure_ascii=False))

        result["sendRequests"] = page.evaluate("() => window.__keyboardSendRequests.length")
        result["sendText"] = send_payload.get("text")
        result["busyDraftRetained"] = busy_draft_retained
        page.screenshot(path=str(SCREENSHOT), full_page=True)
        result["screenshot"] = str(SCREENSHOT)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        browser.close()


if __name__ == "__main__":
    try:
        main()
    except PlaywrightTimeoutError as error:
        raise SystemExit(f"chat composer keyboard smoke timed out: {error}") from error
