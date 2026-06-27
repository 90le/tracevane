#!/usr/bin/env python3
"""Render Markdown files into a static HTML docs/blog site using Pandoc."""

from __future__ import annotations

import argparse
import base64
import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from urllib.parse import quote, unquote, urlsplit


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parents[1]
DEFAULT_TEMPLATE = SCRIPT_DIR / "templates" / "standalone.html"
DEFAULT_CSS = SCRIPT_DIR / "styles" / "tracevane-docs.css"
DEFAULT_FILTER = SCRIPT_DIR / "filters" / "rich-blocks.lua"
DEFAULT_RUNTIME = SCRIPT_DIR / "renderer" / "runtime" / "index.js"
DEFAULT_DESCRIPTION = "Tracevane 知识库、工程文档与静态手册。"
EXCLUDED_DIRS = {".git", ".hg", ".svn", ".omx", "node_modules", "__pycache__"}
MIN_PANDOC_MAJOR = 3


@dataclass(frozen=True)
class SourceDoc:
  source: Path
  output_rel: Path
  title: str


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description="Render one or more Markdown files/directories into polished static HTML docs.",
    formatter_class=argparse.ArgumentDefaultsHelpFormatter,
  )
  parser.add_argument(
    "inputs",
    nargs="+",
    help="Markdown files and/or directories. Directories are scanned recursively.",
  )
  parser.add_argument(
    "-o",
    "--out",
    type=Path,
    help="Output directory. For one file, omit this to write next to the Markdown source.",
  )
  parser.add_argument("--site-title", default="Tracevane Docs", help="Label shown in the page header.")
  parser.add_argument("--description", default=DEFAULT_DESCRIPTION, help="Header description.")
  parser.add_argument("--toc-depth", default="3", help="Pandoc table-of-contents depth.")
  parser.add_argument("--template", type=Path, default=DEFAULT_TEMPLATE, help="Pandoc HTML template.")
  parser.add_argument("--css", type=Path, default=DEFAULT_CSS, help="CSS file to embed.")
  parser.add_argument("--lua-filter", type=Path, default=DEFAULT_FILTER, help="Pandoc Lua filter.")
  parser.add_argument("--runtime", type=Path, default=DEFAULT_RUNTIME, help="Runtime bootstrap module to embed.")
  parser.add_argument(
    "--mermaid-mode",
    choices=("local", "cdn", "disabled"),
    default="local",
    help="How Mermaid diagrams are handled. 'local' bundles Mermaid from node_modules for offline HTML; 'cdn' loads Mermaid v11 from jsDelivr; 'disabled' keeps source blocks visible without network access.",
  )
  parser.add_argument("--index-title", default="文档手册", help="Generated collection index title.")
  parser.add_argument("--no-index", action="store_true", help="Skip collection index generation.")
  parser.add_argument("--clean", action="store_true", help="Delete the output directory before rendering.")
  return parser.parse_args()


def main() -> int:
  args = parse_args()
  pandoc = shutil.which("pandoc")
  if not pandoc:
    print("error: pandoc is required but was not found in PATH", file=sys.stderr)
    return 2

  try:
    validate_tool_inputs(args)
    validate_pandoc_version(pandoc)
    validate_mermaid_mode(args)
    docs = discover_docs([Path(item) for item in args.inputs])
  except ValueError as exc:
    print(f"error: {exc}", file=sys.stderr)
    return 2

  if not docs:
    print("error: no Markdown files found", file=sys.stderr)
    return 2

  out_dir = resolve_output_dir(args, docs)
  try:
    if args.clean and out_dir.exists():
      validate_clean_target(out_dir)
      shutil.rmtree(out_dir)
  except ValueError as exc:
    print(f"error: {exc}", file=sys.stderr)
    return 2
  out_dir.mkdir(parents=True, exist_ok=True)

  docs = assign_output_paths(docs, out_dir, args.out is not None)
  validate_output_paths(docs)
  nav_by_page = {doc.output_rel: build_docs_nav(docs, doc) for doc in docs}

  for doc in docs:
    output = out_dir / doc.output_rel
    output.parent.mkdir(parents=True, exist_ok=True)
    render_doc(pandoc, args, doc, output, nav_by_page[doc.output_rel], docs)
    print(f"rendered {doc.source} -> {output}")

  if not args.no_index and len(docs) > 1:
    index_path = out_dir / "index.html"
    render_index(pandoc, args, docs, index_path)
    print(f"rendered index -> {index_path}")

  return 0


def validate_tool_inputs(args: argparse.Namespace) -> None:
  for label in ("template", "css", "lua_filter", "runtime"):
    path = getattr(args, label)
    if not path.exists():
      raise ValueError(f"{label.replace('_', '-')} does not exist: {path}")
    if not path.is_file():
      raise ValueError(f"{label.replace('_', '-')} is not a file: {path}")


def validate_pandoc_version(pandoc: str) -> None:
  try:
    result = subprocess.run([pandoc, "--version"], check=True, text=True, capture_output=True)
  except subprocess.SubprocessError as exc:
    raise ValueError(f"failed to inspect pandoc version: {exc}") from exc

  first_line = result.stdout.splitlines()[0] if result.stdout else ""
  parts = first_line.split()
  version = parts[1] if len(parts) > 1 else ""
  major_text = version.split(".", 1)[0]
  try:
    major = int(major_text)
  except ValueError as exc:
    raise ValueError(f"unsupported pandoc version output: {first_line}") from exc
  if major < MIN_PANDOC_MAJOR:
    raise ValueError(f"pandoc {MIN_PANDOC_MAJOR}.x or newer is required, found: {first_line}")


def discover_docs(inputs: list[Path]) -> list[SourceDoc]:
  cwd = Path.cwd().resolve()
  docs: list[SourceDoc] = []
  seen: set[Path] = set()
  multi_root = len(inputs) > 1

  for item in inputs:
    path = item.expanduser().resolve()
    if not path.exists():
      raise ValueError(f"input does not exist: {item}")

    if path.is_file():
      if path.suffix.lower() not in {".md", ".markdown"}:
        continue
      add_doc(docs, seen, path, path.parent, path.name)
      continue

    root = path
    for md_path in sorted(iter_markdown_files(root)):
      if multi_root:
        try:
          rel = md_path.relative_to(cwd)
        except ValueError:
          rel = Path(root.name) / md_path.relative_to(root)
      else:
        rel = md_path.relative_to(root)
      add_doc(docs, seen, md_path, root, rel)

  return sorted(docs, key=lambda doc: natural_sort_key(doc.output_rel))


def iter_markdown_files(root: Path) -> Iterable[Path]:
  for current, dirs, files in os.walk(root):
    dirs[:] = sorted(
      name for name in dirs
      if name not in EXCLUDED_DIRS and not name.startswith(".")
    )
    for name in sorted(files):
      path = Path(current) / name
      if path.suffix.lower() in {".md", ".markdown"}:
        yield path.resolve()


def add_doc(docs: list[SourceDoc], seen: set[Path], path: Path, root: Path, rel: Path | str) -> None:
  real = path.resolve()
  if real in seen:
    return
  seen.add(real)
  rel_path = Path(rel)
  output_rel = rel_path.with_suffix(".html")
  docs.append(
    SourceDoc(
      source=real,
      output_rel=output_rel,
      title=extract_title(real),
    )
  )


def extract_title(path: Path) -> str:
  try:
    with path.open("r", encoding="utf-8") as handle:
      for line in handle:
        stripped = line.strip()
        if stripped.startswith("# "):
          return stripped[2:].strip()
  except UnicodeDecodeError:
    pass
  return path.stem


def assign_output_paths(docs: list[SourceDoc], out_dir: Path, explicit_out: bool) -> list[SourceDoc]:
  if len(docs) == 1 and not explicit_out:
    doc = docs[0]
    return [
      SourceDoc(
        source=doc.source,
        output_rel=Path(doc.source.with_suffix(".html").name),
        title=doc.title,
      )
    ]
  return docs


def resolve_output_dir(args: argparse.Namespace, docs: list[SourceDoc]) -> Path:
  if args.out:
    return args.out.resolve()
  if len(docs) == 1:
    return docs[0].source.parent
  return Path.cwd() / "site"


def validate_clean_target(out_dir: Path) -> None:
  target = out_dir.resolve()
  forbidden = {
    Path("/").resolve(),
    Path.home().resolve(),
    Path.cwd().resolve(),
    SCRIPT_DIR.resolve(),
    SCRIPT_DIR.parent.resolve(),
  }
  if target in forbidden:
    raise ValueError(f"refusing to --clean dangerous output directory: {target}")
  if len(target.parts) < 3:
    raise ValueError(f"refusing to --clean shallow output directory: {target}")


def validate_output_paths(docs: list[SourceDoc]) -> None:
  seen: dict[Path, Path] = {}
  for doc in docs:
    if doc.output_rel.is_absolute() or ".." in doc.output_rel.parts:
      raise ValueError(f"unsafe generated output path for {doc.source}: {doc.output_rel}")
    previous = seen.get(doc.output_rel)
    if previous:
      raise ValueError(f"multiple inputs would write {doc.output_rel}: {previous} and {doc.source}")
    seen[doc.output_rel] = doc.source


def build_docs_nav(docs: list[SourceDoc], current: SourceDoc) -> str:
  groups: dict[Path, list[SourceDoc]] = {}
  for doc in docs:
    group = doc.output_rel.parent
    groups.setdefault(group, []).append(doc)

  parts = ['<div class="docs-nav">']
  home_href = relative_href(current.output_rel.parent, Path("index.html"))
  home_active = ' class="active docs-nav-home"' if current.output_rel == Path("index.html") else ' class="docs-nav-home"'
  parts.append(f'<a{home_active} href="{home_href}">首页 · Index</a>')
  for group in sorted(groups, key=natural_sort_key):
    group_docs = sorted(groups[group], key=lambda doc: natural_sort_key(doc.output_rel))
    if group != Path("."):
      parts.append('<div class="docs-nav-group">')
      parts.append(f'<div class="docs-nav-group-title">{html.escape(label_for_path(group))}</div>')
      parts.append('<div class="docs-nav">')
    for doc in group_docs:
      href = relative_href(current.output_rel.parent, doc.output_rel)
      active = ' class="active"' if doc.output_rel == current.output_rel else ""
      parts.append(f'<a{active} href="{href}">{html.escape(doc.title)}</a>')
    if group != Path("."):
      parts.append("</div></div>")
  parts.append("</div>")
  return "\n".join(parts)


def relative_href(from_dir: Path, target: Path) -> str:
  rel = os.path.relpath(target, start=from_dir if str(from_dir) != "" else ".")
  return quote(rel.replace(os.sep, "/"), safe="/#%:;?&=@+$,~-_.")


def label_for_path(path: Path) -> str:
  if path == Path("."):
    return "Docs"
  return " / ".join(part for part in path.parts if part not in {"."})


def natural_sort_key(value: Path | str) -> tuple[str, ...]:
  return tuple(str(value).lower().split("/"))


def render_doc(pandoc: str, args: argparse.Namespace, doc: SourceDoc, output: Path, docs_nav: str, docs: list[SourceDoc]) -> None:
  metadata = {
    "title": doc.title,
    "site_title": args.site_title,
    "description": args.description,
    "nav_title": "文档导航",
    "docs_nav": docs_nav,
    "mermaid_mode": args.mermaid_mode,
  }
  run_pandoc(
    pandoc,
    args,
    input_path=doc.source,
    output_path=output,
    metadata=metadata,
    search_index=build_search_index(docs, doc.output_rel),
    link_graph=build_link_graph(docs, doc.output_rel),
  )


def render_index(pandoc: str, args: argparse.Namespace, docs: list[SourceDoc], output: Path) -> None:
  source = build_index_markdown(args, docs)
  index_doc = SourceDoc(
    source=output,
    output_rel=Path("index.html"),
    title=args.index_title,
  )
  docs_nav = build_docs_nav(docs, index_doc)
  metadata = {
    "title": args.index_title,
    "site_title": args.site_title,
    "description": args.description,
    "nav_title": "文档导航",
    "docs_nav": docs_nav,
    "mermaid_mode": args.mermaid_mode,
  }
  with tempfile.TemporaryDirectory(prefix="tracevane-docs-index-") as tmp:
    index_md = Path(tmp) / "index.md"
    index_md.write_text(source, encoding="utf-8")
    run_pandoc(
      pandoc,
      args,
      input_path=index_md,
      output_path=output,
      metadata=metadata,
      search_index=build_search_index(docs, Path("index.html")),
      link_graph=build_link_graph(docs, Path("index.html")),
    )


def build_index_markdown(args: argparse.Namespace, docs: list[SourceDoc]) -> str:
  lines = [f"# {args.index_title}", "", args.description, "", "## 文档入口", ""]
  for doc in docs:
    href = quote(str(doc.output_rel).replace(os.sep, "/"), safe="/#%:;?&=@+$,~-_.")
    lines.append(f"- [{doc.title}]({href})")
  lines.append("")
  return "\n".join(lines)


def load_runtime_source(entry_path: Path, mermaid_mode: str) -> str:
  entry = entry_path.resolve()
  source: list[str] = []
  visited: set[Path] = set()

  def resolve_import(base: Path, spec: str) -> Path:
    target = base / spec
    return target if target.suffix == ".js" else target.with_suffix(".js")

  def inline_module(path: Path) -> None:
    resolved = path.resolve()
    if resolved in visited:
      return
    visited.add(resolved)
    text = resolved.read_text(encoding="utf-8")
    for line in text.splitlines():
      stripped = line.strip()
      if stripped.startswith("import ") and " from " in stripped:
        spec = stripped.split(" from ", 1)[1].strip().rstrip(";")
        if (spec.startswith('"./') and spec.endswith('"')) or (spec.startswith("'./") and spec.endswith("'")):
          module_name = spec[1:-1]
          inline_module(resolve_import(resolved.parent, module_name))
        continue
      source.append(line)
    source.append("")

  inline_module(entry)
  runtime = "\n".join(source)
  if mermaid_mode != "cdn":
    runtime = runtime.replace(
      "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs",
      "data:text/javascript,export default null",
    )
  return runtime


def run_pandoc(
  pandoc: str,
  args: argparse.Namespace,
  input_path: Path,
  output_path: Path,
  metadata: dict[str, str],
  search_index: str,
  link_graph: str,
) -> None:
  command = [
    pandoc,
    str(input_path),
    "--from=markdown-raw_html-native_divs-native_spans+pipe_tables+task_lists+definition_lists+fenced_code_attributes+fenced_divs+bracketed_spans+header_attributes+link_attributes+table_attributes+footnotes+tex_math_dollars",
    "--standalone",
    "--toc",
    f"--toc-depth={args.toc_depth}",
    f"--template={args.template.resolve()}",
    f"--css={args.css.resolve()}",
    f"--lua-filter={args.lua_filter.resolve()}",
    f"--resource-path={input_path.parent.resolve()}{os.pathsep}{Path.cwd().resolve()}",
    f"--metadata=title:{metadata['title']}",
    f"--variable=site_title:{metadata['site_title']}",
    f"--variable=description:{metadata['description']}",
    f"--variable=nav_title:{metadata['nav_title']}",
    f"--variable=docs_nav:{metadata['docs_nav']}",
    f"--variable=mermaid_mode:{metadata['mermaid_mode']}",
    "--embed-resources",
    "-o",
    str(output_path),
  ]
  subprocess.run(command, check=True)
  inject_postprocessed_assets(output_path, args, search_index, link_graph)


def validate_mermaid_mode(args: argparse.Namespace) -> None:
  if args.mermaid_mode != "local":
    return
  if not shutil.which("node"):
    raise ValueError("local Mermaid mode requires node; use --mermaid-mode disabled for no-JS diagram source output")
  if not (PROJECT_ROOT / "node_modules" / "mermaid" / "package.json").exists():
    raise ValueError("local Mermaid mode requires node_modules/mermaid; run npm install or use --mermaid-mode disabled")
  if not (PROJECT_ROOT / "node_modules" / "esbuild").exists():
    raise ValueError("local Mermaid mode requires node_modules/esbuild; run npm install or use --mermaid-mode disabled")
  get_local_mermaid_bundle(args)


def inject_postprocessed_assets(output_path: Path, args: argparse.Namespace, search_index: str, link_graph: str) -> None:
  mermaid_marker = "<!--TRACEVANE_MERMAID_BUNDLE-->"
  runtime_marker = "<!--TRACEVANE_RUNTIME-->"
  search_marker = "<!--TRACEVANE_SEARCH_INDEX-->"
  link_graph_marker = "<!--TRACEVANE_LINK_GRAPH-->"
  csp_marker = "<!--TRACEVANE_CSP-->"
  html_text = output_path.read_text(encoding="utf-8")
  html_text = sanitize_main_content(html_text)
  mermaid_replacement = ""
  if mermaid_marker in html_text and args.mermaid_mode == "local" and document_needs_mermaid_runtime(html_text):
    bundle = get_local_mermaid_bundle(args)
    mermaid_replacement = "<!--TRACEVANE_MERMAID_LOCAL_BUNDLE:START-->\n<script>\n" + bundle + "\n</script>\n<!--TRACEVANE_MERMAID_LOCAL_BUNDLE:END-->"
  html_text = html_text.replace(mermaid_marker, mermaid_replacement)
  html_text = html_text.replace(runtime_marker, load_runtime_source(args.runtime, args.mermaid_mode))
  html_text = html_text.replace(search_marker, '<script id="tracevane-search-index" type="application/json">' + escape_script_json(search_index) + '</script>')
  html_text = html_text.replace(link_graph_marker, '<script id="tracevane-link-graph" type="application/json">' + escape_script_json(link_graph) + '</script>')
  html_text = html_text.replace(csp_marker, build_csp_meta(html_text, args.mermaid_mode))
  output_path.write_text(html_text, encoding="utf-8")


def sanitize_main_content(html_text: str) -> str:
  """Remove high-risk raw HTML that could have come from Markdown input.

  Pandoc is invoked with raw HTML disabled, but this defense-in-depth pass keeps
  generated online docs safe if a future extension or template change lets raw
  markup through. It only targets the document body content and preserves the
  renderer's own trusted runtime/template scripts.
  """

  pattern = re.compile(r'(<main id="main-content">\s*)([\s\S]*?)(\s*</main>)', re.IGNORECASE)
  match = pattern.search(html_text)
  if not match:
    return strip_dangerous_attributes(html_text)

  cleaned = sanitize_html_fragment(match.group(2))
  return html_text[:match.start()] + match.group(1) + cleaned + match.group(3) + html_text[match.end():]


def sanitize_html_fragment(fragment: str) -> str:
  # Preserve trusted iframe previews generated by our Lua filter before applying
  # broad raw-HTML stripping. Author raw iframes are removed below.
  preview_iframes: list[str] = []

  def preserve_preview(match: re.Match[str]) -> str:
    token = f"TRACEVANE_HTML_PREVIEW_PLACEHOLDER_{len(preview_iframes)}"
    preview_iframes.append(match.group(0))
    return token

  fragment = re.sub(
    r"<iframe\b[\s\S]*?</iframe\s*>",
    lambda match: preserve_preview(match) if re.search(r"\bclass=(['\"])[^'\"]*\bhtml-preview-frame\b[^'\"]*\1", match.group(0), flags=re.IGNORECASE) else "",
    fragment,
    flags=re.IGNORECASE,
  )
  fragment = re.sub(r"<\s*(script|style|object|embed|base|meta|link)\b[\s\S]*?<\s*/\s*\1\s*>", "", fragment, flags=re.IGNORECASE)
  fragment = re.sub(r"<\s*(script|style|object|embed|base|meta|link)\b[^>]*>", "", fragment, flags=re.IGNORECASE)
  fragment = re.sub(r"<iframe\b[^>]*>", "", fragment, flags=re.IGNORECASE)
  fragment = strip_dangerous_attributes(fragment)
  for index, iframe in enumerate(preview_iframes):
    fragment = fragment.replace(f"TRACEVANE_HTML_PREVIEW_PLACEHOLDER_{index}", iframe)
  return fragment


def strip_dangerous_attributes(fragment: str) -> str:
  # Defense-in-depth for any raw HTML that reaches the document body. The
  # renderer's own rich blocks are produced by the trusted Lua filter; arbitrary
  # author-controlled active attributes/styles are not needed in main content.
  fragment = re.sub(r"\s+on[a-zA-Z0-9_-]+\s*=\s*(\"[^\"]*\"|'[^']*'|(?!&quot;|&#)[^\s>&]+)", "", fragment)
  fragment = re.sub(r"\s+style\s*=\s*(\"[^\"]*\"|'[^']*'|(?!&quot;|&#)[^\s>&]+)", "", fragment, flags=re.IGNORECASE)
  fragment = re.sub(
    r"\s+(href|src|xlink:href|formaction|action|poster)\s*=\s*(['\"])\s*(?:javascript|vbscript|data:text/html)[\s\S]*?\2",
    r' \1="#" data-tracevane-blocked-url="true"',
    fragment,
    flags=re.IGNORECASE,
  )
  fragment = re.sub(
    r"\s+(href|src|xlink:href|formaction|action|poster)\s*=\s*(?:javascript|vbscript|data:text/html)[^\s>]+",
    r' \1="#" data-tracevane-blocked-url="true"',
    fragment,
    flags=re.IGNORECASE,
  )
  return fragment


def build_csp_meta(html_text: str, mermaid_mode: str) -> str:
  hashes: list[str] = []
  for attrs, script in re.findall(r"<script([^>]*)>([\s\S]*?)</script>", html_text, flags=re.IGNORECASE):
    if re.search(r'type\s*=\s*["\']application/json["\']', attrs, flags=re.IGNORECASE):
      continue
    digest = base64.b64encode(hashlib.sha256(script.encode("utf-8")).digest()).decode("ascii")
    hashes.append(f"'sha256-{digest}'")

  script_src = ["'self'", "data:", *sorted(set(hashes))]
  if mermaid_mode == "cdn":
    script_src.append("https://cdn.jsdelivr.net")
  csp = {
    "default-src": ["'none'"],
    "base-uri": ["'none'"],
    "object-src": ["'none'"],
    "form-action": ["'none'"],
    "frame-ancestors": ["'self'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "style-src": ["'self'", "'unsafe-inline'", "data:"],
    "script-src": script_src,
    "connect-src": ["'none'"],
    "frame-src": ["'self'", "data:", "blob:"],
    "worker-src": ["'none'"],
    "manifest-src": ["'none'"],
  }
  value = "; ".join(name + " " + " ".join(values) for name, values in csp.items())
  return '<meta http-equiv="Content-Security-Policy" content="' + html.escape(value, quote=True) + '">'


def strip_markdown_for_search(path: Path) -> str:
  try:
    text = path.read_text(encoding="utf-8")
  except UnicodeDecodeError:
    return ""
  text = re.sub(r"```[a-zA-Z0-9_-]*\n([\s\S]*?)```", r"\1", text)
  text = re.sub(r"`([^`]*)`", r"\1", text)
  text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.IGNORECASE)
  text = re.sub(r"<script[\s\S]*?</script>", " ", text, flags=re.IGNORECASE)
  text = re.sub(r"<[^>]+>", " ", text)
  text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
  text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
  text = re.sub(r"[#>*_~|\-]+", " ", text)
  return re.sub(r"\s+", " ", text).strip()


def build_search_index(docs: list[SourceDoc], current_output_rel: Path) -> str:
  current_dir = current_output_rel.parent
  items = []
  for doc in docs:
    text = strip_markdown_for_search(doc.source)
    items.append({
      "title": doc.title,
      "href": relative_href(current_dir, doc.output_rel),
      "path": str(doc.output_rel).replace(os.sep, "/"),
      "text": text[:120000],
    })
  return json.dumps({"documents": items}, ensure_ascii=False, separators=(",", ":"))


def build_link_graph(docs: list[SourceDoc], current_output_rel: Path) -> str:
  doc_by_output = {normalize_rel_path(doc.output_rel): doc for doc in docs}
  edges: dict[str, set[str]] = {normalize_rel_path(doc.output_rel): set() for doc in docs}

  for doc in docs:
    source_key = normalize_rel_path(doc.output_rel)
    for href in extract_markdown_hrefs(doc.source):
      target = resolve_site_href(doc.output_rel.parent, href)
      if not target:
        continue
      target_key = normalize_rel_path(target)
      if target_key in doc_by_output and target_key != source_key:
        edges[source_key].add(target_key)

  current_key = normalize_rel_path(current_output_rel)
  incoming = sorted((source for source, targets in edges.items() if current_key in targets), key=natural_sort_key)
  outgoing = sorted(edges.get(current_key, set()), key=natural_sort_key)

  def item_for(path_key: str) -> dict[str, str]:
    doc = doc_by_output[path_key]
    return {
      "title": doc.title,
      "path": path_key,
      "href": relative_href(current_output_rel.parent, Path(path_key)),
    }

  payload = {
    "current": current_key,
    "documents": len(docs),
    "incoming": [item_for(path_key) for path_key in incoming],
    "outgoing": [item_for(path_key) for path_key in outgoing],
  }
  return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def extract_markdown_hrefs(path: Path) -> list[str]:
  try:
    text = path.read_text(encoding="utf-8")
  except UnicodeDecodeError:
    return []
  text = re.sub(r"```[\s\S]*?```", " ", text)
  text = re.sub(r"`[^`]*`", " ", text)
  return [
    match.group(1).strip()
    for match in re.finditer(r"(?<!!)\[[^\]]+\]\(([^)]+)\)", text)
    if match.group(1).strip()
  ]


def resolve_site_href(from_dir: Path, href: str) -> Path | None:
  parsed = urlsplit(href.strip())
  if parsed.scheme or parsed.netloc or parsed.path == "":
    return None
  path_text = unquote(parsed.path)
  if path_text.startswith("/") or path_text.startswith("."):
    # Leading ./ and ../ are normalized below; absolute site paths would be
    # ambiguous because the static renderer can be hosted under any prefix.
    pass
  suffix = Path(path_text).suffix.lower()
  if suffix in {".md", ".markdown"}:
    path_text = str(Path(path_text).with_suffix(".html"))
  elif suffix != ".html":
    return None
  candidate = normalize_rel_path(from_dir / Path(path_text))
  if candidate.startswith("../") or candidate == ".." or "/../" in candidate:
    return None
  return Path(candidate)


def normalize_rel_path(path: Path | str) -> str:
  parts: list[str] = []
  for part in Path(path).parts:
    if part in {"", "."}:
      continue
    if part == "..":
      if parts:
        parts.pop()
      else:
        parts.append(part)
      continue
    parts.append(part)
  return "/".join(parts) if parts else "index.html"


def escape_script_json(value: str) -> str:
  return value.replace("</", r"<\/")


def document_needs_mermaid_runtime(html_text: str) -> bool:
  return 'class="mermaid"' in html_text or "class='mermaid'" in html_text


def get_local_mermaid_bundle(args: argparse.Namespace) -> str:
  cached = getattr(args, "_tracevane_mermaid_bundle", None)
  if cached:
    return cached

  node_script = """
const esbuild = require('esbuild');
const result = esbuild.buildSync({
  stdin: {
    contents: "import mermaid from 'mermaid'; window.__TRACEVANE_MERMAID__ = mermaid;",
    resolveDir: process.cwd(),
    sourcefile: 'tracevane-mermaid-entry.js',
  },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  write: false,
  minify: true,
  legalComments: 'none',
  logLevel: 'silent',
});
process.stdout.write(result.outputFiles[0].text);
"""
  try:
    result = subprocess.run(
      ["node", "-e", node_script],
      cwd=PROJECT_ROOT,
      check=True,
      text=True,
      capture_output=True,
    )
  except subprocess.SubprocessError as exc:
    stderr = getattr(exc, "stderr", "") or str(exc)
    raise ValueError(f"failed to bundle local Mermaid runtime: {stderr}") from exc

  safe_bundle = result.stdout.replace("</script", "<\\/script")
  setattr(args, "_tracevane_mermaid_bundle", safe_bundle)
  return safe_bundle


if __name__ == "__main__":
  raise SystemExit(main())
