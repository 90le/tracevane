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


SCREENSHOT = Path("/tmp/tracevane-chat-composer-queue-failure-acceptance.png")


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


def write_temp_file(name: str, content: str) -> Path:
    root = Path(tempfile.mkdtemp(prefix="tracevane-chat-queue-failure-"))
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


def main() -> None:
    first_token = f"composer-queue-primer-{int(time.time() * 1000)}"
    failed_token = f"composer-queue-failure-{int(time.time() * 1000)}"
    file_path = write_temp_file("queue-failure-rollback.txt", "queue failure rollback fixture")
    failure_message = "simulated queue outage"
    captured_send_payloads: list[dict[str, object]] = []
    captured_queue_payloads: list[dict[str, object]] = []
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
                        "requestId": payload.get("clientRequestId") or "composer-queue-failure-send",
                        "runId": "composer-queue-failure-active-run",
                        "status": "started",
                        "runtime": runtime("composer-queue-failure-active-run"),
                    },
                ),
            )

        def fail_queue(route):
            payload = read_upload_payload(route.request)
            captured_queue_payloads.append(payload)
            route.fulfill(
                status=500,
                content_type="application/json",
                body=json.dumps({
                    "error": {
                        "code": "queue_failed",
                        "message": failure_message,
                    },
                }),
            )

        page.route(re.compile(r".*/api/chat/sessions/.*/send$"), handle_send)
        page.route(
            re.compile(r".*/api/chat/sessions/.*/queue(?:\\?.*)?$"),
            lambda route: fail_queue(route)
            if route.request.method == "POST"
            else route.continue_(),
        )

        wait_for_chat_surface(page, "http://127.0.0.1:5176/chat/workbench")
        open_new_chat(page)

        editor = page.locator(".chat-composer-editor[contenteditable='true']").first
        send_button = page.locator(".chat-composer-send").first

        fill_editor(page, editor, first_token)
        click_enabled(send_button)
        page.wait_for_function(
            "() => document.querySelector('.chat-composer-stop')"
            " || /Streaming|运行中|生成中|回复生成中/i.test(document.querySelector('.chat-conversation-pane__status')?.textContent || '')"
            " || /reply is still running|回复生成中|生成中/i.test(document.querySelector('.chat-composer-editor')?.getAttribute('data-placeholder') || '')",
            timeout=30000,
        )

        fill_editor(page, editor, f"{failed_token} ")
        upload_file_and_insert(page, file_path)
        click_enabled(send_button)
        wait_for_count(page, captured_queue_payloads, 1, "/queue POST")

        page.wait_for_function(
            """([message, tokenValue, fileName]) => {
                const toast = document.querySelector('.chat-shell-toast-error');
                const editorText = document.querySelector('.chat-composer-editor')?.textContent || '';
                const poolText = Array.from(document.querySelectorAll('.chat-composer-pool-item.ready'))
                    .map((item) => item.textContent || '')
                    .join('\\n');
                const railText = document.querySelector('.chat-queue-rail')?.textContent || '';
                const send = document.querySelector('.chat-composer-send');
                return Boolean(
                    toast
                    && (toast.textContent || '').includes(message)
                    && editorText.includes(tokenValue)
                    && editorText.includes(fileName)
                    && poolText.includes(fileName)
                    && !railText.includes(tokenValue)
                    && send
                    && !send.disabled
                );
            }""",
            arg=[failure_message, failed_token, file_path.name],
            timeout=15000,
        )

        if len(captured_send_payloads) != 1:
            raise AssertionError(f"expected one primer /send request, got {len(captured_send_payloads)}")
        if len(captured_queue_payloads) != 1:
            raise AssertionError(f"expected one failed /queue request, got {len(captured_queue_payloads)}")

        queue_payload = captured_queue_payloads[0]
        if failed_token not in str(queue_payload.get("text") or ""):
            raise AssertionError(f"failed queue payload text missing token: {queue_payload}")
        file_refs = queue_payload.get("fileRefs")
        if not isinstance(file_refs, list) or len(file_refs) != 1 or file_refs[0].get("fileName") != file_path.name:
            raise AssertionError(f"failed queue payload must include fileRef: {queue_payload}")
        if queue_payload.get("flushWhenIdle") is not True:
            raise AssertionError(f"queue payload must flush when idle: {queue_payload}")
        if console_errors:
            raise AssertionError("browser console errors: " + json.dumps(console_errors, ensure_ascii=False))

        result["sendRequests"] = len(captured_send_payloads)
        result["queueRequests"] = len(captured_queue_payloads)
        result["draftRetained"] = page.evaluate(
            "(tokenValue) => (document.querySelector('.chat-composer-editor')?.textContent || '').includes(tokenValue)",
            failed_token,
        )
        result["fileRefRetained"] = page.evaluate(
            "(fileName) => Array.from(document.querySelectorAll('.chat-composer-pool-item.ready'))"
            ".some((item) => (item.textContent || '').includes(fileName))",
            file_path.name,
        )
        result["optimisticQueueCleared"] = page.evaluate(
            "(tokenValue) => !((document.querySelector('.chat-queue-rail')?.textContent || '').includes(tokenValue))",
            failed_token,
        )
        result["activeRunStillVisible"] = page.locator(".chat-composer-stop").count() > 0
        result["payloadFileRefs"] = file_refs
        result["toast"] = page.locator(".chat-shell-toast-error").first.inner_text()
        page.screenshot(path=str(SCREENSHOT), full_page=True)
        result["screenshot"] = str(SCREENSHOT)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        browser.close()


if __name__ == "__main__":
    try:
        main()
    except PlaywrightTimeoutError as error:
        raise SystemExit(f"chat composer queue failure smoke timed out: {error}") from error
