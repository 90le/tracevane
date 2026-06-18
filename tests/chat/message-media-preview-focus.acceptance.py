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


SCREENSHOT = Path("/tmp/tracevane-chat-message-media-preview-focus.png")
TINY_PNG = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/"
    "lW9X5QAAAABJRU5ErkJggg=="
)
SESSION_KEY = "agent:media-preview-focus:webchat:direct:tracevane-smoke"
RESOURCE_ID = "media-preview-focus-image"
RESOURCE_URL = "/mock-media/media-preview-focus.png"


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
        "transport": "tracevane_bff",
        "authMode": "tracevane_backend_token",
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
        "agentId": "media-preview-focus-agent",
        "sessionId": None,
        "kind": "tracevane_managed",
        "label": "消息媒体预览焦点会话",
        "derivedTitle": "消息媒体预览焦点会话",
        "lastMessagePreview": "media preview focus fixture",
        "updatedAt": now,
        "presentation": {
            "archived": False,
            "archivedAt": None,
            "customLabel": "消息媒体预览焦点会话",
            "autoLabel": "消息媒体预览焦点会话",
        },
        "source": {
            "source": "tracevane",
            "channel": "webchat",
            "surface": "tracevane-chat",
            "originLabel": "Tracevane Chat",
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


def resource_item() -> dict[str, object]:
    return {
        "id": RESOURCE_ID,
        "kind": "image",
        "url": RESOURCE_URL,
        "downloadUrl": RESOURCE_URL,
        "fileName": "media-preview-focus.png",
        "mimeType": "image/png",
        "relativePath": "uploads/media-preview-focus.png",
        "originalPath": "media-preview-focus.png",
        "source": "upload",
        "status": "ready",
        "placement": "card",
        "toolCallId": None,
    }


def history_payload(session: dict[str, object]) -> dict[str, object]:
    now = now_iso()
    return {
        "checkedAt": now,
        "session": session,
        "messages": [
            {
                "id": "media-preview-focus-user",
                "role": "user",
                "text": "请查看这张图片。",
                "createdAt": "2026-06-02T10:00:00.000Z",
                "source": "history",
                "runId": None,
                "truncated": False,
                "omitted": False,
                "aborted": False,
                "stopReason": None,
            },
            {
                "id": "media-preview-focus-assistant",
                "role": "assistant",
                "text": "",
                "createdAt": "2026-06-02T10:00:05.000Z",
                "source": "history",
                "runId": None,
                "truncated": False,
                "omitted": False,
                "aborted": False,
                "stopReason": None,
                "resources": [resource_item()],
                "blocks": [
                    {
                        "type": "resource",
                        "resourceId": RESOURCE_ID,
                        "display": "card",
                    }
                ],
            },
        ],
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


def bootstrap_payload(session: dict[str, object]) -> dict[str, object]:
    now = now_iso()
    return {
        "checkedAt": now,
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
        "queue": {
            "checkedAt": now,
            "session": session,
            "items": [],
        },
        "controls": {
            "checkedAt": now,
            "session": session,
            "globalHostManagementExecEnabled": False,
            "controls": {
                "allowHostManagementExec": False,
                "updatedAt": now,
            },
        },
        "diagnostics": diagnostics(),
    }


def queue_payload(session: dict[str, object]) -> dict[str, object]:
    return {
        "checkedAt": now_iso(),
        "session": session,
        "items": [],
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

    def handle_media(route) -> None:
        route.fulfill(
            status=200,
            content_type="image/png",
            body=base64.b64decode(TINY_PNG),
        )

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
    page.route(re.compile(r".*/mock-media/media-preview-focus\.png(?:\?.*)?$"), handle_media)
    page.route(re.compile(r".*/favicon\.ico(?:\?.*)?$"), handle_favicon)
    return session


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
                    f"{request.method} {request.url} {request.failure.get('errorText') if request.failure else ''}"
                ),
            )
            install_routes(page)

            session_url = f"http://127.0.0.1:5176/chat/s/{encode_session_ref(SESSION_KEY)}"
            wait_for_chat_surface(
                page,
                session_url,
                selectors=(".chat-conversation-pane", ".chat-resource-card.image"),
                timeout=90000,
            )
            wait_for_active_session(page, SESSION_KEY, timeout=30000)
            card = page.locator(".chat-resource-card.image[data-chat-media-preview-source-key]").first
            card.wait_for(state="visible", timeout=30000)
            source_key = card.get_attribute("data-chat-media-preview-source-key") or ""
            if source_key != RESOURCE_ID:
                raise AssertionError(f"unexpected source key: {source_key}")

            card.click()
            page.wait_for_selector(".chat-image-preview-dialog", state="visible", timeout=10000)
            page.keyboard.press("Escape")
            page.wait_for_selector(".chat-image-preview-dialog", state="detached", timeout=10000)
            page.wait_for_function(
                """(sourceKey) => {
                    const active = document.activeElement;
                    return Boolean(
                        active
                        && active.classList.contains('chat-resource-card')
                        && active.getAttribute('data-chat-media-preview-source-key') === sourceKey
                    );
                }""",
                arg=source_key,
                timeout=10000,
            )

            result.update(page.evaluate(
                """() => {
                    const active = document.activeElement;
                    return {
                        previewOpen: Boolean(document.querySelector('.chat-image-preview-dialog')),
                        activeTag: active?.tagName || '',
                        activeClass: String(active?.className || ''),
                        activePreviewKey: active?.getAttribute('data-chat-media-preview-source-key') || '',
                        resourceCardCount: document.querySelectorAll('.chat-resource-card.image').length,
                    };
                }"""
            ))
            page.screenshot(path=str(SCREENSHOT), full_page=True)
            result["screenshot"] = str(SCREENSHOT)
            browser.close()
    except PlaywrightTimeoutError as error:
        raise SystemExit(f"message media preview focus smoke timed out: {error}") from error

    result["consoleErrors"] = console_errors
    result["requestFailures"] = request_failures
    result["httpErrors"] = http_errors
    checks = {
        "preview_closed": result.get("previewOpen") is False,
        "focus_restored_to_source_card": result.get("activePreviewKey") == RESOURCE_ID,
        "resource_card_rendered": int(result.get("resourceCardCount") or 0) >= 1,
        "no_console_errors": len(console_errors) == 0,
        "no_request_failures": len(request_failures) == 0,
        "no_http_errors": len(http_errors) == 0,
    }
    result["checks"] = checks
    print(json.dumps(result, ensure_ascii=False, indent=2))
    failed = [key for key, value in checks.items() if not value]
    if failed:
        raise SystemExit(f"message media preview focus smoke failed: {', '.join(failed)}")


if __name__ == "__main__":
    main()
