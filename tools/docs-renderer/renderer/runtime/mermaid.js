import { escapeHtml } from './utils.js';

const mermaidThemeVariables = (theme) => theme === 'dark'
  ? {
      fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, Arial, sans-serif',
      background: 'transparent',
      mainBkg: '#111c28',
      primaryColor: '#102238',
      primaryTextColor: '#e7edf4',
      primaryBorderColor: '#38bdf8',
      secondaryColor: '#12291f',
      secondaryTextColor: '#e7edf4',
      tertiaryColor: '#2b1c10',
      tertiaryTextColor: '#f8fafc',
      lineColor: '#93a4b8',
      textColor: '#e7edf4',
      nodeTextColor: '#e7edf4',
      labelTextColor: '#e7edf4',
      edgeLabelBackground: '#111c28',
      clusterBkg: '#0f1722',
      clusterBorder: '#3a5068',
      noteBkgColor: '#2b230d',
      noteTextColor: '#f8fafc',
      noteBorderColor: '#f59e0b',
      actorBkg: '#111c28',
      actorTextColor: '#e7edf4',
      actorBorder: '#38bdf8',
      signalColor: '#e7edf4',
      signalTextColor: '#e7edf4',
      loopTextColor: '#e7edf4',
      activationBkgColor: '#1f3a4a',
      activationBorderColor: '#38bdf8'
    }
  : {
      fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, Arial, sans-serif',
      background: 'transparent',
      mainBkg: '#eff6ff',
      primaryColor: '#eff6ff',
      primaryTextColor: '#0f172a',
      primaryBorderColor: '#2563eb',
      secondaryColor: '#f0fdf4',
      secondaryTextColor: '#0f172a',
      tertiaryColor: '#fff7ed',
      tertiaryTextColor: '#0f172a',
      lineColor: '#64748b',
      textColor: '#0f172a',
      nodeTextColor: '#0f172a',
      labelTextColor: '#0f172a',
      edgeLabelBackground: '#ffffff',
      clusterBkg: '#f8fafc',
      clusterBorder: '#cbd5e1',
      noteBkgColor: '#fef3c7',
      noteTextColor: '#111827',
      noteBorderColor: '#f59e0b',
      actorBkg: '#eff6ff',
      actorTextColor: '#0f172a',
      actorBorder: '#2563eb',
      signalColor: '#0f172a',
      signalTextColor: '#0f172a',
      loopTextColor: '#0f172a',
      activationBkgColor: '#dbeafe',
      activationBorderColor: '#2563eb'
    };

const currentTheme = () => document.documentElement.dataset.theme || (
  window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
);

const configureMermaid = (mermaid, theme = currentTheme()) => {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    themeVariables: mermaidThemeVariables(theme)
  });
};

const resetDiagramSources = () => {
  document.querySelectorAll('.diagram-wrap').forEach((wrap) => {
    const diagram = wrap.querySelector('.mermaid');
    if (!diagram) return;
    const source = wrap.dataset.source || diagram.textContent || '';
    wrap.dataset.source = source;
    diagram.removeAttribute('data-processed');
    diagram.innerHTML = escapeHtml(source);
  });
};

const renderDiagrams = async (mermaid) => {
  const nodes = Array.from(document.querySelectorAll('.diagram-wrap .mermaid'));
  if (!nodes.length) return;
  resetDiagramSources();
  await mermaid.run({ nodes });
};

export async function initMermaidRuntime() {
  const mode = document.body && document.body.dataset ? document.body.dataset.mermaidMode : 'cdn';
  if (mode === 'disabled') {
    document.querySelectorAll('.diagram-wrap').forEach((wrap) => {
      wrap.classList.add('diagram-wrap--disabled');
      const note = document.createElement('div');
      note.className = 'diagram-disabled-note';
      note.textContent = 'Mermaid rendering disabled; source is shown for offline review.';
      wrap.appendChild(note);
    });
    return;
  }
  const mermaid = mode === 'local' && window.__TRACEVANE_MERMAID__
    ? window.__TRACEVANE_MERMAID__
    : (await import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs')).default;

  let renderTimer = 0;
  const scheduleRender = () => {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(() => {
      configureMermaid(mermaid);
      renderDiagrams(mermaid).catch((error) => console.warn('Failed to render themed Mermaid diagrams', error));
    }, 40);
  };

  configureMermaid(mermaid);
  await renderDiagrams(mermaid);
  window.addEventListener('tracevane:themechange', scheduleRender);
}
