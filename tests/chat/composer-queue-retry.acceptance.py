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
from upload_request import read_upload_payload


SCREENSHOT = Path("/tmp/tracevane-chat-composer-queue-retry-acceptance.png")


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


def write_temp_file(name: str, content: str) -> Path:
    root = Path(tempfile.mkdtemp(prefix="tracevane-chat-queue-retry-"))
    path = root / name
    path.write_text(content, encoding="utf-8")
    return path


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
    page.wait_for_function(
        """(fileName) => {
            const editor = document.querySelector('.chat-composer-editor');
            return Boolean(editor && (editor.value || editor.textContent || '').includes(`@${fileName}`));
        }""",
        arg=file_path.name,
        timeout=10000,
    )


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


def wait_for_count(page, items: list[dict[str, object]], count: int, label: str, timeout=10000):
    deadline = time.monotonic() + (timeout / 1000)
    while time.monotonic() < deadline:
        if len(items) >= count:
            return
        page.wait_for_timeout(50)
    raise AssertionError(f"timed out waiting for {label}; expected {count}, got {len(items)}")


def assert_file_ref_payload(payload: dict[str, object], file_name: str, label: str):
    file_refs = payload.get("fileRefs")
    if not isinstance(file_refs, list) or len(file_refs) != 1:
        raise AssertionError(f"{label} expected exactly one fileRef, got: {file_refs}")
    file_ref = file_refs[0]
    if file_ref.get("fileName") != file_name:
        raise AssertionError(f"{label} unexpected fileRef.fileName: {file_ref}")
    if not str(file_ref.get("resourceRef") or "").startswith("uploads:"):
        raise AssertionError(f"{label} fileRef must expose uploads: resourceRef: {file_ref}")
    if payload.get("attachments"):
        raise AssertionError(f"{label} must not duplicate uploaded files as inline attachments")


def main() -> None:
    first_token = f"composer-queue-retry-primer-{int(time.time() * 1000)}"
    retry_token = f"composer-queue-retry-{int(time.time() * 1000)}"
    file_path = write_temp_file("queue-retry-file.txt", "queue retry file fixture")
    blocked_reason = "temporary model outage"
    captured_send_payloads: list[dict[str, object]] = []
    captured_queue_payloads: list[dict[str, object]] = []
    captured_patch_payloads: list[dict[str, object]] = []
    console_errors: list[str] = []
    result: dict[str, object] = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1500, "height": 900})

        def record_console_error(msg):
            if msg.type != "error":
                return
            console_errors.append(msg.text)

        page.on("console", record_console_error)

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
                        "requestId": payload.get("clientRequestId") or "composer-queue-retry-send",
                        "runId": "composer-queue-retry-active-run",
                        "status": "started",
                        "runtime": runtime("composer-queue-retry-active-run"),
                    },
                ),
            )

        def handle_queue_post(route):
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
                                "id": "composer-queue-retry-blocked-item",
                                "sessionKey": session_key,
                                "clientRequestId": payload.get("clientRequestId"),
                                "deliveryRequestId": payload.get("clientRequestId") or "composer-queue-retry-delivery",
                                "text": payload.get("text") or "",
                                "previewText": payload.get("text") or "",
                                "composerDocument": payload.get("composerDocument"),
                                "fileRefs": payload.get("fileRefs"),
                                "attachments": payload.get("attachments"),
                                "createdAt": now,
                                "updatedAt": now,
                                "status": "blocked",
                                "blockedReason": blocked_reason,
                            },
                        ],
                    },
                ),
            )

        def handle_queue_patch(route):
            payload = read_upload_payload(route.request)
            captured_patch_payloads.append(payload)
            session_key = route_session_key(route.request.url, "/queue/")
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
                                "id": "composer-queue-retry-blocked-item",
                                "sessionKey": session_key,
                                "clientRequestId": payload.get("clientRequestId"),
                                "deliveryRequestId": payload.get("clientRequestId") or "composer-queue-retry-delivery",
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

        def handle_queue_route(route):
            if route.request.method == "POST":
                handle_queue_post(route)
                return
            if route.request.method == "PATCH":
                handle_queue_patch(route)
                return
            route.continue_()

        page.route(re.compile(r".*/api/chat/sessions/.*/send$"), handle_send)
        page.route(re.compile(r".*/api/chat/sessions/.*/queue(?:/[^/?]+)?(?:\\?.*)?$"), handle_queue_route)

        wait_for_chat_surface(page, "http://127.0.0.1:5176/chat/workbench")
        open_new_chat(page)

        editor = page.locator(".chat-composer-editor").first
        send_button = page.locator(".chat-composer-send").first

        fill_editor(page, editor, first_token)
        click_enabled(send_button)
        page.wait_for_function(
            "() => document.querySelector('.chat-composer-stop')"
            " || /Streaming|运行中|生成中|回复生成中/i.test(document.querySelector('.chat-conversation-pane__status')?.textContent || '')"
            " || /reply is still running|回复生成中|生成中/i.test(document.querySelector('.chat-composer-editor')?.getAttribute('data-placeholder') || '')",
            timeout=30000,
        )

        fill_editor(page, editor, f"{retry_token} ")
        upload_file_and_insert(page, file_path)
        click_enabled(send_button)
        wait_for_count(page, captured_queue_payloads, 1, "/queue POST")

        page.wait_for_function(
            """(reason) => {
                const rail = document.querySelector('.chat-queue-rail');
                return Boolean(
                    rail
                    && (rail.textContent || '').includes(reason)
                );
            }""",
            arg=blocked_reason,
            timeout=15000,
        )

        summary_trigger = page.locator(".chat-queue-rail__summary-trigger").first
        if summary_trigger.count() > 0:
            click_enabled(summary_trigger)
        page.wait_for_function(
            """([reason, tokenValue]) => {
                const rail = document.querySelector('.chat-queue-rail');
                return Boolean(
                    rail
                    && (rail.textContent || '').includes(reason)
                    && (rail.textContent || '').includes(tokenValue)
                    && rail.querySelector('.chat-queue-rail__item.blocked')
                );
            }""",
            arg=[blocked_reason, retry_token],
            timeout=15000,
        )
        blocked_item = page.locator(".chat-queue-rail__item.blocked").first
        blocked_item.wait_for(state="visible", timeout=10000)
        retry_button = blocked_item.get_by_role("button", name=re.compile("重试|Retry")).first
        click_enabled(retry_button)
        wait_for_count(page, captured_patch_payloads, 1, "/queue PATCH")

        page.wait_for_function(
            """([tokenValue, successZh, successEn]) => {
                const rail = document.querySelector('.chat-queue-rail');
                const toast = document.querySelector('.chat-shell-toast-success');
                return Boolean(
                    rail
                    && (rail.textContent || '').includes(tokenValue)
                    && !(rail.textContent || '').includes('temporary model outage')
                    && !rail.querySelector('.chat-queue-rail__item.blocked')
                    && toast
                    && ((toast.textContent || '').includes(successZh) || (toast.textContent || '').includes(successEn))
                );
            }""",
            arg=[retry_token, "已重新加入待发送队列", "Queued message retry scheduled"],
            timeout=15000,
        )

        if len(captured_send_payloads) != 1:
            raise AssertionError(f"expected one primer /send request, got {len(captured_send_payloads)}")
        if len(captured_queue_payloads) != 1:
            raise AssertionError(f"expected one /queue POST request, got {len(captured_queue_payloads)}")
        if len(captured_patch_payloads) != 1:
            raise AssertionError(f"expected one /queue PATCH request, got {len(captured_patch_payloads)}")

        queue_payload = captured_queue_payloads[0]
        patch_payload = captured_patch_payloads[0]
        assert_file_ref_payload(queue_payload, file_path.name, "queue")
        assert_file_ref_payload(patch_payload, file_path.name, "retry")
        if patch_payload.get("flushWhenIdle") is not True:
            raise AssertionError(f"retry payload must flush when idle: {patch_payload}")
        if patch_payload.get("clientRequestId") != queue_payload.get("clientRequestId"):
            raise AssertionError(f"retry must preserve clientRequestId: {patch_payload}")
        if retry_token not in str(patch_payload.get("text") or ""):
            raise AssertionError(f"retry payload text missing token: {patch_payload}")
        if not patch_payload.get("composerDocument"):
            raise AssertionError(f"retry payload must preserve composerDocument: {patch_payload}")
        if console_errors:
            raise AssertionError("browser console errors: " + json.dumps(console_errors, ensure_ascii=False))

        result["sendRequests"] = len(captured_send_payloads)
        result["queueRequests"] = len(captured_queue_payloads)
        result["retryPatchRequests"] = len(captured_patch_payloads)
        result["retryFlushWhenIdle"] = patch_payload.get("flushWhenIdle") is True
        result["clientRequestIdPreserved"] = patch_payload.get("clientRequestId") == queue_payload.get("clientRequestId")
        result["fileRefPreserved"] = patch_payload.get("fileRefs")
        result["composerDocumentPreserved"] = bool(patch_payload.get("composerDocument"))
        result["blockedCleared"] = page.locator(".chat-queue-rail__item.blocked").count() == 0
        result["toast"] = page.locator(".chat-shell-toast-success").first.inner_text()
        page.screenshot(path=str(SCREENSHOT), full_page=True)
        result["screenshot"] = str(SCREENSHOT)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        browser.close()


if __name__ == "__main__":
    try:
        main()
    except PlaywrightTimeoutError as error:
        raise SystemExit(f"chat composer queue retry smoke timed out: {error}") from error
