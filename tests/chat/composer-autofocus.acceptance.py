from __future__ import annotations

import base64
import json
import time
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

from browser_surface import wait_for_active_session, wait_for_chat_surface


DESKTOP_SCREENSHOT = Path("/tmp/tracevane-chat-composer-autofocus-desktop.png")
MOBILE_SCREENSHOT = Path("/tmp/tracevane-chat-composer-autofocus-mobile.png")


def install_send_fetch_probe(page) -> None:
    page.add_init_script(
        r"""(() => {
            const originalFetch = window.fetch.bind(window);
            window.__composerAutofocusSendRequests = [];
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
                window.__composerAutofocusSendRequests.push(payload);

                const encodedSessionKey = requestUrl.pathname
                    .slice('/api/chat/sessions/'.length)
                    .replace(/\/send$/, '');
                const sessionKey = decodeURIComponent(encodedSessionKey);
                const now = new Date().toISOString();
                const requestId = payload.clientRequestId || 'composer-autofocus-send';
                return new Response(JSON.stringify({
                    accepted: true,
                    sessionKey,
                    sessionId: null,
                    requestId,
                    runId: 'composer-autofocus-run',
                    status: 'started',
                    runtime: {
                        gatewayConnected: true,
                        sessionWritable: true,
                        activeRunId: 'composer-autofocus-run',
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


def click_enabled(locator, timeout=30000):
    locator.wait_for(state="visible", timeout=timeout)
    locator.page.wait_for_function(
        "(el) => !el.disabled",
        arg=locator.element_handle(),
        timeout=timeout,
    )
    locator.page.wait_for_timeout(80)
    locator.evaluate("(el) => el.click()")


def wait_for_composer_focused(page, label: str, timeout=10000) -> None:
    try:
        page.wait_for_function(
            """() => {
                const active = document.activeElement;
                return Boolean(active && active.classList.contains('chat-composer-editor'));
            }""",
            timeout=timeout,
        )
    except PlaywrightTimeoutError as error:
        active = page.evaluate(
            """() => {
                const active = document.activeElement;
                return active
                    ? {
                        tag: active.tagName,
                        className: String(active.className || ''),
                        text: (active.textContent || '').slice(0, 120),
                    }
                    : null;
            }"""
        )
        raise AssertionError(f"{label}: composer did not receive focus; active={active}") from error


def composer_focused(page) -> bool:
    return bool(
        page.evaluate(
            """() => {
                const active = document.activeElement;
                return Boolean(active && active.classList.contains('chat-composer-editor'));
            }"""
        )
    )


def session_ref(session_key: str) -> str:
    encoded = base64.urlsafe_b64encode(session_key.encode("utf-8")).decode("ascii").rstrip("=")
    return f"r1_{encoded}"


def fill_editor(page, text: str) -> None:
    page.locator(".chat-composer-editor").first.evaluate(
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


def send_request_count(page) -> int:
    return int(page.evaluate("() => window.__composerAutofocusSendRequests?.length || 0"))


def create_session_from_picker(page) -> str:
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


def open_session_route(page, session_key: str) -> None:
    wait_for_chat_surface(
        page,
        f"http://127.0.0.1:5176/chat/s/{session_ref(session_key)}",
        selectors=(".chat-conversation-pane",),
    )
    wait_for_active_session(page, session_key)


def main() -> None:
    result: dict[str, object] = {}
    desktop_console_errors: list[str] = []
    mobile_console_errors: list[str] = []
    first_session_key = ""
    second_session_key = ""

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        desktop = browser.new_page(viewport={"width": 1440, "height": 900})
        install_send_fetch_probe(desktop)
        desktop.on(
            "console",
            lambda msg: desktop_console_errors.append(msg.text) if msg.type == "error" else None,
        )
        wait_for_chat_surface(desktop, "http://127.0.0.1:5176/chat")

        first_session_key = create_session_from_picker(desktop)
        wait_for_composer_focused(desktop, "new desktop chat")
        first_create_focus = composer_focused(desktop)
        send_focus_token = f"composer-click-send-focus-{int(time.time() * 1000)}"
        fill_editor(desktop, send_focus_token)
        desktop.locator(".chat-composer-send").first.click()
        desktop.wait_for_function(
            "() => window.__composerAutofocusSendRequests?.length === 1",
            timeout=5000,
        )
        click_send_request_count = send_request_count(desktop)
        click_send_payload_text = desktop.evaluate(
            "() => String(window.__composerAutofocusSendRequests?.[0]?.text || '')"
        )
        if send_focus_token not in click_send_payload_text:
            raise AssertionError(f"click send payload missing token: {click_send_payload_text}")
        desktop.wait_for_timeout(180)
        click_send_focus = composer_focused(desktop)
        if not click_send_focus:
            raise AssertionError("desktop click send should keep focus in the composer")

        second_session_key = create_session_from_picker(desktop)
        wait_for_composer_focused(desktop, "second desktop chat")
        second_create_focus = composer_focused(desktop)

        open_session_route(desktop, first_session_key)
        wait_for_composer_focused(desktop, "desktop session switch")
        switch_focus = composer_focused(desktop)
        desktop.screenshot(path=str(DESKTOP_SCREENSHOT), full_page=True)

        mobile_context = browser.new_context(
            viewport={"width": 390, "height": 840},
            is_mobile=True,
            has_touch=True,
        )
        mobile = mobile_context.new_page()
        mobile.on(
            "console",
            lambda msg: mobile_console_errors.append(msg.text) if msg.type == "error" else None,
        )
        wait_for_chat_surface(
            mobile,
            f"http://127.0.0.1:5176/chat/s/{session_ref(second_session_key)}",
            selectors=(".chat-conversation-pane",),
        )
        wait_for_active_session(mobile, second_session_key)
        mobile.wait_for_timeout(500)
        mobile_route_focus = composer_focused(mobile)
        mobile.screenshot(path=str(MOBILE_SCREENSHOT), full_page=True)

        if desktop_console_errors:
            raise AssertionError("desktop console errors: " + json.dumps(desktop_console_errors, ensure_ascii=False))
        if mobile_console_errors:
            raise AssertionError("mobile console errors: " + json.dumps(mobile_console_errors, ensure_ascii=False))
        if mobile_route_focus:
            raise AssertionError("mobile route selection should not autofocus composer and raise the keyboard")

        result.update({
            "firstSessionKey": first_session_key,
            "secondSessionKey": second_session_key,
            "firstCreateFocus": first_create_focus,
            "secondCreateFocus": second_create_focus,
            "switchFocus": switch_focus,
            "clickSendFocus": click_send_focus,
            "sendRequests": click_send_request_count,
            "mobileRouteFocus": mobile_route_focus,
            "desktopScreenshot": str(DESKTOP_SCREENSHOT),
            "mobileScreenshot": str(MOBILE_SCREENSHOT),
            "timestamp": int(time.time() * 1000),
        })
        print(json.dumps(result, ensure_ascii=False, indent=2))
        mobile_context.close()
        browser.close()


if __name__ == "__main__":
    try:
        main()
    except PlaywrightTimeoutError as error:
        raise SystemExit(f"chat composer autofocus smoke timed out: {error}") from error
