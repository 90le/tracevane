#!/usr/bin/env python3
"""Regression checks for image lightbox affordance and modal caption."""
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
        page.wait_for_timeout(1600)

        frame = page.locator('[data-lightbox-frame]').first
        expect(frame).to_be_visible()
        badge = frame.locator('.doc-lightbox-frame__badge')
        expect(badge).to_have_text('预览')
        image = frame.locator('img.doc-lightbox-image')
        expect(image).to_have_attribute('role', 'button')
        aria = image.get_attribute('aria-label') or ''
        assert '打开图片预览' in aria and 'Gradient sample' in aria, aria

        image.press('Enter')
        modal = page.locator('.rich-preview-modal[aria-hidden="false"]')
        expect(modal).to_be_visible()
        expect(modal.locator('.modal-image-stage img')).to_have_attribute('alt', 'Gradient sample')
        expect(modal.locator('.modal-image-caption')).to_have_text('Gradient sample')
        expect(modal.locator('[data-modal-copy]')).to_contain_text('复制链接')
        modal.locator('[data-modal-copy]').click()
        expect(modal.locator('[data-modal-copy]')).to_have_attribute('data-copy-state', 'copied')

        browser.close()
    print('media lightbox regression verification ok')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
