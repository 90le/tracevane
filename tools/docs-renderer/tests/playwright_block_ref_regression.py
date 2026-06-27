#!/usr/bin/env python3
"""Regression checks for SiYuan-inspired same-page block reference popovers."""
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

        link = page.locator('a.block-ref-link[href="#mindmap-思维导图渲染"]').first
        expect(link).to_be_visible()
        link.hover()
        popover = page.locator('.block-ref-popover')
        expect(popover).to_be_visible()
        expect(popover).to_contain_text('Mindmap 思维导图渲染')
        expect(popover).to_contain_text('Block reference')
        assert popover.evaluate('el => el.parentElement === document.body'), 'popover must be body-level and non-flow'
        assert popover.evaluate('el => getComputedStyle(el).position') == 'fixed'
        assert popover.evaluate('''el => {
          const a = document.querySelector('a.block-ref-link[href="#mindmap-思维导图渲染"]').getBoundingClientRect();
          const b = el.getBoundingClientRect();
          return !(b.left < a.right && b.right > a.left && b.top < a.bottom && b.bottom > a.top);
        }'''), 'popover should not cover the reference link itself'

        html_link = page.locator('a.block-ref-link[href="#html-preview长内容与响应式卡片"]').first
        expect(html_link).to_be_visible()
        html_link.hover()
        page.wait_for_timeout(180)
        expect(popover).to_be_visible()
        expect(popover).to_contain_text('HTML Preview：长内容与响应式卡片')
        expect(popover).to_contain_text('Mobile')
        assert '<section' not in popover.inner_text(), 'popover should expose rendered preview text, not source HTML'
        assert 'demo-grid' not in popover.inner_text(), 'popover should not leak hidden HTML/CSS source'

        # Focus should also show it for keyboard users.
        page.keyboard.press('Escape')
        link.focus()
        page.wait_for_timeout(160)
        expect(popover).to_be_visible()

        browser.close()
    print('block-ref regression verification ok')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
