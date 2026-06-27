#!/usr/bin/env python3
"""Accessibility regression checks for keyboard, ARIA status, and modal focus."""
from __future__ import annotations

import sys
from pathlib import Path
from playwright.sync_api import expect, sync_playwright


def reveal_toolbar(page, block_selector: str, toolbar_selector: str):
    block = page.locator(block_selector).first
    block.scroll_into_view_if_needed()
    page.wait_for_timeout(120)
    block.hover()
    page.wait_for_timeout(250)
    toolbar = page.locator(toolbar_selector).first
    if toolbar.evaluate('el => el.hidden'):
        block.evaluate('el => el.focus()')
        page.wait_for_timeout(250)
    expect(toolbar).to_be_visible()
    return toolbar


def main() -> int:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.tmp/docs-renderer-preview-site/rich-rendering-gallery.html')
    target = target.resolve()
    if not target.exists():
        raise SystemExit(f'preview HTML not found: {target}')

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1180, "height": 900}, reduced_motion='reduce')
        page.goto(target.as_uri())
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(1500)

        skip = page.locator('.skip-link')
        expect(skip).to_be_visible()
        skip.focus()
        assert page.evaluate("() => document.activeElement.classList.contains('skip-link')")
        page.keyboard.press('Enter')
        page.wait_for_timeout(120)
        assert page.evaluate("() => document.activeElement.id") == 'main-content'

        search = page.locator('#doc-search-input')
        search.focus()
        assert page.evaluate("() => document.activeElement.id") == 'doc-search-input'
        status = page.locator('[data-doc-search-status]')
        assert status.get_attribute('aria-live') == 'polite'
        assert status.get_attribute('aria-atomic') == 'true'
        assert 'doc-search-status' in (search.get_attribute('aria-describedby') or '')
        assert search.get_attribute('aria-controls') == 'doc-search-results'
        search.fill('Browser viewer')
        page.wait_for_timeout(350)
        assert page.locator('#doc-search-results').get_attribute('role') == 'list'
        assert page.locator('#doc-search-results').get_attribute('aria-busy') == 'false'
        expect(page.locator('.doc-search-result').first).to_have_attribute('role', 'listitem')

        page.keyboard.press('Escape')
        page.wait_for_timeout(120)
        toolbar = reveal_toolbar(page, '.chart-wrap', 'body > .chart-toolbar.rich-floating-toolbar')
        opener = toolbar.locator('button', has_text='预览')
        opener.focus()
        assert page.evaluate("() => document.activeElement.textContent.trim().includes('预览')")
        opener.click()
        modal = page.locator('.rich-preview-modal[aria-hidden="false"]')
        expect(modal).to_be_visible()
        assert modal.get_attribute('role') == 'dialog'
        assert modal.get_attribute('aria-modal') == 'true'
        assert (modal.get_attribute('aria-label') or '') not in ('', '沉浸预览')
        assert page.evaluate("() => document.activeElement.closest('.rich-preview-modal') !== null")

        for _ in range(10):
            page.keyboard.press('Tab')
            assert page.evaluate("() => document.activeElement.closest('.rich-preview-modal') !== null"), 'Tab escaped modal focus trap'
        page.keyboard.down('Shift')
        page.keyboard.press('Tab')
        page.keyboard.up('Shift')
        assert page.evaluate("() => document.activeElement.closest('.rich-preview-modal') !== null"), 'Shift+Tab escaped modal focus trap'

        page.keyboard.press('Escape')
        page.wait_for_timeout(180)
        assert page.locator('.rich-preview-modal').get_attribute('aria-hidden') == 'true'
        assert page.evaluate("() => document.activeElement && document.activeElement.textContent.trim().includes('预览')")

        browser.close()
    print('accessibility regression verification ok')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
