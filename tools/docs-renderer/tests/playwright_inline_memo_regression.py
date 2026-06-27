#!/usr/bin/env python3
"""Regression checks for SiYuan-inspired inline memo popovers."""
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

        memo = page.locator('.inline-memo').first
        expect(memo).to_be_visible()
        assert 'html-preview' in (memo.get_attribute('data-inline-memo-content') or '')
        memo.hover()
        popover = page.locator('.inline-memo-popover')
        expect(popover).to_be_visible()
        expect(popover).to_contain_text('Memo')
        expect(popover).to_contain_text('html-preview')
        assert popover.evaluate('el => el.parentElement === document.body'), 'memo popover must be body-level'
        assert popover.evaluate('el => getComputedStyle(el).position') == 'fixed'

        memo.focus()
        page.wait_for_timeout(120)
        expect(popover).to_be_visible()

        page.emulate_media(media='print')
        assert memo.evaluate("el => getComputedStyle(el, '::after').content").strip('"') != 'none'
        page.emulate_media(media='screen')

        browser.close()
    print('inline memo regression verification ok')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
