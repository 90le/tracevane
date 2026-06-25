from __future__ import annotations

import base64
import json
import re
import time
from pathlib import Path
from urllib.parse import unquote

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

from browser_surface import canonical_chat_url, wait_for_active_session, wait_for_chat_surface
from upload_request import install_files_upload_routes, read_upload_payload


SCREENSHOT = Path("/tmp/tracevane-chat-composer-paste-mixed-acceptance.png")


def click_enabled(locator, timeout=30000):
    locator.wait_for(state="visible", timeout=timeout)
    locator.page.wait_for_function(
        "(el) => !el.disabled",
        arg=locator.element_handle(),
        timeout=timeout,
    )
    locator.page.wait_for_timeout(80)
    locator.evaluate("(el) => el.click()")


def wait_for_count(page, items: list[dict[str, object]], count: int, label: str, timeout=10000):
    deadline = time.monotonic() + (timeout / 1000)
    while time.monotonic() < deadline:
        if len(items) >= count:
            return
        page.wait_for_timeout(50)
    raise AssertionError(f"timed out waiting for {label}; expected {count}, got {len(items)}")


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
            canonical_chat_url(f"http://127.0.0.1:5176/chat/s/{session_ref(session_key)}"),
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


def paste_text_and_file(page, text: str, file_name: str) -> None:
    page.locator(".chat-composer-editor").first.evaluate(
        """(editor, payload) => {
            editor.focus();
            if (typeof editor.setSelectionRange === 'function') {
                const end = (editor.value || '').length;
                editor.setSelectionRange(end, end);
            }

            const data = new DataTransfer();
            data.setData('text/plain', payload.text);
            data.items.add(new File(['paste fixture'], payload.fileName, { type: 'text/plain' }));

            let event;
            try {
                event = new ClipboardEvent('paste', {
                    clipboardData: data,
                    bubbles: true,
                    cancelable: true,
                });
            } catch (_error) {
                event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
            }
            if (!event.clipboardData) {
                Object.defineProperty(event, 'clipboardData', { value: data });
            }
            const cancelled = !editor.dispatchEvent(event);
            window.__composerPasteMixed = {
                defaultPrevented: Boolean(event.defaultPrevented || cancelled),
                text: editor.value || editor.textContent || '',
            };
        }""",
        {"text": text, "fileName": file_name},
    )


def assert_file_ref_payload(payload: dict[str, object], token: str, file_name: str):
    text = str(payload.get("text") or "")
    if token not in text:
        raise AssertionError(f"send payload lost pasted text: {text}")
    file_refs = payload.get("fileRefs")
    if not isinstance(file_refs, list) or len(file_refs) != 1:
        raise AssertionError(f"expected one pasted fileRef, got: {file_refs}")
    file_ref = file_refs[0]
    if not isinstance(file_ref, dict) or file_ref.get("fileName") != file_name:
        raise AssertionError(f"unexpected pasted fileRef: {file_ref}")
    if not str(file_ref.get("relativePath") or "").startswith(".tracevane/chat-uploads/"):
        raise AssertionError(f"pasted fileRef must point at shared Chat upload directory: {file_ref}")
    if not str(file_ref.get("resourceRef") or "").startswith("files:project-root:"):
        raise AssertionError(f"pasted fileRef must expose Files API resourceRef: {file_ref}")
    if payload.get("attachments"):
        raise AssertionError(f"pasted upload must not fall back to inline attachments: {payload.get('attachments')}")


def main() -> None:
    token = f"composer-paste-mixed-{int(time.time() * 1000)}"
    file_name = "paste-mixed-file.txt"
    upload_payloads: list[dict[str, object]] = []
    captured_send_payloads: list[dict[str, object]] = []
    console_errors: list[str] = []
    result: dict[str, object] = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1500, "height": 900})
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        def handle_send(route):
            payload = read_upload_payload(route.request)
            captured_send_payloads.append(payload)
            session_key = route_session_key(route.request.url, "/send")
            request_id = payload.get("clientRequestId") or "composer-paste-mixed-send"
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(
                    {
                        "accepted": True,
                        "sessionKey": session_key,
                        "sessionId": None,
                        "requestId": request_id,
                        "runId": "composer-paste-mixed-run",
                        "status": "started",
                        "runtime": runtime("composer-paste-mixed-run"),
                    },
                ),
            )

        install_files_upload_routes(page, upload_payloads)
        page.route(re.compile(r".*/api/chat/sessions/.*/send$"), handle_send)

        wait_for_chat_surface(page, "http://127.0.0.1:5176/chat/workbench")
        open_new_chat(page)

        paste_text_and_file(page, token, file_name)
        page.wait_for_function(
            """(tokenValue) => {
                const editor = document.querySelector('.chat-composer-editor');
                return Boolean(editor && (editor.value || editor.textContent || '').includes(tokenValue));
            }""",
            arg=token,
            timeout=10000,
        )
        paste_state = page.evaluate("() => window.__composerPasteMixed || null")
        if not paste_state or not paste_state.get("defaultPrevented"):
            raise AssertionError(f"mixed paste should prevent the browser default action: {paste_state}")

        wait_for_count(page, upload_payloads, 1, "Files upload init")
        if upload_payloads[0].get("fileName") != file_name:
            raise AssertionError(f"upload lost pasted file name: {upload_payloads[0]}")

        page.wait_for_function(
            """(fileName) => {
                const items = Array.from(document.querySelectorAll('.chat-composer-pool-item'));
                return items.some((item) => {
                    const text = item.textContent || '';
                    return text.includes(fileName)
                        && item.classList.contains('ready');
                });
            }""",
            arg=file_name,
            timeout=30000,
        )

        send_button = page.get_by_role("button", name=re.compile("^发送$|^Send$")).first
        click_enabled(send_button)
        wait_for_count(page, captured_send_payloads, 1, "/send POST")
        assert_file_ref_payload(captured_send_payloads[0], token, file_name)

        if console_errors:
            raise AssertionError("browser console errors: " + json.dumps(console_errors, ensure_ascii=False))

        result.update({
            "tokenPreserved": token in str(captured_send_payloads[0].get("text") or ""),
            "uploadFileName": upload_payloads[0].get("fileName"),
            "sendFileRefs": captured_send_payloads[0].get("fileRefs"),
            "inlineAttachments": bool(captured_send_payloads[0].get("attachments")),
            "screenshot": str(SCREENSHOT),
            "timestamp": int(time.time() * 1000),
        })
        page.screenshot(path=str(SCREENSHOT), full_page=True)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        browser.close()


if __name__ == "__main__":
    try:
        main()
    except PlaywrightTimeoutError as error:
        raise SystemExit(f"chat composer mixed paste smoke timed out: {error}") from error
