import { onViewportChange, rafThrottle } from './scheduler.js';
export function initReadingProgress() {
  const bar = document.createElement('div');
  bar.className = 'reading-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);

  const update = () => {
    const main = document.querySelector('main');
    if (!main) return;
    const rect = main.getBoundingClientRect();
    const total = Math.max(1, main.scrollHeight - window.innerHeight * 0.72);
    const read = Math.min(total, Math.max(0, -rect.top));
    bar.style.transform = 'scaleX(' + (read / total) + ')';
  };

  const scheduleUpdate = rafThrottle(update);
  update();
  onViewportChange(scheduleUpdate);
}
