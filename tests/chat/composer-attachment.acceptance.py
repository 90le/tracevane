from __future__ import annotations

import base64
import json
import re
import tempfile
import time
from pathlib import Path
from urllib.parse import unquote

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import expect, sync_playwright

from browser_surface import wait_for_active_session, wait_for_chat_surface
from upload_request import read_upload_payload


SCREENSHOT = Path("/tmp/openclaw-studio-chat-composer-attachment-acceptance.png")


def wait_button_enabled(locator, timeout=30000):
    locator.wait_for(state="visible", timeout=timeout)
    locator.page.wait_for_function(
        "(el) => !el.disabled",
        arg=locator.element_handle(),
        timeout=timeout,
    )


def click_enabled(locator, timeout=30000):
    wait_button_enabled(locator, timeout=timeout)
    locator.page.wait_for_timeout(100)
    locator.evaluate("(el) => el.click()")


def fill_editor(page, locator, text):
    locator.click()
    page.keyboard.press("Control+A")
    page.keyboard.press("Backspace")
    page.keyboard.type(text, delay=1)
    page.wait_for_timeout(150)


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


def write_temp_file(name: str, content: str) -> Path:
    root = Path(tempfile.mkdtemp(prefix="openclaw-studio-chat-attachment-"))
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


def upload_file_and_insert(page, file_path: Path):
    page.locator(".chat-composer-file-input").set_input_files(str(file_path))
    page.wait_for_function(
        """(fileName) => {
            const items = Array.from(document.querySelectorAll('.chat-composer-pool-item'));
            return items.some((item) => {
                const text = item.textContent || '';
                return text.includes(fileName)
                    && (/Ready|已就绪/.test(text))
                    && item.classList.contains('ready');
            });
        }""",
        arg=file_path.name,
        timeout=30000,
    )
    pool_item = page.locator(".chat-composer-pool-item").filter(has_text=file_path.name).first
    click_enabled(pool_item.locator(".chat-composer-pool-insert").first)
    page.wait_for_function(
        """(fileName) => {
            const editor = document.querySelector('.chat-composer-editor');
            return Boolean(editor && (editor.textContent || '').includes(`@${fileName}`));
        }""",
        arg=file_path.name,
        timeout=10000,
    )


def assert_file_ref_payload(payload: dict, file_name: str, label: str):
    file_refs = payload.get("fileRefs")
    if not isinstance(file_refs, list) or len(file_refs) != 1:
        raise AssertionError(f"{label} expected exactly one fileRef, got: {file_refs}")
    file_ref = file_refs[0]
    if file_ref.get("fileName") != file_name:
        raise AssertionError(f"{label} unexpected fileRef.fileName: {file_ref}")
    if not str(file_ref.get("relativePath") or "").startswith("uploads/"):
        raise AssertionError(f"{label} fileRef must point at uploads/: {file_ref}")
    if not str(file_ref.get("resourceRef") or "").startswith("uploads:"):
        raise AssertionError(f"{label} fileRef must expose uploads: resourceRef: {file_ref}")
    if payload.get("attachments"):
        raise AssertionError(f"{label} must not duplicate uploaded files as inline attachments")
    text = str(payload.get("text") or "")
    if file_name not in text or "uploads:" not in text:
        raise AssertionError(f"{label} text must include a portable uploads: markdown ref: {text}")


def wait_for_count(page, items: list[dict], count: int, label: str, timeout=10000):
    deadline = time.monotonic() + (timeout / 1000)
    while time.monotonic() < deadline:
        if len(items) >= count:
            return
        page.wait_for_timeout(50)
    raise AssertionError(f"timed out waiting for {label}; expected {count}, got {len(items)}")


def main() -> None:
    first_file = write_temp_file("composer-send-one.txt", "send payload fixture")
    second_file = write_temp_file("composer-queue-two.txt", "queue payload fixture")
    first_token = f"composer-send-{int(time.time() * 1000)}"
    second_token = f"composer-queue-{int(time.time() * 1000)}"

    captured_send_payloads: list[dict] = []
    captured_queue_payloads: list[dict] = []
    result: dict[str, object] = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1500, "height": 1000})

        def handle_send(route):
            payload = read_upload_payload(route.request)
            captured_send_payloads.append(payload)
            session_key = route_session_key(route.request.url, "/send")
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(
                    {
                        "accepted": True,
                        "sessionKey": session_key,
                        "sessionId": None,
                        "requestId": payload.get("clientRequestId") or "composer-attachment-send",
                        "runId": "composer-attachment-active-run",
                        "status": "started",
                        "runtime": runtime("composer-attachment-active-run"),
                    },
                ),
            )

        def handle_queue(route):
            payload = read_upload_payload(route.request)
            captured_queue_payloads.append(payload)
            session_key = route_session_key(route.request.url, "/queue")
            now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(
                    {
                        "checkedAt": now,
                        "session": None,
                        "items": [
                            {
                                "id": "composer-attachment-queued-item",
                                "sessionKey": session_key,
                                "clientRequestId": payload.get("clientRequestId"),
                                "deliveryRequestId": payload.get("clientRequestId") or "composer-attachment-delivery",
                                "text": payload.get("text") or "",
                                "previewText": payload.get("text") or "",
                                "composerDocument": payload.get("composerDocument"),
                                "fileRefs": payload.get("fileRefs"),
                                "attachments": payload.get("attachments"),
                                "createdAt": now,
                                "updatedAt": now,
                                "status": "queued",
                                "blockedReason": None,
                            },
                        ],
                    },
                ),
            )

        page.route(re.compile(r".*/api/chat/sessions/.*/send$"), handle_send)
        page.route(
            re.compile(r".*/api/chat/sessions/.*/queue(?:\?.*)?$"),
            lambda route: handle_queue(route)
            if route.request.method == "POST"
            else route.continue_(),
        )

        wait_for_chat_surface(page, "http://127.0.0.1:5176/chat/workbench")
        open_new_chat(page)

        editor = page.locator(".chat-composer-editor[contenteditable='true']").first
        send_button = page.get_by_role("button", name=re.compile("^发送$|^Send$")).first

        fill_editor(page, editor, f"{first_token} ")
        upload_file_and_insert(page, first_file)
        click_enabled(send_button)
        page.wait_for_function(
            "([token, fileName]) => (document.querySelector('.chat-conversation-thread')?.textContent || '').includes(token)"
            " && (document.querySelector('.chat-conversation-thread')?.textContent || '').includes(fileName)",
            arg=[first_token, first_file.name],
            timeout=30000,
        )

        page.wait_for_function(
            "() => document.querySelector('.chat-composer-editor[contenteditable=\"true\"]')"
            " && !document.querySelector('.chat-composer-editor[contenteditable=\"true\"]')?.textContent?.trim()",
            timeout=10000,
        )
        page.wait_for_function(
            "() => document.querySelector('.chat-composer-stop')"
            " || /Streaming|运行中|生成中|回复生成中/i.test(document.querySelector('.chat-conversation-pane__status')?.textContent || '')"
            " || /reply is still running|回复生成中|生成中/i.test(document.querySelector('.chat-composer-editor')?.getAttribute('data-placeholder') || '')",
            timeout=30000,
        )

        fill_editor(page, editor, f"{second_token} ")
        upload_file_and_insert(page, second_file)
        click_enabled(send_button)
        wait_for_count(page, captured_queue_payloads, 1, "/queue POST")
        page.wait_for_function(
            "() => document.querySelector('.chat-queue-rail')"
            " && /附件 1|Assets 1/.test(document.querySelector('.chat-queue-rail')?.textContent || '')",
            timeout=30000,
        )

        if len(captured_send_payloads) != 1:
            raise AssertionError(f"expected one /send request, got {len(captured_send_payloads)}")
        if len(captured_queue_payloads) != 1:
            raise AssertionError(f"expected one /queue POST request, got {len(captured_queue_payloads)}")

        send_payload = captured_send_payloads[0]
        queue_payload = captured_queue_payloads[0]
        assert_file_ref_payload(send_payload, first_file.name, "send")
        assert_file_ref_payload(queue_payload, second_file.name, "queue")
        if queue_payload.get("flushWhenIdle") is not True:
            raise AssertionError(f"queue payload must flush when idle: {queue_payload}")

        result["send_file_refs"] = send_payload.get("fileRefs")
        result["queue_file_refs"] = queue_payload.get("fileRefs")
        result["send_has_inline_attachments"] = bool(send_payload.get("attachments"))
        result["queue_has_inline_attachments"] = bool(queue_payload.get("attachments"))
        result["queue_flush_when_idle"] = queue_payload.get("flushWhenIdle") is True
        result["queue_rail_summary"] = page.locator(".chat-queue-rail").first.inner_text()

        page.screenshot(path=str(SCREENSHOT), full_page=True)
        result["screenshot"] = str(SCREENSHOT)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        browser.close()


if __name__ == "__main__":
    try:
        main()
    except PlaywrightTimeoutError as error:
        raise SystemExit(f"chat composer attachment smoke timed out: {error}") from error
