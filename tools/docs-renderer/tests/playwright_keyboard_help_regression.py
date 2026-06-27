#!/usr/bin/env python3
"""Regression checks for keyboard shortcut help panel."""
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
        page.wait_for_timeout(1200)

        toggle = page.locator('[data-keyboard-help-toggle]')
        expect(toggle).to_be_visible()
        assert toggle.get_attribute('aria-expanded') == 'false'
        toggle.click()
        panel = page.locator('[data-keyboard-help-panel]')
        expect(panel).to_be_visible()
        assert toggle.get_attribute('aria-expanded') == 'true'
        assert panel.get_attribute('role') == 'dialog'
        expect(panel).to_contain_text('Ctrl / ⌘ + K')
        expect(panel).to_contain_text('Alt + ↓ / ↑')
        assert page.evaluate("() => document.activeElement.matches('[data-keyboard-help-close]')")

        page.keyboard.press('Escape')
        page.wait_for_timeout(120)
        expect(panel).to_be_hidden()
        assert toggle.get_attribute('aria-expanded') == 'false'

        page.keyboard.press('?')
        page.wait_for_timeout(120)
        expect(panel).to_be_visible()
        page.keyboard.press('?')
        page.wait_for_timeout(120)
        expect(panel).to_be_hidden()

        search = page.locator('#doc-search-input')
        search.focus()
        page.keyboard.press('?')
        page.wait_for_timeout(120)
        expect(panel).to_be_hidden()
        assert search.input_value() == '?'

        browser.close()
    print('keyboard help regression verification ok')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
