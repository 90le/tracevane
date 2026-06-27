#!/usr/bin/env python3
"""Regression checks for Mermaid and Chart SVG/PNG export controls."""
from __future__ import annotations

import sys
from pathlib import Path
from playwright.sync_api import expect, sync_playwright


def expect_download(page, button, suffix: str) -> str:
    with page.expect_download() as download_info:
        button.click()
    download = download_info.value
    name = download.suggested_filename
    assert name.endswith(suffix), name
    return name


def reveal_toolbar(page, block_selector: str, toolbar_selector: str):
    block = page.locator(block_selector).first
    block.scroll_into_view_if_needed()
    page.wait_for_timeout(120)
    block.hover()
    page.wait_for_timeout(250)
    toolbar = page.locator(toolbar_selector).first
    if toolbar.evaluate('el => el.hidden'):
        block.evaluate('el => el.focus()')
        page.wait_for_timeout(250)
    expect(toolbar).to_be_visible()
    return toolbar


def main() -> int:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.tmp/docs-renderer-preview-site/rich-rendering-gallery.html')
    target = target.resolve()
    if not target.exists():
        raise SystemExit(f'preview HTML not found: {target}')

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1360, "height": 900}, accept_downloads=True)
        page.goto(target.as_uri())
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(2200)

        mermaid_toolbar = reveal_toolbar(page, '.diagram-wrap', 'body > .diagram-toolbar.rich-floating-toolbar')
        expect_download(page, mermaid_toolbar.locator('button[data-export-format="svg"]'), '.svg')
        expect(mermaid_toolbar.locator('button[data-export-format="svg"]')).to_have_attribute('data-copy-state', 'copied')
        expect_download(page, mermaid_toolbar.locator('button[data-export-format="png"]'), '.png')
        expect(mermaid_toolbar.locator('button[data-export-format="png"]')).to_have_attribute('data-copy-state', 'copied')

        chart_toolbar = reveal_toolbar(page, '.chart-wrap', 'body > .chart-toolbar.rich-floating-toolbar')
        expect_download(page, chart_toolbar.locator('button[data-export-format="svg"]'), '.svg')
        expect(chart_toolbar.locator('button[data-export-format="svg"]')).to_have_attribute('data-copy-state', 'copied')
        expect_download(page, chart_toolbar.locator('button[data-export-format="png"]'), '.png')
        expect(chart_toolbar.locator('button[data-export-format="png"]')).to_have_attribute('data-copy-state', 'copied')

        mindmap_toolbar = reveal_toolbar(page, '.mindmap-wrap', 'body > .mindmap-toolbar.rich-floating-toolbar')
        expect_download(page, mindmap_toolbar.locator('button[data-export-format="svg"]'), '.svg')
        expect(mindmap_toolbar.locator('button[data-export-format="svg"]')).to_have_attribute('data-copy-state', 'copied')
        expect_download(page, mindmap_toolbar.locator('button[data-export-format="png"]'), '.png')
        expect(mindmap_toolbar.locator('button[data-export-format="png"]')).to_have_attribute('data-copy-state', 'copied')

        browser.close()
    print('export regression verification ok')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
