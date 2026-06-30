/**
 * Legacy Markdown preview compatibility surface.
 *
 * The active Workspace goal is IDE-first: code editing, terminal, Git, search,
 * evidence, and responsive workbench layout. Rich Markdown rendering and
 * preview editing are future `/document-engine` concerns; keep this component
 * import-compatible only until that boundary owns the implementation.
 */
import * as React from "react";
import { Eye, FileQuestion } from "lucide-react";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";

import { useTheme } from "@/app/providers";
import { EmptyState } from "@/shared/states/EmptyState";

// Scoped article CSS (see header in the file for the token mapping).
import "./markdown-preview.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MarkdownPreviewProps {
  /** Path of the active file. Determines markdown detection and relative asset base. */
  path?: string;
  /** Files API root id used to resolve relative Markdown images/media. */
  rootId?: string;
  /** Live edited content of the active file (tracked from the editor). */
  content?: string;
  /**
   * Optional live-preview task toggle hook. When provided, GFM task checkboxes
   * become interactive and call back with the checkbox index inside the current
   * rendered markdown fragment.
   */
  onTaskToggle?: (taskIndex: number, checked: boolean) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** True if `path` is a Markdown file by extension. */
function isMarkdownPath(path: string | undefined): boolean {
  if (!path) return false;
  const ext = path.toLowerCase().split(".").pop() ?? "";
  return ext === "md" || ext === "markdown";
}

/**
 * Run the remark → rehype → stringify pipeline and return sanitized HTML.
 * Throws on pipeline error; callers must handle (graceful-degrade to <pre>).
 *
 * `allowDangerousHtml` + `rehypeRaw` preserve raw HTML authored in the
 * Markdown. The output is ALWAYS passed through DOMPurify before render, so
 * the "dangerous" upstream flag is safe at the boundary.
 */
async function renderMarkdown(md: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeStringify)
    .process(md);
  const html = String(file);
  return DOMPurify.sanitize(html, {
    // Allow class on code/pre so hljs tokens survive sanitization; we add
    // `language-*` classes during highlighting and hljs adds `hljs`.
    ADD_ATTR: ["class", "target", "rel", "controls", "loading", "decoding", "playsinline", "preload"],
  });
}

/**
 * Replace fenced ```mermaid blocks in the rendered HTML with placeholder
 * <div class="mermaid"> nodes so the post-render mermaid pass can pick them
 * up. The unified pipeline emits ```mermaid as
 *   <pre><code class="language-mermaid">...</code></pre>
 * which is neither useful as code nor rendered as a diagram. We rewrite those
 * into `<div class="md-preview__mermaid">` (raw-source fallback) so the user
 * at least sees the diagram source; a later pass renders them as SVG if
 * mermaid is available.
 */
function extractMermaidBlocks(html: string): string {
  // Match <pre><code class="language-mermaid">...source...</code></pre>
  // The source is HTML-escaped inside <code>; we keep it as text content.
  return html.replace(
    /<pre><code(?:\s+class="[^"]*language-mermaid[^"]*")>([\s\S]*?)<\/code><\/pre>/g,
    (_m, src) => {
      // Un-escape common entities so mermaid sees real source.
      const text = String(src)
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      return `<div class="md-preview__mermaid" data-mermaid="${encodeURIComponent(text)}">${escapeHtml(text)}</div>`;
    },
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}


function decorateMarkdownDom(
  node: HTMLElement,
  rootId: string | undefined,
  markdownPath: string | undefined,
  onTaskToggle?: (taskIndex: number, checked: boolean) => void,
): void {
  node.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
    const rawSrc = image.getAttribute("src");
    const resolved = resolveMarkdownResourceUrl(rawSrc, rootId, markdownPath);
    const source = resolved ?? rawSrc;
    const mediaKind = getMarkdownMediaKind(rawSrc);

    if (source && mediaKind === "video") {
      const video = document.createElement("video");
      video.src = source;
      video.controls = true;
      video.preload = "metadata";
      video.playsInline = true;
      copyMarkdownMediaLabel(image, video);
      image.replaceWith(video);
      return;
    }

    if (source && mediaKind === "audio") {
      const audio = document.createElement("audio");
      audio.src = source;
      audio.controls = true;
      audio.preload = "metadata";
      copyMarkdownMediaLabel(image, audio);
      image.replaceWith(audio);
      return;
    }

    if (resolved) image.setAttribute("src", resolved);
    image.setAttribute("loading", image.getAttribute("loading") ?? "lazy");
    image.setAttribute("decoding", image.getAttribute("decoding") ?? "async");
  });

  node.querySelectorAll<HTMLVideoElement | HTMLAudioElement>("video,audio").forEach((media) => {
    const resolved = resolveMarkdownResourceUrl(media.getAttribute("src"), rootId, markdownPath);
    if (resolved) media.setAttribute("src", resolved);
    media.setAttribute("controls", "");
    media.setAttribute("preload", media.getAttribute("preload") ?? "metadata");
    if (media.tagName.toLowerCase() === "video") media.setAttribute("playsinline", "");
  });

  node.querySelectorAll<HTMLSourceElement>("source").forEach((source) => {
    const resolved = resolveMarkdownResourceUrl(source.getAttribute("src"), rootId, markdownPath);
    if (resolved) source.setAttribute("src", resolved);
  });

  node.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#")) return;
    if (isExternalResourceUrl(href)) {
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noreferrer noopener");
    }
  });

  node.querySelectorAll<HTMLInputElement>('li input[type="checkbox"]').forEach((checkbox, index) => {
    checkbox.setAttribute("aria-label", checkbox.checked ? "取消完成任务" : "完成任务");
    if (!onTaskToggle) return;
    checkbox.disabled = false;
    checkbox.classList.add("md-preview__task-toggle");
    checkbox.onchange = () => onTaskToggle(index, checkbox.checked);
  });
}

function resolveMarkdownResourceUrl(value: string | null, rootId: string | undefined, markdownPath: string | undefined): string | null {
  if (!value || !rootId || !markdownPath) return null;
  if (isExternalResourceUrl(value) || value.startsWith("#") || value.startsWith("data:") || value.startsWith("blob:")) return null;
  const [rawPath, suffix = ""] = splitUrlSuffix(value);
  const assetPath = normalizeMarkdownAssetPath(markdownPath, decodeURIComponent(rawPath));
  if (!assetPath) return null;
  const params = new URLSearchParams({ rootId, path: assetPath });
  return `/api/files/download?${params.toString()}${suffix}`;
}


function getMarkdownMediaKind(value: string | null): "video" | "audio" | null {
  if (!value) return null;
  const [rawPath] = splitUrlSuffix(value);
  const ext = rawPath.toLowerCase().split(".").pop() ?? "";
  if (["mp4", "webm", "ogg", "ogv", "mov", "m4v"].includes(ext)) return "video";
  if (["mp3", "wav", "m4a", "aac", "flac", "oga", "opus"].includes(ext)) return "audio";
  return null;
}

function copyMarkdownMediaLabel(source: HTMLImageElement, target: HTMLMediaElement): void {
  const alt = source.getAttribute("alt");
  if (!alt) return;
  target.setAttribute("aria-label", alt);
  target.setAttribute("title", alt);
}

function isExternalResourceUrl(value: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(value) || /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function splitUrlSuffix(value: string): [string, string?] {
  const match = /^([^?#]*)([?#].*)?$/.exec(value);
  return [match?.[1] ?? value, match?.[2]];
}

function normalizeMarkdownAssetPath(markdownPath: string, assetPath: string): string {
  const cleanAsset = assetPath.replace(/\\/g, "/");
  if (cleanAsset.startsWith("/")) return normalizePathSegments(cleanAsset.slice(1));
  const base = markdownPath.includes("/") ? markdownPath.slice(0, markdownPath.lastIndexOf("/")) : "";
  return normalizePathSegments(`${base}/${cleanAsset}`);
}

function normalizePathSegments(value: string): string {
  const parts: string[] = [];
  value.split("/").forEach((part) => {
    if (!part || part === ".") return;
    if (part === "..") {
      parts.pop();
      return;
    }
    parts.push(part);
  });
  return parts.join("/");
}

// Track whether mermaid has been initialized once for this page. Initializing
// more than once is fine (mermaid is idempotent) but doing it lazily keeps
// the initial bundle impact off the critical path for non-md files.
let mermaidInitializedTheme: "default" | "dark" | null = null;
let mermaidLoadFailed = false;

async function ensureMermaid(theme: "default" | "dark"): Promise<typeof import("mermaid") | null> {
  if (mermaidLoadFailed) return null;
  try {
    const mod = await import("mermaid");
    if (mermaidInitializedTheme !== theme) {
      // startOnLoad false — we drive rendering explicitly. Re-initialize when
      // Aurora switches light/dark so rendered diagrams use the active theme.
      mod.default.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme,
      });
      mermaidInitializedTheme = theme;
    }
    return mod;
  } catch {
    mermaidLoadFailed = true;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Workspace Markdown live preview.
 *
 * ## Pipeline
 *
 * `content` (live edited markdown) → debounced (~150ms) →
 * `unified().use(remarkParse).use(remarkGfm).use(remarkRehype,
 * {allowDangerousHtml:true}).use(rehypeRaw).use(rehypeStringify)` →
 * HTML string → `DOMPurify.sanitize` → `dangerouslySetInnerHTML`.
 *
 * Raw HTML in the source is preserved by `allowDangerousHtml`+`rehypeRaw`
 * upstream, but the DOMPurify pass is the security boundary: everything
 * rendered to the DOM is sanitized regardless of upstream flags.
 *
 * ## Code highlighting
 *
 * After the sanitized HTML is mounted, `pre code` blocks are highlighted
 * with `hljs.highlightElement`. Already-highlighted nodes are skipped via a
 * `data-highlighted` attribute so re-renders don't double-process.
 *
 * ## Mermaid
 *
 * ` ```mermaid ` fenced blocks are rewritten (pre-render) into
 * `<div class="md-preview__mermaid">` placeholders. After mount, if the
 * `mermaid` dynamic import succeeds, each placeholder is rendered to an SVG
 * in place; if the import fails (or mermaid errors), the raw source stays
 * visible as a graceful degrade. This remains best-effort.
 *
 * ## Error handling
 *
 * Any pipeline error shows the raw `content` inside a `<pre>` — the preview
 * never crashes Workspace.
 *
 * ## Non-markdown files
 *
 * Non-.md/.markdown paths render an "此文件类型暂无预览" placeholder. An
 * undefined/empty path renders the empty-state hint.
 */
export function MarkdownPreview({ path, rootId, content, onTaskToggle }: MarkdownPreviewProps) {
  const articleRef = React.useRef<HTMLElement | null>(null);
  const { theme } = useTheme();
  const mermaidTheme = theme === "dark" ? "dark" : "default";

  // Debounced content for the pipeline. We keep the latest raw content in a
  // ref and run the pipeline ~150ms after edits settle.
  const [debounced, setDebounced] = React.useState<string>(content ?? "");
  React.useEffect(() => {
    const id = window.setTimeout(() => {
      setDebounced(content ?? "");
    }, 150);
    return () => window.clearTimeout(id);
  }, [content]);

  // Render pipeline state.
  const [html, setHtml] = React.useState<string>("");
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    if (!isMarkdownPath(path) || !debounced) {
      setHtml("");
      setError(null);
      return;
    }
    let cancelled = false;
    renderMarkdown(debounced)
      .then((clean) => {
        if (cancelled) return;
        setError(null);
        setHtml(extractMermaidBlocks(clean));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setHtml("");
      });
    return () => {
      cancelled = true;
    };
    // Include mermaidTheme so theme switches rebuild the sanitized HTML back
    // to unprocessed Mermaid placeholders before the post-render SVG pass runs.
  }, [debounced, path, mermaidTheme]);

  // Post-render: highlight code blocks + render mermaid placeholders. Runs
  // after the article DOM is updated with new `html`.
  React.useEffect(() => {
    const node = articleRef.current;
    if (!node || error) return;

    decorateMarkdownDom(node, rootId, path, onTaskToggle);

    // --- Code highlighting ----------------------------------------------
    const codeBlocks = node.querySelectorAll<HTMLPreElement>(
      "pre code:not([data-highlighted])",
    );
    for (const block of codeBlocks) {
      // Skip mermaid placeholders (they shouldn't appear inside pre/code at
      // this point, but guard anyway).
      if (block.classList.contains("language-mermaid")) continue;
      try {
        hljs.highlightElement(block);
      } catch {
        // Unknown language / hljs hiccup — leave the block unhighlighted.
      }
      block.setAttribute("data-highlighted", "1");
    }

    // --- Mermaid ---------------------------------------------------------
    const mermaidNodes = node.querySelectorAll<HTMLElement>(
      ".md-preview__mermaid:not([data-processed])",
    );
    if (mermaidNodes.length > 0) {
      let cancelled = false;
      ensureMermaid(mermaidTheme).then((mod) => {
        if (cancelled || !mod) return;
        const m = mod.default;
        mermaidNodes.forEach(async (host, idx) => {
          const raw = decodeURIComponent(
            host.getAttribute("data-mermaid") ?? "",
          );
          if (!raw) return;
          host.setAttribute("data-processed", "1");
          try {
            const id = `md-preview-mermaid-${Date.now()}-${idx}`;
            const { svg } = await m.render(id, raw);
            host.classList.remove("md-preview__mermaid");
            host.classList.add("mermaid");
            host.removeAttribute("data-mermaid");
            host.innerHTML = svg;
          } catch {
            // Leave the raw source visible (graceful degrade).
          }
        });
      });
      return () => {
        cancelled = true;
      };
    }
  }, [html, error, path, rootId, mermaidTheme, onTaskToggle]);

  // --- Branches ---------------------------------------------------------

  // No file open.
  if (!path) {
    return (
      <PreviewFrame>
        <EmptyState
          title="无预览"
          description="打开 .md 文件查看实时预览"
          icon={<Eye />}
        />
      </PreviewFrame>
    );
  }

  // Non-markdown file.
  if (!isMarkdownPath(path)) {
    return (
      <PreviewFrame>
        <EmptyState
          title="此文件类型暂无预览"
          description={`不支持 ${path.split(".").pop() ?? ""} 格式的实时预览`}
          icon={<FileQuestion />}
        />
      </PreviewFrame>
    );
  }

  // Markdown but no content yet.
  if (!content && !html) {
    return (
      <PreviewFrame>
        <EmptyState
          title="空文档"
          description="开始输入 Markdown 内容即可看到预览"
          icon={<Eye />}
        />
      </PreviewFrame>
    );
  }

  // Pipeline error → graceful degrade to raw <pre>.
  if (error) {
    return (
      <PreviewFrame>
        <pre className="m-3 overflow-auto rounded-md bg-panel-3 p-3 font-mono text-2xs text-muted">
          {content ?? ""}
        </pre>
      </PreviewFrame>
    );
  }

  // Normal render.
  return (
    <PreviewFrame>
      <article
        ref={articleRef as React.RefObject<HTMLElement>}
        className="md-preview__article min-h-0 overflow-auto px-4 py-4"
        dangerouslySetInnerHTML={{ __html: html || "<p></p>" }}
      />
    </PreviewFrame>
  );
}

// ---------------------------------------------------------------------------
// PreviewFrame — shared chrome (header) so every branch looks consistent.
// ---------------------------------------------------------------------------

function PreviewFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)] overflow-hidden">
      {children}
    </div>
  );
}

export default MarkdownPreview;
