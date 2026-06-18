from pathlib import Path
from playwright.sync_api import sync_playwright, expect, TimeoutError as PlaywrightTimeoutError
import json
import time
import urllib.error
import urllib.parse
import urllib.request

from browser_surface import wait_for_chat_surface


BASE_URL = "http://127.0.0.1:5176"
SCREENSHOT = Path("/tmp/tracevane-chat-host-exec-smoke.png")


def api_json(path, method="GET", payload=None):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if payload is not None else {},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def build_config_payload(enabled):
    return {
        "plugins": {
            "entries": {
                "tracevane": {
                    "enabled": True,
                    "config": {
                        "chat": {
                            "allowHostManagementExecInTracevaneChat": bool(enabled),
                        },
                    },
                },
            },
        },
    }


def read_global_host_exec(summary):
    return bool(
        (((summary.get("plugins") or {}).get("entries") or {}).get("tracevane") or {})
        .get("config", {})
        .get("chat", {})
        .get("allowHostManagementExecInTracevaneChat")
        is True
    )


def set_global_host_exec(enabled):
    api_json("/api/config", method="PATCH", payload=build_config_payload(enabled))


def wait_button_enabled(locator, timeout=30000):
    locator.wait_for(state="visible", timeout=timeout)
    expect(locator).to_be_enabled(timeout=timeout)


def click_enabled(locator, timeout=30000):
    wait_button_enabled(locator, timeout=timeout)
    locator.click(timeout=timeout)


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
    deadline = time.monotonic() + 30
    last_state = None
    while time.monotonic() < deadline:
        last_state = page.evaluate(
            """(sessionKey) => {
                const activeRow = document.querySelector('.chat-shell-session-row.active');
                const activeText = (activeRow?.textContent || '').trim();
                const composer = document.querySelector('.chat-composer-shell');
                const execToggle = document.querySelector('.chat-conversation-pane__exec-toggle');
                return {
                  href: window.location.href,
                  activeRowVisible: Boolean(activeRow),
                  activeSessionKey: activeRow?.getAttribute('data-session-key') || '',
                  activeText,
                  composerVisible: Boolean(composer),
                  execToggleVisible: Boolean(execToggle),
                  selectedRoute: window.location.href.includes(encodeURIComponent(sessionKey)),
                };
            }""",
            session_key,
        )
        if (
            last_state["activeRowVisible"]
            and last_state["activeSessionKey"] == session_key
            and (last_state["composerVisible"] or last_state["execToggleVisible"])
        ):
            break
        page.wait_for_timeout(250)
    else:
        raise AssertionError(
            "new chat session was created but did not become visible: "
            f"{json.dumps({'sessionKey': session_key, 'state': last_state, 'diagnostics': collect_page_diagnostics(page)}, ensure_ascii=False)}"
        )
    page.wait_for_load_state("networkidle")
    return session_key


def exec_toggle_info(page):
    return page.evaluate(
        """() => {
            const el = document.querySelector('.chat-conversation-pane__exec-toggle');
            if (!el) return null;
            return {
              text: (el.textContent || '').trim(),
              title: el.getAttribute('title') || '',
              disabled: el.disabled === true,
              active: el.classList.contains('active'),
              unavailable: el.classList.contains('unavailable'),
            };
        }"""
    )


def wait_exec_toggle_state(page, expected_active, timeout=30000):
    deadline = time.monotonic() + timeout / 1000
    last_info = None
    while time.monotonic() < deadline:
        last_info = exec_toggle_info(page)
        if last_info and not last_info["disabled"] and not last_info["unavailable"] and last_info["active"] is expected_active:
            return last_info
        page.wait_for_timeout(250)
    raise AssertionError(f"exec toggle state did not become active={expected_active}: {last_info}")


def fetch_session_controls(session_key):
    return api_json(f"/api/chat/sessions/{urllib.parse.quote(session_key, safe='')}/controls")


def collect_page_diagnostics(page):
    return page.evaluate(
        """() => {
            const text = (selector) => (document.querySelector(selector)?.textContent || '').trim();
            const exists = (selector) => Boolean(document.querySelector(selector));
            const buttonState = (selector) => {
              const el = document.querySelector(selector);
              if (!el) return null;
              return {
                text: (el.textContent || '').trim(),
                disabled: el.disabled === true,
                className: el.getAttribute('class') || '',
                title: el.getAttribute('title') || '',
              };
            };
            return {
              url: window.location.href,
              newChatButton: buttonState('.chat-new-chat-trigger'),
              execToggle: buttonState('.chat-conversation-pane__exec-toggle'),
              confirmPrimary: buttonState('.chat-host-exec-confirm-primary'),
              pickerVisible: exists('.chat-agent-picker'),
              confirmVisible: exists('.chat-host-exec-confirm-dialog'),
              activeSessionText: text('.chat-shell-session-row.active'),
              composerVisible: exists('.chat-composer-editor[contenteditable="true"]'),
              noticeText: text('.chat-shell-notice'),
              bodyTail: (document.body?.innerText || '').slice(-1200),
            };
        }"""
    )


def main() -> None:
    result = {}
    browser = None
    page = None
    previous_global = read_global_host_exec(api_json("/api/config"))
    changed_global = previous_global is False

    try:
        if changed_global:
            set_global_host_exec(True)
        result["global_host_exec_enabled_for_smoke"] = read_global_host_exec(api_json("/api/config"))

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1600, "height": 1200})
            result["stage"] = "goto-chat"
            wait_for_chat_surface(page, f"{BASE_URL}/chat")

            result["stage"] = "open-new-chat"
            session_key = open_new_chat(page)
            result["session_key"] = session_key

            result["stage"] = "wait-initial-toggle"
            initial_info = wait_exec_toggle_state(page, expected_active=False)
            result["toggle_available_before_enable"] = not initial_info["unavailable"] and not initial_info["disabled"]

            result["stage"] = "open-confirm"
            toggle = page.locator(".chat-conversation-pane__exec-toggle").first
            click_enabled(toggle)
            confirm_dialog = page.locator(".chat-host-exec-confirm-dialog")
            confirm_dialog.wait_for(state="visible", timeout=10000)
            result["confirm_dialog_visible"] = True

            result["stage"] = "confirm-enable"
            with page.expect_response(
                lambda resp: f"/api/chat/sessions/{urllib.parse.quote(session_key, safe='')}/controls" in resp.url and resp.request.method == "PATCH",
                timeout=30000,
            ) as response_info:
                click_enabled(page.locator(".chat-host-exec-confirm-primary").first)
            controls_payload = response_info.value.json()
            result["patch_global_enabled"] = controls_payload.get("globalHostManagementExecEnabled") is True
            result["patch_session_enabled"] = (controls_payload.get("controls") or {}).get("allowHostManagementExec") is True

            result["stage"] = "wait-enabled-toggle"
            enabled_info = wait_exec_toggle_state(page, expected_active=True)
            result["toggle_active_after_enable"] = enabled_info["active"] is True

            result["stage"] = "reload"
            page.reload(wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle")
            result["stage"] = "wait-reloaded-toggle"
            reloaded_info = wait_exec_toggle_state(page, expected_active=True)
            result["toggle_active_after_reload"] = reloaded_info["active"] is True
            result["toggle_not_unavailable_after_reload"] = reloaded_info["unavailable"] is False

            result["stage"] = "fetch-controls-after-reload"
            controls_after_reload = fetch_session_controls(session_key)
            result["api_global_enabled_after_reload"] = controls_after_reload.get("globalHostManagementExecEnabled") is True
            result["api_session_enabled_after_reload"] = (controls_after_reload.get("controls") or {}).get("allowHostManagementExec") is True

            page.screenshot(path=str(SCREENSHOT), full_page=True)
            result["screenshot"] = str(SCREENSHOT)
            browser.close()
            browser = None
    except Exception:
        if page is not None:
            try:
                result["diagnostics"] = collect_page_diagnostics(page)
                page.screenshot(path=str(SCREENSHOT), full_page=True)
                result["screenshot"] = str(SCREENSHOT)
            except Exception as diagnostic_error:
                result["diagnostic_error"] = str(diagnostic_error)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if browser is not None:
            try:
                browser.close()
            except Exception:
                pass
        raise
    finally:
        if changed_global:
            try:
                set_global_host_exec(previous_global)
                result["global_host_exec_restored"] = True
            except (urllib.error.URLError, TimeoutError):
                result["global_host_exec_restored"] = False

    critical_checks = [
        "global_host_exec_enabled_for_smoke",
        "toggle_available_before_enable",
        "confirm_dialog_visible",
        "patch_global_enabled",
        "patch_session_enabled",
        "toggle_active_after_enable",
        "toggle_active_after_reload",
        "toggle_not_unavailable_after_reload",
        "api_global_enabled_after_reload",
        "api_session_enabled_after_reload",
    ]
    failed = [key for key in critical_checks if not result.get(key)]
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if failed:
        raise SystemExit(f"host exec smoke failed: {', '.join(failed)}")


if __name__ == "__main__":
    try:
        main()
    except PlaywrightTimeoutError as error:
        raise SystemExit(f"host exec smoke timed out: {error}") from error
