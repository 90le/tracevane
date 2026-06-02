from __future__ import annotations

import base64
import json
import re
import time
from pathlib import Path
from urllib.parse import unquote

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

from browser_surface import wait_for_active_session, wait_for_chat_surface
from upload_request import read_upload_payload


SCREENSHOT = Path("/tmp/openclaw-studio-chat-composer-ime-acceptance.png")


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
            editor.replaceChildren();
            const textNode = document.createElement('span');
            textNode.className = 'chat-composer-editor-text';
            textNode.dataset.composerNodeType = 'text';
            textNode.textContent = value;
            editor.appendChild(textNode);
            editor.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                inputType: 'insertText',
                data: value,
            }));
        }""",
        text,
    )
    page.wait_for_timeout(100)


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


def route_session_key(url: str, suffix: str) -> str:
    marker = "/api/chat/sessions/"
    if marker not in url:
        return ""
    encoded = url.split(marker, 1)[1].split(suffix, 1)[0]
    return unquote(encoded)


def runtime(active_run_id: str | None):
    now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    return {
        "gatewayConnected": True,
        "sessionWritable": True,
        "activeRunId": active_run_id,
        "state": "running" if active_run_id else "idle",
        "lastEventAt": now,
        "lastAckAt": now,
        "lastErrorCode": None,
        "lastErrorMessage": None,
    }


def dispatch_composing_ctrl_enter(page) -> bool:
    return bool(page.evaluate(
        """() => {
            const editor = document.querySelector('.chat-composer-editor[contenteditable="true"]');
            if (!editor) throw new Error('composer editor missing');
            editor.focus();
            editor.dispatchEvent(new CompositionEvent('compositionstart', {
                bubbles: true,
                data: '拼',
            }));
            const event = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                ctrlKey: true,
                bubbles: true,
                cancelable: true,
                composed: true,
                isComposing: true,
            });
            editor.dispatchEvent(event);
            return event.defaultPrevented;
        }"""
    ))


def finish_composition(page, token: str):
    page.evaluate(
        """(value) => {
            const editor = document.querySelector('.chat-composer-editor[contenteditable="true"]');
            if (!editor) throw new Error('composer editor missing');
            editor.dispatchEvent(new CompositionEvent('compositionend', {
                bubbles: true,
                data: value,
            }));
            editor.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                inputType: 'insertCompositionText',
                data: value,
            }));
        }""",
        token,
    )
    page.wait_for_timeout(100)


def wait_for_count(page, items: list[dict[str, object]], count: int, label: str, timeout=10000):
    deadline = time.monotonic() + (timeout / 1000)
    while time.monotonic() < deadline:
        if len(items) >= count:
            return
        page.wait_for_timeout(50)
    raise AssertionError(f"timed out waiting for {label}; expected {count}, got {len(items)}")


def main() -> None:
    token = f"composer-ime-{int(time.time() * 1000)}"
    send_payloads: list[dict[str, object]] = []
    console_errors: list[str] = []
    result: dict[str, object] = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1500, "height": 900})
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        def handle_send(route):
            payload = read_upload_payload(route.request)
            send_payloads.append(payload)
            session_key = route_session_key(route.request.url, "/send")
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps({
                    "accepted": True,
                    "sessionKey": session_key,
                    "sessionId": None,
                    "requestId": payload.get("clientRequestId") or "composer-ime-send",
                    "runId": "composer-ime-run",
                    "status": "started",
                    "runtime": runtime("composer-ime-run"),
                }),
            )

        page.route(re.compile(r".*/api/chat/sessions/.*/send$"), handle_send)

        wait_for_chat_surface(page, "http://127.0.0.1:5176/chat/workbench")
        open_new_chat(page)

        editor = page.locator(".chat-composer-editor[contenteditable='true']").first
        send_button = page.locator(".chat-composer-send").first
        fill_editor(page, editor, token)
        wait_button_enabled(send_button)

        composing_ctrl_enter_default_prevented = dispatch_composing_ctrl_enter(page)
        page.wait_for_timeout(250)
        if send_payloads:
            raise AssertionError(f"IME composition Ctrl+Enter must not send: {send_payloads}")
        send_count_during_composition = len(send_payloads)
        if not page.locator(".chat-composer-editor").first.inner_text().strip().startswith(token):
            raise AssertionError("IME composing draft text should remain in the composer")

        finish_composition(page, token)
        page.keyboard.press("Control+Enter")
        wait_for_count(page, send_payloads, 1, "/send after composition end")
        send_payload = send_payloads[0]
        if token not in str(send_payload.get("text") or ""):
            raise AssertionError(f"send after composition end missing text: {send_payload}")
        if console_errors:
            raise AssertionError("browser console errors: " + json.dumps(console_errors, ensure_ascii=False))

        result["sendRequests"] = len(send_payloads)
        result["sendRequestsDuringComposition"] = send_count_during_composition
        result["composingCtrlEnterDefaultPrevented"] = composing_ctrl_enter_default_prevented
        result["sendText"] = send_payload.get("text")
        result["screenshot"] = str(SCREENSHOT)
        page.screenshot(path=str(SCREENSHOT), full_page=True)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        browser.close()


if __name__ == "__main__":
    try:
        main()
    except PlaywrightTimeoutError as error:
        raise SystemExit(f"chat composer IME smoke timed out: {error}") from error
