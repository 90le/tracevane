from __future__ import annotations

import base64
import json
import re
import tempfile
import time
from pathlib import Path
from urllib.parse import unquote

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

from browser_surface import wait_for_active_session, wait_for_chat_surface
from upload_request import install_files_upload_routes, read_upload_payload


SCREENSHOT = Path("/tmp/tracevane-chat-composer-upload-session-switch-acceptance.png")


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


def wait_for_count(page, items: list[object], count: int, label: str, timeout=10000):
    deadline = time.monotonic() + (timeout / 1000)
    while time.monotonic() < deadline:
        if len(items) >= count:
            return
        page.wait_for_timeout(50)
    raise AssertionError(f"timed out waiting for {label}; expected {count}, got {len(items)}")


def write_temp_file(name: str, content: str) -> Path:
    root = Path(tempfile.mkdtemp(prefix="tracevane-chat-upload-session-switch-"))
    path = root / name
    path.write_text(content, encoding="utf-8")
    return path


def session_ref(session_key: str) -> str:
    encoded = base64.urlsafe_b64encode(session_key.encode("utf-8")).decode("ascii").rstrip("=")
    return f"r1_{encoded}"


def route_session_key(url: str, suffix: str) -> str:
    marker = "/api/chat/sessions/"
    if marker not in url:
        return ""
    encoded = url.split(marker, 1)[1].split(suffix, 1)[0]
    return unquote(encoded)


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


def goto_session(page, session_key: str):
    page.goto(
        f"http://127.0.0.1:5176/chat/s/{session_ref(session_key)}",
        wait_until="domcontentloaded",
        timeout=30000,
    )
    wait_for_active_session(page, session_key, timeout=60000)
    page.wait_for_load_state("networkidle")


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


def upload_response(session_key: str, payload: dict[str, object]) -> dict[str, object]:
    file_name = str(payload.get("fileName") or "session-switch-upload.txt")
    relative_path = f".tracevane/chat-uploads/mock-{int(time.time() * 1000)}-{file_name}"
    resource_ref = f"files:project-root:{relative_path}"
    mime_type = str(payload.get("mimeType") or "text/plain")
    return {
        "ok": True,
        "sessionKey": session_key,
        "id": f"upload-{file_name}",
        "relativePath": relative_path,
        "resourceRef": resource_ref,
        "fileName": file_name,
        "mimeType": mime_type,
        "resource": {
            "id": f"resource-{file_name}",
            "kind": "file",
            "fileName": file_name,
            "mimeType": mime_type,
            "relativePath": relative_path,
            "resourceRef": resource_ref,
            "source": "user_upload",
            "url": f"/api/files/download?rootId=project-root&path={relative_path}",
            "downloadUrl": f"/api/files/download?rootId=project-root&path={relative_path}&download=true",
        },
    }


def read_draft_storage(page, session_key: str) -> dict[str, object]:
    key = f"tracevane.chat.composer-draft:{session_key}"
    raw = page.evaluate("(keyName) => window.localStorage.getItem(keyName)", key)
    if not raw:
        return {}
    return json.loads(raw)


def main() -> None:
    token = f"composer-upload-switch-{int(time.time() * 1000)}"
    other_token = f"composer-upload-switch-other-{int(time.time() * 1000)}"
    file_path = write_temp_file("session-switch-upload.txt", "session switch upload fixture")
    upload_payloads: list[dict[str, object]] = []
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
                    "requestId": payload.get("clientRequestId") or "composer-upload-session-switch-send",
                    "runId": "composer-upload-session-switch-run",
                    "status": "started",
                    "runtime": runtime("composer-upload-session-switch-run"),
                }),
            )

        install_files_upload_routes(page, upload_payloads, delay_first_init_ms=1200)
        page.route(re.compile(r".*/api/chat/sessions/.*/send$"), handle_send)

        wait_for_chat_surface(page, "http://127.0.0.1:5176/chat/workbench")
        first_session_key = open_new_chat(page)

        editor = page.locator(".chat-composer-editor").first
        fill_editor(page, editor, f"{token} ")
        page.locator(".chat-composer-file-input").set_input_files(str(file_path))
        wait_for_count(page, upload_payloads, 1, "Files upload init")

        page.wait_for_function(
            """(fileName) => {
                const uploadingItem = document.querySelector('.chat-composer-pool-item.uploading');
                return Boolean(uploadingItem && (uploadingItem.textContent || '').includes(fileName));
            }""",
            arg=file_path.name,
            timeout=15000,
        )

        second_session_key = open_new_chat(page)
        fill_editor(page, page.locator(".chat-composer-editor").first, other_token)

        page.wait_for_timeout(1500)

        goto_session(page, first_session_key)
        page.wait_for_function(
            """([tokenValue, fileName]) => {
                const editorText = document.querySelector('.chat-composer-editor')?.value || document.querySelector('.chat-composer-editor')?.textContent || '';
                const item = Array.from(document.querySelectorAll('.chat-composer-pool-item.ready'))
                    .find((candidate) => (candidate.textContent || '').includes(fileName));
                return Boolean(editorText.includes(tokenValue) && item);
            }""",
            arg=[token, file_path.name],
            timeout=15000,
        )

        persisted = read_draft_storage(page, first_session_key)
        if file_path.name not in json.dumps(persisted, ensure_ascii=False):
            raise AssertionError(f"completed upload must persist back to first session draft: {persisted}")

        pool_item = page.locator(".chat-composer-pool-item.ready").filter(has_text=file_path.name).first
        click_enabled(pool_item.locator(".chat-composer-pool-insert").first)
        click_enabled(page.locator(".chat-composer-send").first)
        wait_for_count(page, send_payloads, 1, "/send after returning to uploaded session")

        send_payload = send_payloads[0]
        if token not in str(send_payload.get("text") or ""):
            raise AssertionError(f"send after session-switch upload missing text: {send_payload}")
        file_refs = send_payload.get("fileRefs")
        if not isinstance(file_refs, list) or len(file_refs) != 1 or file_refs[0].get("fileName") != file_path.name:
            raise AssertionError(f"send after session-switch upload must include fileRef: {send_payload}")
        if console_errors:
            raise AssertionError("browser console errors: " + json.dumps(console_errors, ensure_ascii=False))

        result["firstSessionKey"] = first_session_key
        result["secondSessionKey"] = second_session_key
        result["uploadRequests"] = len(upload_payloads)
        result["sendRequests"] = len(send_payloads)
        result["restoredReadyAfterSwitch"] = True
        result["persistedAttachmentCount"] = len(persisted.get("attachments") or [])
        result["fileRefs"] = file_refs
        result["sendText"] = send_payload.get("text")
        result["screenshot"] = str(SCREENSHOT)
        page.screenshot(path=str(SCREENSHOT), full_page=True)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        browser.close()


if __name__ == "__main__":
    try:
        main()
    except PlaywrightTimeoutError as error:
        raise SystemExit(f"chat composer upload session switch smoke timed out: {error}") from error
