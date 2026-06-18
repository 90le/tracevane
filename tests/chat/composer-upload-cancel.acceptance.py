from __future__ import annotations

import base64
import json
import re
import tempfile
import time
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

from browser_surface import wait_for_active_session, wait_for_chat_surface
from upload_request import read_upload_payload


SCREENSHOT = Path("/tmp/tracevane-chat-composer-upload-cancel-acceptance.png")


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


def wait_for_count(page, items: list[object], count: int, label: str, timeout=10000):
    deadline = time.monotonic() + (timeout / 1000)
    while time.monotonic() < deadline:
        if len(items) >= count:
            return
        page.wait_for_timeout(50)
    raise AssertionError(f"timed out waiting for {label}; expected {count}, got {len(items)}")


def write_temp_file(name: str, content: str) -> Path:
    root = Path(tempfile.mkdtemp(prefix="tracevane-chat-upload-cancel-"))
    path = root / name
    path.write_text(content, encoding="utf-8")
    return path


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


def main() -> None:
    token = f"composer-upload-cancel-{int(time.time() * 1000)}"
    file_path = write_temp_file("upload-cancel-inflight.txt", "upload cancel fixture")
    failure_message = "simulated late upload outage after removal"
    upload_payloads: list[dict[str, object]] = []
    upload_routes: list[object] = []
    send_payloads: list[dict[str, object]] = []
    console_errors: list[str] = []
    result: dict[str, object] = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1500, "height": 900})

        def record_console_error(msg):
            if msg.type != "error":
                return
            if "Failed to load resource: the server responded with a status of 500" in msg.text:
                return
            console_errors.append(msg.text)

        page.on("console", record_console_error)

        def handle_upload(route):
            upload_payloads.append(read_upload_payload(route.request))
            upload_routes.append(route)

        def handle_send(route):
            payload = read_upload_payload(route.request)
            send_payloads.append(payload)
            session_key = route.request.url.split("/api/chat/sessions/", 1)[1].split("/send", 1)[0]
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps({
                    "accepted": True,
                    "sessionKey": session_key,
                    "sessionId": None,
                    "requestId": payload.get("clientRequestId") or "composer-upload-cancel-send",
                    "runId": "composer-upload-cancel-run",
                    "status": "started",
                    "runtime": runtime("composer-upload-cancel-run"),
                }),
            )

        page.route(re.compile(r".*/api/chat/sessions/.*/upload(?:\?.*)?$"), handle_upload)
        page.route(re.compile(r".*/api/chat/sessions/.*/send$"), handle_send)

        wait_for_chat_surface(page, "http://127.0.0.1:5176/chat/workbench")
        open_new_chat(page)

        editor = page.locator(".chat-composer-editor[contenteditable='true']").first
        send_button = page.locator(".chat-composer-send").first
        fill_editor(page, editor, token)
        page.locator(".chat-composer-file-input").set_input_files(str(file_path))
        wait_for_count(page, upload_routes, 1, "/upload request")

        page.wait_for_function(
            """(fileName) => {
                const uploadingItem = document.querySelector('.chat-composer-pool-item.uploading');
                return Boolean(
                    uploadingItem
                    && (uploadingItem.textContent || '').includes(fileName)
                    && uploadingItem.querySelector('.chat-composer-attachment-remove')
                );
            }""",
            arg=file_path.name,
            timeout=15000,
        )

        uploading_item = page.locator(".chat-composer-pool-item.uploading").filter(has_text=file_path.name).first
        click_enabled(uploading_item.locator(".chat-composer-attachment-remove").first)
        page.wait_for_function(
            """(tokenValue) => {
                const editor = document.querySelector('.chat-composer-editor');
                const send = document.querySelector('.chat-composer-send');
                return Boolean(
                    editor
                    && (editor.textContent || '').includes(tokenValue)
                    && !document.querySelector('.chat-composer-pool-item')
                    && !document.querySelector('.chat-shell-toast-error')
                    && send
                    && !send.disabled
                );
            }""",
            arg=token,
            timeout=15000,
        )

        upload_routes[0].fulfill(
            status=500,
            content_type="application/json",
            body=json.dumps({
                "error": {
                    "code": "upload_failed",
                    "message": failure_message,
                },
            }),
        )
        page.wait_for_timeout(500)
        stale_error_visible = page.locator(".chat-shell-toast-error").filter(has_text=failure_message).count() > 0
        if stale_error_visible:
            raise AssertionError("removed uploading attachment must ignore late upload failure toast")
        if page.locator(".chat-composer-pool-item").count() > 0:
            raise AssertionError("removed uploading attachment must not reappear after late upload failure")

        click_enabled(send_button)
        wait_for_count(page, send_payloads, 1, "/send after canceling upload")
        send_payload = send_payloads[0]
        if token not in str(send_payload.get("text") or ""):
            raise AssertionError(f"send after upload cancel missing draft text: {send_payload}")
        if send_payload.get("fileRefs"):
            raise AssertionError(f"send after upload cancel must not include fileRefs: {send_payload}")
        if send_payload.get("attachments"):
            raise AssertionError(f"send after upload cancel must not include inline attachments: {send_payload}")
        if console_errors:
            raise AssertionError("browser console errors: " + json.dumps(console_errors, ensure_ascii=False))

        result["uploadRequests"] = len(upload_payloads)
        result["sendRequests"] = len(send_payloads)
        result["lateUploadFailureIgnored"] = not stale_error_visible
        result["poolItemCountAfterLateFailure"] = page.locator(".chat-composer-pool-item").count()
        result["sendText"] = send_payload.get("text")
        result["fileRefs"] = send_payload.get("fileRefs")
        result["sendHasInlineAttachments"] = bool(send_payload.get("attachments"))
        result["screenshot"] = str(SCREENSHOT)
        page.screenshot(path=str(SCREENSHOT), full_page=True)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        browser.close()


if __name__ == "__main__":
    try:
        main()
    except PlaywrightTimeoutError as error:
        raise SystemExit(f"chat composer upload cancel smoke timed out: {error}") from error
