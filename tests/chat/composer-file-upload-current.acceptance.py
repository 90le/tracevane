from __future__ import annotations

from pathlib import Path

from playwright.sync_api import expect, sync_playwright

SCREENSHOT = Path('/tmp/tracevane-chat-composer-file-upload-current.png')
SAMPLE = Path('/tmp/tracevane-chat-composer-file-upload-current.txt')


def main() -> None:
    SAMPLE.write_text('Tracevane Agent chat composer upload acceptance\n', encoding='utf-8')
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        http_errors: list[str] = []
        page.on(
            'response',
            lambda response: http_errors.append(f'{response.status} {response.url}')
            if response.status >= 400
            else None,
        )

        page.goto('http://127.0.0.1:5176/#/chat', wait_until='networkidle')
        expect(page.get_by_text('上传文件')).to_be_visible(timeout=10000)
        expect(page.locator('textarea')).to_be_visible(timeout=10000)

        page.locator('input[type="file"]').first.set_input_files(str(SAMPLE))
        expect(page.get_by_text(SAMPLE.name)).to_be_visible(timeout=15000)
        page.screenshot(path=str(SCREENSHOT), full_page=True)

        if http_errors:
            raise AssertionError(f'Unexpected HTTP errors during chat upload smoke: {http_errors}')

        browser.close()


if __name__ == '__main__':
    main()
