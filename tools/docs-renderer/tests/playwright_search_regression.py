#!/usr/bin/env python3
"""Playwright regression checks for Tracevane docs renderer search.

Usage:
  python3 tools/docs-renderer/tests/playwright_search_regression.py \
    .tmp/docs-renderer-preview-site/rich-rendering-gallery.html
"""
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

        search = page.locator('#doc-search-input')
        expect(search).to_be_visible()

        # Search controls must stay inside the navigation rail without overflow.
        form_box = page.locator('.doc-search').bounding_box()
        toc_box = page.locator('.toc-panel').bounding_box()
        assert form_box and toc_box
        assert form_box['x'] >= toc_box['x'] - 1
        assert form_box['x'] + form_box['width'] <= toc_box['x'] + toc_box['width'] + 1, (form_box, toc_box)
        for selector in ['[data-doc-search-prev]', '[data-doc-search-next]', '[data-doc-search-status]']:
            box = page.locator(selector).bounding_box()
            assert box and box['x'] >= form_box['x'] - 1 and box['x'] + box['width'] <= form_box['x'] + form_box['width'] + 1, (selector, box, form_box)
        home = page.locator('.docs-nav-home').first
        expect(home).to_be_visible()
        assert (home.get_attribute('href') or '').endswith('index.html')

        # Rendered iframe text should be searchable and highlighted inside srcdoc.
        search.fill('390px viewport preview')
        page.wait_for_timeout(350)
        status = page.locator('[data-doc-search-status]').inner_text()
        assert '当前页' in status and '0 处' not in status, status
        iframe_hits = page.locator('.html-preview-frame').first.evaluate("""
          frame => {
            const doc = frame.contentDocument;
            return doc ? doc.querySelectorAll('mark.doc-search-hit').length : 0;
          }
        """)
        assert iframe_hits >= 1, iframe_hits

        # Code block text should still be searchable after syntax highlighting.
        search.fill('tracevane-docs')
        page.wait_for_timeout(250)
        assert page.locator('main mark.doc-search-hit').count() >= 1

        # Table text should be searchable.
        search.fill('Browser viewer')
        page.wait_for_timeout(250)
        assert page.locator('main mark.doc-search-hit').count() >= 1

        # Mindmap rendered text should be searchable.
        search.fill('Playwright suite')
        page.wait_for_timeout(250)
        assert page.locator('.mindmap-wrap mark.doc-search-hit, main mark.doc-search-hit').count() >= 1

        # Multi-document search links must not use query-string propagation.
        search.fill('sandbox')
        page.wait_for_timeout(350)
        result = page.locator('.doc-search-result').first
        expect(result).to_be_visible()
        href = result.get_attribute('href') or ''
        assert '?q=' not in href, href
        assert result.get_attribute('data-search-carry') == 'sandbox'

        browser.close()
    print('search regression verification ok')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
