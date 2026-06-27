import { flashButton, showDocFeedback } from './clipboard.js';
import { createToolButton, escapeHtml } from './utils.js';
import { onViewportChange, rafThrottle, whenVisible } from './scheduler.js';

const htmlPreviewCsp = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'none'; base-uri 'none'; form-action 'none'; img-src data: https: http:; media-src data: https: http:; font-src data:; style-src 'unsafe-inline';\">";
const htmlPreviewBaseStyle = htmlPreviewCsp + '<style>:root{color-scheme:light;--tv-html-ink:#0f172a;--tv-html-muted:#475569;--tv-html-line:#d7e0ea;--tv-html-link:#0369a1;--tv-html-heading:#0f172a;--tv-html-soft:rgba(248,250,252,.86)}html{overflow:auto;max-width:100%}body{overflow:auto;overflow-x:hidden;width:100%;max-width:100%;margin:0;padding:16px;color:var(--tv-html-ink);background:transparent;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Arial,sans-serif;line-height:1.6}body,div,p,li,td,th,span,section,article{color:inherit}h1,h2,h3,h4,h5,h6,strong,b{color:var(--tv-html-heading)}small,figcaption,caption{color:var(--tv-html-muted)}a{color:var(--tv-html-link)}*{box-sizing:border-box;max-width:100%}pre,code{white-space:pre-wrap;overflow-wrap:anywhere}pre{background:var(--tv-html-soft);border-radius:10px;padding:10px}img,svg,canvas,video{max-width:100%;height:auto}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid var(--tv-html-line);padding:6px 8px}mark.doc-search-hit{border-radius:4px;background:#fde68a;color:#111827;box-shadow:0 0 0 2px rgba(253,230,138,.36)}mark.doc-search-active{background:#fb923c;color:#111827}html[data-theme=dark]{color-scheme:dark;--tv-html-ink:#e7edf4;--tv-html-muted:#a8b6c7;--tv-html-line:#334155;--tv-html-link:#67e8f9;--tv-html-heading:#f8fafc;--tv-html-soft:rgba(15,23,42,.72)}html[data-theme=light]{color-scheme:light}</style>';
const htmlPreviewModalGuardStyle = '<style>html,body{width:100%!important;max-width:100%!important;overflow-x:hidden!important}*,*::before,*::after{max-width:100%!important;box-sizing:border-box!important}pre,code{white-space:pre-wrap!important;overflow-wrap:anywhere!important}img,svg,canvas,video{max-width:100%!important;height:auto!important}table{width:100%;table-layout:auto}</style>';


function downloadTextFile(filename, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function slugifyName(value, fallback) {
  return String(value || fallback || 'tracevane-export')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+/, '').replace(new RegExp('-+' + String.fromCharCode(36)), '') || fallback || 'tracevane-export';
}


let activeFloatingToolbar = null;

function attachFloatingToolbar(anchor, toolbar, options = {}) {
  if (!anchor || !toolbar || toolbar.dataset.floatingReady === 'true') return;
  toolbar.dataset.floatingReady = 'true';
  toolbar.classList.add('rich-floating-toolbar');
  if (options.className) toolbar.classList.add(options.className);
  toolbar.hidden = true;
  toolbar.setAttribute('role', 'toolbar');
  if (options.label) toolbar.setAttribute('aria-label', options.label);
  if (!anchor.hasAttribute('tabindex')) anchor.tabIndex = 0;
  if (!anchor.getAttribute('aria-label') && options.anchorLabel) anchor.setAttribute('aria-label', options.anchorLabel);
  anchor.dataset.richToolbarAnchor = 'true';
  document.body.appendChild(toolbar);

  let hideTimer = 0;
  let suppressFocusUntil = 0;
  const isConnected = () => document.body.contains(toolbar) && document.body.contains(anchor);
  const place = () => {
    if (!isConnected()) return;
    toolbar.hidden = false;
    toolbar.style.opacity = '0';
    const rect = anchor.getBoundingClientRect();
    const contentRoot = anchor.closest('main') || document.querySelector('main') || anchor.closest('.document') || document.body;
    const contentRect = contentRoot.getBoundingClientRect();
    const width = toolbar.offsetWidth || 180;
    const height = toolbar.offsetHeight || 24;
    const gap = options.gap || 12;
    const edge = 8;
    const toc = document.querySelector('.toc-panel');
    const tocRect = toc ? toc.getBoundingClientRect() : null;
    const leftRailMin = tocRect && tocRect.width > 0 && tocRect.right > edge ? tocRect.right + edge : edge;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    let left;
    let top = clamp(rect.top + 2, edge, window.innerHeight - height - edge);
    let placement = 'viewport-rail';

    // Always prefer a body-level side rail outside the article column. The
    // toolbar must never become an in-content overlay or reserve layout space.
    if (contentRect.right + gap + width <= window.innerWidth - edge) {
      left = contentRect.right + gap;
      placement = 'outside-content-right';
    } else if (contentRect.left - gap - width >= leftRailMin) {
      left = contentRect.left - gap - width;
      placement = 'outside-content-left';
    } else if (rect.right + gap + width <= window.innerWidth - edge && rect.right <= contentRect.right + 1) {
      left = rect.right + gap;
      placement = 'outside-block-right';
    } else if (rect.left - gap - width >= leftRailMin && rect.left >= contentRect.left - 1) {
      left = rect.left - gap - width;
      placement = 'outside-block-left';
    } else if (rect.top - gap - height >= edge) {
      left = clamp(rect.right - width, edge, window.innerWidth - width - edge);
      top = rect.top - gap - height;
      placement = 'outside-block-above';
    } else if (rect.bottom + gap + height <= window.innerHeight - edge) {
      left = clamp(rect.right - width, edge, window.innerWidth - width - edge);
      top = rect.bottom + gap;
      placement = 'outside-block-below';
    } else {
      // Last-resort narrow viewport fallback: dock to the viewport rail. This
      // remains fixed and non-flow; CSS renders it as a tiny glass capsule.
      left = window.innerWidth - width - edge;
      top = clamp(rect.top + 2, edge, window.innerHeight - height - edge);
    }

    toolbar.dataset.placement = placement;
    toolbar.style.left = Math.round(left) + 'px';
    toolbar.style.top = Math.round(top) + 'px';
    toolbar.style.opacity = '1';
  };
  const show = () => {
    if (Date.now() < suppressFocusUntil) return;
    window.clearTimeout(hideTimer);
    if (activeFloatingToolbar && activeFloatingToolbar !== toolbar) {
      activeFloatingToolbar.hidden = true;
      activeFloatingToolbar.style.opacity = '0';
    }
    activeFloatingToolbar = toolbar;
    place();
    // Mouse hover may force Playwright/browser scrollIntoView before layout settles
    // on very tall rich blocks. Re-place across the next frames so the body-level
    // toolbar remains outside the rendered content instead of keeping a stale x/y.
    window.requestAnimationFrame(() => {
      place();
      window.requestAnimationFrame(place);
    });
    window.setTimeout(place, 90);
  };
  const hide = () => {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (toolbar.matches(':hover') || anchor.matches(':hover') || toolbar.contains(document.activeElement) || anchor.contains(document.activeElement)) return;
      toolbar.hidden = true;
      toolbar.style.opacity = '0';
    }, 120);
  };
  const onKeyDown = (event) => {
    if (event.key === 'Escape' && activeFloatingToolbar === toolbar) {
      suppressFocusUntil = Date.now() + 220;
      toolbar.hidden = true;
      toolbar.style.opacity = '0';
      activeFloatingToolbar = null;
      anchor.focus({ preventScroll: true });
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && event.target === anchor) {
      event.preventDefault();
      show();
      const first = toolbar.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (first && first.focus) first.focus({ preventScroll: true });
    }
  };

  anchor.addEventListener('mouseenter', show);
  anchor.addEventListener('focusin', show);
  anchor.addEventListener('mouseleave', hide);
  anchor.addEventListener('focusout', hide);
  anchor.addEventListener('keydown', onKeyDown);
  toolbar.addEventListener('mouseenter', show);
  toolbar.addEventListener('mouseleave', hide);
  toolbar.addEventListener('focusout', hide);
  toolbar.addEventListener('keydown', onKeyDown);
  onViewportChange(() => { if (!toolbar.hidden) place(); });
}
function serializeSvg(svg) {
  const clone = svg.cloneNode(true);
  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (!clone.getAttribute('xmlns:xlink')) clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
}

function findExportSvg(root) {
  return root && root.querySelector ? root.querySelector('svg') : null;
}

function markButton(button, state) {
  if (!button) return;
  button.dataset.copyState = state;
  showDocFeedback(state === 'copied' ? '已导出' : '导出失败', state === 'copied' ? 'success' : 'error');
  window.setTimeout(() => delete button.dataset.copyState, 1400);
}

function exportSvg(button, svg, filename) {
  if (!svg) {
    markButton(button, 'error');
    return false;
  }
  downloadTextFile(filename, serializeSvg(svg), 'image/svg+xml;charset=utf-8');
  markButton(button, 'copied');
  return true;
}

function exportPng(button, svg, filename) {
  if (!svg) {
    markButton(button, 'error');
    return;
  }
  const source = serializeSvg(svg);
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => {
    const viewBox = svg.viewBox && svg.viewBox.baseVal;
    const rect = viewBox && viewBox.width ? { width: viewBox.width, height: viewBox.height } : svg.getBoundingClientRect();
    const width = Math.max(1, Math.ceil(rect.width || image.naturalWidth || 1200));
    const height = Math.max(1, Math.ceil(rect.height || image.naturalHeight || 800));
    const ratio = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * ratio);
    canvas.height = Math.ceil(height * ratio);
    const context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--doc-paper') || '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    canvas.toBlob((png) => {
      URL.revokeObjectURL(url);
      if (!png) {
        markButton(button, 'error');
        return;
      }
      const pngUrl = URL.createObjectURL(png);
      const link = document.createElement('a');
      link.href = pngUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(pngUrl), 1200);
      markButton(button, 'copied');
    }, 'image/png');
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    markButton(button, 'error');
  };
  image.src = url;
}

export function initMermaidBlocks(openModal) {
  document.querySelectorAll('.diagram-wrap').forEach((wrap, index) => {
    if (wrap.dataset.toolbarReady === 'true') return;
    const diagram = wrap.querySelector('.mermaid');
    if (!diagram) return;
    const source = diagram.textContent || '';
    wrap.dataset.source = source;
    const toolbar = document.createElement('div');
    toolbar.className = 'diagram-toolbar rich-block-toolbar';
    const label = document.createElement('span');
    label.className = 'rich-block-title';
    label.textContent = 'Mermaid · diagram ' + (index + 1);
    const actions = document.createElement('div');
    actions.className = 'rich-tool-actions';
    const copy = createToolButton('复制', '复制 Mermaid 源码');
    copy.addEventListener('click', () => flashButton(copy, source));
    const sourceButton = createToolButton('源码', '查看 Mermaid 源码');
    sourceButton.addEventListener('click', () => openModal('Mermaid 源码', '<div class="modal-source-panel"><pre class="modal-code"><code>' + escapeHtml(source) + '</code></pre></div>', source, { viewer: 'source', copyLabel: '复制源码', copyTitle: '复制源码' }));
    const saveSvg = createToolButton('SVG', '导出 Mermaid SVG');
    saveSvg.dataset.exportFormat = 'svg';
    saveSvg.addEventListener('click', () => exportSvg(saveSvg, findExportSvg(diagram), slugifyName(source.split('\n')[0], 'mermaid-diagram') + '.svg'));
    const savePng = createToolButton('PNG', '导出 Mermaid PNG');
    savePng.dataset.exportFormat = 'png';
    savePng.addEventListener('click', () => exportPng(savePng, findExportSvg(diagram), slugifyName(source.split('\n')[0], 'mermaid-diagram') + '.png'));
    const preview = createToolButton('预览', '弹出图表预览');
    preview.addEventListener('click', () => openModal('Mermaid 预览', '<div class="modal-canvas" data-modal-canvas><div class="modal-canvas-content modal-diagram">' + wrap.querySelector('.mermaid').outerHTML + '</div></div>', source, { viewer: 'canvas', copyLabel: '复制源码', copyTitle: '复制 Mermaid 源码' }));
    actions.append(copy, sourceButton, saveSvg, savePng, preview);
    toolbar.append(label, actions);
    wrap.dataset.toolbarReady = 'true';
    attachFloatingToolbar(wrap, toolbar, { label: 'Mermaid 工具栏', anchorLabel: 'Mermaid 图表，按 Enter 显示工具栏' });
  });
}

export function initHtmlPreviewBlocks(openModal) {
  document.querySelectorAll('.html-preview-wrap').forEach((wrap, index) => {
    const preview = wrap.querySelector('.html-preview-frame');
    const sourceNode = wrap.querySelector('.html-preview-source code');
    const source = sourceNode ? sourceNode.textContent || '' : '';
    const toolbar = wrap.querySelector('.html-preview-toolbar');
    if (preview && !preview.dataset.autoSized) {
      preview.dataset.autoSized = 'true';
      let observer = null;
      const measureHeight = (doc) => {
        if (!doc) return 0;
        const body = doc.body;
        const element = doc.documentElement;
        const children = body ? Array.from(body.children) : [];
        const childBottom = children.reduce((max, child) => {
          const rect = child.getBoundingClientRect();
          return Math.max(max, rect.bottom + (body ? body.scrollTop : 0));
        }, 0);
        const bodyRect = body ? body.getBoundingClientRect().height : 0;
        const intrinsic = Math.max(
          childBottom ? childBottom + 16 : 0,
          bodyRect,
          body ? body.offsetHeight : 0,
          element ? element.offsetHeight : 0,
        );
        const scroll = Math.max(
          body ? body.scrollHeight : 0,
          element ? element.scrollHeight : 0,
        );
        if (intrinsic > 0 && scroll > 3000 && scroll > intrinsic * 2) return Math.ceil(intrinsic);
        return Math.ceil(Math.max(intrinsic, scroll));
      };
      const syncPreviewTheme = () => {
        try {
          const doc = preview.contentWindow ? preview.contentWindow.document : preview.contentDocument;
          if (doc && doc.documentElement) doc.documentElement.dataset.theme = document.documentElement.dataset.theme || 'light';
        } catch {}
      };
      const resize = () => {
        try {
          const doc = preview.contentWindow ? preview.contentWindow.document : preview.contentDocument;
          syncPreviewTheme();
          const height = measureHeight(doc);
          if (height) {
            preview.style.height = 'auto';
            preview.style.minHeight = Math.max(80, height) + 'px';
            preview.dataset.contentHeight = String(height);
          }
        } catch {
          preview.style.minHeight = '320px';
        }
      };
      const scheduleResize = rafThrottle(resize);
      const attachObserver = () => {
        try {
          const doc = preview.contentDocument;
          if (!doc || observer || !('ResizeObserver' in window)) return;
          observer = new ResizeObserver(scheduleResize);
          if (doc.body) observer.observe(doc.body);
          if (doc.documentElement) observer.observe(doc.documentElement);
        } catch {
          observer = null;
        }
      };
      const activateSizing = () => {
        resize();
        attachObserver();
        [80, 240, 600, 1200].forEach((delay) => window.setTimeout(scheduleResize, delay));
      };
      whenVisible(preview, activateSizing, { rootMargin: '900px 0px' });
      preview.addEventListener('load', activateSizing);
      window.addEventListener('tracevane:themechange', () => {
        syncPreviewTheme();
        scheduleResize();
      });
    }
    if (!toolbar || toolbar.dataset.ready) return;
    toolbar.dataset.ready = 'true';
    const actions = document.createElement('div');
    actions.className = 'rich-tool-actions';
    const copy = createToolButton('复制', '复制 HTML 源码');
    copy.addEventListener('click', () => flashButton(copy, source));
    const toggleSource = createToolButton('源码', '切换源码');
    toggleSource.addEventListener('click', () => wrap.classList.toggle('show-source'));
    const full = createToolButton('预览', '弹出 HTML 预览');
    full.addEventListener('click', () => openModal(
      'HTML Preview ' + (index + 1),
      '<div class="modal-canvas modal-canvas--browser" data-modal-canvas><div class="modal-browser-toolbar"><div class="modal-browser-title"><span class="modal-browser-dot"></span><strong>HTML Preview</strong><small data-browser-size>Fluid · auto width</small></div><div class="modal-browser-actions"><button type="button" data-browser-viewport="390">手机</button><button type="button" data-browser-viewport="768">平板</button><button type="button" data-browser-viewport="1280">桌面</button><button type="button" data-browser-viewport="fluid">全宽</button><button type="button" data-browser-copy-info>复制视口</button></div></div><div class="modal-canvas-content modal-browser" data-browser-stage><div class="modal-browser-viewport"><iframe class="html-preview-frame html-preview-frame--modal" sandbox="allow-same-origin" referrerpolicy="no-referrer" scrolling="auto" srcdoc="' + escapeHtml(htmlPreviewBaseStyle + source + htmlPreviewModalGuardStyle) + '"></iframe></div></div></div>',
      source,
      { viewer: 'browser', copyLabel: '复制源码', copyTitle: '复制 HTML 源码' },
    ));
    actions.append(copy, toggleSource, full);
    toolbar.append(actions);
    attachFloatingToolbar(wrap, toolbar, { label: 'HTML 预览工具栏', anchorLabel: 'HTML 预览，按 Enter 显示工具栏' });
  });
}

export function initChartBlocks(openModal) {
  const palette = ['chart-series-0', 'chart-series-1', 'chart-series-2', 'chart-series-3', 'chart-series-4', 'chart-series-5'];
  const number = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const formatNumber = (value) => Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  const normalizeSpec = (source) => {
    const spec = JSON.parse(source);
    const labels = Array.isArray(spec.labels) ? spec.labels.map((item, index) => item == null ? String(index + 1) : String(item)) : [];
    const rawSeries = Array.isArray(spec.series) && spec.series.length ? spec.series : [{ name: 'Value', data: [] }];
    const series = rawSeries.slice(0, 6).map((entry, index) => ({
      name: String(entry && entry.name ? entry.name : 'Series ' + (index + 1)),
      data: Array.isArray(entry && entry.data) ? entry.data.map(number) : [],
    }));
    const length = Math.max(labels.length, ...series.map((entry) => entry.data.length), 1);
    const finalLabels = Array.from({ length }, (_, index) => labels[index] || String(index + 1));
    const finalSeries = series.map((entry) => ({ ...entry, data: Array.from({ length }, (_, index) => number(entry.data[index])) }));
    return {
      title: String(spec.title || finalSeries[0].name || 'Chart'),
      type: String(spec.type || 'bar').toLowerCase(),
      labels: finalLabels,
      series: finalSeries,
      align: String(spec.align || spec.layout || '').toLowerCase(),
    };
  };
  const legend = (series, x, y) => series.map((entry, index) => '<g class="chart-legend-item" transform="translate(' + (x + index * 118) + ' ' + y + ')"><rect width="10" height="10" rx="3" class="' + palette[index % palette.length] + '"></rect><text x="16" y="10">' + escapeHtml(entry.name) + '</text></g>').join('');
  const renderBars = (spec) => {
    const length = spec.labels.length;
    const seriesCount = Math.max(1, spec.series.length);
    const width = Math.max(440, 90 + length * Math.max(76, seriesCount * 24));
    const height = 260;
    const top = 42;
    const bottom = 58;
    const plotHeight = height - top - bottom;
    const max = Math.max(1, ...spec.series.flatMap((entry) => entry.data));
    const groupWidth = (width - 80) / length;
    const barWidth = Math.max(10, Math.min(24, (groupWidth - 18) / seriesCount));
    const bars = spec.labels.map((label, i) => {
      const baseX = 56 + i * groupWidth + (groupWidth - seriesCount * barWidth) / 2;
      const groupBars = spec.series.map((entry, seriesIndex) => {
        const value = number(entry.data[i]);
        const barHeight = Math.max(value > 0 ? 3 : 0, Math.round((value / max) * plotHeight));
        const x = baseX + seriesIndex * barWidth;
        const y = top + plotHeight - barHeight;
        return '<rect class="chart-bar ' + palette[seriesIndex % palette.length] + '" x="' + x + '" y="' + y + '" width="' + Math.max(6, barWidth - 3) + '" height="' + barHeight + '" rx="5"><title>' + escapeHtml(entry.name + ' · ' + label + ': ' + formatNumber(value)) + '</title></rect>';
      }).join('');
      return '<g>' + groupBars + '<text x="' + (56 + i * groupWidth + groupWidth / 2) + '" y="' + (height - 22) + '" text-anchor="middle">' + escapeHtml(label) + '</text></g>';
    }).join('');
    return '<svg class="chart-svg chart-svg--bar" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + escapeHtml(spec.title) + '"><title>' + escapeHtml(spec.title) + '</title><text class="chart-title" x="28" y="26">' + escapeHtml(spec.title) + '</text><line class="chart-axis" x1="44" y1="' + (top + plotHeight) + '" x2="' + (width - 24) + '" y2="' + (top + plotHeight) + '"></line><g class="chart-bars">' + bars + '</g><g class="chart-legend">' + legend(spec.series, 28, height - 12) + '</g></svg>';
  };
  const renderLine = (spec) => {
    const length = spec.labels.length;
    const width = Math.max(460, 100 + length * 84);
    const height = 270;
    const left = 54;
    const right = 28;
    const top = 44;
    const bottom = 62;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const values = spec.series.flatMap((entry) => entry.data);
    const max = Math.max(1, ...values);
    const min = Math.min(0, ...values);
    const range = Math.max(1, max - min);
    const xFor = (i) => left + (length === 1 ? plotWidth / 2 : (i / (length - 1)) * plotWidth);
    const yFor = (value) => top + plotHeight - ((value - min) / range) * plotHeight;
    const lines = spec.series.map((entry, seriesIndex) => {
      const points = entry.data.map((value, i) => xFor(i) + ',' + yFor(number(value))).join(' ');
      const dots = entry.data.map((value, i) => '<circle class="chart-dot ' + palette[seriesIndex % palette.length] + '" cx="' + xFor(i) + '" cy="' + yFor(number(value)) + '" r="4"><title>' + escapeHtml(entry.name + ' · ' + spec.labels[i] + ': ' + formatNumber(number(value))) + '</title></circle>').join('');
      return '<polyline class="chart-line ' + palette[seriesIndex % palette.length] + '" points="' + points + '"></polyline>' + dots;
    }).join('');
    const labels = spec.labels.map((label, i) => '<text x="' + xFor(i) + '" y="' + (height - 30) + '" text-anchor="middle">' + escapeHtml(label) + '</text>').join('');
    return '<svg class="chart-svg chart-svg--line" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + escapeHtml(spec.title) + '"><title>' + escapeHtml(spec.title) + '</title><text class="chart-title" x="28" y="26">' + escapeHtml(spec.title) + '</text><line class="chart-axis" x1="' + left + '" y1="' + (top + plotHeight) + '" x2="' + (width - right) + '" y2="' + (top + plotHeight) + '"></line><g class="chart-lines">' + lines + '</g><g class="chart-labels">' + labels + '</g><g class="chart-legend">' + legend(spec.series, 28, height - 12) + '</g></svg>';
  };
  const renderChart = (wrap, index) => {
    const sourceNode = wrap.querySelector('.chart-source code');
    const surface = wrap.querySelector('.chart-surface');
    if (!sourceNode || !surface) return;
    const source = sourceNode.textContent || '';
    let spec;
    try {
      spec = normalizeSpec(source);
    } catch (error) {
      surface.innerHTML = '<pre class="chart-error">Chart JSON 解析失败：' + escapeHtml(error.message || String(error)) + '</pre>';
      return;
    }
    const chartHtml = spec.type === 'line' ? renderLine(spec) : renderBars(spec);
    wrap.classList.toggle('chart-align-center', spec.align === 'center');
    wrap.classList.toggle('chart-align-right', spec.align === 'right');
    surface.innerHTML = chartHtml;
    const toolbar = wrap.querySelector('.chart-toolbar');
    if (toolbar && !toolbar.dataset.ready) {
      toolbar.dataset.ready = 'true';
      const label = toolbar.querySelector('.rich-block-title');
      if (label) label.textContent = 'Chart · ' + spec.type + ' · ' + spec.series.length + ' series';
      const actions = document.createElement('div');
      actions.className = 'rich-tool-actions';
      const copy = createToolButton('复制', '复制图表数据');
      copy.addEventListener('click', () => flashButton(copy, source));
      const sourceButton = createToolButton('源码', '查看图表源码');
      sourceButton.addEventListener('click', () => openModal('Chart JSON', '<div class="modal-source-panel"><pre class="modal-code"><code>' + escapeHtml(source) + '</code></pre></div>', source, { viewer: 'source', copyLabel: '复制源码', copyTitle: '复制源码' }));
      const saveSvg = createToolButton('SVG', '导出图表 SVG');
      saveSvg.dataset.exportFormat = 'svg';
      saveSvg.addEventListener('click', () => exportSvg(saveSvg, findExportSvg(surface), slugifyName(spec.title, 'chart') + '.svg'));
      const savePng = createToolButton('PNG', '导出图表 PNG');
      savePng.dataset.exportFormat = 'png';
      savePng.addEventListener('click', () => exportPng(savePng, findExportSvg(surface), slugifyName(spec.title, 'chart') + '.png'));
      const full = createToolButton('预览', '弹出图表预览');
      full.addEventListener('click', () => openModal(spec.title || 'Chart Preview', '<div class="modal-canvas" data-modal-canvas><div class="modal-canvas-content modal-chart">' + surface.innerHTML + '</div></div>', source, { viewer: 'canvas', copyLabel: '复制数据', copyTitle: '复制图表数据' }));
      actions.append(copy, sourceButton, saveSvg, savePng, full);
      toolbar.append(actions);
      attachFloatingToolbar(wrap, toolbar, { label: '图表工具栏', anchorLabel: '图表，按 Enter 显示工具栏' });
    }
  };
  document.querySelectorAll('.chart-wrap').forEach(renderChart);
}


function parseMindmapSource(source) {
  const lines = String(source || '').split(/\r?\n/).map((raw) => {
    const leading = (raw.match(/^\s*/) || [''])[0].replace(/\t/g, '  ').length;
    const text = raw.trim().replace(/^[-*+]\s+/, '').replace(/^\d+[.)]\s+/, '').trim();
    return text ? { leading, text } : null;
  }).filter(Boolean);
  const root = { id: 0, text: lines[0] ? lines[0].text : 'Mindmap', level: 0, children: [], parent: null, x: 0, y: 0 };
  if (!lines.length) return root;
  const stack = [{ indent: lines[0].leading, node: root }];
  let id = 1;
  lines.slice(1).forEach((line) => {
    while (stack.length > 1 && line.leading <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].node;
    const node = { id: id++, text: line.text, level: parent.level + 1, children: [], parent, x: 0, y: 0 };
    parent.children.push(node);
    stack.push({ indent: line.leading, node });
  });
  return root;
}

function layoutMindmap(root) {
  const nodes = [];
  const edges = [];
  let leaf = 0;
  let maxDepth = 0;
  const walk = (node, depth) => {
    node.level = depth;
    maxDepth = Math.max(maxDepth, depth);
    if (!node.children.length) {
      node.y = leaf++;
    } else {
      node.children.forEach((child) => {
        edges.push([node, child]);
        walk(child, depth + 1);
      });
      node.y = node.children.reduce((sum, child) => sum + child.y, 0) / node.children.length;
    }
    nodes.push(node);
  };
  walk(root, 0);
  const rowGap = 68;
  const colGap = 210;
  const width = Math.max(520, 160 + (maxDepth + 1) * colGap);
  const height = Math.max(180, 76 + Math.max(1, leaf) * rowGap);
  nodes.forEach((node) => {
    node.x = 42 + node.level * colGap;
    node.cy = 42 + node.y * rowGap;
  });
  return { nodes, edges, width, height };
}

function renderMindmapSvg(source) {
  const root = parseMindmapSource(source);
  const { nodes, edges, width, height } = layoutMindmap(root);
  const nodeHtml = nodes.map((node) => {
    const text = escapeHtml(node.text.length > 34 ? node.text.slice(0, 33) + '…' : node.text);
    const className = node.level === 0 ? 'mindmap-node mindmap-node--root' : 'mindmap-node';
    const nodeWidth = Math.min(190, Math.max(104, node.text.length * 7.2 + 28));
    return '<g class="' + className + '" transform="translate(' + node.x + ' ' + node.cy + ')"><rect x="0" y="-18" width="' + nodeWidth + '" height="36" rx="12"></rect><text x="14" y="5">' + text + '</text><title>' + escapeHtml(node.text) + '</title></g>';
  }).join('');
  const edgeHtml = edges.map(([from, to]) => {
    const fromWidth = Math.min(190, Math.max(104, from.text.length * 7.2 + 28));
    const x1 = from.x + fromWidth;
    const y1 = from.cy;
    const x2 = to.x;
    const y2 = to.cy;
    const mid = Math.max(28, (x2 - x1) / 2);
    return '<path class="mindmap-edge" d="M' + x1 + ',' + y1 + ' C' + (x1 + mid) + ',' + y1 + ' ' + (x2 - mid) + ',' + y2 + ' ' + x2 + ',' + y2 + '"></path>';
  }).join('');
  return '<svg class="mindmap-svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Mindmap"><title>Mindmap</title><g class="mindmap-edges">' + edgeHtml + '</g><g class="mindmap-nodes">' + nodeHtml + '</g></svg>';
}

export function initMindmapBlocks(openModal) {
  document.querySelectorAll('.mindmap-wrap').forEach((wrap, index) => {
    if (wrap.dataset.mindmapReady === 'true') return;
    wrap.dataset.mindmapReady = 'true';
    const sourceNode = wrap.querySelector('.mindmap-source code');
    const surface = wrap.querySelector('.mindmap-surface');
    if (!sourceNode || !surface) return;
    const source = sourceNode.textContent || '';
    surface.innerHTML = renderMindmapSvg(source);
    const toolbar = wrap.querySelector('.mindmap-toolbar');
    if (!toolbar || toolbar.dataset.ready) return;
    toolbar.dataset.ready = 'true';
    const label = toolbar.querySelector('.rich-block-title');
    if (label) label.textContent = 'Mindmap · ' + (index + 1);
    const actions = document.createElement('div');
    actions.className = 'rich-tool-actions';
    const copy = createToolButton('复制', '复制 Mindmap 源码');
    copy.addEventListener('click', () => flashButton(copy, source));
    const sourceButton = createToolButton('源码', '查看 Mindmap 源码');
    sourceButton.addEventListener('click', () => openModal('Mindmap 源码', '<div class="modal-source-panel"><pre class="modal-code"><code>' + escapeHtml(source) + '</code></pre></div>', source, { viewer: 'source', copyLabel: '复制源码', copyTitle: '复制 Mindmap 源码' }));
    const saveSvg = createToolButton('SVG', '导出 Mindmap SVG');
    saveSvg.dataset.exportFormat = 'svg';
    saveSvg.addEventListener('click', () => exportSvg(saveSvg, findExportSvg(surface), slugifyName(source.split('\n')[0], 'mindmap') + '.svg'));
    const savePng = createToolButton('PNG', '导出 Mindmap PNG');
    savePng.dataset.exportFormat = 'png';
    savePng.addEventListener('click', () => exportPng(savePng, findExportSvg(surface), slugifyName(source.split('\n')[0], 'mindmap') + '.png'));
    const full = createToolButton('预览', '弹出 Mindmap 预览');
    full.addEventListener('click', () => openModal('Mindmap 预览', '<div class="modal-canvas" data-modal-canvas><div class="modal-canvas-content modal-mindmap">' + surface.innerHTML + '</div></div>', source, { viewer: 'canvas', copyLabel: '复制源码', copyTitle: '复制 Mindmap 源码' }));
    actions.append(copy, sourceButton, saveSvg, savePng, full);
    toolbar.append(actions);
    attachFloatingToolbar(wrap, toolbar, { label: 'Mindmap 工具栏', anchorLabel: 'Mindmap，按 Enter 显示工具栏' });
  });
}

export function initTables(openModal) {
  document.querySelectorAll('.table-wrap').forEach((wrap, index) => {
    if (wrap.dataset.tableEnhanced === 'true') return;
    wrap.dataset.tableEnhanced = 'true';
    const table = wrap.querySelector('table');
    if (!table) return;
    const rows = () => Array.from(table.rows).map((row) => Array.from(row.cells).map((cell) => (cell.textContent || '').trim().replace(/\s+/g, ' ')));
    const columnCount = () => Math.max(0, ...Array.from(table.rows).map((row) => row.cells.length));
    const rowCount = () => table.rows.length;
    const updateScrollState = () => {
      const tableWidth = table.getBoundingClientRect().width;
      const overflow = Math.max(wrap.scrollWidth, tableWidth) > wrap.clientWidth + 2;
      const maxScroll = Math.max(0, wrap.scrollWidth - wrap.clientWidth);
      wrap.classList.toggle('table-can-scroll', overflow);
      wrap.classList.toggle('table-at-start', !overflow || wrap.scrollLeft <= 2);
      wrap.classList.toggle('table-at-end', !overflow || (maxScroll > 0 && wrap.scrollLeft >= maxScroll - 2));
      wrap.dataset.tableScroll = overflow ? 'horizontal' : 'none';
      wrap.dataset.tableWidth = String(Math.round(tableWidth));
    };
    const scheduleScrollState = rafThrottle(updateScrollState);
    updateScrollState();
    wrap.addEventListener('scroll', scheduleScrollState, { passive: true });
    if ('ResizeObserver' in window) {
      const tableObserver = new ResizeObserver(scheduleScrollState);
      tableObserver.observe(wrap);
      tableObserver.observe(table);
    } else {
      onViewportChange(scheduleScrollState);
    }
    window.setTimeout(scheduleScrollState, 120);
    const toolbar = document.createElement('div');
    toolbar.className = 'table-toolbar table-floating-toolbar rich-block-toolbar';
    toolbar.hidden = true;
    const label = document.createElement('span');
    label.className = 'rich-block-title';
    label.textContent = 'Table · ' + rowCount() + ' rows · ' + columnCount() + ' cols';
    const actions = document.createElement('div');
    actions.className = 'rich-tool-actions';
    const status = document.createElement('span');
    status.className = 'table-copy-status';
    status.setAttribute('aria-live', 'polite');
    status.title = rowCount() + ' 行 · ' + columnCount() + ' 列';
    const toCsv = () => rows().map((row) => row.map((cell) => '"' + cell.replace(/"/g, '""') + '"').join(',')).join('\n');
    const toMarkdown = () => {
      const data = rows();
      if (!data.length) return '';
      const widths = data[0].map((_, column) => Math.max(3, ...data.map((row) => (row[column] || '').length)));
      const line = (row) => '| ' + widths.map((width, column) => (row[column] || '').padEnd(width, ' ')).join(' | ') + ' |';
      return [line(data[0]), '| ' + widths.map((width) => '-'.repeat(width)).join(' | ') + ' |', ...data.slice(1).map(line)].join('\n');
    };
    const copyMd = createToolButton('MD', '复制 Markdown 表格');
    copyMd.dataset.copyFormat = 'markdown';
    copyMd.addEventListener('click', () => flashButton(copyMd, toMarkdown(), { status, successText: '已复制 Markdown 表格' }));
    const copyCsv = createToolButton('CSV', '复制表格 CSV');
    copyCsv.dataset.copyFormat = 'csv';
    copyCsv.addEventListener('click', () => flashButton(copyCsv, toCsv(), { status, successText: '已复制 CSV' }));
    const full = createToolButton('预览', '弹出表格预览');
    full.addEventListener('click', () => openModal('Table Preview ' + (index + 1), '<div class="modal-table-viewer" data-table-rows="' + rowCount() + '" data-table-cols="' + columnCount() + '">' + table.outerHTML + '</div>', toCsv(), { viewer: 'table', copyLabel: '复制 CSV', copyTitle: '复制表格 CSV' }));
    actions.append(copyMd, copyCsv, full);
    toolbar.append(label, status, actions);
    attachFloatingToolbar(wrap, toolbar, { className: 'table-floating-toolbar', label: '表格工具栏', anchorLabel: '表格，按 Enter 显示工具栏' });
  });
}
