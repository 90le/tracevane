from pathlib import Path
from playwright.sync_api import sync_playwright, expect, TimeoutError as PlaywrightTimeoutError
import base64
import json
import os
import re
import time
import urllib.error
import urllib.request


SCREENSHOT = Path("/tmp/openclaw-studio-chat-gateway-acceptance.png")
DEFAULT_BASE_URL = "http://127.0.0.1:31879/studio"
OPENCLAW_CONFIG = Path.home() / ".openclaw" / "openclaw.json"
NO_PROXY_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
LAST_CREATED_SESSION_KEY = ""
LAST_SEND_URL = ""
LAST_EDITOR_TEXT = ""
PAGE_ERRORS: list[str] = []
CONSOLE_LOGS: list[str] = []


def load_gateway_settings() -> dict:
    try:
        raw = json.loads(OPENCLAW_CONFIG.read_text(encoding="utf-8"))
    except Exception:
        return {}
    gateway = raw.get("gateway") or {}
    auth = gateway.get("auth") or {}
    return {
        "port": gateway.get("port"),
        "token": auth.get("token"),
    }


def base_url() -> str:
    override = (os.environ.get("STUDIO_GATEWAY_BASE_URL") or "").strip()
    if override:
        return override.rstrip("/")
    settings = load_gateway_settings()
    port = settings.get("port")
    if isinstance(port, int) and port > 0:
        return f"http://127.0.0.1:{port}/studio"
    return DEFAULT_BASE_URL


def auth_token() -> str:
    override = (os.environ.get("STUDIO_GATEWAY_TOKEN") or "").strip()
    if override:
        return override
    token = load_gateway_settings().get("token")
    return token.strip() if isinstance(token, str) else ""


def open_url(path: str) -> str:
    token = auth_token()
    url = f"{base_url()}{path}"
    if token:
        separator = "&" if "?" in url else "?"
        return f"{url}{separator}token={token}"
    return url


def wait_for_gateway_http_ready(path: str = "/chat/workbench", timeout_ms: int = 60000, interval_ms: int = 500):
    deadline = time.monotonic() + (timeout_ms / 1000)
    last_error: Exception | None = None
    target = open_url(path)
    while time.monotonic() < deadline:
        try:
            with NO_PROXY_OPENER.open(target, timeout=5) as response:
                if 200 <= response.status < 500:
                    return
        except Exception as error:
            last_error = error
        time.sleep(interval_ms / 1000)
    raise AssertionError(f"gateway HTTP never became ready for {target}: {last_error}")


def encode_session_ref(session_key: str) -> str:
    encoded = base64.urlsafe_b64encode(session_key.encode("utf-8")).decode("ascii").rstrip("=")
    return f"r1_{encoded}"


def wait_button_enabled(locator, timeout=30000):
    locator.wait_for(state="visible", timeout=timeout)
    locator.page.wait_for_function(
        "(el) => !!el && !el.disabled",
        arg=locator.element_handle(),
        timeout=timeout,
    )


def click_enabled(locator, timeout=30000):
    wait_button_enabled(locator, timeout=timeout)
    locator.page.wait_for_timeout(200)
    locator.evaluate("(el) => el.click()")


def fill_editor(page, locator, text):
    global LAST_EDITOR_TEXT
    locator.click()
    page.keyboard.press("Control+A")
    page.keyboard.press("Backspace")
    page.keyboard.insert_text(text)
    page.wait_for_timeout(300)
    LAST_EDITOR_TEXT = locator.inner_text()


def collect_thread_debug(page) -> dict:
    threads = page.locator(".chat-conversation-thread")
    thread_texts = []
    for index in range(threads.count()):
        locator = threads.nth(index)
        try:
            thread_texts.append({
                "index": index,
                "visible": locator.is_visible(),
                "text": locator.inner_text()[:1200],
            })
        except Exception as error:
            thread_texts.append({
                "index": index,
                "visible": False,
                "error": str(error),
            })
    return {
        "url": page.url,
        "lastCreatedSessionKey": LAST_CREATED_SESSION_KEY,
        "lastSendUrl": LAST_SEND_URL,
        "lastEditorText": LAST_EDITOR_TEXT,
        "pageErrors": PAGE_ERRORS[-10:],
        "consoleTail": CONSOLE_LOGS[-20:],
        "bodyHasTargetThread": page.locator(".chat-conversation-thread").count() > 0,
        "threadCount": threads.count(),
        "messageBubbleCount": page.locator(".chat-message-bubble").count(),
        "activeRowCount": page.locator(".chat-shell-session-row.active").count(),
        "activeRowText": page.locator(".chat-shell-session-row.active").first.inner_text()[:600] if page.locator(".chat-shell-session-row.active").count() else "",
        "conversationTitle": page.locator(".chat-conversation-pane__copy strong").first.inner_text() if page.locator(".chat-conversation-pane__copy strong").count() else "",
        "bodyText": page.locator("body").inner_text()[:1600],
        "threads": thread_texts,
    }


def wait_for_thread_text(page, text: str, timeout=30000):
    deadline = time.monotonic() + (timeout / 1000)
    while time.monotonic() < deadline:
        threads = page.locator(".chat-conversation-thread")
        for index in range(threads.count()):
            try:
                if text in threads.nth(index).inner_text():
                    return
            except Exception:
                continue
        page.wait_for_timeout(250)
    raise AssertionError(json.dumps({
        "missingText": text,
        "threadDebug": collect_thread_debug(page),
    }, ensure_ascii=False, indent=2))


def click_send_and_wait_for_ack(page, send_button, timeout=30000):
    global LAST_SEND_URL
    with page.expect_response(
        lambda resp: (
            resp.request.method == "POST"
            and "/api/chat/sessions/" in resp.url
            and resp.url.endswith("/send")
        ),
        timeout=timeout,
    ) as response_info:
        click_enabled(send_button, timeout=timeout)
    response = response_info.value
    LAST_SEND_URL = response.url
    if response.status >= 400:
        raise AssertionError(f"chat send failed with HTTP {response.status}: {response.url}")
    page.wait_for_timeout(250)
    return response


def wait_for_run_to_settle(page, timeout=30000):
    deadline = time.monotonic() + (timeout / 1000)
    while time.monotonic() < deadline:
        stop_button = page.get_by_role("button", name=re.compile("^停止$|^Stop$")).first
        running_status = page.locator(".chat-conversation-pane__status").first
        stop_visible = stop_button.count() > 0 and stop_button.is_visible()
        status_visible = running_status.count() > 0 and running_status.is_visible()
        if not stop_visible and not status_visible:
            return
        page.wait_for_timeout(250)
    raise AssertionError("chat run did not settle before next send")


def open_new_chat(page):
    global LAST_CREATED_SESSION_KEY
    button = page.locator(".chat-new-chat-trigger").first
    click_enabled(button)
    picker = page.locator(".chat-agent-picker")
    picker.wait_for(state="visible", timeout=15000)
    option = picker.locator(".chat-agent-picker-option").first
    with page.expect_response(lambda resp: "/api/chat/agents/" in resp.url and resp.request.method == "POST", timeout=30000) as response_info:
        click_enabled(option)
    response = response_info.value
    payload = response.json()
    session_key = ((payload.get("session") or {}).get("key") or "").strip()
    if not session_key:
        raise AssertionError(f"create session response missing session.key: {payload}")
    LAST_CREATED_SESSION_KEY = session_key
    expected_ref = encode_session_ref(session_key)
    page.wait_for_function(
        """(expectedRef) => (
            window.location.pathname.includes(`/chat/s/${expectedRef}`)
            && document.querySelectorAll('.chat-shell-session-row.active').length >= 1
        )""",
        arg=expected_ref,
        timeout=30000,
    )
    wait_for_chat_shell_ready(page)


def open_reset_menu(page):
    summary = page.locator(".chat-session-menu summary").first
    summary.wait_for(state="visible", timeout=10000)
    summary.click()
    page.locator(".chat-session-menu-popover").wait_for(state="visible", timeout=10000)


def close_inspector_if_open(page):
    close_button = page.locator(".chat-inspector-panel__close").first
    if close_button.count() == 0:
        return
    close_button.click()
    page.wait_for_timeout(300)


def wait_for_chat_shell_ready(page, timeout=30000):
    page.locator(".chat-shell-session-list").wait_for(state="visible", timeout=timeout)
    page.locator(".chat-conversation-pane").wait_for(state="visible", timeout=timeout)
    page.locator(".chat-composer-editor").wait_for(state="visible", timeout=timeout)
    page.wait_for_timeout(500)


def goto_with_gateway_retry(page, path: str, timeout=60000):
    wait_for_gateway_http_ready(path, timeout_ms=timeout)
    page.goto(open_url(path), wait_until="domcontentloaded")


def reload_with_gateway_retry(page, timeout=60000):
    current_url = page.url or open_url("/chat/workbench")
    wait_for_gateway_http_ready("/chat/workbench", timeout_ms=timeout)
    try:
        page.reload(wait_until="domcontentloaded")
    except Exception:
        page.goto(current_url, wait_until="domcontentloaded")


def main() -> None:
    global PAGE_ERRORS, CONSOLE_LOGS
    result = {}
    PAGE_ERRORS = []
    CONSOLE_LOGS = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-proxy-server"])
        page = browser.new_page(viewport={"width": 1600, "height": 1200})
        page.on("pageerror", lambda error: PAGE_ERRORS.append(str(error)))
        page.on("console", lambda message: CONSOLE_LOGS.append(f"{message.type}: {message.text}"))

        seen_chat_urls = []

        def on_response(response) -> None:
            if "/api/chat/" in response.url:
                seen_chat_urls.append(response.url)

        page.on("response", on_response)
        goto_with_gateway_retry(page, "/chat/workbench")
        wait_for_chat_shell_ready(page)

        body_text = page.locator("body").inner_text()
        result["route_not_502"] = "502 Bad Gateway" not in body_text
        expect(page.locator(".chat-shell-session-list")).to_be_visible()
        expect(page.locator(".chat-conversation-pane")).to_be_visible()
        expect(page.locator(".chat-composer-editor")).to_be_visible()
        result["session_list_visible"] = True
        result["conversation_pane_visible"] = True
        result["composer_visible"] = True
        close_inspector_if_open(page)

        open_new_chat(page)
        result["created_session_selected"] = page.locator(".chat-shell-session-row.active").count() == 1

        textarea = page.locator(".chat-composer-editor[contenteditable='true']").first
        send_btn = page.get_by_role("button", name=re.compile("^发送$|^Send$")).first
        stop_btn = page.get_by_role("button", name=re.compile("^停止$|^Stop$")).first
        refresh_btn = page.get_by_title(re.compile("刷新对话|Refresh conversation")).first

        fill_editor(page, textarea, "gateway reload persistence smoke")
        click_send_and_wait_for_ack(page, send_btn)
        wait_for_thread_text(page, "gateway reload persistence smoke")
        result["pre_reload_message_visible"] = "gateway reload persistence smoke" in page.locator(".chat-conversation-thread").inner_text()

        reload_with_gateway_retry(page)
        wait_for_chat_shell_ready(page)
        body_after_reload = page.locator("body").inner_text()
        result["reload_route_authorized"] = "Unauthorized" not in body_after_reload
        wait_for_thread_text(page, "gateway reload persistence smoke")
        result["reload_restores_message"] = "gateway reload persistence smoke" in page.locator(".chat-conversation-thread").inner_text()

        refresh_btn = page.get_by_title(re.compile("刷新对话|Refresh conversation")).first
        click_enabled(refresh_btn)
        wait_for_chat_shell_ready(page)
        page.wait_for_timeout(800)
        result["manual_refresh_available"] = refresh_btn.count() == 1
        result["manual_refresh_keeps_history"] = "gateway reload persistence smoke" in page.locator(".chat-conversation-thread").inner_text()
        wait_for_run_to_settle(page)

        fill_editor(page, textarea, "gateway acceptance smoke one")
        click_send_and_wait_for_ack(page, send_btn)
        wait_for_thread_text(page, "gateway acceptance smoke one")
        result["send_final_visible"] = "gateway acceptance smoke one" in page.locator(".chat-conversation-thread").inner_text()
        wait_for_run_to_settle(page)

        long_text = "gateway acceptance abort " + ("please output 10000 numbered lines in a markdown code block. " * 20)
        fill_editor(page, textarea, long_text)
        click_send_and_wait_for_ack(page, send_btn)
        try:
            wait_button_enabled(stop_btn, timeout=20000)
            click_enabled(stop_btn, timeout=20000)
            page.wait_for_timeout(1000)
            result["abort_notice_present"] = page.locator("text=已中止").count() > 0 or page.locator("text=Aborted").count() > 0
        except PlaywrightTimeoutError:
            result["abort_notice_present"] = False

        open_reset_menu(page)
        reset_btn = page.get_by_role("button", name=re.compile("重置 Session|Reset Session")).first
        click_enabled(reset_btn)
        wait_for_chat_shell_ready(page)
        page.wait_for_timeout(500)
        result["reset_empty_state"] = (
            page.locator(".chat-message-bubble").count() == 0
            or page.locator("text=这里还没有消息").count() > 0
            or page.locator("text=No messages yet").count() > 0
        )

        fill_editor(page, textarea, "gateway after reset smoke")
        click_send_and_wait_for_ack(page, send_btn)
        wait_for_thread_text(page, "gateway after reset smoke")
        result["send_after_reset"] = "gateway after reset smoke" in page.locator(".chat-conversation-thread").inner_text()

        page.evaluate("() => window.__OPENCLAW_STUDIO_CHAT_TEST_FORCE_WS_CLOSE && window.__OPENCLAW_STUDIO_CHAT_TEST_FORCE_WS_CLOSE()")
        page.wait_for_timeout(1500)
        warning_text = page.locator("body").inner_text()
        result["disconnect_warning_present"] = "实时连接正在恢复" in warning_text or "Realtime connection is recovering" in warning_text

        page.screenshot(path=str(SCREENSHOT), full_page=True)

        result["chat_api_urls"] = sorted(set(seen_chat_urls))
        prefix = f"{base_url()}/api/chat/"
        result["single_path_ok"] = bool(result["chat_api_urls"]) and all(url.startswith(prefix) for url in result["chat_api_urls"])
        result["screenshot"] = str(SCREENSHOT)

        critical_checks = [
            "route_not_502",
            "session_list_visible",
            "conversation_pane_visible",
            "composer_visible",
            "created_session_selected",
            "pre_reload_message_visible",
            "reload_route_authorized",
            "reload_restores_message",
            "manual_refresh_available",
            "manual_refresh_keeps_history",
            "send_final_visible",
            "reset_empty_state",
            "send_after_reset",
            "disconnect_warning_present",
            "single_path_ok",
        ]
        failed = [key for key in critical_checks if not result.get(key)]
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if failed:
            raise SystemExit(f"gateway workbench smoke failed: {', '.join(failed)}")
        browser.close()


if __name__ == "__main__":
    main()
