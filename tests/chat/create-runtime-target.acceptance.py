import re

from playwright.sync_api import expect, sync_playwright


def test_chat_create_runtime_target_picker():
    http_errors: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.on(
            "response",
            lambda response: http_errors.append(f"{response.status} {response.url}")
            if response.status >= 400 and "/api/" in response.url
            else None,
        )
        page.goto("http://127.0.0.1:5176/#/chat")
        page.wait_for_load_state("networkidle")

        page.get_by_text("新建", exact=True).click()
        picker = page.locator(".chat-agent-picker").first
        expect(picker.get_by_text("运行器 / Agent")).to_be_visible(timeout=8000)
        expect(picker.get_by_role("button", name=re.compile("OpenClaw 平台 Agent"))).to_be_visible()
        picker.get_by_role("button", name=re.compile("Codex CLI")).click()
        expect(picker.get_by_text("native-cli / codex")).to_be_visible(timeout=5000)
        expect(picker.get_by_label("默认工作目录")).to_be_visible(timeout=5000)
        expect(picker.get_by_label("权限模式")).to_be_visible(timeout=5000)
        page.screenshot(path="/tmp/tracevane-chat-create-runtime-target.png", full_page=True)
        browser.close()

    assert not http_errors, http_errors


if __name__ == "__main__":
    test_chat_create_runtime_target_picker()
    print("ok screenshot=/tmp/tracevane-chat-create-runtime-target.png")
