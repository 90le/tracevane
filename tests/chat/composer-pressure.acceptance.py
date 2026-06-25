from __future__ import annotations

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


SCREENSHOT = Path("/tmp/tracevane-chat-composer-pressure-acceptance.png")
QUEUE_ITEM_COUNT = 8
ATTACHMENT_COUNT = 8


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
    wait_for_active_session(page, session_key)
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


def write_temp_files(count: int) -> list[Path]:
    root = Path(tempfile.mkdtemp(prefix="tracevane-chat-pressure-"))
    paths: list[Path] = []
    for index in range(count):
        path = root / f"pressure-asset-{index + 1}.txt"
        path.write_text(f"composer pressure attachment {index + 1}", encoding="utf-8")
        paths.append(path)
    return paths


def upload_attachment_pool(page, paths: list[Path]):
    page.locator(".chat-composer-file-input").set_input_files([str(path) for path in paths])
    expected_names = [path.name for path in paths]
    page.wait_for_function(
        """(fileNames) => {
            const items = Array.from(document.querySelectorAll('.chat-composer-pool-item.ready'));
            const text = items.map((item) => item.textContent || '').join('\\n');
            return fileNames.every((name) => text.includes(name));
        }""",
        arg=expected_names,
        timeout=45000,
    )


def wait_for_count(page, items: list[object], count: int, label: str, timeout=10000):
    deadline = time.monotonic() + (timeout / 1000)
    while time.monotonic() < deadline:
        if len(items) >= count:
            return True
        page.wait_for_timeout(50)
    return False


def read_composer_diagnostics(page) -> dict[str, object]:
    return page.evaluate(
        """() => {
            const editor = document.querySelector('.chat-composer-editor');
            const send = document.querySelector('.chat-composer-send');
            const stop = document.querySelector('.chat-composer-stop');
            return {
              url: window.location.href,
              editorText: (editor?.value || editor?.textContent || '').slice(0, 220),
              editorPlaceholder: editor?.getAttribute('data-placeholder') || '',
              sendDisabled: send ? send.hasAttribute('disabled') : null,
              stopVisible: Boolean(stop),
              queueItemCount: document.querySelectorAll('.chat-queue-rail__item').length,
              queueSummary: (document.querySelector('.chat-queue-rail')?.textContent || '').slice(0, 320),
            };
        }"""
    )


def active_runtime_event(session_key: str) -> dict[str, object]:
    now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    return {
        "kind": "runtime.state",
        "sessionKey": session_key,
        "runId": "composer-pressure-active-run",
        "emittedAt": now,
        "runtime": runtime("composer-pressure-active-run"),
    }


def measure_pressure_layout(page) -> dict[str, object]:
    return page.evaluate(
        """() => {
            const rect = (selector) => {
              const el = document.querySelector(selector);
              if (!el) return null;
              const box = el.getBoundingClientRect();
              return {
                top: box.top,
                bottom: box.bottom,
                height: box.height,
                width: box.width,
                clientHeight: el.clientHeight,
                clientWidth: el.clientWidth,
                scrollHeight: el.scrollHeight,
                scrollWidth: el.scrollWidth,
                overflowY: getComputedStyle(el).overflowY,
                overflowX: getComputedStyle(el).overflowX,
                maxHeight: getComputedStyle(el).maxHeight,
              };
            };
            return {
              viewportHeight: window.innerHeight,
              composer: rect('.chat-conversation-pane__composer'),
              thread: rect('.chat-conversation-thread'),
              queueRail: rect('.chat-queue-rail'),
              queuePanel: rect('.chat-queue-rail__panel'),
              editor: rect('.chat-composer-editor'),
              resourcePool: rect('.chat-composer-resource-pool'),
              queuePresentationMode: document.querySelector('.chat-queue-rail')?.getAttribute('data-presentation-mode') || '',
              queueItemCount: document.querySelectorAll('.chat-queue-rail__item').length,
              attachmentCount: document.querySelectorAll('.chat-composer-pool-item.ready').length,
              composerTextLength: (document.querySelector('.chat-composer-editor')?.value || document.querySelector('.chat-composer-editor')?.textContent || '').length,
            };
        }"""
    )


def assert_pressure_layout(metrics: dict[str, object]):
    viewport_height = float(metrics["viewportHeight"])
    composer = metrics.get("composer") or {}
    thread = metrics.get("thread") or {}
    queue_panel = metrics.get("queuePanel") or {}
    resource_pool = metrics.get("resourcePool") or {}

    composer_height = float(composer.get("height") or 0)
    composer_client = float(composer.get("clientHeight") or 0)
    composer_scroll = float(composer.get("scrollHeight") or 0)
    composer_client_width = float(composer.get("clientWidth") or 0)
    composer_scroll_width = float(composer.get("scrollWidth") or 0)
    thread_client = float(thread.get("clientHeight") or 0)
    queue_client = float(queue_panel.get("clientHeight") or 0)
    queue_scroll = float(queue_panel.get("scrollHeight") or 0)
    resource_pool_client = float(resource_pool.get("clientHeight") or 0)
    editor_client_width = float((metrics.get("editor") or {}).get("clientWidth") or 0)
    editor_scroll_width = float((metrics.get("editor") or {}).get("scrollWidth") or 0)

    composer_limit = min(viewport_height * 0.48, 460)
    queue_limit = min(viewport_height * 0.30, 280)

    checks = {
        "rail_mode": metrics.get("queuePresentationMode") == "rail",
        "queue_items_rendered": int(metrics.get("queueItemCount") or 0) >= QUEUE_ITEM_COUNT,
        "attachments_ready": int(metrics.get("attachmentCount") or 0) >= ATTACHMENT_COUNT,
        "long_draft_present": int(metrics.get("composerTextLength") or 0) >= 1600,
        "composer_is_capped": composer_height <= composer_limit + 4,
        "composer_scrolls_under_pressure": composer_scroll > composer_client + 24,
        "composer_no_horizontal_overflow": composer_scroll_width <= composer_client_width + 2,
        "editor_no_horizontal_overflow": editor_scroll_width <= editor_client_width + 2,
        "thread_remains_usable": thread_client >= max(300, viewport_height * 0.30),
        "queue_panel_is_capped": queue_client <= queue_limit + 4,
        "queue_panel_scrolls": queue_scroll > queue_client + 24,
        "resource_pool_capped": resource_pool_client <= 118,
        "composer_overflow_auto": composer.get("overflowY") == "auto",
        "queue_overflow_auto": queue_panel.get("overflowY") == "auto",
    }
    failed = [name for name, passed in checks.items() if not passed]
    if failed:
        raise AssertionError(
            "composer pressure layout failed: "
            + ", ".join(failed)
            + "\n"
            + json.dumps({"checks": checks, "metrics": metrics}, ensure_ascii=False, indent=2)
        )
    metrics["checks"] = checks


def main() -> None:
    files = write_temp_files(ATTACHMENT_COUNT)
    queued_items: list[dict[str, object]] = []
    captured_send_payloads: list[dict[str, object]] = []
    captured_queue_payloads: list[dict[str, object]] = []
    chat_streams: list[object] = []
    console_errors: list[str] = []
    result: dict[str, object] = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1500, "height": 900})
        page.on(
            "console",
            lambda msg: console_errors.append(msg.text) if msg.type == "error" else None,
        )
        def keep_chat_stream_open(web_socket):
            chat_streams.append(web_socket)
            web_socket.on_message(lambda _message: None)

        def emit_active_runtime(session_key: str):
            event = json.dumps(active_runtime_event(session_key))
            for web_socket in chat_streams[:]:
                try:
                    web_socket.send(event)
                except Exception:
                    try:
                        chat_streams.remove(web_socket)
                    except ValueError:
                        pass

        page.route_web_socket(re.compile(r".*/ws/chat(?:\?.*)?$"), keep_chat_stream_open)

        def handle_send(route):
            payload = read_upload_payload(route.request)
            captured_send_payloads.append(payload)
            session_key = route_session_key(route.request.url, "/send")
            emit_active_runtime(session_key)
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(
                    {
                        "accepted": True,
                        "sessionKey": session_key,
                        "sessionId": None,
                        "requestId": payload.get("clientRequestId") or "composer-pressure-send",
                        "runId": "composer-pressure-active-run",
                        "status": "started",
                        "runtime": runtime("composer-pressure-active-run"),
                    },
                ),
            )

        def handle_queue(route):
            payload = read_upload_payload(route.request)
            captured_queue_payloads.append(payload)
            session_key = route_session_key(route.request.url, "/queue")
            now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
            queue_index = len(queued_items) + 1
            emit_active_runtime(session_key)
            queued_items.append(
                {
                    "id": f"composer-pressure-queued-{queue_index}",
                    "sessionKey": session_key,
                    "clientRequestId": payload.get("clientRequestId"),
                    "deliveryRequestId": payload.get("clientRequestId") or f"composer-pressure-delivery-{queue_index}",
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
            )
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(
                    {
                        "checkedAt": now,
                        "session": None,
                        "items": queued_items,
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
        session_key = open_new_chat(page)

        editor = page.locator(".chat-composer-editor").first
        send_button = page.get_by_role("button", name=re.compile("^发送$|^Send$")).first

        fill_editor(page, editor, "composer pressure starts active run")
        click_enabled(send_button)
        page.wait_for_function(
            "() => document.querySelector('.chat-composer-stop')"
            " || /reply is still running|回复生成中|生成中/i.test(document.querySelector('.chat-composer-editor')?.getAttribute('data-placeholder') || '')",
            timeout=30000,
        )

        for index in range(QUEUE_ITEM_COUNT):
            queue_text = (
                f"pressure queued message {index + 1} "
                + ("with enough preview text to make each queue row tall and realistic. " * 6)
            )
            expected_queue_count = index + 1
            queued = False
            for attempt in range(3):
                emit_active_runtime(session_key)
                fill_editor(page, editor, f"{queue_text} attempt {attempt + 1}")
                click_enabled(send_button)
                if wait_for_count(page, captured_queue_payloads, expected_queue_count, "/queue POST", timeout=8000):
                    queued = True
                    break
            if not queued:
                raise AssertionError(
                    "timed out waiting for /queue POST; "
                    f"expected {expected_queue_count}, got {len(captured_queue_payloads)}; "
                    f"sendRequests={len(captured_send_payloads)}; "
                    f"diagnostics={json.dumps(read_composer_diagnostics(page), ensure_ascii=False)}"
                )

        unbroken_token = "TRACEVANE_LONG_COMMAND_TOKEN_" + ("0123456789abcdef" * 96)
        long_draft = (
            "pressure draft "
            + ("long desktop IM draft line with markdown **bold** and resource context. " * 30)
            + unbroken_token
        )
        fill_editor(page, editor, long_draft)
        upload_attachment_pool(page, files)

        click_enabled(page.locator(".chat-queue-rail__summary-trigger").first)
        page.locator(".chat-queue-rail__panel").wait_for(state="visible", timeout=10000)
        page.wait_for_function(
            """([queueCount, attachmentCount]) => {
                return document.querySelectorAll('.chat-queue-rail__item').length >= queueCount
                    && document.querySelectorAll('.chat-composer-pool-item.ready').length >= attachmentCount;
            }""",
            arg=[QUEUE_ITEM_COUNT, ATTACHMENT_COUNT],
            timeout=30000,
        )

        metrics = measure_pressure_layout(page)
        assert_pressure_layout(metrics)

        if len(captured_send_payloads) != 1:
            raise AssertionError(f"expected one initial /send request, got {len(captured_send_payloads)}")
        if len(captured_queue_payloads) < QUEUE_ITEM_COUNT:
            raise AssertionError(f"expected at least {QUEUE_ITEM_COUNT} /queue requests, got {len(captured_queue_payloads)}")
        if console_errors:
            raise AssertionError(f"browser console errors: {console_errors}")

        page.screenshot(path=str(SCREENSHOT), full_page=True)
        result.update(metrics)
        result["sendRequests"] = len(captured_send_payloads)
        result["queueRequests"] = len(captured_queue_payloads)
        result["consoleErrors"] = console_errors
        result["screenshot"] = str(SCREENSHOT)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        browser.close()


if __name__ == "__main__":
    try:
        main()
    except PlaywrightTimeoutError as error:
        raise SystemExit(f"chat composer pressure smoke timed out: {error}") from error
