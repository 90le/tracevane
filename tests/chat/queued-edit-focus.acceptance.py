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


SCREENSHOT = Path("/tmp/openclaw-studio-chat-queued-edit-focus.png")
SESSION_KEY = "agent:queued-edit-focus:webchat:direct:studio-smoke"
QUEUE_ENTRY_ID = "queued-edit-focus-entry"
QUEUE_TEXT = "queued edit focus smoke message"


def encode_session_ref(session_key: str) -> str:
    encoded = base64.urlsafe_b64encode(session_key.encode("utf-8")).decode("ascii").rstrip("=")
    return f"r1_{encoded}"


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())


def route_session_key(url: str, suffix: str) -> str:
    marker = "/api/chat/sessions/"
    if marker not in url:
        return ""
    encoded = url.split(marker, 1)[1].split(suffix, 1)[0]
    return unquote(encoded)


def runtime_state() -> dict[str, object]:
    now = now_iso()
    return {
        "gatewayConnected": True,
        "sessionWritable": True,
        "activeRunId": None,
        "state": "idle",
        "lastEventAt": now,
        "lastAckAt": now,
        "lastErrorCode": None,
        "lastErrorMessage": None,
    }


def diagnostics() -> dict[str, object]:
    return {
        "gatewayReachable": True,
        "gatewayWsUrl": "ws://127.0.0.1:5176/ws/chat",
        "transport": "studio_bff",
        "authMode": "studio_backend_token",
        "rawGatewayFramesExposed": False,
        "rawGatewayMethodsExposed": False,
        "sameOriginRequired": True,
        "historyTruncated": False,
        "truncationMode": "none",
        "notes": [],
    }


def session_row() -> dict[str, object]:
    now = now_iso()
    return {
        "key": SESSION_KEY,
        "agentId": "queued-edit-focus-agent",
        "sessionId": None,
        "kind": "studio_managed",
        "label": "队列编辑焦点会话",
        "derivedTitle": "队列编辑焦点会话",
        "lastMessagePreview": QUEUE_TEXT,
        "updatedAt": now,
        "presentation": {
            "archived": False,
            "archivedAt": None,
            "customLabel": "队列编辑焦点会话",
            "autoLabel": "队列编辑焦点会话",
        },
        "source": {
            "source": "studio",
            "channel": "webchat",
            "surface": "studio-chat",
            "originLabel": "Studio Chat",
        },
        "deliveryContext": {
            "channel": "webchat",
            "accountId": None,
            "to": None,
            "threadId": None,
        },
        "permissions": {
            "writable": True,
            "canSend": True,
            "canAbort": False,
            "canReset": True,
            "canDelete": True,
            "canInject": True,
            "visibleInFrontend": True,
            "visibleInMvpRail": True,
        },
        "runtime": runtime_state(),
    }


def queue_item() -> dict[str, object]:
    now = now_iso()
    return {
        "id": QUEUE_ENTRY_ID,
        "sessionKey": SESSION_KEY,
        "clientRequestId": "queued-edit-focus-client",
        "deliveryRequestId": "queued-edit-focus-delivery",
        "text": QUEUE_TEXT,
        "previewText": QUEUE_TEXT,
        "composerDocument": [
            {
                "type": "text",
                "id": "queued-edit-focus-text",
                "text": QUEUE_TEXT,
            }
        ],
        "fileRefs": [],
        "attachments": [],
        "createdAt": now,
        "updatedAt": now,
        "status": "queued",
        "blockedReason": None,
    }


def history_payload(session: dict[str, object]) -> dict[str, object]:
    return {
        "checkedAt": now_iso(),
        "session": session,
        "messages": [],
        "overlays": [],
        "runtime": runtime_state(),
        "diagnostics": diagnostics(),
        "observability": {
            "lifecycle": None,
            "toolCards": [],
            "usage": None,
            "timeline": [],
        },
        "pageInfo": {
            "hasMoreBefore": False,
            "beforeCursor": None,
            "hasMoreAfter": False,
            "afterCursor": None,
        },
        "day": None,
        "sessionKey": SESSION_KEY,
    }


def queue_payload(session: dict[str, object]) -> dict[str, object]:
    return {
        "checkedAt": now_iso(),
        "session": session,
        "items": [queue_item()],
    }


def controls_payload(session: dict[str, object]) -> dict[str, object]:
    now = now_iso()
    return {
        "checkedAt": now,
        "session": session,
        "globalHostManagementExecEnabled": False,
        "controls": {
            "allowHostManagementExec": False,
            "updatedAt": now,
        },
    }


def bootstrap_payload(session: dict[str, object]) -> dict[str, object]:
    return {
        "checkedAt": now_iso(),
        "organizer": {
            "folders": [],
            "folderOrder": [],
            "childFolderOrder": {},
            "rootSessionOrder": [SESSION_KEY],
            "folderSessionOrder": {},
            "sessionFolderMap": {SESSION_KEY: None},
        },
        "sessions": [session],
        "selectedSessionKey": SESSION_KEY,
        "history": history_payload(session),
        "queue": queue_payload(session),
        "controls": controls_payload(session),
        "diagnostics": diagnostics(),
    }


def install_routes(page) -> dict[str, object]:
    session = session_row()

    def fulfill_json(route, payload: dict[str, object]) -> None:
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(payload, ensure_ascii=False),
        )

    def handle_bootstrap(route) -> None:
        if route.request.method != "GET":
            route.continue_()
            return
        fulfill_json(route, bootstrap_payload(session))

    def handle_history(route) -> None:
        if route.request.method != "GET" or route_session_key(route.request.url, "/history") != SESSION_KEY:
            route.continue_()
            return
        fulfill_json(route, history_payload(session))

    def handle_queue(route) -> None:
        if route.request.method != "GET" or route_session_key(route.request.url, "/queue") != SESSION_KEY:
            route.continue_()
            return
        fulfill_json(route, queue_payload(session))

    def handle_controls(route) -> None:
        if route.request.method != "GET" or route_session_key(route.request.url, "/controls") != SESSION_KEY:
            route.continue_()
            return
        fulfill_json(route, controls_payload(session))

    def handle_favicon(route) -> None:
        route.fulfill(status=204, body="")

    page.route(re.compile(r".*/api/chat/bootstrap(?:\?.*)?$"), handle_bootstrap)
    page.route(re.compile(r".*/api/chat/sessions/.*/history(?:\?.*)?$"), handle_history)
    page.route(re.compile(r".*/api/chat/sessions/.*/queue(?:\?.*)?$"), handle_queue)
    page.route(re.compile(r".*/api/chat/sessions/.*/controls(?:\?.*)?$"), handle_controls)
    page.route(re.compile(r".*/favicon\.ico(?:\?.*)?$"), handle_favicon)
    return session


def request_failure_text(request) -> str:
    failure = request.failure
    if isinstance(failure, dict):
        return str(failure.get("errorText") or "")
    return str(failure or "")


def main() -> None:
    console_errors: list[str] = []
    request_failures: list[str] = []
    http_errors: list[str] = []
    result: dict[str, object] = {}

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 980})
            page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
            page.on(
                "response",
                lambda response: http_errors.append(f"{response.status} {response.url}") if response.status >= 400 else None,
            )
            page.on(
                "requestfailed",
                lambda request: request_failures.append(
                    f"{request.method} {request.url} {request_failure_text(request)}"
                ),
            )
            install_routes(page)

            session_url = f"http://127.0.0.1:5176/chat/s/{encode_session_ref(SESSION_KEY)}"
            wait_for_chat_surface(
                page,
                session_url,
                selectors=(".chat-conversation-pane", ".chat-queue-rail__summary-trigger"),
                timeout=90000,
            )
            wait_for_active_session(page, SESSION_KEY, timeout=30000)
            page.locator(".chat-queue-rail__summary-trigger").first.click()
            page.wait_for_selector(".chat-queue-rail__item", state="visible", timeout=10000)

            edit_button = page.locator(f".chat-queue-rail__ghost[data-queue-edit-trigger-id='{QUEUE_ENTRY_ID}']").first
            edit_button.click()
            page.wait_for_selector(".chat-queue-rail__textarea", state="visible", timeout=10000)
            page.wait_for_function(
                """(entryId) => {
                    const active = document.activeElement;
                    return Boolean(
                        active
                        && active.classList.contains('chat-queue-rail__textarea')
                        && active.getAttribute('data-queue-edit-entry-id') === entryId
                        && active.selectionStart === active.value.length
                        && active.selectionEnd === active.value.length
                    );
                }""",
                arg=QUEUE_ENTRY_ID,
                timeout=10000,
            )
            page.keyboard.press("Escape")
            page.wait_for_selector(".chat-queue-rail__textarea", state="detached", timeout=10000)
            page.wait_for_function(
                """(entryId) => {
                    const active = document.activeElement;
                    return Boolean(
                        active
                        && active.classList.contains('chat-queue-rail__ghost')
                        && active.getAttribute('data-queue-edit-trigger-id') === entryId
                    );
                }""",
                arg=QUEUE_ENTRY_ID,
                timeout=10000,
            )
            result["queueEscapeFocusRestored"] = page.evaluate(
                """(entryId) => {
                    const active = document.activeElement;
                    return Boolean(
                        active
                        && active.classList.contains('chat-queue-rail__ghost')
                        && active.getAttribute('data-queue-edit-trigger-id') === entryId
                    );
                }""",
                QUEUE_ENTRY_ID,
            )

            edit_button.click()
            page.wait_for_selector(".chat-queue-rail__textarea", state="visible", timeout=10000)
            page.wait_for_function(
                """(entryId) => {
                    const active = document.activeElement;
                    return Boolean(
                        active
                        && active.classList.contains('chat-queue-rail__textarea')
                        && active.getAttribute('data-queue-edit-entry-id') === entryId
                        && active.selectionStart === active.value.length
                        && active.selectionEnd === active.value.length
                    );
                }""",
                arg=QUEUE_ENTRY_ID,
                timeout=10000,
            )
            page.locator(".chat-queue-rail__editor-actions .chat-queue-rail__ghost").filter(
                has_text=re.compile(r"取消|Cancel")
            ).first.click()
            page.wait_for_selector(".chat-queue-rail__textarea", state="detached", timeout=10000)
            page.wait_for_function(
                """(entryId) => {
                    const active = document.activeElement;
                    return Boolean(
                        active
                        && active.classList.contains('chat-queue-rail__ghost')
                        && active.getAttribute('data-queue-edit-trigger-id') === entryId
                    );
                }""",
                arg=QUEUE_ENTRY_ID,
                timeout=10000,
            )
            result["queueButtonCancelFocusRestored"] = page.evaluate(
                """(entryId) => {
                    const active = document.activeElement;
                    return Boolean(
                        active
                        && active.classList.contains('chat-queue-rail__ghost')
                        && active.getAttribute('data-queue-edit-trigger-id') === entryId
                    );
                }""",
                QUEUE_ENTRY_ID,
            )

            more_button = page.get_by_role("button", name=re.compile(r"^更多$|^More$")).first
            more_button.click()
            page.locator(".chat-session-menu-popover").wait_for(state="visible", timeout=10000)
            page.locator(".chat-session-menu-item").filter(
                has_text=re.compile(r"渲染设置|Rendering settings")
            ).first.click()
            page.wait_for_selector(".chat-rendering-settings-dialog", state="visible", timeout=10000)
            page.locator(".chat-rendering-settings-close").click()
            page.wait_for_selector(".chat-rendering-settings-dialog", state="detached", timeout=10000)
            page.wait_for_function(
                """() => {
                    const active = document.activeElement;
                    return Boolean(
                        active
                        && active.classList.contains('chat-conversation-pane__ghost')
                        && /更多|More/.test(active.textContent || '')
                    );
                }""",
                timeout=10000,
            )

            result.update(page.evaluate(
                """() => {
                    const active = document.activeElement;
                    return {
                        textareaVisible: Boolean(document.querySelector('.chat-queue-rail__textarea')),
                        activeTag: active?.tagName || '',
                        activeClass: String(active?.className || ''),
                        activeEditTriggerId: active?.getAttribute('data-queue-edit-trigger-id') || '',
                        activeText: active?.textContent?.trim() || '',
                        queueItemCount: document.querySelectorAll('.chat-queue-rail__item').length,
                    };
                }"""
            ))
            page.screenshot(path=str(SCREENSHOT), full_page=True)
            result["screenshot"] = str(SCREENSHOT)
            browser.close()
    except PlaywrightTimeoutError as error:
        raise SystemExit(f"queued edit focus smoke timed out: {error}") from error

    result["consoleErrors"] = console_errors
    result["requestFailures"] = request_failures
    result["httpErrors"] = http_errors
    checks = {
        "edit_cancelled": result.get("textareaVisible") is False,
        "escape_focus_restored_to_edit_trigger": result.get("queueEscapeFocusRestored") is True,
        "button_focus_restored_to_edit_trigger": result.get("queueButtonCancelFocusRestored") is True,
        "rendering_settings_focus_restored": re.search(r"更多|More", str(result.get("activeText") or "")) is not None,
        "queue_item_rendered": int(result.get("queueItemCount") or 0) >= 1,
        "no_console_errors": len(console_errors) == 0,
        "no_request_failures": len(request_failures) == 0,
        "no_http_errors": len(http_errors) == 0,
    }
    result["checks"] = checks
    print(json.dumps(result, ensure_ascii=False, indent=2))
    failed = [key for key, value in checks.items() if not value]
    if failed:
        raise SystemExit(f"queued edit focus smoke failed: {', '.join(failed)}")


if __name__ == "__main__":
    main()
