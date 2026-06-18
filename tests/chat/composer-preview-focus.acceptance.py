from __future__ import annotations

import base64
import json
import tempfile
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

from browser_surface import wait_for_chat_surface


SCREENSHOT = Path("/tmp/tracevane-chat-composer-preview-focus.png")
TINY_PNG = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/"
    "lW9X5QAAAABJRU5ErkJggg=="
)


def write_temp_image() -> Path:
    root = Path(tempfile.mkdtemp(prefix="tracevane-chat-preview-focus-"))
    path = root / "composer-preview-focus.png"
    path.write_bytes(base64.b64decode(TINY_PNG))
    return path


def main() -> None:
    image_path = write_temp_image()
    console_errors: list[str] = []
    request_failures: list[str] = []
    result: dict[str, object] = {
        "file": str(image_path),
    }

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 980})
            page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
            page.on(
                "requestfailed",
                lambda request: request_failures.append(
                    f"{request.method} {request.url} {request.failure.get('errorText') if request.failure else ''}"
                ),
            )

            wait_for_chat_surface(
                page,
                "http://127.0.0.1:5176/chat",
                selectors=(".chat-conversation-pane", ".chat-composer-editor"),
                timeout=90000,
            )
            page.wait_for_selector(".chat-composer-file-input", state="attached", timeout=30000)
            page.locator(".chat-composer-file-input").set_input_files(str(image_path))
            page.wait_for_function(
                """(fileName) => {
                    return Array.from(document.querySelectorAll('.chat-composer-pool-item.ready')).some((item) => {
                        const text = item.textContent || '';
                        return text.includes(fileName);
                    });
                }""",
                arg=image_path.name,
                timeout=30000,
            )

            chip = page.locator(".chat-composer-pool-item.ready").filter(has_text=image_path.name).locator(".chat-composer-pool-chip").first
            chip.wait_for(state="visible", timeout=10000)
            source_key = chip.get_attribute("data-composer-attachment-preview-key") or ""
            if not source_key:
                raise AssertionError("attachment preview source key is missing")

            chip.click()
            page.wait_for_selector(".chat-composer-preview-dialog", state="visible", timeout=10000)
            page.keyboard.press("Escape")
            page.wait_for_selector(".chat-composer-preview-dialog", state="detached", timeout=10000)
            page.wait_for_function(
                """(sourceKey) => {
                    const active = document.activeElement;
                    return Boolean(
                        active
                        && active.classList.contains('chat-composer-pool-chip')
                        && active.getAttribute('data-composer-attachment-preview-key') === sourceKey
                    );
                }""",
                arg=source_key,
                timeout=10000,
            )

            result.update(page.evaluate(
                """() => {
                    const active = document.activeElement;
                    return {
                        previewOpen: Boolean(document.querySelector('.chat-composer-preview-dialog')),
                        activeTag: active?.tagName || '',
                        activeClass: String(active?.className || ''),
                        activePreviewKey: active?.getAttribute('data-composer-attachment-preview-key') || '',
                        poolItemCount: document.querySelectorAll('.chat-composer-pool-item.ready').length,
                    };
                }"""
            ))
            page.screenshot(path=str(SCREENSHOT), full_page=True)
            result["screenshot"] = str(SCREENSHOT)
            browser.close()
    except PlaywrightTimeoutError as error:
        raise SystemExit(f"composer preview focus smoke timed out: {error}") from error
    finally:
        try:
            image_path.unlink()
            image_path.parent.rmdir()
        except OSError:
            pass

    result["consoleErrors"] = console_errors
    result["requestFailures"] = request_failures
    checks = {
        "preview_closed": result.get("previewOpen") is False,
        "focus_restored_to_source_chip": result.get("activePreviewKey") not in (None, ""),
        "no_console_errors": len(console_errors) == 0,
        "no_request_failures": len(request_failures) == 0,
    }
    result["checks"] = checks
    print(json.dumps(result, ensure_ascii=False, indent=2))
    failed = [key for key, value in checks.items() if not value]
    if failed:
        raise SystemExit(f"composer preview focus smoke failed: {', '.join(failed)}")


if __name__ == "__main__":
    main()
