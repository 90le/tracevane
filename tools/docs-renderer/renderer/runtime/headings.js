import { copyText } from './clipboard.js';

const COPIED_RESET_MS = 1400;

export function initHeadingAnchors() {
  document.querySelectorAll('main :is(h2,h3,h4,h5,h6)[id]').forEach((heading) => {
    if (heading.querySelector('.heading-anchor')) return;
    const anchor = document.createElement('a');
    anchor.className = 'heading-anchor';
    anchor.href = '#' + encodeURIComponent(heading.id);
    anchor.setAttribute('aria-label', '复制标题链接');
    anchor.setAttribute('title', '复制标题链接');
    anchor.textContent = '#';
    let resetTimer = 0;
    anchor.addEventListener('click', async (event) => {
      event.preventDefault();
      const href = window.location.href.split('#')[0] + '#' + heading.id;
      try {
        await copyText(href);
        anchor.dataset.copyState = 'copied';
        anchor.textContent = '✓';
        anchor.setAttribute('aria-label', '标题链接已复制');
        anchor.setAttribute('title', '已复制');
        window.clearTimeout(resetTimer);
        resetTimer = window.setTimeout(() => {
          delete anchor.dataset.copyState;
          anchor.textContent = '#';
          anchor.setAttribute('aria-label', '复制标题链接');
          anchor.setAttribute('title', '复制标题链接');
        }, COPIED_RESET_MS);
      } catch {
        anchor.dataset.copyState = 'error';
        anchor.textContent = '!';
        anchor.setAttribute('aria-label', '复制失败');
        anchor.setAttribute('title', '复制失败');
      }
      history.replaceState(null, '', '#' + heading.id);
    });
    heading.appendChild(anchor);
  });
}
