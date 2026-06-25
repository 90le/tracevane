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


SCREENSHOT = Path("/tmp/tracevane-chat-composer-draft-attachment-acceptance.png")


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


def goto_session(page, session_key: str) -> None:
    page.goto(
        f"http://127.0.0.1:5176/chat/s/{session_ref(session_key)}",
        wait_until="domcontentloaded",
        timeout=30000,
    )
    wait_for_active_session(page, session_key, timeout=60000)
    page.wait_for_load_state("networkidle")


def write_temp_file(name: str, content: str) -> Path:
    root = Path(tempfile.mkdtemp(prefix="tracevane-chat-draft-attachment-"))
    path = root / name
    path.write_text(content, encoding="utf-8")
    return path


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


def upload_response(session_key: str, payload: dict[str, object]) -> dict[str, object]:
    file_name = str(payload.get("fileName") or "draft-attachment.txt")
    mime_type = str(payload.get("mimeType") or "text/plain")
    relative_path = f"uploads/draft-{int(time.time() * 1000)}-{file_name}"
    return {
        "ok": True,
        "relativePath": relative_path,
        "resourceRef": f"uploads:{relative_path.removeprefix('uploads/')}",
        "absolutePath": f"/tmp/{relative_path}",
        "fileName": file_name,
        "mimeType": mime_type,
        "kind": "file",
        "size": len(str(payload.get("content") or "")),
        "resource": {
            "id": "composer-draft-attachment-upload",
            "kind": "file",
            "url": f"/api/chat/sessions/{session_key}/media/{relative_path}",
            "downloadUrl": f"/api/chat/sessions/{session_key}/media/{relative_path}?download=1",
            "fileName": file_name,
            "mimeType": mime_type,
            "relativePath": relative_path,
            "originalPath": relative_path,
            "source": "user_upload",
            "status": "ready",
            "placement": "inline",
        },
    }


def wait_for_count(page, items: list[dict[str, object]], count: int, label: str, timeout=10000):
    deadline = time.monotonic() + (timeout / 1000)
    while time.monotonic() < deadline:
        if len(items) >= count:
            return
        page.wait_for_timeout(50)
    raise AssertionError(f"timed out waiting for {label}; expected {count}, got {len(items)}")


def wait_for_editor_resource(page, token: str, file_name: str, timeout=15000):
    page.wait_for_function(
        """([tokenValue, fileName]) => {
            const editor = document.querySelector('.chat-composer-editor[contenteditable="true"]');
            const text = editor?.textContent || '';
            const resource = editor?.querySelector('[data-composer-node-type="resource"]');
            return Boolean(text.includes(tokenValue) && text.includes(`@${fileName}`) && resource);
        }""",
        arg=[token, file_name],
        timeout=timeout,
    )


def upload_file_and_insert(page, file_path: Path):
    page.locator(".chat-composer-file-input").set_input_files(str(file_path))
    page.wait_for_function(
        """(fileName) => {
            const items = Array.from(document.querySelectorAll('.chat-composer-pool-item'));
            return items.some((item) => {
                const text = item.textContent || '';
                return text.includes(fileName)
                    && item.classList.contains('ready');
            });
        }""",
        arg=file_path.name,
        timeout=30000,
    )
    pool_item = page.locator(".chat-composer-pool-item").filter(has_text=file_path.name).first
    click_enabled(pool_item.locator(".chat-composer-pool-insert").first)
    wait_for_editor_resource(page, "", file_path.name, timeout=10000)


def read_draft_storage(page, session_key: str) -> dict[str, object]:
    key = f"tracevane.chat.composer-draft:{session_key}"
    raw = page.evaluate("(keyName) => window.localStorage.getItem(keyName)", key)
    if not raw:
        return {}
    return json.loads(raw)


def wait_for_persisted_draft(page, session_key: str, token: str, file_name: str):
    key = f"tracevane.chat.composer-draft:{session_key}"
    page.wait_for_function(
        """([keyName, tokenValue, fileName]) => {
            const raw = window.localStorage.getItem(keyName);
            if (!raw) return false;
            try {
                const parsed = JSON.parse(raw);
                const serialized = JSON.stringify(parsed);
                return parsed.version === 1
                    && Array.isArray(parsed.attachments)
                    && parsed.attachments.length === 1
                    && parsed.attachments[0]?.fileName === fileName
                    && parsed.attachments[0]?.uploadState === 'ready'
                    && !('content' in parsed.attachments[0])
                    && serialized.includes(tokenValue)
                    && serialized.includes(fileName);
            } catch {
                return false;
            }
        }""",
        arg=[key, token, file_name],
        timeout=15000,
    )


def assert_file_ref_payload(payload: dict[str, object], file_name: str, token: str):
    file_refs = payload.get("fileRefs")
    if not isinstance(file_refs, list) or len(file_refs) != 1:
        raise AssertionError(f"send expected exactly one fileRef, got: {payload}")
    file_ref = file_refs[0]
    if file_ref.get("fileName") != file_name:
        raise AssertionError(f"send fileRef did not preserve filename: {payload}")
    if not str(file_ref.get("resourceRef") or "").startswith("uploads:"):
        raise AssertionError(f"send fileRef must expose uploads: resourceRef: {payload}")
    if payload.get("attachments"):
        raise AssertionError(f"send must not duplicate persisted uploads as inline attachments: {payload}")
    text = str(payload.get("text") or "")
    if token not in text or file_name not in text or "uploads:" not in text:
        raise AssertionError(f"send text must preserve draft text and portable upload ref: {payload}")
    document = payload.get("composerDocument")
    if not isinstance(document, list) or not any(
        isinstance(node, dict) and node.get("type") == "resource-ref" for node in document
    ):
        raise AssertionError(f"send composerDocument must preserve resource-ref node: {payload}")


def main() -> None:
    token = f"composer-draft-file-{int(time.time() * 1000)}"
    other_token = f"composer-draft-other-{int(time.time() * 1000)}"
    file_path = write_temp_file("draft-persisted-file.txt", "draft attachment fixture")
    upload_payloads: list[dict[str, object]] = []
    send_payloads: list[dict[str, object]] = []
    console_errors: list[str] = []
    result: dict[str, object] = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1500, "height": 950})

        def record_console_error(msg):
            if msg.type == "error":
                console_errors.append(msg.text)

        page.on("console", record_console_error)

        def handle_upload(route):
            payload = read_upload_payload(route.request)
            upload_payloads.append(payload)
            session_key = route_session_key(route.request.url, "/upload")
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(upload_response(session_key, payload)),
            )

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
                    "requestId": payload.get("clientRequestId") or "composer-draft-attachment-send",
                    "runId": "composer-draft-attachment-run",
                    "status": "started",
                    "runtime": runtime("composer-draft-attachment-run"),
                }),
            )

        install_files_upload_routes(page, upload_payloads)
        page.route(re.compile(r".*/api/chat/sessions/.*/send$"), handle_send)

        wait_for_chat_surface(page, "http://127.0.0.1:5176/chat/workbench")

        first_session_key = open_new_chat(page)
        editor = page.locator(".chat-composer-editor[contenteditable='true']").first
        fill_editor(page, editor, f"{token} ")
        upload_file_and_insert(page, file_path)
        wait_for_count(page, upload_payloads, 1, "/upload")
        wait_for_editor_resource(page, token, file_path.name)
        wait_for_persisted_draft(page, first_session_key, token, file_path.name)
        first_stored_before_switch = read_draft_storage(page, first_session_key)

        second_session_key = open_new_chat(page)
        fill_editor(page, page.locator(".chat-composer-editor[contenteditable='true']").first, other_token)
        page.wait_for_timeout(450)

        goto_session(page, first_session_key)
        wait_for_editor_resource(page, token, file_path.name)
        restored_after_switch = page.locator(".chat-composer-pool-item.ready").filter(has_text=file_path.name).count() == 1

        page.reload(wait_until="domcontentloaded", timeout=30000)
        wait_for_active_session(page, first_session_key, timeout=60000)
        page.wait_for_load_state("networkidle")
        wait_for_editor_resource(page, token, file_path.name)
        restored_after_reload = page.locator(".chat-composer-pool-item.ready").filter(has_text=file_path.name).count() == 1

        send_button = page.locator(".chat-composer-send").first
        click_enabled(send_button)
        wait_for_count(page, send_payloads, 1, "/send")
        assert_file_ref_payload(send_payloads[0], file_path.name, token)
        if console_errors:
            raise AssertionError("browser console errors: " + json.dumps(console_errors, ensure_ascii=False))

        result["firstSessionKey"] = first_session_key
        result["secondSessionKey"] = second_session_key
        result["uploadRequests"] = len(upload_payloads)
        result["sendRequests"] = len(send_payloads)
        result["storedAttachmentCount"] = len(first_stored_before_switch.get("attachments") or [])
        result["storedDraftHasContentField"] = any(
            isinstance(attachment, dict) and "content" in attachment
            for attachment in (first_stored_before_switch.get("attachments") or [])
        )
        result["restoredAfterSwitch"] = restored_after_switch
        result["restoredAfterReload"] = restored_after_reload
        result["sendHasInlineAttachments"] = bool(send_payloads[0].get("attachments"))
        result["fileRefs"] = send_payloads[0].get("fileRefs")
        result["screenshot"] = str(SCREENSHOT)
        page.screenshot(path=str(SCREENSHOT), full_page=True)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        browser.close()


if __name__ == "__main__":
    try:
        main()
    except PlaywrightTimeoutError as error:
        raise SystemExit(f"chat composer draft attachment smoke timed out: {error}") from error
