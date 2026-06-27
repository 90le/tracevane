import { onViewportChange } from './scheduler.js';

export function initBackToTop() {
  const footerLink = document.querySelector('.back-to-top');
  const button = document.createElement('button');
  button.className = 'back-to-top-fab';
  button.type = 'button';
  button.setAttribute('aria-label', '返回顶部');
  button.setAttribute('title', '返回顶部');
  button.innerHTML = '<span aria-hidden="true">↑</span><span>顶部</span>';
  document.body.appendChild(button);

  const scrollTop = (event) => {
    if (event) event.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const main = document.getElementById('main-content');
    window.setTimeout(() => {
      if (main && main.focus) main.focus({ preventScroll: true });
    }, 260);
  };

  const update = () => {
    button.classList.toggle('is-visible', window.scrollY > Math.max(360, window.innerHeight * 0.55));
  };

  button.addEventListener('click', scrollTop);
  if (footerLink) footerLink.addEventListener('click', scrollTop);
  onViewportChange(update);
  update();
}
