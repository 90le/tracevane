#!/usr/bin/env python3
"""Regression checks for the HTML Preview browser viewer."""
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
        page = browser.new_page(viewport={"width": 1360, "height": 900})
        page.goto(target.as_uri())
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(1800)

        page.locator('.html-preview-wrap').first.hover()
        page.wait_for_timeout(220)
        toolbar = page.locator('body > .html-preview-toolbar.rich-floating-toolbar').first
        expect(toolbar).to_be_visible()
        toolbar.locator('button', has_text='预览').click()
        modal = page.locator('.rich-preview-modal[aria-hidden="false"]')
        expect(modal).to_be_visible()

        stage = modal.locator('[data-browser-stage]')
        label = modal.locator('[data-browser-size]')
        expect(label).to_contain_text('Fluid')

        modal.locator('[data-browser-viewport="390"]').click()
        expect(label).to_contain_text('Mobile')
        expect(label).to_contain_text('390')
        width = stage.evaluate('el => el.getBoundingClientRect().width')
        assert 360 <= width <= 430, width

        modal.locator('[data-modal-zoom-in]').click()
        page.wait_for_timeout(120)
        expect(label).to_contain_text('120%')

        copy = modal.locator('[data-browser-copy-info]')
        copy.click()
        expect(copy).to_have_attribute('data-copy-state', 'copied')
        info = stage.get_attribute('data-browser-info') or ''
        assert 'Mobile' in info and '390' in info and '120%' in info, info

        frame = modal.locator('.html-preview-frame--modal')
        frame.evaluate('el => { el.contentWindow.scrollTo(0, 120); }')
        scroll_y = frame.evaluate('el => el.contentWindow.scrollY')
        assert scroll_y >= 0

        browser.close()
    print('browser viewer regression verification ok')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
