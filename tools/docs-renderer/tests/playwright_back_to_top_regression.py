#!/usr/bin/env python3
"""Regression checks for the floating back-to-top affordance."""
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
        page.wait_for_timeout(1600)

        assert page.locator('.section-navigator').count() == 0, 'section navigator should not be created when TOC already exists'
        fab = page.locator('.back-to-top-fab')
        expect(fab).to_be_attached()
        assert 'is-visible' not in (fab.get_attribute('class') or '')

        page.evaluate('window.scrollTo(0, document.body.scrollHeight * 0.55)')
        page.wait_for_timeout(300)
        assert 'is-visible' in (fab.get_attribute('class') or '')
        box = fab.bounding_box()
        assert box and box['x'] + box['width'] <= 1361 and box['y'] + box['height'] <= 901, box

        fab.click()
        page.wait_for_function('() => window.scrollY < 80', timeout=2500)
        assert page.evaluate('window.scrollY') < 80

        browser.close()
    print('back-to-top regression verification ok')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
