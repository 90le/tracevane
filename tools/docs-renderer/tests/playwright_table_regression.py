#!/usr/bin/env python3
"""Regression checks for table interactions and horizontal-scroll affordances."""
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
        page = browser.new_page(viewport={"width": 860, "height": 2600})
        page.goto(target.as_uri())
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(1500)

        wrap = page.locator('.table-wrap').first
        expect(wrap).to_be_visible()
        assert wrap.evaluate('el => el.scrollWidth > el.clientWidth'), 'fixture table should overflow horizontally'
        assert 'table-can-scroll' in (wrap.get_attribute('class') or '')
        assert wrap.get_attribute('data-table-scroll') == 'horizontal'
        assert wrap.evaluate("el => getComputedStyle(el, '::after').content") != 'none'

        scroll_y = wrap.evaluate('el => el.getBoundingClientRect().top + window.scrollY - 220')
        page.evaluate('(y) => window.scrollTo(0, y)', scroll_y)
        page.wait_for_timeout(300)
        wrap.dispatch_event('mouseenter')
        page.wait_for_timeout(260)
        toolbar = page.locator('body > .table-toolbar.rich-floating-toolbar.table-floating-toolbar').first
        expect(toolbar).to_be_visible()
        assert toolbar.evaluate('''(tb) => {
            const a = document.querySelector('.table-wrap').getBoundingClientRect();
            const b = tb.getBoundingClientRect();
            return b.right <= a.left || b.left >= a.right || b.bottom <= a.top || b.top >= a.bottom;
        }'''), 'floating table toolbar must sit outside the rendered table box'
        assert toolbar.evaluate("tb => tb.parentElement === document.body"), 'floating table toolbar must be body-level and non-flow'
        expect(toolbar.locator('button[data-copy-format="markdown"]')).to_be_visible()
        toolbar.locator('button[data-copy-format="markdown"]').evaluate('button => button.click()')
        expect(toolbar.locator('button[data-copy-format="markdown"]')).to_have_attribute('data-copy-state', 'copied')
        toolbar.locator('button[data-copy-format="csv"]').evaluate('button => button.click()')
        expect(toolbar.locator('button[data-copy-format="csv"]')).to_have_attribute('data-copy-state', 'copied')

        toolbar.locator('button', has_text='预览').evaluate('button => button.click()')
        modal = page.locator('.rich-preview-modal[aria-hidden="false"]')
        expect(modal).to_be_visible()
        viewer = modal.locator('.modal-table-viewer')
        expect(viewer).to_be_visible()
        tools = modal.locator('.modal-table-tools')
        viewer.hover()
        page.wait_for_timeout(180)
        expect(tools).to_be_visible()
        expect(tools.locator('.modal-table-meta')).to_contain_text('行')
        expect(tools.locator('.modal-table-meta')).to_contain_text('列')
        tools.locator('button[data-copy-format="markdown"]').click()
        expect(tools.locator('button[data-copy-format="markdown"]')).to_have_attribute('data-copy-state', 'copied')

        browser.close()
    print('table regression verification ok')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
