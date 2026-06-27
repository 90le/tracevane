import { copyText, flashButton, showDocFeedback } from './clipboard.js';
import { createToolButton, escapeHtml, readCodeLanguage } from './utils.js';


const wrapPreferenceKey = 'tracevane-docs-code-wrap';

function readWrapPreference() {
  try {
    return localStorage.getItem(wrapPreferenceKey) === 'true';
  } catch {
    return false;
  }
}

function writeWrapPreference(value) {
  try {
    localStorage.setItem(wrapPreferenceKey, value ? 'true' : 'false');
  } catch {}
}

function getSelectedTextWithin(root) {
  const selection = window.getSelection && window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return '';
  const range = selection.getRangeAt(0);
  const start = range.startContainer && (range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement);
  const end = range.endContainer && (range.endContainer.nodeType === Node.ELEMENT_NODE ? range.endContainer : range.endContainer.parentElement);
  if (!root.contains(start) && !root.contains(end)) return '';
  return selection.toString();
}

function flashState(button, state) {
  button.dataset.copyState = state;
  window.setTimeout(() => delete button.dataset.copyState, 1400);
}

async function copySelection(button, wrapper) {
  const selected = getSelectedTextWithin(wrapper).trimEnd();
  if (!selected) {
    flashState(button, 'error');
    showDocFeedback('复制失败，请先选择代码', 'error');
    return false;
  }
  try {
    const ok = await copyText(selected);
    flashState(button, ok ? 'copied' : 'error');
    showDocFeedback(ok ? '已复制选区' : '复制失败，请手动选择', ok ? 'success' : 'error');
    return ok;
  } catch {
    flashState(button, 'error');
    showDocFeedback('复制失败，请手动选择', 'error');
    return false;
  }
}

const keywordGroups = {
  javascript: ['await', 'async', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default', 'export', 'extends', 'finally', 'for', 'from', 'function', 'if', 'import', 'let', 'new', 'return', 'switch', 'throw', 'try', 'typeof', 'var', 'while', 'yield'],
  typescript: ['await', 'async', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default', 'export', 'extends', 'finally', 'for', 'from', 'function', 'if', 'implements', 'import', 'interface', 'let', 'new', 'private', 'protected', 'public', 'readonly', 'return', 'switch', 'throw', 'try', 'type', 'typeof', 'var', 'while', 'yield'],
  python: ['and', 'as', 'async', 'await', 'break', 'class', 'continue', 'def', 'elif', 'else', 'except', 'False', 'finally', 'for', 'from', 'if', 'import', 'in', 'is', 'lambda', 'None', 'not', 'or', 'pass', 'raise', 'return', 'True', 'try', 'while', 'with', 'yield'],
  shell: ['case', 'do', 'done', 'elif', 'else', 'esac', 'export', 'fi', 'for', 'function', 'if', 'in', 'local', 'then', 'while'],
  css: ['align-items', 'background', 'border', 'color', 'display', 'flex', 'font', 'gap', 'grid', 'height', 'justify-content', 'margin', 'padding', 'position', 'transform', 'transition', 'width'],
  sql: ['select', 'from', 'where', 'join', 'left', 'right', 'inner', 'outer', 'on', 'group', 'by', 'order', 'insert', 'into', 'update', 'delete', 'create', 'table', 'alter', 'drop', 'and', 'or', 'not', 'null', 'as', 'limit', 'having'],
  dockerfile: ['from', 'run', 'cmd', 'label', 'maintainer', 'expose', 'env', 'add', 'copy', 'entrypoint', 'volume', 'user', 'workdir', 'arg', 'onbuild', 'stopsignal', 'healthcheck', 'shell'],
};

function languageKey(language) {
  const value = String(language || '').toLowerCase();
  if (value.includes('typescript') || value === 'ts' || value === 'tsx') return 'typescript';
  if (value.includes('javascript') || value === 'js' || value === 'jsx') return 'javascript';
  if (value.includes('python') || value === 'py') return 'python';
  if (value.includes('shell') || value.includes('bash') || value === 'sh' || value === 'zsh') return 'shell';
  if (value.includes('json')) return 'json';
  if (value.includes('css') || value === 'scss' || value === 'sass') return 'css';
  if (value.includes('html') || value === 'xml' || value === 'svg' || value === 'vue') return 'html';
  if (value.includes('yaml') || value === 'yml') return 'yaml';
  if (value.includes('sql')) return 'sql';
  if (value.includes('dockerfile')) return 'dockerfile';
  if (value.includes('diff') || value.includes('patch')) return 'diff';
  if (value.includes('toml') || value.includes('ini')) return 'toml';
  if (value.includes('markdown') || value === 'md') return 'markdown';
  return '';
}

function highlightLine(line, language) {
  const lineEnd = String.fromCharCode(36);
  const key = languageKey(language);
  const placeholders = [];
  const encodeIndex = (index) => {
    let value = index + 1;
    let encoded = '';
    while (value > 0) {
      value -= 1;
      encoded = String.fromCharCode(65 + (value % 26)) + encoded;
      value = Math.floor(value / 26);
    }
    return encoded;
  };
  const decodeIndex = (encoded) => encoded.split('').reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
  const token = (markup) => '\uE000' + encodeIndex(placeholders.push(markup) - 1) + '\uE001';
  const restore = (value) => value.replace(/\uE000([A-Z]+)\uE001/g, (_, index) => placeholders[decodeIndex(index)] || '');
  const span = (className, value) => '<span class="code-token ' + className + '">' + value + '</span>';
  let html = escapeHtml(line || ' ');

  if (key === 'html') {
    html = html.replace(/(&lt;\/?)([\w:-]+)/g, (_, prefix, name) => prefix + token(span('code-token--keyword', name)));
    html = html.replace(/\s([\w:-]+)(=)/g, (_, name, suffix) => ' ' + token(span('code-token--property', name)) + suffix);
    html = html.replace(/(&quot;[^&]*(?:&quot;)|'[^']*')/g, (match) => token(span('code-token--string', match)));
    return restore(html);
  }

  if (key === 'diff') {
    if (html.startsWith('+')) return span('code-token--inserted', html);
    if (html.startsWith('-')) return span('code-token--deleted', html);
    if (html.startsWith('@@')) return span('code-token--keyword', html);
    return html;
  }

  if (key === 'json') {
    html = html.replace(/(&quot;[^&]*(?:&quot;))(\s*:)/g, (_, property, suffix) => token(span('code-token--property', property)) + suffix);
  }

  if (key === 'yaml' || key === 'toml') {
    html = html.replace(/^([\s-]*)([A-Za-z0-9_.-]+)(\s*[:=])/, (_, prefix, property, suffix) => prefix + token(span('code-token--property', property)) + suffix);
  }

  if (key === 'markdown') {
    html = html.replace(new RegExp('^(#{1,6}\\s.*)' + lineEnd, 'g'), (match) => token(span('code-token--keyword', match)));
    html = html.replace(/(\[[^\]]+\]\([^\)]+\))/g, (match) => token(span('code-token--string', match)));
  }

  html = html.replace(/(&quot;[^&]*(?:&quot;)|'[^']*'|`[^`]*`)/g, (match) => token(span('code-token--string', match)));
  html = html.replace(new RegExp('(^|\\s)(#[^\\uE000]*)' + lineEnd, 'g'), (_, prefix, comment) => prefix + token(span('code-token--comment', comment)));
  html = html.replace(new RegExp('(//[^\\uE000]*)' + lineEnd, 'g'), (match) => token(span('code-token--comment', match)));
  html = html.replace(/\b(\d+(?:\.\d+)?)\b/g, (match) => token(span('code-token--number', match)));

  if (key === 'json' || key === 'yaml' || key === 'toml') {
    html = html.replace(/\b(true|false|null|yes|no|on|off)\b/gi, (match) => span('code-token--keyword', match));
    return restore(html);
  }

  const keywords = keywordGroups[key] || [];
  if (keywords.length) {
    const flags = ['sql', 'dockerfile', 'css'].includes(key) ? 'gi' : 'g';
    html = html.replace(new RegExp('\\b(' + keywords.join('|') + ')\\b', flags), (match) => span('code-token--keyword', match));
  }
  html = html.replace(/\b([A-Za-z_\u0024][\w\u0024]*)(?=\()/g, (match) => span('code-token--function', match));
  return restore(html);
}

export function initCodeBlocks(openModal) {
  document.querySelectorAll('main pre > code').forEach((code) => {
    const pre = code.parentElement;
    if (!pre || pre.closest('.code-block-wrapper, .diagram-wrap, .chart-wrap, .mindmap-wrap, .html-preview-wrap')) return;
    const container = pre.parentElement && pre.parentElement.classList.contains('sourceCode') ? pre.parentElement : pre;
    if (container.closest('.code-block-wrapper, .diagram-wrap, .chart-wrap, .mindmap-wrap, .html-preview-wrap')) return;
    const source = code.textContent || '';
    const language = readCodeLanguage(pre, code);
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block-wrapper';
    wrapper.dataset.source = source;
    const bar = document.createElement('div');
    bar.className = 'code-block-bar';
    const label = document.createElement('span');
    label.className = 'code-block-language';
    label.textContent = language + ' · ' + source.split('\n').length + ' lines';
    const actions = document.createElement('div');
    actions.className = 'rich-tool-actions';
    const copy = createToolButton('复制全部', '复制整个代码块');
    copy.dataset.copyFormat = 'all';
    copy.addEventListener('click', () => flashButton(copy, source));
    const copySelected = createToolButton('复制选区', '复制当前选中的代码文本');
    copySelected.dataset.copyFormat = 'selection';
    copySelected.addEventListener('click', () => copySelection(copySelected, wrapper));
    const wrap = createToolButton('自动换行', '切换代码自动换行');
    wrap.dataset.wrapToggle = 'true';
    wrap.setAttribute('aria-pressed', 'false');
    const updateWrapState = () => {
      const wrapped = wrapper.classList.contains('is-wrapped');
      wrap.setAttribute('aria-pressed', wrapped ? 'true' : 'false');
      wrap.textContent = wrapped ? '取消换行' : '自动换行';
      wrap.title = wrapped ? '关闭代码自动换行' : '开启代码自动换行';
    };
    if (readWrapPreference()) wrapper.classList.add('is-wrapped');
    wrap.addEventListener('click', () => {
      wrapper.classList.toggle('is-wrapped');
      writeWrapPreference(wrapper.classList.contains('is-wrapped'));
      updateWrapState();
    });
    updateWrapState();
    const sourceButton = createToolButton('源码', '弹出查看源码');
    sourceButton.addEventListener('click', () => openModal(language + ' 源码', '<div class="modal-source-panel"><pre class="modal-code"><code>' + escapeHtml(source) + '</code></pre></div>', source, { viewer: 'source', copyLabel: '复制源码', copyTitle: '复制源码' }));
    actions.append(copy, copySelected, wrap, sourceButton);
    bar.append(label, actions);
    if (source.length && !code.dataset.lineEnhanced) {
      const codeSource = source.endsWith('\n') ? source.slice(0, -1) : source;
      const lines = codeSource.split('\n');
      code.innerHTML = lines.map((line) => '<span class="code-line">' + highlightLine(line, language) + '</span>').join('');
      code.dataset.lineEnhanced = 'true';
    }
    container.replaceWith(wrapper);
    wrapper.append(bar, container);
  });
}
