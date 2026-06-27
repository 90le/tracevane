#!/usr/bin/env python3
"""Smoke test for Tracevane Docs Renderer."""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

TOOLS_ROOT = Path(__file__).resolve().parent
RENDERER = TOOLS_ROOT / "render-docs.py"
FIXTURES = TOOLS_ROOT / "renderer" / "fixtures"
DOCS = [
  FIXTURES / "renderer-capabilities.md",
  FIXTURES / "unsafe-html.md",
  FIXTURES / "long-document.md",
  FIXTURES / "offline-rendering-test.md",
  FIXTURES / "rich-rendering-gallery.md",
  FIXTURES / "renderer-edge-cases.md",
]
REQUIRED_SNIPPETS = [
  "Tracevane Docs Renderer",
  "rich-preview-modal",
  "IntersectionObserver",
  "page-toc-section",
  "heading-anchor",
  "code-block-wrapper",
  "diagram-toolbar",
  "table-toolbar",
  "__TRACEVANE_MERMAID__",
  "doc-search",
  "doc-search-hit",
  "doc-search-results",
  "tracevane-search-index",
  "data-theme-toggle",
  "code-token--keyword",
  "Content-Security-Policy",
  "mindmap-wrap",
  "block-ref-popover",
  "inline-memo",
]
RICH_DOC_SNIPPETS = [
  "html-preview-wrap",
  "chart-wrap",
]
EDGE_DOC_SNIPPETS = [
  "Renderer Edge Cases and Safety Examples",
  "plain-html-should-not-render",
  "dynamic-script-probe",
  "Broken chart",
]


def run(command: list[str], cwd: Path | None = None) -> None:
  print("$", " ".join(command))
  subprocess.run(command, cwd=cwd, check=True)


def run_expect_failure(command: list[str], cwd: Path | None = None) -> None:
  print("$", " ".join(command), "(expect failure)")
  result = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
  if result.returncode == 0:
    raise AssertionError(f"command unexpectedly succeeded: {' '.join(command)}")
  if "refusing to --clean dangerous output directory" not in result.stderr:
    raise AssertionError(f"unexpected failure output: {result.stderr}")


def assert_contains(path: Path, snippets: list[str]) -> None:
  text = path.read_text(encoding="utf-8")
  missing = [snippet for snippet in snippets if snippet not in text]
  if missing:
    raise AssertionError(f"{path} missing snippets: {missing}")


def check_inline_scripts(path: Path) -> None:
  node = shutil.which("node")
  if not node:
    print("warning: node not found; skip inline JS syntax check", file=sys.stderr)
    return
  text = path.read_text(encoding="utf-8")
  scripts = re.findall(r'<script([^>]*)>([\s\S]*?)</script>', text)
  with tempfile.TemporaryDirectory(prefix="tracevane-docs-js-") as tmpdir:
    tmp = Path(tmpdir)
    for index, (attrs, script) in enumerate(scripts):
      if 'application/json' in attrs:
        continue
      is_module = 'type="module"' in attrs or "type='module'" in attrs
      script_path = tmp / f"inline-{index}.{'mjs' if is_module else 'js'}"
      script_path.write_text(script, encoding="utf-8")
      run([node, "--check", str(script_path)])


def assert_html_preview_sandboxed(path: Path) -> None:
  text = path.read_text(encoding="utf-8")
  if "html-preview-frame" not in text:
    return
  if 'sandbox=' not in text or '<div class="html-preview-rendered"' in text:
    raise AssertionError(f"{path} must render html-preview blocks in sandboxed iframes")
  if "script-src &apos;none&apos;" not in text and "script-src 'none'" not in text:
    raise AssertionError(f"{path} html-preview iframe srcdoc must carry a script-blocking CSP")


def assert_security_hardened(path: Path) -> None:
  text = path.read_text(encoding="utf-8")
  if '<main id="main-content"' not in text:
    raise AssertionError(f"{path} missing main content")
  main = re.split(r'<main\b[^>]*id="main-content"[^>]*>', text, maxsplit=1)[1].split('</main>', 1)[0]
  forbidden = [
    "<script>window.__TRACEVANE_XSS",
    "<svg onload=",
    "<iframe srcdoc=",
    "<form action=\"javascript:",
    "<a href=\"data:text/html",
    "<span style=\"position:fixed",
  ]
  present = [snippet for snippet in forbidden if snippet in main]
  if present:
    raise AssertionError(f"{path} unsafe HTML survived in main content: {present}")
  if "Content-Security-Policy" not in text or "object-src" not in text or "base-uri" not in text:
    raise AssertionError(f"{path} missing top-level CSP hardening")


def assert_local_mermaid_bundle(path: Path) -> None:
  text = path.read_text(encoding="utf-8")
  if 'data-mermaid-mode="local"' not in text or "__TRACEVANE_MERMAID__" not in text:
    raise AssertionError(f"{path} missing local Mermaid mode evidence")
  if "https://cdn.jsdelivr.net/npm/mermaid" in text:
    raise AssertionError(f"{path} should not reference Mermaid CDN in local mode")
  if 'class="mermaid"' in text and "TRACEVANE_MERMAID_LOCAL_BUNDLE:START" not in text:
    raise AssertionError(f"{path} has Mermaid diagrams but no local Mermaid bundle")
  if 'class="mermaid"' not in text and "TRACEVANE_MERMAID_LOCAL_BUNDLE:START" in text:
    raise AssertionError(f"{path} has no Mermaid diagrams but still embeds the local Mermaid bundle")


def assert_mermaid_disabled(path: Path) -> None:
  text = path.read_text(encoding="utf-8")
  required = ['data-mermaid-mode="disabled"', "Mermaid rendering disabled", "diagram-wrap--disabled"]
  missing = [snippet for snippet in required if snippet not in text]
  if missing:
    raise AssertionError(f"{path} missing disabled Mermaid snippets: {missing}")


def main() -> int:
  missing_docs = [path for path in DOCS if not path.exists()]
  if missing_docs:
    print("missing docs:", *map(str, missing_docs), sep="\n  ", file=sys.stderr)
    return 2

  with tempfile.TemporaryDirectory(prefix="tracevane-docs-renderer-smoke-") as tmpdir:
    tmp = Path(tmpdir)
    single_source = tmp / "single.md"
    single_source.write_text((FIXTURES / "renderer-capabilities.md").read_text(encoding="utf-8"), encoding="utf-8")
    run([sys.executable, str(RENDERER), str(single_source)])
    single_html = single_source.with_suffix(".html")
    if not single_html.exists():
      raise AssertionError("single-file render without --out did not write next to source")
    assert_contains(single_html, REQUIRED_SNIPPETS)
    check_inline_scripts(single_html)
    assert_local_mermaid_bundle(single_html)
    run_expect_failure([sys.executable, str(RENDERER), str(single_source), "--out", str(tmp), "--clean"], cwd=tmp)

    out = tmp / "site"
    run([
      sys.executable,
      str(RENDERER),
      *map(str, DOCS),
      "--out",
      str(out),
      "--site-title",
      "Tracevane Docs",
      "--description",
      "Tracevane Docs Renderer smoke site",
      "--clean",
    ])

    index = out / "index.html"
    if not index.exists():
      raise AssertionError("index.html was not generated")
    assert_contains(index, ["Tracevane Docs Renderer", "文档入口"])

    html_files = sorted(path for path in out.glob("*.html") if path.name != "index.html")
    if len(html_files) != len(DOCS):
      raise AssertionError(f"expected {len(DOCS)} html docs, got {len(html_files)}")

    for html_path in html_files:
      assert_contains(html_path, REQUIRED_SNIPPETS)
      check_inline_scripts(html_path)
      assert_html_preview_sandboxed(html_path)
      assert_security_hardened(html_path)
      assert_local_mermaid_bundle(html_path)

    rich_doc = next(path for path in html_files if "renderer-capabilities" in path.name)
    assert_contains(rich_doc, ["diagram-toolbar", "table-toolbar"])

    gallery_doc = next(path for path in html_files if "rich-rendering-gallery" in path.name)
    assert_contains(gallery_doc, ["tracevane-callout", "chart-svg--line", "chart-series-1", "sequenceDiagram", "mindmap-wrap", "block-ref-link", "inline-memo"])

    unsafe_doc = next(path for path in html_files if "unsafe-html" in path.name)
    assert_contains(unsafe_doc, RICH_DOC_SNIPPETS)

    edge_doc = next(path for path in html_files if "renderer-edge-cases" in path.name)
    assert_contains(edge_doc, EDGE_DOC_SNIPPETS)

    dir_out = tmp / "directory-site"
    run([
      sys.executable,
      str(RENDERER),
      str(FIXTURES),
      "--out",
      str(dir_out),
      "--clean",
      "--site-title",
      "Tracevane Fixture Directory",
    ])
    if not (dir_out / "index.html").exists() or len(list(dir_out.glob("*.html"))) < len(DOCS):
      raise AssertionError("directory render did not generate expected site files")

    offline_out = tmp / "offline-site"
    run([
      sys.executable,
      str(RENDERER),
      str(FIXTURES / "renderer-capabilities.md"),
      "--out",
      str(offline_out),
      "--clean",
      "--mermaid-mode",
      "disabled",
    ])
    offline_doc = offline_out / "renderer-capabilities.html"
    if not offline_doc.exists():
      raise AssertionError("offline Mermaid render did not generate output")
    assert_mermaid_disabled(offline_doc)
    check_inline_scripts(offline_doc)

    print(f"ok: rendered {len(html_files)} docs + index into {out}")
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
