export const labels = {
  bash: 'Shell', sh: 'Shell', shell: 'Shell', zsh: 'Shell', fish: 'Shell',
  js: 'JavaScript', jsx: 'JavaScript JSX', mjs: 'JavaScript', cjs: 'JavaScript',
  ts: 'TypeScript', tsx: 'TypeScript TSX', py: 'Python', python: 'Python',
  vue: 'Vue', html: 'HTML', css: 'CSS', scss: 'SCSS', json: 'JSON', jsonc: 'JSONC',
  yaml: 'YAML', yml: 'YAML', toml: 'TOML', md: 'Markdown', markdown: 'Markdown',
  mermaid: 'Mermaid', sql: 'SQL', dockerfile: 'Dockerfile', diff: 'Diff', patch: 'Patch',
  text: 'Text', txt: 'Text', chart: 'Chart'
};

export function normalizeCodeLanguage(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Code';
  return labels[normalized] || normalized.split(/[-_]/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

export function readCodeLanguage(pre, code) {
  const className = (code && code.className ? code.className : '') + ' ' + (pre && pre.className ? pre.className : '');
  const languageMatch = className.match(/language-([^\s]+)/) || className.match(/sourceCode\s+([^\s]+)/);
  return normalizeCodeLanguage(languageMatch ? languageMatch[1] : '');
}

export function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function createToolButton(label, title) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'rich-tool-button';
  button.textContent = label;
  if (title) button.setAttribute('aria-label', title);
  return button;
}
