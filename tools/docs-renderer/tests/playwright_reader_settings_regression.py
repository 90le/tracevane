#!/usr/bin/env python3
"""Regression checks for reader typography controls."""
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
        page.wait_for_timeout(1000)

        toggle = page.locator('[data-reader-settings-toggle]')
        expect(toggle).to_be_visible()
        assert toggle.get_attribute('aria-expanded') == 'false'
        toggle.click()
        panel = page.locator('[data-reader-settings-panel]')
        expect(panel).to_be_visible()
        assert toggle.get_attribute('aria-expanded') == 'true'

        size_before = page.evaluate("() => getComputedStyle(document.body).fontSize")
        page.locator('[data-reader-option="size"][data-reader-value="large"]').click()
        assert page.evaluate("() => document.documentElement.dataset.readerSize") == 'large'
        size_after = page.evaluate("() => getComputedStyle(document.body).fontSize")
        assert float(size_after.replace('px', '')) > float(size_before.replace('px', ''))
        expect(page.locator('[data-reader-option="size"][data-reader-value="large"]')).to_have_attribute('aria-pressed', 'true')

        page.locator('[data-reader-option="width"][data-reader-value="narrow"]').click()
        assert page.evaluate("() => document.documentElement.dataset.readerWidth") == 'narrow'
        narrow_measure = page.evaluate("() => getComputedStyle(document.documentElement).getPropertyValue('--doc-reader-measure').trim()")
        assert narrow_measure == '70ch'

        page.locator('[data-reader-option="leading"][data-reader-value="loose"]').click()
        assert page.evaluate("() => document.documentElement.dataset.readerLeading") == 'loose'
        line_height = page.evaluate("() => getComputedStyle(document.body).lineHeight")
        assert float(line_height.replace('px', '')) > 26

        page.locator('[data-reader-option="density"][data-reader-value="dense"]').click()
        assert page.evaluate("() => document.documentElement.dataset.readerDensity") == 'dense'
        assert page.evaluate("() => JSON.parse(localStorage.getItem('tracevane-docs-reader-settings')).density") == 'dense'

        cover = page.locator('.cover')
        toc = page.locator('.toc-panel')
        document_padding_before = page.evaluate("() => getComputedStyle(document.querySelector('.document')).paddingLeft")
        page.locator('[data-reader-option="focus"][data-reader-value="on"]').click()
        assert page.evaluate("() => document.documentElement.dataset.readerFocus") == 'on'
        expect(page.locator('[data-reader-option="focus"][data-reader-value="on"]')).to_have_attribute('aria-pressed', 'true')
        expect(cover).to_be_hidden()
        expect(toc).to_be_hidden()
        document_padding_after = page.evaluate("() => getComputedStyle(document.querySelector('.document')).paddingLeft")
        assert float(document_padding_after.replace('px', '')) < float(document_padding_before.replace('px', ''))
        assert page.evaluate("() => JSON.parse(localStorage.getItem('tracevane-docs-reader-settings')).focus") == 'on'

        page.locator('[data-reader-settings-reset]').click()
        assert page.evaluate("() => document.documentElement.dataset.readerSize") == 'normal'
        assert page.evaluate("() => document.documentElement.dataset.readerFocus") == 'off'
        expect(cover).to_be_visible()
        assert page.evaluate("() => localStorage.getItem('tracevane-docs-reader-settings')") is None

        page.keyboard.press('Escape')
        page.wait_for_timeout(120)
        expect(panel).to_be_hidden()
        assert toggle.get_attribute('aria-expanded') == 'false'

        browser.close()
    print('reader settings regression verification ok')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
