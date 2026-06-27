import { escapeHtml } from './utils.js';

function readLinkGraph() {
  const node = document.getElementById('tracevane-link-graph');
  if (!node) return null;
  try {
    const parsed = JSON.parse(node.textContent || '{}');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function renderList(items, emptyText) {
  if (!Array.isArray(items) || !items.length) {
    return '<p class="link-graph-empty">' + escapeHtml(emptyText) + '</p>';
  }
  return '<ul class="link-graph-list">' + items.map((item) => (
    '<li><a href="' + escapeHtml(item.href || '#') + '">' +
    '<span class="link-graph-title">' + escapeHtml(item.title || item.path || 'Untitled') + '</span>' +
    '<span class="link-graph-path">' + escapeHtml(item.path || '') + '</span>' +
    '</a></li>'
  )).join('') + '</ul>';
}

export function initLinkGraph() {
  const graph = readLinkGraph();
  const tocList = document.querySelector('.toc-list');
  if (!graph || !tocList) return;
  const incoming = Array.isArray(graph.incoming) ? graph.incoming : [];
  const outgoing = Array.isArray(graph.outgoing) ? graph.outgoing : [];
  if (!incoming.length && !outgoing.length) return;

  const section = document.createElement('section');
  section.className = 'docs-nav-section link-graph-section';
  section.setAttribute('aria-label', '引用关系');
  section.innerHTML =
    '<details class="link-graph" open>' +
      '<summary>' +
        '<span class="toc-heading">引用关系</span>' +
        '<span class="link-graph-count" aria-label="入链和出链数量">' + incoming.length + ' 入 / ' + outgoing.length + ' 出</span>' +
      '</summary>' +
      '<div class="link-graph-group link-graph-group--incoming">' +
        '<div class="link-graph-label">被这些文档引用</div>' +
        renderList(incoming, '暂无站内入链') +
      '</div>' +
      '<div class="link-graph-group link-graph-group--outgoing">' +
        '<div class="link-graph-label">当前文档引用</div>' +
        renderList(outgoing, '暂无站内出链') +
      '</div>' +
    '</details>';
  tocList.insertBefore(section, tocList.firstElementChild || null);
}
