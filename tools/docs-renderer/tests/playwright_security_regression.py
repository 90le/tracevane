#!/usr/bin/env python3
"""Security regression checks for sandboxed HTML preview and inert raw HTML."""
from __future__ import annotations

import re
import sys
from pathlib import Path
from playwright.sync_api import expect, sync_playwright


def main() -> int:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.tmp/docs-renderer-preview-site/unsafe-html.html')
    target = target.resolve()
    if not target.exists():
        raise SystemExit(f'preview HTML not found: {target}')

    html_text = target.read_text(encoding='utf-8')
    assert 'Content-Security-Policy' in html_text
    assert "script-src" in html_text and "object-src" in html_text and "base-uri" in html_text
    assert 'allow-scripts' not in html_text, 'HTML preview iframe must not allow script execution'
    assert 'sandbox="allow-same-origin"' in html_text

    main = re.split(r'<main\b[^>]*id="main-content"[^>]*>', html_text, maxsplit=1)[1].split('</main>', 1)[0]
    # Literal escaped source snippets are acceptable evidence in documentation;
    # active raw tags/attributes outside trusted preview iframes are not.
    forbidden_active_markup = [
        '<script>window.__TRACEVANE_XSS',
        '<svg onload=',
        '<iframe srcdoc=',
        '<form action="javascript:',
        '<a href="data:text/html',
        '<span style="position:fixed',
    ]
    leaked = [item for item in forbidden_active_markup if item in main]
    assert not leaked, f'active unsafe markup survived in main content: {leaked}'

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1180, "height": 900})
        page.goto(target.as_uri())
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(1200)

        assert page.evaluate("() => window.__TRACEVANE_XSS || null") is None
        assert page.locator('main script').count() == 0
        assert page.locator('main [onerror], main [onload], main [onclick]').count() == 0
        assert page.locator('main iframe:not(.html-preview-frame)').count() == 0
        assert page.locator('main [srcdoc]:not(.html-preview-frame)').count() == 0
        assert page.locator('main [style*="position:fixed"], main [style*="position: fixed"]').count() == 0

        frames = page.locator('.html-preview-frame')
        expect(frames.first).to_be_visible()
        assert frames.first.evaluate("frame => frame.getAttribute('sandbox')") == 'allow-same-origin'
        assert frames.first.evaluate("frame => frame.contentDocument.querySelector('meta[http-equiv=\"Content-Security-Policy\"]')?.content.includes(\"script-src 'none'\")")
        assert frames.last.evaluate("frame => frame.contentDocument.querySelector('#preview-security-probe') !== null")
        assert frames.last.evaluate("frame => frame.contentWindow.__TRACEVANE_IFRAME_SCRIPT || null") is None
        assert page.evaluate("() => window.__TRACEVANE_XSS || null") is None

        browser.close()
    print('security regression verification ok')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
