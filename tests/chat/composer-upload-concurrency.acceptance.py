from __future__ import annotations

import base64
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


SCREENSHOT = Path("/tmp/openclaw-studio-chat-composer-upload-concurrency-acceptance.png")


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


def wait_for_count(page, items: list[dict[str, object]], count: int, label: str, timeout=10000):
    deadline = time.monotonic() + (timeout / 1000)
    while time.monotonic() < deadline:
        if len(items) >= count:
            return
        page.wait_for_timeout(50)
    raise AssertionError(f"timed out waiting for {label}; expected {count}, got {len(items)}")


def session_ref(session_key: str) -> str:
    encoded = base64.urlsafe_b64encode(session_key.encode("utf-8")).decode("ascii").rstrip("=")
    return f"r1_{encoded}"


def open_new_chat(page) -> str:
    click_enabled(page.locator(".chat-new-chat-trigger").first)
    picker = page.locator(".chat-agent-picker")
    picker.wait_for(state="visible", timeout=15000)
    option = picker.locator(".chat-agent-picker-option").first
    with page.expect_response(
        lambda resp: "/api/chat/agents/" in resp.url and resp.request.method == "POST",
        timeout=30000,
    ) as response_info:
        click_enabled(option)
    payload = response_info.value.json()
    session_key = ((payload.get("session") or {}).get("key") or "").strip()
    if not session_key:
        raise AssertionError(f"create session response missing session.key: {payload}")
    try:
        wait_for_active_session(page, session_key, timeout=15000)
    except PlaywrightTimeoutError:
        page.goto(
            f"http://127.0.0.1:5176/chat/s/{session_ref(session_key)}",
            wait_until="domcontentloaded",
            timeout=30000,
        )
        wait_for_active_session(page, session_key, timeout=60000)
    page.wait_for_load_state("networkidle")
    return session_key


def write_temp_file(name: str, content: str) -> Path:
    root = Path(tempfile.mkdtemp(prefix="openclaw-studio-chat-upload-concurrency-"))
    path = root / name
    path.write_text(content, encoding="utf-8")
    return path


def route_session_key(url: str, suffix: str) -> str:
    marker = "/api/chat/sessions/"
    if marker not in url:
        return ""
    encoded = url.split(marker, 1)[1].split(suffix, 1)[0]
    return unquote(encoded)


def upload_response(session_key: str, payload: dict[str, object]) -> dict[str, object]:
    file_name = str(payload.get("fileName") or "upload.txt")
    relative_path = f"uploads/{int(time.time() * 1000)}-{file_name}"
    resource_ref = f"uploads:{relative_path.removeprefix('uploads/')}"
    mime_type = str(payload.get("mimeType") or "text/plain")
    preview_url = "data:image/png;base64,iVBORw0KGgo=" if mime_type.startswith("image/") else None
    return {
        "ok": True,
        "sessionKey": session_key,
        "id": f"upload-{file_name}",
        "relativePath": relative_path,
        "resourceRef": resource_ref,
        "fileName": file_name,
        "mimeType": mime_type,
        "resource": {
            "id": f"resource-{file_name}",
            "kind": "file",
            "fileName": file_name,
            "mimeType": mime_type,
            "relativePath": relative_path,
            "resourceRef": resource_ref,
            "source": "user_upload",
            "url": preview_url or f"/api/chat/sessions/{session_key}/resources/{resource_ref}",
            "downloadUrl": preview_url or f"/api/chat/sessions/{session_key}/resources/{resource_ref}?download=1",
        },
    }


def install_file_reader_probe(page, slow_file_name: str, delay_ms: int):
    payload = json.dumps({"slowFileName": slow_file_name, "delayMs": delay_ms})
    script = """(() => {
            const { slowFileName, delayMs } = __PAYLOAD__;
            const nativeReadAsDataUrl = FileReader.prototype.readAsDataURL;
            window.__studioReadEvents = [];
            FileReader.prototype.readAsDataURL = function(blob) {
                const fileName = blob && typeof blob.name === 'string' ? blob.name : '';
                const record = (type) => {
                    window.__studioReadEvents.push({
                        type,
                        fileName,
                        at: performance.now(),
                    });
                };
                record('start');
                this.addEventListener('loadend', () => record('done'), { once: true });
                if (fileName === slowFileName) {
                    window.setTimeout(() => nativeReadAsDataUrl.call(this, blob), delayMs);
                    return;
                }
                nativeReadAsDataUrl.call(this, blob);
            };
        })()""".replace("__PAYLOAD__", payload)
    page.add_init_script(
        script=script,
    )


def read_events(page) -> list[dict[str, object]]:
    return page.evaluate("() => window.__studioReadEvents || []")


def main() -> None:
    fast_file = write_temp_file("fast-upload-first.png", "fast image upload should not wait for slow preview read")
    slow_file = write_temp_file("slow-upload-second.png", "slow image upload intentionally delayed")
    upload_payloads: list[dict[str, object]] = []
    console_errors: list[str] = []
    result: dict[str, object] = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1500, "height": 900})
        install_file_reader_probe(page, slow_file.name, 3000)
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        def handle_upload(route):
            payload = read_upload_payload(route.request)
            upload_payloads.append({
                "fileName": payload.get("fileName"),
                "at": time.monotonic(),
            })
            session_key = route_session_key(route.request.url, "/upload")
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(upload_response(session_key, payload)),
            )

        page.route(re.compile(r".*/api/chat/sessions/.*/upload(?:\?.*)?$"), handle_upload)
        wait_for_chat_surface(page, "http://127.0.0.1:5176/chat/workbench")
        open_new_chat(page)

        input_el = page.locator(".chat-composer-file-input").first
        input_el.set_input_files([str(fast_file), str(slow_file)])

        wait_for_count(page, upload_payloads, 1, "first upload before slow FileReader completes", timeout=2000)
        first_upload = upload_payloads[0]
        events_after_first_upload = read_events(page)
        slow_done_before_first_upload = any(
            event.get("type") == "done" and event.get("fileName") == slow_file.name
            for event in events_after_first_upload
        )
        if first_upload.get("fileName") != fast_file.name:
            raise AssertionError(f"fast file must upload first, got {first_upload}")
        if slow_done_before_first_upload:
            raise AssertionError(
                "first upload waited for the slow file read to finish: "
                + json.dumps(events_after_first_upload, ensure_ascii=False)
            )

        wait_for_count(page, upload_payloads, 2, "all uploads", timeout=8000)
        page.wait_for_function(
            """(fileNames) => fileNames.every((fileName) => {
                const item = Array.from(document.querySelectorAll('.chat-composer-pool-item'))
                    .find((candidate) => (candidate.textContent || '').includes(fileName));
                return item && item.classList.contains('ready') && (/Ready|已就绪/.test(item.textContent || ''));
            })""",
            arg=[fast_file.name, slow_file.name],
            timeout=10000,
        )
        if console_errors:
            raise AssertionError("browser console errors: " + json.dumps(console_errors, ensure_ascii=False))

        result["uploadOrder"] = [payload.get("fileName") for payload in upload_payloads]
        result["slowDoneBeforeFirstUpload"] = slow_done_before_first_upload
        result["readEvents"] = read_events(page)
        result["screenshot"] = str(SCREENSHOT)
        page.screenshot(path=str(SCREENSHOT), full_page=True)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        browser.close()


if __name__ == "__main__":
    try:
        main()
    except PlaywrightTimeoutError as error:
        raise SystemExit(f"chat composer upload concurrency smoke timed out: {error}") from error
