from pathlib import Path
from playwright.sync_api import sync_playwright, expect, TimeoutError as PlaywrightTimeoutError
import json
import re
import time

from browser_surface import wait_for_active_session, wait_for_chat_surface


SCREENSHOT = Path("/tmp/openclaw-studio-chat-mvp-acceptance.png")


def wait_button_enabled(locator, timeout=30000):
    locator.wait_for(state="visible", timeout=timeout)
    locator.page.wait_for_function(
        "(el) => !el.disabled",
        arg=locator.element_handle(),
        timeout=timeout,
    )


def click_enabled(locator, timeout=30000):
    wait_button_enabled(locator, timeout=timeout)
    locator.page.wait_for_timeout(200)
    locator.evaluate("(el) => el.click()")


def fill_editor(page, locator, text):
    locator.click()
    page.keyboard.press("Control+A")
    page.keyboard.press("Backspace")
    page.keyboard.type(text, delay=1)
    page.wait_for_timeout(300)


def wait_for_run_to_settle(page, timeout=60000):
    deadline = time.monotonic() + (timeout / 1000)
    while time.monotonic() < deadline:
        stop_button = page.get_by_role("button", name=re.compile("^停止$|^Stop$")).first
        running_status = page.locator(".chat-conversation-pane__status").first
        stop_visible = stop_button.count() > 0 and stop_button.is_visible()
        status_visible = running_status.count() > 0 and running_status.is_visible()
        composer_running = page.evaluate(
            """() => {
                const editor = document.querySelector('.chat-composer-editor[contenteditable="true"]');
                const placeholder = editor?.getAttribute('data-placeholder') || '';
                return /reply is still running|回复生成中|生成中/i.test(placeholder);
            }"""
        )
        if not stop_visible and not status_visible and not composer_running:
            return True
        page.wait_for_timeout(250)
    return False


def thread_bottom_distance(page):
    return page.evaluate(
        """() => {
            const el = document.querySelector('.chat-conversation-thread');
            if (!el) return Number.POSITIVE_INFINITY;
            return Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight);
        }"""
    )


def bubble_signatures(page):
    return page.evaluate(
        """() => Array.from(document.querySelectorAll('.chat-message-group'))
            .map((group) => Array.from(group.classList).find((name) => name.startsWith('role-')) || 'role-unknown')
            .filter((value) => value !== 'role-unknown')"""
    )


def wait_for_bubble_signatures_stable(page, timeout=8000):
    deadline = time.monotonic() + (timeout / 1000)
    previous = None
    stable_ticks = 0
    while time.monotonic() < deadline:
        current = bubble_signatures(page)
        if current and current == previous:
            stable_ticks += 1
            if stable_ticks >= 3:
                return current
        else:
            stable_ticks = 0
            previous = current
        page.wait_for_timeout(250)
    return bubble_signatures(page)


def open_new_chat(page):
    button = page.locator(".chat-new-chat-trigger").first
    click_enabled(button)
    picker = page.locator(".chat-agent-picker")
    picker.wait_for(state="visible", timeout=15000)
    option = picker.locator(".chat-agent-picker-option").first
    with page.expect_response(lambda resp: "/api/chat/agents/" in resp.url and resp.request.method == "POST", timeout=30000) as response_info:
        click_enabled(option)
    payload = response_info.value.json()
    session_key = ((payload.get("session") or {}).get("key") or "").strip()
    if not session_key:
        raise AssertionError(f"create session response missing session.key: {payload}")
    wait_for_active_session(page, session_key)
    page.wait_for_load_state("networkidle")
    return session_key


def open_reset_menu(page):
    trigger = page.get_by_role("button", name=re.compile("更多|More")).first
    trigger.wait_for(state="visible", timeout=10000)
    trigger.click()
    page.locator(".chat-session-menu-popover").wait_for(state="visible", timeout=10000)


def reset_menu_item(page):
    return page.locator(".chat-session-menu-item").filter(has_text=re.compile("重置 Session|Reset Session")).first


def click_reset_menu_item(page):
    item = reset_menu_item(page)
    item.wait_for(state="visible", timeout=10000)
    item.evaluate("(el) => el.click()")


def reset_menu_item_disabled(page):
    item = reset_menu_item(page)
    item.wait_for(state="visible", timeout=10000)
    return item.evaluate("(el) => el.hasAttribute('data-disabled') || el.getAttribute('aria-disabled') === 'true'")


def visible_button_is_disabled(locator):
    if locator.count() == 0 or not locator.is_visible():
        return True
    return locator.is_disabled()


def click_if_visible_enabled(locator, timeout=20000):
    if locator.count() == 0 or not locator.is_visible() or locator.is_disabled():
        return False
    click_enabled(locator, timeout=timeout)
    return True


def close_inspector_if_open(page):
    close_button = page.locator(".chat-inspector-panel__close").first
    if close_button.count() == 0:
        return
    close_button.click()
    page.wait_for_timeout(300)


def open_session_with_history(page):
    rows = page.locator(".chat-shell-session-row")
    candidates = []
    for index in range(rows.count()):
        row = rows.nth(index)
        text = row.inner_text()
        if "No messages yet" in text or "还没有消息" in text:
            continue
        clickable = row.locator(".chat-shell-session-item").first
        if clickable.count() == 0:
            continue
        is_writable = bool(re.search(r"可聊|Live", text))
        candidates.append((is_writable, row))

    for is_writable, row in sorted(candidates, key=lambda item: (not item[0])):
        clickable = row.locator(".chat-shell-session-item").first
        click_enabled(clickable)
        page.wait_for_timeout(600)
        return True
    return False


def main() -> None:
    result = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1600, "height": 1200})

        seen_chat_urls = []

        def on_response(response) -> None:
            if "/api/chat/" in response.url:
                seen_chat_urls.append(response.url)

        page.on("response", on_response)
        wait_for_chat_surface(page, "http://127.0.0.1:5176/chat/workbench", (
            ".chat-shell-session-list",
            ".chat-conversation-pane",
            ".chat-composer-editor",
        ))
        expect(page.locator(".chat-shell-session-list")).to_be_visible(timeout=30000)
        expect(page.locator(".chat-inspector-panel")).to_be_visible()
        expect(page.locator(".chat-conversation-pane")).to_be_visible()
        expect(page.locator(".chat-composer-editor")).to_be_visible()
        result["session_list_visible"] = True
        result["inspector_visible"] = True
        result["conversation_pane_visible"] = True
        result["composer_visible"] = True
        close_inspector_if_open(page)

        open_new_chat(page)

        session_active = page.locator(".chat-shell-session-row.active").first
        session_label_before = session_active.locator("strong").inner_text()
        first_created_url = page.url
        result["created_session_selected"] = bool(session_label_before)

        textarea = page.locator(".chat-composer-editor[contenteditable='true']").first
        send_btn = page.get_by_role("button", name=re.compile("^发送$|^Send$")).first
        stop_btn = page.get_by_role("button", name=re.compile("^停止$|^Stop$")).first

        fill_editor(page, textarea, "acceptance smoke one")
        click_enabled(send_btn)
        page.wait_for_function(
            "() => Array.from(document.querySelectorAll('.chat-message-bubble')).some((el) => el.textContent.includes('acceptance smoke one'))",
            timeout=30000,
        )
        result["send_final_visible"] = "acceptance smoke one" in page.locator(".chat-conversation-thread").inner_text()
        result["first_run_settled"] = wait_for_run_to_settle(page)

        long_text = "acceptance abort " + ("please output 10000 numbered lines in a markdown code block. " * 20)
        fill_editor(page, textarea, long_text)
        click_enabled(send_btn)
        try:
            wait_button_enabled(stop_btn, timeout=20000)
            click_enabled(stop_btn, timeout=20000)
            page.wait_for_timeout(1000)
            result["abort_notice_present"] = page.locator("text=已中止").count() > 0 or page.locator("text=Aborted").count() > 0
        except PlaywrightTimeoutError:
            result["abort_notice_present"] = False
        result["run_settled_before_reset"] = wait_for_run_to_settle(page)
        if not result["run_settled_before_reset"]:
            page.screenshot(path=str(SCREENSHOT), full_page=True)
            result["screenshot"] = str(SCREENSHOT)
            print(json.dumps(result, ensure_ascii=False, indent=2))
            raise SystemExit("workbench smoke failed: run_settled_before_reset")

        open_reset_menu(page)
        click_reset_menu_item(page)
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(500)
        result["reset_empty_state"] = (
            page.locator(".chat-message-bubble").count() == 0
            or page.locator("text=这里还没有消息").count() > 0
            or page.locator("text=No messages yet").count() > 0
        )

        fill_editor(page, textarea, "after reset smoke")
        click_enabled(send_btn)
        page.wait_for_function(
            "() => Array.from(document.querySelectorAll('.chat-message-bubble')).some((el) => el.textContent.includes('after reset smoke'))",
            timeout=30000,
        )
        result["send_after_reset"] = "after reset smoke" in page.locator(".chat-conversation-thread").inner_text()

        result["reload_target_has_history"] = open_session_with_history(page)
        if result["reload_target_has_history"]:
            page.wait_for_function(
                "() => (document.querySelector('.chat-conversation-thread')?.textContent || '').trim().length > 0",
                timeout=30000,
            )
        bubble_signatures_before = wait_for_bubble_signatures_stable(page)
        result["initial_scroll_bottom"] = (not result["reload_target_has_history"]) or thread_bottom_distance(page) <= 100
        reload_target_url = page.url
        reload_thread_text_before = page.locator(".chat-conversation-thread").inner_text()

        page.reload(wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        if result["reload_target_has_history"]:
            page.wait_for_function(
                "() => (document.querySelector('.chat-conversation-thread')?.textContent || '').trim().length > 0",
                timeout=30000,
            )
        bubble_signatures_after = wait_for_bubble_signatures_stable(page)
        reloaded_thread_text = page.locator(".chat-conversation-thread").inner_text()
        result["reload_restored_session"] = (
            page.url == reload_target_url
            and page.locator(".chat-shell-session-row.active").count() == 1
        )
        result["reload_order_stable"] = (
            not result["reload_target_has_history"]
            or bubble_signatures_before == bubble_signatures_after
        )
        result["reload_restored_history"] = (
            result["reload_restored_session"]
            and (
                page.locator(".chat-message-bubble").count() >= 1
                or len(reloaded_thread_text.strip()) > 0
            )
        )

        open_new_chat(page)
        result["second_session_selected"] = (
            page.url != first_created_url
            and page.locator(".chat-shell-session-row.active").count() == 1
        )

        session_items = page.locator(".chat-shell-session-item").filter(has_text=re.compile("可聊|Live"))
        result["switch_session_no_cross_talk"] = True
        if session_items.count() >= 2:
            first_writable = session_items.nth(0)
            second_writable = session_items.nth(1)
            first_writable.click()
            page.wait_for_timeout(600)
            fill_editor(page, textarea, "cross-session long request " + ("stream " * 80))
            click_enabled(send_btn)
            try:
                wait_button_enabled(stop_btn, timeout=12000)
            except PlaywrightTimeoutError:
                # Some models refuse or summarize the long prompt quickly; cross-session isolation is still checkable.
                pass
            click_enabled(second_writable)
            page.wait_for_timeout(1200)
            body_text = page.locator(".chat-conversation-thread").inner_text()
            result["switch_session_no_cross_talk"] = "cross-session long request" not in body_text
            click_enabled(first_writable)
            page.wait_for_timeout(600)
            if click_if_visible_enabled(stop_btn, timeout=20000):
                page.wait_for_timeout(800)

        readonly_session = page.locator(".chat-shell-observed-section .chat-shell-session-item").first
        result["readonly_session_present"] = readonly_session.count() > 0
        if readonly_session.count() > 0:
            click_enabled(readonly_session)
            page.wait_for_timeout(600)
            result["readonly_send_disabled"] = page.get_by_role("button", name=re.compile("^发送$|^Send$")).first.is_disabled()
            result["readonly_stop_disabled"] = visible_button_is_disabled(page.get_by_role("button", name=re.compile("^停止$|^Stop$")).first)
            open_reset_menu(page)
            result["readonly_reset_disabled"] = reset_menu_item_disabled(page)
        else:
            result["readonly_send_disabled"] = True
            result["readonly_stop_disabled"] = True
            result["readonly_reset_disabled"] = True

        writable_session = page.locator(".chat-shell-session-item").filter(has_text=re.compile("可聊|Live")).first
        click_enabled(writable_session)
        page.wait_for_timeout(600)

        page.evaluate("() => window.__OPENCLAW_STUDIO_CHAT_TEST_FORCE_WS_CLOSE && window.__OPENCLAW_STUDIO_CHAT_TEST_FORCE_WS_CLOSE()")
        page.wait_for_timeout(1000)
        warning_text = page.locator("body").inner_text()
        result["disconnect_warning_present"] = "实时连接正在恢复" in warning_text or "Realtime connection is recovering" in warning_text

        page.screenshot(path=str(SCREENSHOT), full_page=True)

        result["chat_api_urls"] = sorted(set(seen_chat_urls))
        result["single_path_ok"] = all(url.startswith("http://127.0.0.1:5176/api/chat/") for url in result["chat_api_urls"])
        result["screenshot"] = str(SCREENSHOT)

        critical_checks = [
            "session_list_visible",
            "inspector_visible",
            "conversation_pane_visible",
            "composer_visible",
            "created_session_selected",
            "send_final_visible",
            "first_run_settled",
            "run_settled_before_reset",
            "reset_empty_state",
            "send_after_reset",
            "reload_restored_session",
            "reload_restored_history",
            "reload_order_stable",
            "initial_scroll_bottom",
            "second_session_selected",
            "disconnect_warning_present",
            "single_path_ok",
        ]
        failed = [key for key in critical_checks if not result.get(key)]
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if failed:
            raise SystemExit(f"workbench smoke failed: {', '.join(failed)}")
        browser.close()


if __name__ == "__main__":
    main()
