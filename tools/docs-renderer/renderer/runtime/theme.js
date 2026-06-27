export function initThemeToggle() {
  const root = document.documentElement;
  const button = document.querySelector('[data-theme-toggle]');
  const storageKey = 'tracevane-docs-theme';
  const preferred = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const apply = (theme) => {
    const resolved = theme === 'auto' || !theme ? preferred() : theme;
    root.dataset.theme = resolved;
    root.dataset.themePreference = theme || 'auto';
    root.style.colorScheme = resolved;
    if (button) {
      const label = theme === 'auto' || !theme ? '自动' : (resolved === 'dark' ? '深色' : '浅色');
      button.textContent = label;
      button.dataset.themeState = theme || 'auto';
      button.setAttribute('aria-label', '当前主题：' + label + '，点击切换自动、浅色、深色');
      button.setAttribute('title', '主题：' + label);
    }
    window.dispatchEvent(new CustomEvent('tracevane:themechange', {
      detail: { preference: theme || 'auto', resolved }
    }));
  };
  let current = localStorage.getItem(storageKey) || 'auto';
  apply(current);
  if (button) button.addEventListener('click', () => {
    current = current === 'auto' ? 'light' : (current === 'light' ? 'dark' : 'auto');
    localStorage.setItem(storageKey, current);
    apply(current);
  });
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if ((localStorage.getItem(storageKey) || 'auto') === 'auto') apply('auto');
    });
  }
}
