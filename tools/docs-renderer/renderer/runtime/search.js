import { escapeHtml } from './utils.js';

const SEARCHABLE_SELECTOR = 'main :is(p,li,td,th,blockquote,figcaption,summary,h1,h2,h3,h4,h5,h6,pre,code,.code-line,.html-preview-source,.chart-source)';
const EXCLUDED_SELECTOR = 'script,style,textarea,.heading-anchor,.rich-block-toolbar,.rich-floating-toolbar,.table-floating-toolbar';

function normalize(value) {
  return String(value || '').trim();
}

function readSearchIndex() {
  const node = document.getElementById('tracevane-search-index');
  if (!node) return [];
  try {
    const parsed = JSON.parse(node.textContent || '{}');
    return Array.isArray(parsed.documents) ? parsed.documents : [];
  } catch {
    return [];
  }
}

function makeSnippet(text, index, length) {
  const start = Math.max(0, index - 42);
  const end = Math.min(text.length, index + length + 82);
  const before = escapeHtml(text.slice(start, index));
  const hit = escapeHtml(text.slice(index, index + length));
  const after = escapeHtml(text.slice(index + length, end));
  return (start > 0 ? '…' : '') + before + '<mark class="doc-search-hit doc-search-hit--inline">' + hit + '</mark>' + after + (end < text.length ? '…' : '');
}

function collectPageMatches(query) {
  if (!query) return [];
  const needle = query.toLocaleLowerCase();
  const matches = [];
  document.querySelectorAll(SEARCHABLE_SELECTOR).forEach((node) => {
    if (node.closest(EXCLUDED_SELECTOR)) return;
    const text = node.textContent || '';
    const index = text.toLocaleLowerCase().indexOf(needle);
    if (index === -1) return;
    matches.push({ node, text, index });
  });
  return matches;
}

function getPreviewDocument(frame) {
  try {
    return frame && (frame.contentDocument || (frame.contentWindow && frame.contentWindow.document));
  } catch {
    return null;
  }
}

function collectPreviewMatches(query) {
  if (!query) return [];
  const needle = query.toLocaleLowerCase();
  const matches = [];
  document.querySelectorAll('.html-preview-frame').forEach((frame) => {
    const doc = getPreviewDocument(frame);
    const body = doc && doc.body;
    const text = body ? body.textContent || '' : '';
    const index = text.toLocaleLowerCase().indexOf(needle);
    if (index === -1) return;
    matches.push({ frame, doc, node: body, text, index, preview: true });
  });
  return matches;
}

function collectDocumentMatches(query, currentHref) {
  const needle = query.toLocaleLowerCase();
  return readSearchIndex().map((doc) => {
    const haystack = String((doc.title || '') + ' ' + (doc.path || '') + ' ' + (doc.text || ''));
    const index = haystack.toLocaleLowerCase().indexOf(needle);
    if (index === -1) return null;
    return {
      title: doc.title || doc.path || 'Untitled',
      href: doc.href || '#',
      path: doc.path || '',
      current: (doc.href || '').split('#')[0] === currentHref,
      snippet: makeSnippet(haystack, index, query.length),
    };
  }).filter(Boolean).slice(0, 20);
}

function markNodeText(node, query) {
  const text = node.textContent || '';
  if (!text || !query) return;
  const lower = text.toLocaleLowerCase();
  const needle = query.toLocaleLowerCase();
  const index = lower.indexOf(needle);
  if (index === -1) return;
  const before = text.slice(0, index);
  const hit = text.slice(index, index + query.length);
  const after = text.slice(index + query.length);
  const mark = document.createElement('mark');
  mark.className = 'doc-search-hit';
  mark.textContent = hit;
  const fragment = document.createDocumentFragment();
  if (before) fragment.append(document.createTextNode(before));
  fragment.append(mark);
  if (after) fragment.append(document.createTextNode(after));
  node.replaceWith(fragment);
}

function highlightElement(element, query) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent || !node.textContent.trim()) return NodeFilter.FILTER_REJECT;
      if (node.parentElement && node.parentElement.closest(EXCLUDED_SELECTOR)) return NodeFilter.FILTER_REJECT;
      return node.textContent.toLocaleLowerCase().includes(query.toLocaleLowerCase())
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => markNodeText(node, query));
}

function clearHighlights() {
  const clearRoot = (root) => {
    root.querySelectorAll('mark.doc-search-hit:not(.doc-search-hit--inline)').forEach((mark) => {
      mark.replaceWith(root.createTextNode ? root.createTextNode(mark.textContent || '') : document.createTextNode(mark.textContent || ''));
    });
    root.querySelectorAll('.doc-search-active').forEach((node) => node.classList.remove('doc-search-active'));
    root.body ? root.body.normalize() : document.body.normalize();
  };
  clearRoot(document);
  document.querySelectorAll('.html-preview-frame').forEach((frame) => {
    const doc = getPreviewDocument(frame);
    if (doc) clearRoot(doc);
  });
}

export function initSearch() {
  const form = document.querySelector('[data-doc-search]');
  const input = form && form.querySelector('input[type="search"]');
  const status = form && form.querySelector('[data-doc-search-status]');
  const clear = form && form.querySelector('[data-doc-search-clear]');
  const prevButton = form && form.querySelector('[data-doc-search-prev]');
  const nextButton = form && form.querySelector('[data-doc-search-next]');
  const results = form && form.querySelector('[data-doc-search-results]');
  if (!form || !input) return;
  if (status && !status.id) status.id = 'doc-search-status';
  if (results && !results.id) results.id = 'doc-search-results';
  input.setAttribute('aria-describedby', [status && status.id, results && results.id].filter(Boolean).join(' '));
  input.setAttribute('aria-controls', results && results.id ? results.id : '');

  let lastQuery = '';
  let activeIndex = 0;
  let activeHits = [];

  const currentHref = location.pathname.split('/').pop() || 'index.html';
  const storageKey = 'tracevane-docs-search-query';


  const setNavState = () => {
    const enabled = activeHits.length > 0;
    if (prevButton) prevButton.disabled = !enabled;
    if (nextButton) nextButton.disabled = !enabled;
  };

  const setActiveHit = (index) => {
    if (!activeHits.length) {
      setNavState();
      return;
    }
    activeHits[activeIndex] && activeHits[activeIndex].mark.classList.remove('doc-search-active');
    activeIndex = (index + activeHits.length) % activeHits.length;
    const active = activeHits[activeIndex];
    active.mark.classList.add('doc-search-active');
    active.target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (status && lastQuery) {
      const docCount = results ? results.querySelectorAll('.doc-search-result').length : 0;
      status.textContent = '当前页 ' + activeHits.length + ' 处（第 ' + (activeIndex + 1) + ' 处）；全站 ' + docCount + ' 个文档';
    }
    setNavState();
  };

  const renderResults = (query) => {
    if (!results) return;
    const docs = query ? collectDocumentMatches(query, currentHref) : [];
    results.innerHTML = docs.map((doc) => '<a role="listitem" class="doc-search-result" href="' + escapeHtml(doc.href) + '" data-search-carry="' + escapeHtml(query) + '"><strong>' + escapeHtml(doc.title) + '</strong><span>' + doc.snippet + '</span></a>').join('');
    results.querySelectorAll('[data-search-carry]').forEach((link) => {
      link.addEventListener('click', () => sessionStorage.setItem(storageKey, link.dataset.searchCarry || ''));
    });
  };

  const render = () => {
    const query = normalize(input.value);
    clearHighlights();
    activeIndex = 0;
    activeHits = [];
    setNavState();
    lastQuery = query;
    if (query) sessionStorage.setItem(storageKey, query);
    else sessionStorage.removeItem(storageKey);
    renderResults(query);
    if (!query) {
      if (status) status.textContent = '搜索站点和本文';
      if (results) results.setAttribute('aria-busy', 'false');
      document.body.classList.remove('doc-searching');
      setNavState();
      return;
    }
    document.body.classList.add('doc-searching');
    if (results) results.setAttribute('aria-busy', 'true');
    collectPageMatches(query).forEach((match) => highlightElement(match.node, query));
    collectPreviewMatches(query).forEach((match) => highlightElement(match.node, query));
    const highlights = Array.from(document.querySelectorAll('main mark.doc-search-hit'));
    const previewHighlights = Array.from(document.querySelectorAll('.html-preview-frame')).flatMap((frame) => {
      const doc = getPreviewDocument(frame);
      return doc ? Array.from(doc.querySelectorAll('mark.doc-search-hit')).map((mark) => ({ mark, frame })) : [];
    });
    const docCount = results ? results.querySelectorAll('.doc-search-result').length : 0;
    if (results) results.setAttribute('aria-busy', 'false');
    if (!highlights.length && !previewHighlights.length && !docCount) {
      if (status) status.innerHTML = '未找到：<strong>' + escapeHtml(query) + '</strong>';
      return;
    }
    activeHits = highlights.map((mark) => ({ mark, target: mark })).concat(previewHighlights.map((item) => ({ mark: item.mark, target: item.frame })));
    setActiveHit(0);
    if (status) status.textContent = '当前页 ' + activeHits.length + ' 处（第 ' + (activeIndex + 1) + ' 处）；全站 ' + docCount + ' 个文档';
  };

  const jump = (direction = 1) => {
    if (!activeHits.length) {
      const mainHighlights = Array.from(document.querySelectorAll('main mark.doc-search-hit')).map((mark) => ({ mark, target: mark }));
      const previewHighlights = Array.from(document.querySelectorAll('.html-preview-frame')).flatMap((frame) => {
        const doc = getPreviewDocument(frame);
        return doc ? Array.from(doc.querySelectorAll('mark.doc-search-hit')).map((mark) => ({ mark, target: frame })) : [];
      });
      activeHits = mainHighlights.concat(previewHighlights);
    }
    if (!activeHits.length) return;
    setActiveHit(activeIndex + direction);
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (normalize(input.value) === lastQuery && (document.querySelector('main mark.doc-search-hit') || Array.from(document.querySelectorAll('.html-preview-frame')).some((frame) => { const doc = getPreviewDocument(frame); return doc && doc.querySelector('mark.doc-search-hit'); }))) jump();
    else render();
  });
  input.addEventListener('input', () => window.setTimeout(render, 0));
  if (prevButton) prevButton.addEventListener('click', () => jump(-1));
  if (nextButton) nextButton.addEventListener('click', () => jump(1));
  if (clear) clear.addEventListener('click', () => {
    input.value = '';
    sessionStorage.removeItem(storageKey);
    render();
    input.focus();
  });
  const initialQuery = sessionStorage.getItem(storageKey) || '';
  if (initialQuery) {
    input.value = initialQuery;
    window.setTimeout(render, 80);
  }

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      input.focus();
      input.select();
    }
    if (event.key === 'Enter' && document.activeElement === input && event.shiftKey) {
      event.preventDefault();
      jump(-1);
    }
    if (event.key === 'Escape' && document.body.classList.contains('doc-searching')) {
      input.value = '';
      sessionStorage.removeItem(storageKey);
      render();
    }
  });
}
