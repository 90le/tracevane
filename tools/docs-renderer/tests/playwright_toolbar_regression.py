#!/usr/bin/env python3
"""Regression checks for exterior compact rich-block toolbars."""
from __future__ import annotations

import sys
from pathlib import Path
from playwright.sync_api import expect, sync_playwright


def assert_outside_content(page, toolbar_selector: str, anchor_selector: str) -> None:
    toolbar = page.locator(toolbar_selector).first
    anchor = page.locator(anchor_selector).first
    expect(toolbar).to_be_visible()
    assert toolbar.evaluate('tb => tb.parentElement === document.body'), 'toolbar must be body-level'
    data = toolbar.evaluate(
        '''(tb) => {
            const main = document.querySelector('main').getBoundingClientRect();
            const anchor = document.querySelector(tb.dataset.testAnchor).getBoundingClientRect();
            const rect = tb.getBoundingClientRect();
            const cs = getComputedStyle(tb);
            return {
              parentTag: tb.parentElement.tagName,
              placement: tb.dataset.placement,
              height: rect.height,
              insideMainX: rect.left < main.right && rect.right > main.left,
              overlapsAnchor: rect.left < anchor.right && rect.right > anchor.left && rect.top < anchor.bottom && rect.bottom > anchor.top,
              overlapsToc: (() => {
                const toc = document.querySelector('.toc-panel');
                if (!toc) return false;
                const t = toc.getBoundingClientRect();
                return rect.left < t.right && rect.right > t.left && rect.top < t.bottom && rect.bottom > t.top;
              })(),
              position: cs.position,
              radius: cs.borderRadius,
              fontSize: cs.fontSize,
              display: cs.display,
              rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width },
              anchor: { left: anchor.left, right: anchor.right, top: anchor.top, bottom: anchor.bottom, width: anchor.width }
            };
        }'''
    )
    assert data['position'] == 'fixed', data
    assert data['display'] in ('flex', 'inline-flex'), data
    assert data['placement'].startswith('outside-content') or data['placement'].startswith('outside-block') or data['placement'] == 'viewport-rail', data
    assert not data['overlapsToc'], f'toolbar must not cover navigation/sidebar: {data}'
    if data['placement'] in ('outside-content-left', 'outside-content-right'):
        assert not data['insideMainX'], f'toolbar must stay outside article column: {data}'
    if data['placement'] != 'viewport-rail':
        assert not data['overlapsAnchor'], f'{toolbar_selector} must not cover {anchor_selector}: {data}'
    assert data['height'] <= 28, f'toolbar should be compact, got {data}'
    assert '999' in data['radius'] or float(data['radius'].replace('px', '').split()[0]) >= 10, data


def main() -> int:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.tmp/docs-renderer-preview-site/rich-rendering-gallery.html')
    target = target.resolve()
    if not target.exists():
        raise SystemExit(f'preview HTML not found: {target}')

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto(target.as_uri())
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(1500)

        cases = [
            ('.diagram-wrap', 'body > .diagram-toolbar.rich-floating-toolbar'),
            ('.html-preview-wrap', 'body > .html-preview-toolbar.rich-floating-toolbar'),
            ('.chart-wrap', 'body > .chart-toolbar.rich-floating-toolbar'),
            ('.mindmap-wrap', 'body > .mindmap-toolbar.rich-floating-toolbar'),
            ('.table-wrap', 'body > .table-toolbar.rich-floating-toolbar'),
        ]
        for anchor_selector, toolbar_selector in cases:
            anchor = page.locator(anchor_selector).first
            expect(anchor).to_be_visible()
            page.locator(toolbar_selector).first.evaluate("(tb, sel) => tb.dataset.testAnchor = sel", anchor_selector)
            anchor.hover()
            page.wait_for_timeout(220)
            assert_outside_content(page, toolbar_selector, anchor_selector)
            buttons = page.locator(toolbar_selector).first.locator('button')
            assert buttons.count() >= 2, f'{toolbar_selector} should expose actions'
            first_button = buttons.first
            assert first_button.evaluate('btn => getComputedStyle(btn).height') in ('20px', '21px', '22px'), 'buttons should be micro sized'

        browser.close()
    print('toolbar regression verification ok')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
