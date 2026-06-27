#!/usr/bin/env python3
"""Regression checks for responsive top quick actions."""
from __future__ import annotations

import sys
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

BUTTONS = [
    '[data-theme-toggle]',
    '[data-reader-settings-toggle]',
    '[data-keyboard-help-toggle]',
]


def main() -> int:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.tmp/docs-renderer-preview-site/rich-rendering-gallery.html')
    target = target.resolve()
    if not target.exists():
        raise SystemExit(f'preview HTML not found: {target}')

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 390, "height": 844})
        page.goto(target.as_uri())
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(1200)

        rail = page.locator('.doc-quick-actions')
        expect(rail).to_be_visible()
        rail_box = rail.bounding_box()
        assert rail_box, 'quick actions rail should have layout box'
        assert rail_box['x'] >= -1
        assert rail_box['x'] + rail_box['width'] <= 391
        assert rail.evaluate('el => el.scrollWidth <= el.clientWidth + 2'), 'quick actions should not require horizontal scroll at 390px'

        for selector in BUTTONS:
            button = page.locator(selector)
            expect(button).to_be_visible()
            box = button.bounding_box()
            assert box and box['width'] <= 42 and box['height'] <= 42, (selector, box)
            classes = button.get_attribute('class') or ''
            assert 'doc-action-button' in classes.split(), (selector, classes)
            assert box['x'] >= -1 and box['x'] + box['width'] <= 391, (selector, box)

        page.locator('[data-reader-settings-toggle]').click()
        expect(page.locator('[data-reader-settings-panel]')).to_be_visible()
        page.keyboard.press('Escape')
        page.locator('[data-keyboard-help-toggle]').click()
        expect(page.locator('[data-keyboard-help-panel]')).to_be_visible()
        assert page.locator('[data-copy-doc-link]').count() == 0
        assert page.locator('[data-print-doc]').count() == 0

        browser.close()
    print('quick actions regression verification ok')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
