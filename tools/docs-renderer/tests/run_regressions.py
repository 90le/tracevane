#!/usr/bin/env python3
"""Run the full Tracevane Docs Renderer regression suite.

This script is intentionally small and explicit: it renders the canonical
fixtures into the project .tmp preview folders, then runs every focused
Playwright/smoke verifier against those freshly generated artifacts.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
TOOLS = ROOT / 'tools' / 'docs-renderer'
FIXTURES = TOOLS / 'renderer' / 'fixtures'
RENDERER = TOOLS / 'render-docs.py'
SMOKE = TOOLS / 'smoke-test.py'
TESTS = TOOLS / 'tests'
PREVIEW = ROOT / '.tmp' / 'docs-renderer-preview'
SITE = ROOT / '.tmp' / 'docs-renderer-preview-site'


def run(command: list[str], *, cwd: Path = ROOT) -> None:
    print('$', ' '.join(str(part) for part in command), flush=True)
    subprocess.run([str(part) for part in command], cwd=cwd, check=True)


def render_fixtures() -> None:
    run([
        sys.executable,
        RENDERER,
        FIXTURES,
        '--out',
        SITE,
        '--site-title',
        'Tracevane Docs Renderer',
        '--clean',
        '--mermaid-mode',
        'local',
    ])
    run([
        sys.executable,
        RENDERER,
        FIXTURES / 'rich-rendering-gallery.md',
        '--out',
        PREVIEW,
        '--site-title',
        'Tracevane Docs Renderer',
        '--clean',
        '--mermaid-mode',
        'local',
    ])


def run_regressions() -> None:
    gallery = SITE / 'rich-rendering-gallery.html'
    unsafe = SITE / 'unsafe-html.html'
    edge = SITE / 'renderer-edge-cases.html'
    commands = [
        [sys.executable, TESTS / 'playwright_examples_regression.py', edge],
        [sys.executable, TESTS / 'playwright_gallery_examples_regression.py', gallery],
        [sys.executable, TESTS / 'playwright_block_ref_regression.py', gallery],
        [sys.executable, TESTS / 'playwright_inline_memo_regression.py', gallery],
        [sys.executable, TESTS / 'playwright_link_graph_regression.py', SITE / 'offline-rendering-test.html'],
        [sys.executable, TESTS / 'playwright_toolbar_regression.py', gallery],
        [sys.executable, TESTS / 'playwright_table_regression.py', gallery],
        [sys.executable, TESTS / 'playwright_code_regression.py', gallery],
        [sys.executable, TESTS / 'playwright_feedback_regression.py', gallery],
        [sys.executable, TESTS / 'playwright_export_regression.py', gallery],
        [sys.executable, TESTS / 'playwright_browser_viewer_regression.py', gallery],
        [sys.executable, TESTS / 'playwright_media_lightbox_regression.py', gallery],
        [sys.executable, TESTS / 'playwright_accessibility_regression.py', gallery],
        [sys.executable, TESTS / 'playwright_quick_actions_regression.py', gallery],
        [sys.executable, TESTS / 'playwright_reader_settings_regression.py', gallery],
        [sys.executable, TESTS / 'playwright_keyboard_help_regression.py', gallery],
        [sys.executable, TESTS / 'playwright_back_to_top_regression.py', gallery],
        [sys.executable, TESTS / 'playwright_search_regression.py', gallery],
        [sys.executable, TESTS / 'playwright_theme_regression.py', gallery],
        [sys.executable, TESTS / 'playwright_security_regression.py', unsafe],
        [sys.executable, TESTS / 'playwright_performance_regression.py', gallery],
        [sys.executable, SMOKE],
    ]
    for command in commands:
        run(command)


def main() -> int:
    parser = argparse.ArgumentParser(description='Run Tracevane Docs Renderer full regression suite.')
    parser.add_argument('--skip-render', action='store_true', help='Use existing .tmp rendered fixtures instead of regenerating them first.')
    args = parser.parse_args()
    if not args.skip_render:
        render_fixtures()
    run_regressions()
    print('docs renderer full regression suite ok')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
