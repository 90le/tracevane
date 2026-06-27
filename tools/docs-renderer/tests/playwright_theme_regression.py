#!/usr/bin/env python3
"""Regression checks for dark/light rich-renderer theme propagation."""
from __future__ import annotations

import re
import sys
from pathlib import Path
from playwright.sync_api import expect, sync_playwright


def luminance(css_color: str) -> float:
    nums = [int(float(x)) for x in re.findall(r"\d+(?:\.\d+)?", css_color)[:3]]
    if len(nums) < 3:
        return 0.0
    r, g, b = [v / 255 for v in nums]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def main() -> int:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.tmp/docs-renderer-preview-site/rich-rendering-gallery.html')
    target = target.resolve()
    if not target.exists():
        raise SystemExit(f'preview HTML not found: {target}')

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1180, "height": 900}, color_scheme='light')
        page.add_init_script("localStorage.setItem('tracevane-docs-theme', 'light')")
        page.goto(target.as_uri())
        page.wait_for_load_state('networkidle')
        page.wait_for_selector('.diagram-wrap svg', timeout=10000)
        page.wait_for_timeout(700)

        expect(page.locator('[data-theme-toggle]')).to_contain_text('浅色')
        assert page.locator('html').get_attribute('data-theme') == 'light'
        light_chart = page.locator('.chart-svg .chart-title').first.evaluate("el => getComputedStyle(el).fill")
        assert luminance(light_chart) < 0.35, light_chart

        page.locator('[data-theme-toggle]').click()
        page.wait_for_function("document.documentElement.dataset.theme === 'dark'")
        page.wait_for_timeout(1000)
        assert page.locator('html').get_attribute('data-theme') == 'dark'
        assert page.locator('html').evaluate("el => getComputedStyle(el).colorScheme") == 'dark'

        chart_fill = page.locator('.chart-svg .chart-title').first.evaluate("el => getComputedStyle(el).fill")
        table_color = page.locator('.table-wrap th').first.evaluate("el => getComputedStyle(el).color")
        mermaid_fill = page.locator('.diagram-wrap svg text').first.evaluate("el => getComputedStyle(el).fill")
        iframe_color = page.locator('.html-preview-frame').first.evaluate("frame => getComputedStyle(frame.contentDocument.body).color")
        iframe_theme = page.locator('.html-preview-frame').first.evaluate("frame => frame.contentDocument.documentElement.dataset.theme")
        assert iframe_theme == 'dark', iframe_theme
        assert luminance(chart_fill) > 0.62, chart_fill
        assert luminance(table_color) > 0.62, table_color
        assert luminance(mermaid_fill) > 0.55, mermaid_fill
        assert luminance(iframe_color) > 0.62, iframe_color

        page.locator('[data-theme-toggle]').click()  # dark -> auto, with emulated light scheme
        page.wait_for_function("document.documentElement.dataset.theme === 'light'")
        page.wait_for_timeout(700)
        assert page.locator('.html-preview-frame').first.evaluate("frame => frame.contentDocument.documentElement.dataset.theme") == 'light'
        chart_fill_after = page.locator('.chart-svg .chart-title').first.evaluate("el => getComputedStyle(el).fill")
        assert luminance(chart_fill_after) < 0.35, chart_fill_after

        browser.close()
    print('theme regression verification ok')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
