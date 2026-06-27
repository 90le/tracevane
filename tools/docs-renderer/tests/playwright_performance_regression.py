#!/usr/bin/env python3
"""Runtime performance regression checks for listener coalescing and lazy sizing."""
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
        page = browser.new_page(viewport={"width": 1180, "height": 900})
        page.add_init_script(r"""
          (() => {
            const counts = { windowScroll: 0, windowResize: 0, intervals: 0 };
            const originalAdd = EventTarget.prototype.addEventListener;
            EventTarget.prototype.addEventListener = function(type, listener, options) {
              if (this === window && type === 'scroll') counts.windowScroll += 1;
              if (this === window && type === 'resize') counts.windowResize += 1;
              return originalAdd.call(this, type, listener, options);
            };
            const originalInterval = window.setInterval;
            window.setInterval = function(...args) {
              counts.intervals += 1;
              return originalInterval.apply(this, args);
            };
            window.__TRACEVANE_PERF_COUNTS = counts;
          })();
        """)
        page.goto(target.as_uri())
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(1800)

        counts = page.evaluate("() => window.__TRACEVANE_PERF_COUNTS")
        assert counts['windowScroll'] <= 1, counts
        assert counts['windowResize'] <= 1, counts
        assert counts['intervals'] == 0, counts

        # HTML preview should still autosize without global scroll/resize spam.
        preview = page.locator('.html-preview-frame').first
        preview.scroll_into_view_if_needed()
        expect(preview).to_be_visible()
        page.wait_for_function("() => Number(document.querySelector('.html-preview-frame')?.dataset.contentHeight || 0) >= 80")
        height = preview.evaluate("frame => Number(frame.dataset.contentHeight || 0)")
        assert height >= 80, height

        # Body-level toolbar positioning remains functional after coalescing.
        chart = page.locator('.chart-wrap').first
        chart.hover()
        page.wait_for_timeout(250)
        toolbar = page.locator('body > .chart-toolbar.rich-floating-toolbar').first
        expect(toolbar).to_be_visible()
        before = toolbar.evaluate("el => ({ left: el.style.left, top: el.style.top })")
        page.evaluate("() => window.scrollBy(0, 420)")
        page.wait_for_timeout(250)
        after = toolbar.evaluate("el => ({ left: el.style.left, top: el.style.top })")
        assert before != after, (before, after)

        browser.close()
    print('performance regression verification ok')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
