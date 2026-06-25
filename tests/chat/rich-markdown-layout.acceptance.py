from __future__ import annotations

import copy
import json
import re
import time
from base64 import urlsafe_b64encode
from pathlib import Path
from urllib.parse import unquote

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

from browser_surface import wait_for_active_session, wait_for_chat_surface


SCREENSHOT = Path("/tmp/tracevane-chat-rich-markdown-layout-acceptance.png")


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


def encode_session_ref(session_key: str) -> str:
    encoded = urlsafe_b64encode(session_key.encode("utf-8")).decode("ascii").rstrip("=")
    return f"r1_{encoded}"


def route_session_key(url: str, suffix: str) -> str:
    marker = "/api/chat/sessions/"
    if marker not in url:
        return ""
    encoded = url.split(marker, 1)[1].split(suffix, 1)[0]
    return unquote(encoded)


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())


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


def observability() -> dict[str, object]:
    return {
        "lifecycle": None,
        "toolCards": [],
        "usage": None,
        "timeline": [],
    }


def organizer(session_key: str) -> dict[str, object]:
    return {
        "folders": [],
        "folderOrder": [],
        "childFolderOrder": {},
        "rootSessionOrder": [session_key],
        "folderSessionOrder": {},
        "sessionFolderMap": {session_key: None},
    }


def normalize_session_row(row: dict[str, object]) -> dict[str, object]:
    session = copy.deepcopy(row)
    session["label"] = "富文本布局压力会话"
    session["derivedTitle"] = "富文本布局压力会话"
    session["lastMessagePreview"] = "rich markdown layout baseline"
    session["updatedAt"] = now_iso()
    session["runtime"] = runtime_state()
    presentation = session.get("presentation") if isinstance(session.get("presentation"), dict) else {}
    session["presentation"] = {
        **presentation,
        "archived": False,
        "archivedAt": None,
        "customLabel": "富文本布局压力会话",
    }
    permissions = session.get("permissions") if isinstance(session.get("permissions"), dict) else {}
    session["permissions"] = {
        "writable": True,
        "canSend": True,
        "canAbort": False,
        "canReset": True,
        "canDelete": True,
        "canInject": True,
        "visibleInFrontend": True,
        "visibleInMvpRail": True,
        **permissions,
    }
    return session


def rich_markdown_source() -> str:
    long_code_line = "const desktopLayoutToken = '" + ("pc_layout_scroll_guard_" * 42) + "';"
    table_headers = [f"宽列{index + 1}" for index in range(12)]
    table_cells = [
        f"宽表格单元格{index + 1}-" + ("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" * 4)
        for index in range(12)
    ]
    table_markdown = "\n".join([
        "| " + " | ".join(table_headers) + " |",
        "| " + " | ".join(["---"] * len(table_headers)) + " |",
        "| " + " | ".join(table_cells) + " |",
    ])
    long_inline_token = "宽表格单元格-" + ("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" * 12)
    long_html_token = "html-inline-preview-" + ("UNBROKEN_" * 70)
    long_svg_label = "SVG-PREVIEW-" + ("WIDE-LABEL-" * 38)
    return f"""rich markdown layout baseline

{table_markdown}

`{long_inline_token}`

```ts
{long_code_line}
console.log(desktopLayoutToken);
```

<section>
  <strong>Inline HTML preview</strong>
  <p>{long_html_token}</p>
</section>

<svg width="1800" height="120" viewBox="0 0 1800 120" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="1800" height="120" rx="18" fill="#f7f8fb"></rect>
  <text x="32" y="70" font-size="28" fill="#1f2937">{long_svg_label}</text>
</svg>
"""


def message(message_id: str, role: str, text: str, created_at: str) -> dict[str, object]:
    return {
        "id": message_id,
        "role": role,
        "text": text,
        "createdAt": created_at,
        "source": "history",
        "runId": None,
        "truncated": False,
        "omitted": False,
        "aborted": False,
        "stopReason": None,
    }


def history_payload(session: dict[str, object]) -> dict[str, object]:
    checked_at = now_iso()
    session_key = str(session["key"])
    messages = [
        message(
            "rich-layout-user-1",
            "user",
            "请用表格、长代码、HTML 和 SVG 说明桌面 IM 布局是否稳定。",
            "2026-06-01T09:00:00.000Z",
        ),
        message(
            "rich-layout-assistant-1",
            "assistant",
            rich_markdown_source(),
            "2026-06-01T09:00:05.000Z",
        ),
    ]
    return {
        "checkedAt": checked_at,
        "session": session,
        "messages": messages,
        "overlays": [],
        "runtime": runtime_state(),
        "diagnostics": diagnostics(),
        "observability": observability(),
        "pageInfo": {
            "hasMoreBefore": False,
            "beforeCursor": None,
            "hasMoreAfter": False,
            "afterCursor": None,
        },
        "day": None,
        "sessionKey": session_key,
    }


def bootstrap_payload(session: dict[str, object]) -> dict[str, object]:
    checked_at = now_iso()
    return {
        "checkedAt": checked_at,
        "organizer": organizer(str(session["key"])),
        "sessions": [session],
        "selectedSessionKey": session["key"],
        "history": history_payload(session),
        "queue": {
            "checkedAt": checked_at,
            "session": session,
            "items": [],
        },
        "diagnostics": diagnostics(),
    }


def open_new_chat(page) -> dict[str, object]:
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
    session = payload.get("session") or {}
    session_key = str(session.get("key") or "").strip()
    if not session_key:
        raise AssertionError(f"create session response missing session.key: {payload}")
    wait_for_active_session(page, session_key)
    return session


def install_rich_history_routes(page, session: dict[str, object]):
    session_key = str(session["key"])
    rich_session = normalize_session_row(session)

    def fulfill_json(route, payload: dict[str, object]):
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(payload, ensure_ascii=False),
        )

    def handle_bootstrap(route):
        if route.request.method != "GET":
            route.continue_()
            return
        fulfill_json(route, bootstrap_payload(rich_session))

    def handle_history(route):
        if route.request.method != "GET":
            route.continue_()
            return
        if route_session_key(route.request.url, "/history") != session_key:
            route.continue_()
            return
        fulfill_json(route, history_payload(rich_session))

    page.route(re.compile(r".*/api/chat/bootstrap(?:\?.*)?$"), handle_bootstrap)
    page.route(re.compile(r".*/api/chat/sessions/.*/history(?:\?.*)?$"), handle_history)
    return rich_session


def wait_for_rich_markdown(page) -> None:
    try:
        page.locator(".chat-markdown-deferred-card").first.click(timeout=5000)
    except Exception:
        pass
    page.wait_for_function(
        """() => {
            const threadText = document.querySelector('.chat-conversation-thread')?.textContent || '';
            return threadText.includes('rich markdown layout baseline')
                && document.querySelectorAll('.chat-markdown-table-wrap').length >= 1
                && document.querySelectorAll('.code-block-wrapper').length >= 1
                && document.querySelectorAll('.chat-inline-preview-shell.kind-html').length >= 1
                && document.querySelectorAll('.chat-inline-preview-shell.kind-svg').length >= 1;
        }""",
        timeout=30000,
    )


def measure_rich_layout(page) -> dict[str, object]:
    return page.evaluate(
        """() => {
            const size = (selector) => {
              const el = document.querySelector(selector);
              if (!el) return null;
              const rect = el.getBoundingClientRect();
              const style = window.getComputedStyle(el);
              return {
                selector,
                width: rect.width,
                left: rect.left,
                right: rect.right,
                clientWidth: el.clientWidth,
                scrollWidth: el.scrollWidth,
                overflowX: style.overflowX,
                maxWidth: style.maxWidth,
                minWidth: style.minWidth,
              };
            };
            const all = (selector) => Array.from(document.querySelectorAll(selector)).map((el) => {
              const rect = el.getBoundingClientRect();
              const style = window.getComputedStyle(el);
              return {
                width: rect.width,
                left: rect.left,
                right: rect.right,
                clientWidth: el.clientWidth,
                scrollWidth: el.scrollWidth,
                overflowX: style.overflowX,
                maxWidth: style.maxWidth,
                minWidth: style.minWidth,
              };
            });
            const pane = size('.chat-conversation-pane');
            const thread = size('.chat-conversation-thread');
            const bubble = size('.chat-message-group.role-assistant .chat-message-bubble');
            const tableWrap = size('.chat-markdown-table-wrap');
            const codeWrap = size('.code-block-wrapper');
            const codePre = size('.code-block-wrapper pre');
            const htmlViewport = size('.chat-inline-preview-shell.kind-html .chat-inline-overflow-viewport');
            const svgViewport = size('.chat-inline-preview-shell.kind-svg .chat-inline-overflow-viewport');
            return {
              viewportWidth: window.innerWidth,
              documentClientWidth: document.documentElement.clientWidth,
              documentScrollWidth: document.documentElement.scrollWidth,
              bodyScrollWidth: document.body?.scrollWidth || 0,
              pane,
              thread,
              bubble,
              tableWrap,
              codeWrap,
              codePre,
              htmlViewport,
              svgViewport,
              tableWraps: all('.chat-markdown-table-wrap'),
              codeBlocks: all('.code-block-wrapper'),
              inlineViewports: all('.chat-inline-overflow-viewport'),
              markdownDeferredCards: document.querySelectorAll('.chat-markdown-deferred-card').length,
              messageBubbleCount: document.querySelectorAll('.chat-message-bubble').length,
              consoleText: (document.querySelector('.chat-conversation-thread')?.textContent || '').slice(0, 500),
            };
        }"""
    )


def assert_rich_layout(metrics: dict[str, object]) -> None:
    def width_gap(item: dict[str, object] | None) -> float:
        if not item:
            return 99999
        return float(item.get("scrollWidth") or 0) - float(item.get("clientWidth") or 0)

    def is_bounded(item: dict[str, object] | None, allowance: float = 4) -> bool:
        if not item:
            return False
        return width_gap(item) <= allowance

    table_wrap = metrics.get("tableWrap") or {}
    code_pre = metrics.get("codePre") or {}
    html_viewport = metrics.get("htmlViewport") or {}
    svg_viewport = metrics.get("svgViewport") or {}

    checks = {
        "message_bubbles_rendered": int(metrics.get("messageBubbleCount") or 0) >= 2,
        "pane_not_horizontally_stretched": is_bounded(metrics.get("pane")),
        "thread_not_horizontally_stretched": is_bounded(metrics.get("thread")),
        "assistant_bubble_not_horizontally_stretched": is_bounded(metrics.get("bubble")),
        "table_wrap_exists": bool(table_wrap),
        "table_wrap_scrolls": width_gap(table_wrap) > 48 and table_wrap.get("overflowX") == "auto",
        "code_block_exists": bool(metrics.get("codeWrap")),
        "code_pre_scrolls": width_gap(code_pre) > 48 and code_pre.get("overflowX") == "auto",
        "html_viewport_exists": bool(html_viewport),
        "html_viewport_bounded": is_bounded(html_viewport),
        "svg_viewport_exists": bool(svg_viewport),
        "svg_viewport_scrolls_inside": width_gap(svg_viewport) > 48 and svg_viewport.get("overflowX") == "auto",
        "no_deferred_card_left": int(metrics.get("markdownDeferredCards") or 0) == 0,
    }
    failed = [name for name, passed in checks.items() if not passed]
    if failed:
        raise AssertionError(
            "rich markdown layout failed: "
            + ", ".join(failed)
            + "\n"
            + json.dumps({"checks": checks, "metrics": metrics}, ensure_ascii=False, indent=2)
        )
    metrics["checks"] = checks


def main() -> None:
    result: dict[str, object] = {}
    console_errors: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 980})
        page.on(
            "console",
            lambda msg: console_errors.append(msg.text) if msg.type == "error" else None,
        )

        wait_for_chat_surface(page, "http://127.0.0.1:5176/chat/workbench")
        session = open_new_chat(page)
        rich_session = install_rich_history_routes(page, session)
        session_key = str(rich_session["key"])
        session_url = f"http://127.0.0.1:5176/chat/s/{encode_session_ref(session_key)}"
        page.goto(session_url, wait_until="domcontentloaded")
        wait_for_active_session(page, session_key)
        wait_for_rich_markdown(page)

        metrics = measure_rich_layout(page)
        assert_rich_layout(metrics)

        if console_errors:
            raise AssertionError(f"browser console errors: {console_errors}")

        page.screenshot(path=str(SCREENSHOT), full_page=True)
        result.update(metrics)
        result["sessionKey"] = session_key
        result["screenshot"] = str(SCREENSHOT)
        result["consoleErrors"] = console_errors
        print(json.dumps(result, ensure_ascii=False, indent=2))
        browser.close()


if __name__ == "__main__":
    try:
        main()
    except PlaywrightTimeoutError as error:
        raise SystemExit(f"chat rich markdown layout smoke timed out: {error}") from error
