from pathlib import Path
from playwright.sync_api import sync_playwright, expect, TimeoutError as PlaywrightTimeoutError
import json
import re


SCREENSHOT = Path("/tmp/openclaw-studio-chat-fresh-tool-smoke.png")
TOKEN = "fresh-tool-smoke"


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
    page.wait_for_function(
        """() => (
            document.querySelector('.chat-shell-session-row.active')
            && document.querySelector('.chat-composer-editor[contenteditable="true"]')
        )""",
        timeout=30000,
    )
    page.locator(".chat-composer-editor[contenteditable='true']").first.wait_for(state="visible", timeout=30000)
    page.wait_for_load_state("networkidle")
    return session_key


def visible_inline_process_count(page):
    return page.locator(".chat-inline-process:visible").count()


def visible_tool_state_labels(page):
    return page.evaluate(
        """() => Array.from(document.querySelectorAll('.chat-inline-process-head-state'))
          .filter((el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length))
          .map((el) => ({ text: (el.textContent || '').trim(), cls: String(el.className || '') }))"""
    )


def is_terminal_tool_label(label):
    text = label.get("text")
    cls = str(label.get("cls"))
    return (
        "status-completed" in cls
        or "status-error" in cls
        or text in ("已完成", "Completed", "错误", "Error")
    )


def is_running_tool_label(label):
    text = label.get("text")
    cls = str(label.get("cls"))
    return "status-running" in cls or text in ("执行中", "Running")


def observe_tool_status_until_final(page, token):
    terminal_seen = False
    regression_samples = []
    sample_tail = []

    for sample_index in range(360):
        labels = visible_tool_state_labels(page)
        sample_tail.append(labels)
        sample_tail = sample_tail[-8:]
        if any(is_terminal_tool_label(label) for label in labels):
            terminal_seen = True
        if terminal_seen and any(is_running_tool_label(label) for label in labels):
            regression_samples.append({"index": sample_index, "labels": labels})
        final_seen = page.evaluate(
            "(token) => Array.from(document.querySelectorAll('.chat-message-bubble')).some((el) => (el.textContent || '').includes(token))",
            token,
        )
        if final_seen:
            for post_index in range(24):
                labels = visible_tool_state_labels(page)
                sample_tail.append(labels)
                sample_tail = sample_tail[-8:]
                if any(is_terminal_tool_label(label) for label in labels):
                    terminal_seen = True
                if terminal_seen and any(is_running_tool_label(label) for label in labels):
                    regression_samples.append({"index": f"post-{post_index}", "labels": labels})
                page.wait_for_timeout(250)
            final_labels = visible_tool_state_labels(page)
            terminal_seen = terminal_seen or any(is_terminal_tool_label(label) for label in final_labels)
            return {
                "terminal_seen": terminal_seen,
                "regression_samples": regression_samples[:5],
                "final_labels": final_labels,
                "sample_tail": sample_tail,
            }
        page.wait_for_timeout(250)

    raise PlaywrightTimeoutError("timed out while waiting for final tool reply")


def main() -> None:
    result = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1600, "height": 1200})

        page.goto("http://127.0.0.1:5176/chat", wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        expect(page.locator(".chat-shell-session-list")).to_be_visible()

        open_new_chat(page)

        textarea = page.locator(".chat-composer-editor[contenteditable='true']").first
        send_btn = page.get_by_role("button", name=re.compile("^发送$|^Send$")).first

        prompt = (
            f"Use exactly one local tool call to run `printf {TOKEN}` and then reply with exactly {TOKEN}. "
            "Do not explain the command."
        )
        fill_editor(page, textarea, prompt)
        user_bubbles_before = page.locator(".chat-message-group.role-user .chat-message-bubble").count()
        click_enabled(send_btn)

        page.wait_for_function(
            "(before) => {"
            "  const bubbles = Array.from(document.querySelectorAll('.chat-message-group.role-user .chat-message-bubble'));"
            "  return bubbles.length > before && bubbles.some((el) => ((el.textContent || '').trim().length > 0));"
            "}",
            arg=user_bubbles_before,
            timeout=30000,
        )
        result["user_message_visible_immediately"] = (
            page.locator(".chat-message-group.role-user .chat-message-bubble").count() > user_bubbles_before
        )

        page.wait_for_function(
            "() => Array.from(document.querySelectorAll('.chat-inline-process')).some((el) => (el.textContent || '').trim().length > 0)",
            timeout=90000,
        )
        result["tool_process_visible"] = visible_inline_process_count(page) > 0

        status_observation = observe_tool_status_until_final(page, TOKEN)
        result["tool_terminal_seen"] = status_observation["terminal_seen"]
        result["tool_status_never_regressed"] = not status_observation["regression_samples"]
        result["tool_status_final_labels"] = status_observation["final_labels"]
        if status_observation["regression_samples"]:
            result["tool_status_regression_samples"] = status_observation["regression_samples"]

        page.wait_for_function(
            "(token) => Array.from(document.querySelectorAll('.chat-message-bubble')).some((el) => (el.textContent || '').includes(token))",
            arg=TOKEN,
            timeout=90000,
        )
        result["final_reply_visible"] = TOKEN in page.locator(".chat-conversation-thread").inner_text()

        page.reload(wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        page.wait_for_function(
            "(token) => Array.from(document.querySelectorAll('.chat-message-bubble')).some((el) => (el.textContent || '').includes(token))",
            arg=TOKEN,
            timeout=60000,
        )
        result["reload_restores_tool_process"] = visible_inline_process_count(page) > 0

        page.screenshot(path=str(SCREENSHOT), full_page=True)
        result["screenshot"] = str(SCREENSHOT)

        critical_checks = [
            "user_message_visible_immediately",
            "tool_process_visible",
            "tool_terminal_seen",
            "tool_status_never_regressed",
            "final_reply_visible",
            "reload_restores_tool_process",
        ]
        failed = [key for key in critical_checks if not result.get(key)]
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if failed:
            raise SystemExit(f"fresh tool smoke failed: {', '.join(failed)}")
        browser.close()


if __name__ == "__main__":
    try:
        main()
    except PlaywrightTimeoutError as error:
        raise SystemExit(f"fresh tool smoke timed out: {error}") from error
