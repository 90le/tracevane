import { escapeHtml } from './utils.js';

function enhanceImageAffordance(image) {
  if (image.dataset.lightboxReady === 'true' || image.closest('a, .doc-lightbox-frame')) return null;
  image.dataset.lightboxReady = 'true';
  image.classList.add('doc-lightbox-image');
  image.tabIndex = 0;
  image.setAttribute('role', 'button');
  image.setAttribute('aria-label', '打开图片预览：' + (image.getAttribute('alt') || '图片'));

  const frame = document.createElement('span');
  frame.className = 'doc-lightbox-frame';
  frame.setAttribute('data-lightbox-frame', '');
  const badge = document.createElement('span');
  badge.className = 'doc-lightbox-frame__badge';
  badge.setAttribute('aria-hidden', 'true');
  badge.textContent = '预览';
  image.replaceWith(frame);
  frame.append(image, badge);

  const parent = frame.parentElement;
  if (parent && parent.matches('p') && parent.textContent.trim() === badge.textContent) {
    parent.classList.add('doc-media-paragraph');
  }
  return frame;
}

export function initMediaLightbox(openModal) {
  document.querySelectorAll('main img').forEach((image, index) => {
    const frame = enhanceImageAffordance(image);
    if (!frame) return;
    const open = () => {
      const src = image.currentSrc || image.src || image.getAttribute('src') || '';
      const alt = image.getAttribute('alt') || 'Image ' + (index + 1);
      openModal(
        alt,
        '<figure class="modal-canvas" data-modal-canvas><div class="modal-canvas-content modal-image-stage"><img src="' + escapeHtml(src) + '" alt="' + escapeHtml(alt) + '"></div><figcaption class="modal-image-caption">' + escapeHtml(alt) + '</figcaption></figure>',
        src,
        { viewer: 'image', copyLabel: '复制链接', copyTitle: '复制图片地址' },
      );
    };
    image.addEventListener('click', open);
    image.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
  });
}
