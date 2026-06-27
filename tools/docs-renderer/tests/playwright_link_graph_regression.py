#!/usr/bin/env python3
"""Verify static document link graph/backlinks sidebar."""
from __future__ import annotations

import sys
from pathlib import Path
from playwright.sync_api import expect, sync_playwright


def main() -> int:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.tmp/docs-renderer-preview-site/offline-rendering-test.html')
    url = target.resolve().as_uri()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.goto(url)

        section = page.locator('.link-graph-section')
        expect(section).to_be_visible()
        expect(section.locator('summary')).to_contain_text('引用关系')
        expect(section.locator('.link-graph-count')).to_contain_text('1 入')
        expect(section.locator('.link-graph-group--incoming')).to_contain_text('Renderer Capabilities Fixture')
        incoming = section.locator('.link-graph-group--incoming a').first
        href = incoming.get_attribute('href') or ''
        assert href.endswith('renderer-capabilities.html'), href

        incoming.click()
        assert page.url.endswith('/renderer-capabilities.html'), page.url
        section = page.locator('.link-graph-section')
        expect(section).to_be_visible()
        expect(section.locator('.link-graph-count')).to_contain_text('1 入 / 1 出')
        expect(section.locator('.link-graph-group--incoming')).to_contain_text('Tracevane 离线渲染测试')
        expect(section.locator('.link-graph-group--outgoing')).to_contain_text('Tracevane 离线渲染测试')

        # Link graph data is static JSON, not query-string propagation or remote fetch state.
        graph = page.locator('#tracevane-link-graph')
        expect(graph).to_have_attribute('type', 'application/json')
        assert '?q=' not in page.url
        browser.close()
    print('link graph regression ok')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
