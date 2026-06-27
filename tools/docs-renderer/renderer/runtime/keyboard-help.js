const shortcuts = [
  ['Ctrl / ⌘ + K', '聚焦文档搜索'],
  ['Enter', '搜索框中跳到下一处命中'],
  ['Shift + Enter', '搜索框中跳到上一处命中'],
  ['Alt + ↓ / ↑', '跳到下一 / 上一章节'],
  ['Enter / Space', '聚焦富内容块时打开工具栏'],
  ['Esc', '关闭弹层、设置面板或清空搜索'],
  ['?', '打开 / 关闭快捷键帮助'],
];

function isTypingTarget(target) {
  return target && target.closest && target.closest('input, textarea, select, [contenteditable="true"]');
}

function ensurePanel(toggle) {
  let panel = document.getElementById('keyboard-help-panel');
  if (panel) return panel;
  panel = document.createElement('section');
  panel.id = 'keyboard-help-panel';
  panel.className = 'keyboard-help-panel';
  panel.setAttribute('data-keyboard-help-panel', '');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-label', '快捷键帮助');
  panel.hidden = true;
  panel.innerHTML = '<div class="keyboard-help-panel__head"><strong>快捷键</strong><button type="button" data-keyboard-help-close aria-label="关闭快捷键帮助">×</button></div><dl>' + shortcuts.map(([key, text]) => '<div><dt><kbd>' + key + '</kbd></dt><dd>' + text + '</dd></div>').join('') + '</dl>';
  document.body.appendChild(panel);
  const close = panel.querySelector('[data-keyboard-help-close]');
  close && close.addEventListener('click', () => setOpen(toggle, panel, false));
  return panel;
}

function setOpen(toggle, panel, open) {
  panel.hidden = !open;
  panel.classList.toggle('is-visible', open);
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) {
    window.setTimeout(() => {
      const close = panel.querySelector('[data-keyboard-help-close]');
      close && close.focus({ preventScroll: true });
    }, 0);
  } else if (document.activeElement && panel.contains(document.activeElement)) {
    toggle.focus({ preventScroll: true });
  }
}

export function initKeyboardHelp() {
  const toggle = document.querySelector('[data-keyboard-help-toggle]');
  if (!toggle) return;
  const panel = ensurePanel(toggle);
  const togglePanel = () => setOpen(toggle, panel, panel.hidden);
  toggle.addEventListener('click', togglePanel);
  document.addEventListener('click', (event) => {
    if (panel.hidden || panel.contains(event.target) || toggle.contains(event.target)) return;
    setOpen(toggle, panel, false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey && !isTypingTarget(event.target)) {
      event.preventDefault();
      togglePanel();
      return;
    }
    if (event.key === 'Escape' && !panel.hidden) {
      event.preventDefault();
      setOpen(toggle, panel, false);
    }
  });
}
