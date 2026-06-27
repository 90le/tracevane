#!/usr/bin/env python3
"""Regression checks for code block interactions."""
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
        page.evaluate("localStorage.removeItem('tracevane-docs-code-wrap')")
        page.reload()
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(1200)

        code = page.locator('.code-block-wrapper').first
        expect(code).to_be_visible()
        expect(code.locator('button[data-copy-format="all"]')).to_be_visible()
        expect(code.locator('button[data-copy-format="selection"]')).to_be_visible()
        wrap = code.locator('button[data-wrap-toggle="true"]')
        expect(wrap).to_have_attribute('aria-pressed', 'false')
        assert code.locator('.code-line').first.evaluate('el => getComputedStyle(el).whiteSpace') == 'pre'

        # No selection should produce an error state, not a false success.
        code.locator('button[data-copy-format="selection"]').click()
        expect(code.locator('button[data-copy-format="selection"]')).to_have_attribute('data-copy-state', 'error')

        # Select text inside the code block and copy only the selection.
        page.evaluate("""
          () => {
            const line = document.querySelector('.code-block-wrapper .code-line');
            const range = document.createRange();
            range.selectNodeContents(line);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
          }
        """)
        code.locator('button[data-copy-format="selection"]').click()
        expect(code.locator('button[data-copy-format="selection"]')).to_have_attribute('data-copy-state', 'copied')

        wrap.click()
        expect(wrap).to_have_attribute('aria-pressed', 'true')
        expect(wrap).to_contain_text('取消换行')
        assert code.locator('.code-line').first.evaluate('el => getComputedStyle(el).whiteSpace') == 'pre-wrap'
        assert page.evaluate("localStorage.getItem('tracevane-docs-code-wrap')") == 'true'

        page.reload()
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(1200)
        code = page.locator('.code-block-wrapper').first
        wrap = code.locator('button[data-wrap-toggle="true"]')
        expect(wrap).to_have_attribute('aria-pressed', 'true')
        assert code.locator('.code-line').first.evaluate('el => getComputedStyle(el).whiteSpace') == 'pre-wrap'

        browser.close()
    print('code regression verification ok')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
