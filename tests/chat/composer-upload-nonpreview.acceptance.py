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


SCREENSHOT = Path("/tmp/tracevane-chat-composer-upload-nonpreview-acceptance.png")


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
            f"http://127.0.0.1:5176/chat/s/{session_ref(session_key)}",
            wait_until="domcontentloaded",
            timeout=30000,
        )
        wait_for_active_session(page, session_key, timeout=60000)
    page.wait_for_load_state("networkidle")
    return session_key


def write_temp_file(name: str, content: bytes) -> Path:
    root = Path(tempfile.mkdtemp(prefix="tracevane-chat-upload-nonpreview-"))
    path = root / name
    path.write_bytes(content)
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
    file_name = str(payload.get("fileName") or "nonpreview.pdf")
    mime_type = str(payload.get("mimeType") or "application/pdf")
    relative_path = f".tracevane/chat-uploads/mock-{int(time.time() * 1000)}-{file_name}"
    resource_ref = f"files:project-root:{relative_path}"
    return {
        "ok": True,
        "sessionKey": session_key,
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


def install_read_probe(page) -> None:
    page.add_init_script(
        r"""(() => {
            const nativeReadAsDataUrl = FileReader.prototype.readAsDataURL;
            const nativeArrayBuffer = Blob.prototype.arrayBuffer;
            window.__composerUploadReadProbe = {
                dataUrlReads: [],
                arrayBufferReads: [],
            };

            FileReader.prototype.readAsDataURL = function(blob) {
                window.__composerUploadReadProbe.dataUrlReads.push({
                    fileName: blob && typeof blob.name === 'string' ? blob.name : '',
                    size: blob && typeof blob.size === 'number' ? blob.size : null,
                    type: blob && typeof blob.type === 'string' ? blob.type : '',
                });
                return nativeReadAsDataUrl.call(this, blob);
            };

            Blob.prototype.arrayBuffer = function() {
                window.__composerUploadReadProbe.arrayBufferReads.push({
                    fileName: this && typeof this.name === 'string' ? this.name : '',
                    size: this && typeof this.size === 'number' ? this.size : null,
                    type: this && typeof this.type === 'string' ? this.type : '',
                });
                return nativeArrayBuffer.call(this);
            };
        })();"""
    )


def read_probe(page) -> dict[str, object]:
    return page.evaluate("() => window.__composerUploadReadProbe || { dataUrlReads: [], arrayBufferReads: [] }")


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


def main() -> None:
    token = f"composer-upload-nonpreview-{int(time.time() * 1000)}"
    file_path = write_temp_file(
        "nonpreview-upload.pdf",
        b"%PDF-1.4\n% openclaw tracevane non-preview upload fixture\n" + (b"x" * 4096),
    )
    upload_payloads: list[dict[str, object]] = []
    send_payloads: list[dict[str, object]] = []
    console_errors: list[str] = []
    result: dict[str, object] = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1500, "height": 900})
        install_read_probe(page)
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

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
                    "requestId": payload.get("clientRequestId") or "composer-upload-nonpreview-send",
                    "runId": "composer-upload-nonpreview-run",
                    "status": "started",
                    "runtime": runtime("composer-upload-nonpreview-run"),
                }),
            )

        install_files_upload_routes(page, upload_payloads)
        page.route(re.compile(r".*/api/chat/sessions/.*/send$"), handle_send)

        wait_for_chat_surface(page, "http://127.0.0.1:5176/chat/workbench")
        open_new_chat(page)
        fill_editor(page, token)
        page.locator(".chat-composer-file-input").set_input_files(str(file_path))
        wait_for_count(page, upload_payloads, 1, "Files upload init")

        upload_payload = upload_payloads[0]
        if upload_payload.get("fileName") != file_path.name:
            raise AssertionError(f"upload lost file name: {upload_payload}")
        if upload_payload.get("_filesApi") != "init":
            raise AssertionError(f"upload must initialize through Files API: {upload_payload}")
        if not str(upload_payload.get("relativePath") or "").startswith(".tracevane/chat-uploads/"):
            raise AssertionError(f"upload must target the shared Chat upload directory: {upload_payload}")

        probe_after_upload = read_probe(page)
        data_url_reads = probe_after_upload.get("dataUrlReads") or []
        array_buffer_reads = probe_after_upload.get("arrayBufferReads") or []
        if any(read.get("fileName") == file_path.name for read in data_url_reads):
            raise AssertionError(f"non-preview file should not use readAsDataURL: {probe_after_upload}")
        if any(read.get("fileName") == file_path.name for read in array_buffer_reads):
            raise AssertionError(f"non-preview file should stream binary chunks without pre-reading the whole file: {probe_after_upload}")

        page.wait_for_function(
            """(fileName) => {
                const item = Array.from(document.querySelectorAll('.chat-composer-pool-item'))
                    .find((candidate) => (candidate.textContent || '').includes(fileName));
                return item && item.classList.contains('ready');
            }""",
            arg=file_path.name,
            timeout=15000,
        )

        click_enabled(page.locator(".chat-composer-send").first)
        wait_for_count(page, send_payloads, 1, "/send POST")
        send_payload = send_payloads[0]
        if token not in str(send_payload.get("text") or ""):
            raise AssertionError(f"send lost draft text: {send_payload}")
        file_refs = send_payload.get("fileRefs")
        if not isinstance(file_refs, list) or len(file_refs) != 1:
            raise AssertionError(f"send must include one fileRef: {send_payload}")
        if file_refs[0].get("fileName") != file_path.name:
            raise AssertionError(f"send fileRef lost file name: {send_payload}")
        if send_payload.get("attachments"):
            raise AssertionError(f"non-preview upload must not send inline attachments: {send_payload}")
        if console_errors:
            raise AssertionError("browser console errors: " + json.dumps(console_errors, ensure_ascii=False))

        result.update({
            "uploadFileName": upload_payload.get("fileName"),
            "uploadRequestBodyLength": int(upload_payload.get("size") or 0),
            "filesApi": upload_payload.get("_filesApi"),
            "relativePath": upload_payload.get("relativePath"),
            "dataUrlReadCount": len(data_url_reads),
            "arrayBufferReadCount": len(array_buffer_reads),
            "sendFileRefs": file_refs,
            "inlineAttachments": bool(send_payload.get("attachments")),
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
        raise SystemExit(f"chat composer non-preview upload smoke timed out: {error}") from error
