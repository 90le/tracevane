#!/usr/bin/env python3
"""Regression checks for the rich rendering gallery fixture."""
from __future__ import annotations

import sys
from pathlib import Path
from playwright.sync_api import expect, sync_playwright


def main() -> int:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.tmp/docs-renderer-preview-site/rich-rendering-gallery.html')
    target = target.resolve()
    if not target.exists():
        raise SystemExit(f'gallery HTML not found: {target}')

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1360, "height": 900})
        page.goto(target.as_uri())
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(2500)

        assert page.locator('.diagram-wrap').count() >= 8
        assert page.locator('.diagram-wrap svg').count() >= 8
        assert page.locator('.html-preview-frame').count() >= 6
        assert page.locator('.code-block-wrapper').filter(has_text='FROM python:3.12-slim').count() == 1
        assert page.locator('.code-block-wrapper').filter(has_text='[docs.renderer]').count() == 1
        assert page.locator('.code-block-wrapper').filter(has_text='渲染示例本身也会进入搜索索引').count() == 1
        assert page.locator('.code-block-wrapper').filter(has_text='container-type: inline-size').count() >= 1
        assert page.locator('main').filter(has_text='ER Diagram：文档对象关系').count() == 1
        assert page.locator('main').filter(has_text='HTML Preview：响应式时间线').count() == 1

        blocked = page.evaluate("""
        () => Array.from(document.querySelectorAll('.html-preview-frame')).some((frame) => {
          const doc = frame.contentDocument;
          return doc && doc.querySelector('#friendly-script-status')?.textContent.includes('script blocked by design');
        })
        """)
        assert blocked, 'friendly script-blocked preview should remain inert'

        search = page.locator('#doc-search-input')
        search.fill('Preview')
        page.wait_for_timeout(500)
        next_button = page.locator('[data-doc-search-next]')
        prev_button = page.locator('[data-doc-search-prev]')
        expect(next_button).to_be_enabled()
        expect(prev_button).to_be_enabled()
        first_status = page.locator('[data-doc-search-status]').inner_text()
        next_button.click()
        page.wait_for_timeout(180)
        second_status = page.locator('[data-doc-search-status]').inner_text()
        assert first_status != second_status, (first_status, second_status)
        hrefs = page.locator('.doc-search-result').evaluate_all('(els) => els.map((a) => a.getAttribute("href") || "")')
        assert hrefs and all('?q=' not in href for href in hrefs), hrefs

        browser.close()
    print('gallery examples regression verification ok')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
