#!/usr/bin/env python3
"""Regression checks for documentation examples and edge-case fixtures."""
from __future__ import annotations

import re
import sys
from pathlib import Path
from playwright.sync_api import expect, sync_playwright


def main() -> int:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.tmp/docs-renderer-preview-site/renderer-edge-cases.html')
    target = target.resolve()
    if not target.exists():
        raise SystemExit(f'edge-case HTML not found: {target}')

    html = target.read_text(encoding='utf-8')
    assert 'Renderer Edge Cases and Safety Examples' in html
    assert 'plain-html-should-not-render' in html, 'plain HTML source should remain visible as escaped code'
    assert 'html-preview-frame' in html
    assert 'script-src' in html and 'none' in html
    assert 'Broken chart' in html, 'invalid chart fixture should be present as source'

    main_html = re.split(r'<main\b[^>]*id="main-content"[^>]*>', html, maxsplit=1)[1].split('</main>', 1)[0]
    assert '<div id="plain-html-should-not-render"' not in main_html, 'plain html code fence must not render as raw DOM'
    assert '<script>window.__TRACEVANE_PLAIN_HTML_SCRIPT' not in main_html, 'plain html script must stay escaped code'

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1360, "height": 900})
        page.goto(target.as_uri())
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(2000)

        assert page.locator('main #plain-html-should-not-render').count() == 0
        assert page.evaluate('() => window.__TRACEVANE_PLAIN_HTML_EXECUTED || null') is None
        assert page.evaluate('() => window.__TRACEVANE_PLAIN_HTML_SCRIPT || null') is None
        expect(page.locator('.code-block-wrapper code').filter(has_text='plain-html-should-not-render').first).to_be_visible()

        frames = page.locator('.html-preview-frame')
        assert frames.count() >= 2, 'edge fixture should contain multiple HTML preview examples'
        script_frame = frames.nth(1)
        expect(script_frame).to_be_visible()
        assert script_frame.evaluate("frame => frame.contentDocument.querySelector('#dynamic-script-probe') !== null")
        assert script_frame.evaluate("frame => frame.contentDocument.querySelector('#script-status')?.textContent.includes('script blocked')")
        assert script_frame.evaluate('frame => frame.contentWindow.__TRACEVANE_DYNAMIC_SCRIPT_RAN || null') is None
        assert page.evaluate('() => window.__TRACEVANE_DYNAMIC_SCRIPT_RAN || null') is None

        # Extra Mermaid examples should render as SVG rather than staying only as source text.
        assert page.locator('.diagram-wrap svg').count() >= 3
        mindmap = page.locator('.mindmap-wrap').first
        mindmap.scroll_into_view_if_needed()
        expect(mindmap.locator('.mindmap-svg')).to_be_visible()
        assert mindmap.locator('.mindmap-node').count() >= 5

        # Invalid chart JSON should degrade to a visible parser error, not break later blocks.
        expect(page.locator('.chart-error')).to_be_visible()
        expect(page.locator('.table-wrap').first).to_be_visible()

        # Multi-doc search can discover the new edge fixture without query-string propagation.
        search = page.locator('#doc-search-input')
        search.fill('script blocked')
        page.wait_for_timeout(350)
        result = page.locator('.doc-search-result').first
        expect(result).to_be_visible()
        href = result.get_attribute('href') or ''
        assert '?q=' not in href, href

        browser.close()
    print('examples regression verification ok')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
