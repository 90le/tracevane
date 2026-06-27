import { escapeHtml } from './utils.js';
import { onViewportChange } from './scheduler.js';

function place(popover, anchor) {
  const rect = anchor.getBoundingClientRect();
  const width = popover.offsetWidth || 280;
  const height = popover.offsetHeight || 120;
  const edge = 10;
  const gap = 8;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  let left = clamp(rect.left, edge, window.innerWidth - width - edge);
  let top = rect.bottom + gap;
  if (top + height > window.innerHeight - edge && rect.top - gap - height >= edge) top = rect.top - gap - height;
  popover.style.left = Math.round(left) + 'px';
  popover.style.top = Math.round(clamp(top, edge, window.innerHeight - height - edge)) + 'px';
}

export function initInlineMemos() {
  const memos = Array.from(document.querySelectorAll('main .inline-memo[data-inline-memo-content]'));
  if (!memos.length) return;
  const popover = document.createElement('div');
  popover.className = 'inline-memo-popover';
  popover.hidden = true;
  popover.setAttribute('role', 'tooltip');
  document.body.appendChild(popover);
  let current = null;
  let hideTimer = 0;
  const show = (memo) => {
    window.clearTimeout(hideTimer);
    current = memo;
    popover.innerHTML = '<div class="inline-memo-popover__label">Memo</div><p>' + escapeHtml(memo.dataset.inlineMemoContent || '') + '</p>';
    popover.hidden = false;
    place(popover, memo);
  };
  const hide = () => {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (popover.matches(':hover') || (current && current.matches(':hover'))) return;
      popover.hidden = true;
      current = null;
    }, 120);
  };
  memos.forEach((memo) => {
    memo.addEventListener('mouseenter', () => show(memo));
    memo.addEventListener('focusin', () => show(memo));
    memo.addEventListener('mouseleave', hide);
    memo.addEventListener('focusout', hide);
  });
  popover.addEventListener('mouseenter', () => window.clearTimeout(hideTimer));
  popover.addEventListener('mouseleave', hide);
  onViewportChange(() => {
    if (!popover.hidden && current) place(popover, current);
  });
}
