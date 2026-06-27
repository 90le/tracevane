#!/usr/bin/env python3
"""Regression checks for global copy/export feedback toast."""
from __future__ import annotations

import sys
from pathlib import Path
from playwright.sync_api import expect, sync_playwright


def main() -> int:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.tmp/docs-renderer-preview-site/rich-rendering-gallery.html')
    target = target.resolve()
    if not target.exists():
        raise SystemExit(f'preview HTML not found: {target}')

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1360, "height": 900}, accept_downloads=True)
        page.goto(target.as_uri())
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(1400)

        code = page.locator('.code-block-wrapper').first
        expect(code).to_be_visible()
        code.locator('button[data-copy-format="all"]').click()
        toast = page.locator('[data-doc-feedback-toast]')
        expect(toast).to_be_visible()
        expect(toast).to_contain_text('已复制')
        assert toast.get_attribute('role') == 'status'
        assert toast.get_attribute('aria-live') == 'polite'
        assert toast.get_attribute('data-feedback-state') == 'success'

        # No selection should reuse the same feedback layer for errors.
        page.evaluate("() => window.getSelection().removeAllRanges()")
        code.locator('button[data-copy-format="selection"]').click()
        expect(toast).to_be_visible()
        expect(toast).to_contain_text('复制失败')
        assert toast.get_attribute('data-feedback-state') == 'error'

        page.locator('.diagram-wrap').first.scroll_into_view_if_needed()
        page.wait_for_timeout(120)
        page.locator('.diagram-wrap').first.hover()
        page.wait_for_timeout(250)
        toolbar = page.locator('body > .diagram-toolbar.rich-floating-toolbar').first
        if toolbar.evaluate('el => el.hidden'):
            page.locator('.diagram-wrap').first.evaluate('el => el.focus()')
            page.wait_for_timeout(250)
        expect(toolbar).to_be_visible()
        with page.expect_download() as download_info:
            toolbar.locator('button[data-export-format="svg"]').click()
        assert download_info.value.suggested_filename.endswith('.svg')
        expect(toast).to_be_visible()
        expect(toast).to_contain_text('已导出')
        assert toast.get_attribute('data-feedback-state') == 'success'

        browser.close()
    print('feedback regression verification ok')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
