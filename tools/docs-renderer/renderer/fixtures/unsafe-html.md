# Unsafe HTML Fixture

The renderer should not rely on this file executing arbitrary HTML by default in future safe mode.

```html-preview
<div style="padding:16px;border:1px solid #ddd;border-radius:12px;">Trusted preview example</div>
```

```html
<script>alert('should remain source code, not execute');</script>
```

## Raw HTML must not execute

The following raw HTML is intentionally hostile. The renderer should show it as
text or remove unsafe parts; it must not become active DOM in the generated page.

<img src=x onerror="window.__TRACEVANE_XSS = 'raw-img'">

<script>window.__TRACEVANE_XSS = 'raw-script'</script>

[blocked javascript link](javascript:window.__TRACEVANE_XSS='link')

## Additional hostile raw HTML corpus

These snippets model common XSS vectors. They must remain inert in the generated
main document. The explicit `html-preview` block remains the only rendered HTML
path and keeps scripts disabled by CSP/sandbox.

<svg onload="window.__TRACEVANE_XSS='svg-onload'"><a xlink:href="javascript:window.__TRACEVANE_XSS='svg-link'"><text>bad svg</text></a></svg>

<iframe srcdoc="<script>parent.__TRACEVANE_XSS='srcdoc'</script>"></iframe>

<form action="javascript:window.__TRACEVANE_XSS='form-action'"><button>bad form</button></form>

<a href="data:text/html,<script>window.__TRACEVANE_XSS='data-html'</script>">bad data html</a>

<span style="position:fixed;inset:0;background:red;z-index:999999">style overlay should be stripped if raw HTML ever passes through</span>

```html-preview
<div id="preview-security-probe">
  <p>Preview script must not run.</p>
  <script>parent.__TRACEVANE_XSS = 'preview-script'; window.__TRACEVANE_IFRAME_SCRIPT = true;</script>
  <img src="x" onerror="parent.__TRACEVANE_XSS = 'preview-onerror'">
</div>
```
