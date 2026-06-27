import { escapeHtml } from './utils.js';
import { onViewportChange } from './scheduler.js';

function headingLevel(heading) {
  const match = heading && heading.tagName ? heading.tagName.match(/^H([1-6])$/) : null;
  return match ? Number(match[1]) : 6;
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function visibleSvgText(root) {
  const text = Array.from(root.querySelectorAll('svg text, svg tspan'))
    .map((node) => normalizeText(node.textContent))
    .filter(Boolean)
    .join(' ');
  if (text) return text;
  return Array.from(root.querySelectorAll('svg title'))
    .map((node) => normalizeText(node.textContent))
    .filter(Boolean)
    .join(' ');
}

function htmlPreviewText(wrap) {
  const frame = wrap.querySelector('.html-preview-frame');
  try {
    const doc = frame && (frame.contentDocument || (frame.contentWindow && frame.contentWindow.document));
    if (!doc || !doc.body) return '';
    const clone = doc.body.cloneNode(true);
    clone.querySelectorAll('script, style, meta, link, title').forEach((node) => node.remove());
    const text = normalizeText(clone.innerText || clone.textContent);
    if (text) return text;
  } catch {}
  return '';
}

function renderedTextForElement(element) {
  if (!element || element.matches('.rich-floating-toolbar, .table-floating-toolbar, script, style')) return '';
  if (element.matches('.html-preview-source, .chart-source, .mindmap-source')) return '';
  if (element.matches('.html-preview-wrap')) return htmlPreviewText(element);
  if (element.matches('.mindmap-wrap')) return visibleSvgText(element.querySelector('.mindmap-surface') || element);
  if (element.matches('.chart-wrap')) return visibleSvgText(element.querySelector('.chart-surface') || element);
  if (element.matches('.diagram-wrap')) return visibleSvgText(element.querySelector('.mermaid') || element);
  if (element.matches('.table-wrap')) return normalizeText((element.querySelector('table') || element).textContent);

  const clone = element.cloneNode(true);
  clone.querySelectorAll('.html-preview-source, .chart-source, .mindmap-source, .rich-block-toolbar, .rich-floating-toolbar, .table-floating-toolbar, .code-block-bar, .heading-anchor, script, style').forEach((node) => node.remove());
  return normalizeText(clone.textContent);
}

function excerptForHeading(heading) {
  const level = headingLevel(heading);
  const parts = [];
  let node = heading.nextElementSibling;
  while (node && parts.join(' ').length < 520) {
    if (/^H[1-6]$/.test(node.tagName || '') && headingLevel(node) <= level) break;
    const text = renderedTextForElement(node);
    if (text) parts.push(text);
    node = node.nextElementSibling;
  }
  return parts.join(' ').slice(0, 520).trim();
}

function buildIndex() {
  const index = new Map();
  document.querySelectorAll('main :is(h1,h2,h3,h4,h5,h6)[id]').forEach((heading) => {
    const title = (heading.textContent || '').replace(/#$/, '').trim();
    const excerpt = excerptForHeading(heading);
    index.set(heading.id, { title, heading, level: headingLevel(heading) });
  });
  return index;
}

function samePageHash(link) {
  const href = link.getAttribute('href') || '';
  if (!href || href === '#') return '';
  try {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname !== window.location.pathname) return '';
    return decodeURIComponent(url.hash.replace(/^#/, ''));
  } catch {
    if (href.startsWith('#')) return decodeURIComponent(href.slice(1));
  }
  return '';
}

function placePopover(popover, anchor) {
  const rect = anchor.getBoundingClientRect();
  const width = popover.offsetWidth || 320;
  const height = popover.offsetHeight || 160;
  const edge = 10;
  const gap = 10;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  let left = clamp(rect.left, edge, window.innerWidth - width - edge);
  let top = rect.bottom + gap;
  let placement = 'below';
  if (top + height > window.innerHeight - edge && rect.top - gap - height >= edge) {
    top = rect.top - gap - height;
    placement = 'above';
  } else {
    top = clamp(top, edge, window.innerHeight - height - edge);
  }
  popover.dataset.placement = placement;
  popover.style.left = Math.round(left) + 'px';
  popover.style.top = Math.round(top) + 'px';
}

function createPopover() {
  const popover = document.createElement('div');
  popover.className = 'block-ref-popover';
  popover.hidden = true;
  popover.setAttribute('role', 'tooltip');
  document.body.appendChild(popover);
  return popover;
}

export function initBlockReferencePreviews() {
  const references = buildIndex();
  if (!references.size) return;
  const popover = createPopover();
  let hideTimer = 0;
  let currentAnchor = null;

  const hide = () => {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (popover.matches(':hover') || (currentAnchor && currentAnchor.matches(':hover'))) return;
      popover.hidden = true;
      currentAnchor = null;
    }, 120);
  };

  const show = (link) => {
    const id = samePageHash(link);
    const item = id ? references.get(id) : null;
    if (!item) return;
    window.clearTimeout(hideTimer);
    currentAnchor = link;
    popover.innerHTML = '<div class="block-ref-popover__eyebrow">Block reference</div>' +
      '<strong>' + escapeHtml(item.title || id) + '</strong>' +
      '<p>' + escapeHtml(excerptForHeading(item.heading) || '没有可预览的正文内容。') + '</p>' +
      '<span>↵ 跳转到 #' + escapeHtml(id) + '</span>';
    popover.hidden = false;
    placePopover(popover, link);
  };

  document.querySelectorAll('main a[href^="#"], main a[href*=".html#"]').forEach((link) => {
    const id = samePageHash(link);
    if (!id || !references.has(id) || link.dataset.blockRefPreview === 'true') return;
    link.dataset.blockRefPreview = 'true';
    link.classList.add('block-ref-link');
    link.addEventListener('mouseenter', () => show(link));
    link.addEventListener('focusin', () => show(link));
    link.addEventListener('mouseleave', hide);
    link.addEventListener('focusout', hide);
  });

  popover.addEventListener('mouseenter', () => window.clearTimeout(hideTimer));
  popover.addEventListener('mouseleave', hide);
  onViewportChange(() => {
    if (!popover.hidden && currentAnchor) placePopover(popover, currentAnchor);
  });
}
