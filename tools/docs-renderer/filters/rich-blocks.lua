local function escape_html(value)
  value = value:gsub("&", "&amp;")
  value = value:gsub("<", "&lt;")
  value = value:gsub(">", "&gt;")
  value = value:gsub('"', "&quot;")
  return value
end

local function has_class(block, class_name)
  return block.classes:includes(class_name)
end

local HTML_PREVIEW_CSP = '<meta http-equiv="Content-Security-Policy" content="default-src &apos;none&apos;; script-src &apos;none&apos;; base-uri &apos;none&apos;; form-action &apos;none&apos;; img-src data: https: http:; media-src data: https: http:; font-src data:; style-src &apos;unsafe-inline&apos;">'
local HTML_PREVIEW_BASE_STYLE = '<style>:root{color-scheme:light;--tv-html-ink:#0f172a;--tv-html-muted:#475569;--tv-html-line:#d7e0ea;--tv-html-link:#0369a1;--tv-html-heading:#0f172a;--tv-html-soft:rgba(248,250,252,.86)}html,body{overflow:hidden;max-width:100%}body{margin:0;padding:16px;color:var(--tv-html-ink);background:transparent;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;line-height:1.6;overflow-wrap:anywhere}body,div,p,li,td,th,span,section,article{color:inherit}h1,h2,h3,h4,h5,h6,strong,b{color:var(--tv-html-heading)}small,figcaption,caption{color:var(--tv-html-muted)}a{color:var(--tv-html-link)}*{box-sizing:border-box;max-width:100%}pre,code{white-space:pre-wrap;overflow-wrap:anywhere}pre{background:var(--tv-html-soft);border-radius:10px;padding:10px}img,svg,canvas,video{max-width:100%;height:auto}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid var(--tv-html-line);padding:6px 8px}mark.doc-search-hit{border-radius:4px;background:#fde68a;color:#111827;box-shadow:0 0 0 2px rgba(253,230,138,.36)}mark.doc-search-active{background:#fb923c;color:#111827}html[data-theme=dark]{color-scheme:dark;--tv-html-ink:#e7edf4;--tv-html-muted:#a8b6c7;--tv-html-line:#334155;--tv-html-link:#67e8f9;--tv-html-heading:#f8fafc;--tv-html-soft:rgba(15,23,42,.72)}html[data-theme=light]{color-scheme:light}</style>'

local function is_safe_href(target)
  if target == nil or target == "" then
    return true
  end
  local lower = target:lower():gsub("^%s+", "")
  if lower:match("^#") or lower:match("^/") or lower:match("^%.?/") or lower:match("^%.%./") then
    return true
  end
  if lower:match("^https?://") or lower:match("^mailto:") or lower:match("^tel:") then
    return true
  end
  if lower:match("^[%w._~%%+%-/]+%.%w[%w._~%%+%-/]*[#?]?.*$") and not lower:match("^[%a][%w+.-]*:") then
    return true
  end
  return false
end

function CodeBlock(block)
  if has_class(block, "mermaid") then
    return pandoc.RawBlock("html", '<div class="diagram-wrap"><div class="mermaid">\n' .. escape_html(block.text) .. "\n</div></div>")
  end

  if has_class(block, "html-preview") or has_class(block, "preview-html") then
    local preview_doc = HTML_PREVIEW_CSP .. HTML_PREVIEW_BASE_STYLE .. block.text
    local source = escape_html(block.text)
    local preview = escape_html(preview_doc)
    local html = '<div class="html-preview-wrap">'
      .. '<div class="html-preview-toolbar rich-block-toolbar"><span class="rich-block-title">HTML Preview</span></div>'
      .. '<iframe class="html-preview-frame" sandbox="allow-same-origin" referrerpolicy="no-referrer" loading="eager" scrolling="no" srcdoc="' .. preview .. '"></iframe>'
      .. '<pre class="html-preview-source"><code>' .. source .. '</code></pre>'
      .. '</div>'
    return pandoc.RawBlock("html", html)
  end

  if has_class(block, "chart") or has_class(block, "tracevane-chart") then
    local source = escape_html(block.text)
    local html = '<div class="chart-wrap">'
      .. '<div class="chart-toolbar rich-block-toolbar"><span class="rich-block-title">Chart Preview</span></div>'
      .. '<div class="chart-surface" role="img" aria-label="Chart preview"></div>'
      .. '<pre class="chart-source"><code>' .. source .. '</code></pre>'
      .. '</div>'
    return pandoc.RawBlock("html", html)
  end

  if has_class(block, "mindmap") or has_class(block, "tracevane-mindmap") then
    local source = escape_html(block.text)
    local html = '<div class="mindmap-wrap">'
      .. '<div class="mindmap-toolbar rich-block-toolbar"><span class="rich-block-title">Mindmap Preview</span></div>'
      .. '<div class="mindmap-surface" role="img" aria-label="Mindmap preview"></div>'
      .. '<pre class="mindmap-source"><code>' .. source .. '</code></pre>'
      .. '</div>'
    return pandoc.RawBlock("html", html)
  end

  -- Security boundary: plain ```html remains source code. Rendered HTML must
  -- be an explicit ```html-preview block so it stays inside a sandboxed iframe.
end

function Table(table)
  return pandoc.Div({ table }, pandoc.Attr("", { "table-wrap" }, {}))
end

function Div(div)
  local callout_types = {
    note = true,
    tip = true,
    warning = true,
    danger = true,
    info = true,
    success = true,
  }

  for name, _ in pairs(callout_types) do
    if has_class(div, name) then
      div.classes:insert("tracevane-callout")
      div.classes:insert("tracevane-callout--" .. name)
      return div
    end
  end
end

function Link(link)
  local target = link.target
  if not is_safe_href(target) then
    link.target = "#"
    link.attributes["data-tracevane-blocked-url"] = "true"
    return link
  end
  local path, anchor = target:match("^([^#]+)(#.*)$")
  path = path or target
  anchor = anchor or ""

  if path:match("%.md$") or path:match("%.markdown$") then
    path = path:gsub("%.markdown$", ".html"):gsub("%.md$", ".html")
    link.target = path .. anchor
    return link
  end

  if target:match("^https?://") then
    link.attributes["target"] = "_blank"
    link.attributes["rel"] = "noopener noreferrer"
    return link
  end
end


function Span(span)
  if has_class(span, "inline-memo") or has_class(span, "memo") then
    local memo = span.attributes["memo"] or span.attributes["data-memo"] or span.attributes["content"] or span.attributes["title"] or ""
    if memo == "" then
      return span
    end
    local text = pandoc.utils.stringify(span.content)
    local html = '<span class="inline-memo" tabindex="0" role="note" data-inline-memo-content="' .. escape_html(memo) .. '">' .. escape_html(text) .. '</span>'
    return pandoc.RawInline("html", html)
  end
end

function Image(image)
  if not is_safe_href(image.src) and not image.src:lower():match("^data:image/") then
    image.src = ""
    image.attributes["data-tracevane-blocked-url"] = "true"
    return image
  end
  return image
end
