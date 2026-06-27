import { flashButton } from './clipboard.js';
import { createToolButton } from './utils.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

function focusableWithin(root) {
  return root ? Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true') : [];
}

export function createModalApi() {
  const modal = document.querySelector('.rich-preview-modal');
  const modalBody = modal && modal.querySelector('.rich-preview-modal__body');
  const modalCopy = modal && modal.querySelector('[data-modal-copy]');
  const canvasControls = modal && modal.querySelector('[data-modal-canvas-controls]');
  const zoomIn = modal && modal.querySelector('[data-modal-zoom-in]');
  const zoomOut = modal && modal.querySelector('[data-modal-zoom-out]');
  const zoomReset = modal && modal.querySelector('[data-modal-zoom-reset]');
  let modalSource = '';
  let cleanup = null;
  let previousFocus = null;
  const defaultCopyLabel = modalCopy ? modalCopy.textContent || '复制' : '复制';
  const defaultCopyTitle = modalCopy ? modalCopy.getAttribute('aria-label') || '复制当前预览内容' : '复制当前预览内容';

  const setHud = (mode, options = {}) => {
    if (!modal) return;
    modal.dataset.viewer = mode || 'plain';
    if (canvasControls) canvasControls.hidden = !['canvas', 'browser', 'image'].includes(mode);
    if (modalCopy) {
      modalCopy.textContent = options.copyLabel || defaultCopyLabel;
      modalCopy.setAttribute('aria-label', options.copyTitle || defaultCopyTitle);
    }
  };

  const closeModal = () => {
    if (!modal || !modalBody) return;
    if (cleanup) cleanup();
    cleanup = null;
    setHud('plain');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    modalBody.innerHTML = '';
    modalSource = '';
    if (previousFocus && previousFocus.focus) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  };

  const setupPanZoom = (canvas, content, options = {}) => {
    let scale = 1;
    let x = 0;
    let y = 0;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let baseX = 0;
    let baseY = 0;
    const min = options.min || 0.2;
    const max = options.max || 5;
    const apply = () => {
      content.style.transform = 'translate(-50%, -50%) translate(' + x + 'px, ' + y + 'px) scale(' + scale + ')';
      if (options.onChange) options.onChange({ scale, x, y });
    };
    const reset = () => {
      scale = 1;
      x = 0;
      y = 0;
      apply();
    };
    const zoomBy = (delta) => {
      scale = clamp(scale + delta, min, max);
      apply();
    };
    const onPointerDown = (event) => {
      if (event.target && event.target.closest && event.target.closest('button,a,input,select,textarea,iframe,.modal-browser-toolbar')) return;
      if (event.button != null && event.button !== 0) return;
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      baseX = x;
      baseY = y;
      canvas.classList.add('is-dragging');
      canvas.setPointerCapture && canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event) => {
      if (!dragging) return;
      x = baseX + event.clientX - startX;
      y = baseY + event.clientY - startY;
      apply();
    };
    const onPointerUp = (event) => {
      dragging = false;
      canvas.classList.remove('is-dragging');
      canvas.releasePointerCapture && canvas.releasePointerCapture(event.pointerId);
    };
    const onWheel = (event) => {
      event.preventDefault();
      zoomBy(event.deltaY > 0 ? -0.12 : 0.12);
    };
    const onZoomIn = () => zoomBy(0.2);
    const onZoomOut = () => zoomBy(-0.2);
    const onKeyDown = (event) => {
      if (!modal || modal.getAttribute('aria-hidden') === 'true') return;
      if (event.target && event.target.closest && event.target.closest('input,textarea,select')) return;
      const key = event.key || '';
      const code = event.code || '';
      if (key === '+' || key === '=' || code === 'Equal' || code === 'NumpadAdd') {
        event.preventDefault();
        zoomBy(0.2);
      } else if (key === '-' || code === 'Minus' || code === 'NumpadSubtract') {
        event.preventDefault();
        zoomBy(-0.2);
      } else if (key === '0' || code === 'Digit0' || code === 'Numpad0') {
        event.preventDefault();
        reset();
      } else if (key === 'ArrowLeft') {
        event.preventDefault();
        x -= 42; apply();
      } else if (key === 'ArrowRight') {
        event.preventDefault();
        x += 42; apply();
      } else if (key === 'ArrowUp') {
        event.preventDefault();
        y -= 42; apply();
      } else if (key === 'ArrowDown') {
        event.preventDefault();
        y += 42; apply();
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    zoomIn && zoomIn.addEventListener('click', onZoomIn);
    zoomOut && zoomOut.addEventListener('click', onZoomOut);
    zoomReset && zoomReset.addEventListener('click', reset);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    reset();
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      zoomIn && zoomIn.removeEventListener('click', onZoomIn);
      zoomOut && zoomOut.removeEventListener('click', onZoomOut);
      zoomReset && zoomReset.removeEventListener('click', reset);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  };

  const setupBrowserViewer = () => {
    const stage = modalBody && modalBody.querySelector('[data-browser-stage]');
    const canvas = modalBody && modalBody.querySelector('[data-modal-canvas]');
    const content = modalBody && modalBody.querySelector('.modal-canvas-content');
    if (!stage || !canvas || !content) return null;
    const buttons = Array.from(modalBody.querySelectorAll('[data-browser-viewport]'));
    const sizeLabel = modalBody.querySelector('[data-browser-size]');
    const copyInfo = modalBody.querySelector('[data-browser-copy-info]');
    let viewport = 'fluid';
    let zoomState = { scale: 1, x: 0, y: 0 };
    const viewportLabel = (value) => {
      if (value === 'fluid') return 'Fluid · auto width';
      if (value === '1280') return 'Desktop · 1280px';
      if (value === '768') return 'Tablet · 768px';
      if (value === '390') return 'Mobile · 390px';
      return value + 'px';
    };
    const updateInfo = () => {
      const rect = stage.getBoundingClientRect();
      const text = viewportLabel(viewport) + ' · ' + Math.round(rect.width) + '×' + Math.round(rect.height) + ' · ' + Math.round(zoomState.scale * 100) + '%';
      if (sizeLabel) sizeLabel.textContent = text;
      stage.dataset.browserInfo = text;
      return text;
    };
    const applyViewport = (value) => {
      viewport = value || 'fluid';
      buttons.forEach((button) => button.classList.toggle('is-active', button.dataset.browserViewport === viewport));
      stage.dataset.browserViewport = viewport;
      if (viewport === 'fluid') {
        stage.style.width = 'min(94vw, 1440px)';
        stage.style.height = 'min(86vh, 980px)';
      } else if (viewport === '1280') {
        stage.style.width = 'min(88vw, 1280px)';
        stage.style.height = 'min(82vh, 920px)';
      } else {
        stage.style.width = viewport + 'px';
        stage.style.height = viewport === '390' ? 'min(86vh, 844px)' : 'min(86vh, 920px)';
      }
      window.requestAnimationFrame(updateInfo);
    };
    const onStageClick = (event) => {
      const button = event.target && event.target.closest ? event.target.closest('[data-browser-viewport]') : null;
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      applyViewport(button.dataset.browserViewport || 'fluid');
    };
    const onCopyInfo = () => flashButton(copyInfo, updateInfo(), { successText: '已复制视口信息' });
    modalBody.addEventListener('click', onStageClick);
    copyInfo && copyInfo.addEventListener('click', onCopyInfo);
    applyViewport('fluid');
    const cleanupPan = setupPanZoom(canvas, content, {
      min: 0.25,
      max: 3,
      onChange: (state) => {
        zoomState = state;
        updateInfo();
      },
    });
    window.requestAnimationFrame(updateInfo);
    return () => {
      modalBody.removeEventListener('click', onStageClick);
      copyInfo && copyInfo.removeEventListener('click', onCopyInfo);
      cleanupPan && cleanupPan();
    };
  };

  const setupTableViewer = () => {
    const viewer = modalBody && modalBody.querySelector('.modal-table-viewer');
    const table = viewer && viewer.querySelector('table');
    if (!viewer || !table || viewer.querySelector('.modal-table-tools')) return null;
    const tools = document.createElement('div');
    tools.className = 'modal-table-tools';
    const title = document.createElement('span');
    title.className = 'modal-table-tools__title';
    title.textContent = 'Table · ' + table.rows.length + ' rows · ' + Math.max(0, ...Array.from(table.rows).map((row) => row.cells.length)) + ' cols';
    const status = document.createElement('span');
    status.className = 'modal-table-tools__status';
    status.setAttribute('aria-live', 'polite');
    const actions = document.createElement('div');
    actions.className = 'rich-tool-actions';
    const meta = document.createElement('span');
    meta.className = 'modal-table-meta';
    meta.textContent = table.rows.length + ' 行 · ' + Math.max(0, ...Array.from(table.rows).map((row) => row.cells.length)) + ' 列';
    const rows = () => Array.from(table.rows).map((row) => Array.from(row.cells).map((cell) => (cell.textContent || '').trim().replace(/\s+/g, ' ')));
    const toCsv = () => rows().map((row) => row.map((cell) => '"' + cell.replace(/"/g, '""') + '"').join(',')).join('\n');
    const toMarkdown = () => {
      const data = rows();
      if (!data.length) return '';
      const widths = data[0].map((_, column) => Math.max(3, ...data.map((row) => (row[column] || '').length)));
      const line = (row) => '| ' + widths.map((width, column) => (row[column] || '').padEnd(width, ' ')).join(' | ') + ' |';
      return [line(data[0]), '| ' + widths.map((width) => '-'.repeat(width)).join(' | ') + ' |', ...data.slice(1).map(line)].join('\n');
    };
    const copyMarkdown = createToolButton('复制表格', '复制 Markdown 表格');
    copyMarkdown.dataset.copyFormat = 'markdown';
    copyMarkdown.addEventListener('click', () => flashButton(copyMarkdown, toMarkdown(), { status, successText: '已复制 Markdown 表格' }));
    const copyCsv = createToolButton('CSV', '复制表格 CSV');
    copyCsv.dataset.copyFormat = 'csv';
    copyCsv.addEventListener('click', () => flashButton(copyCsv, toCsv(), { status, successText: '已复制 CSV' }));
    actions.append(copyMarkdown, copyCsv);
    tools.append(title, meta, status, actions);
    viewer.prepend(tools);
    return null;
  };

  const setupViewer = () => {
    const mode = modal && modal.dataset.viewer;
    if (mode === 'browser') return setupBrowserViewer();
    if (mode === 'table') return setupTableViewer();
    const canvas = modalBody && modalBody.querySelector('[data-modal-canvas]');
    const content = modalBody && modalBody.querySelector('.modal-canvas-content');
    if (canvas && content && ['canvas', 'image'].includes(mode)) return setupPanZoom(canvas, content);
    return null;
  };

  const openModal = (title, html, source, options = {}) => {
    if (!modal || !modalBody) return;
    if (cleanup) cleanup();
    cleanup = null;
    previousFocus = document.activeElement;
    setHud(options.viewer || 'plain', options);
    modalBody.innerHTML = html || '';
    modalBody.tabIndex = -1;
    modalSource = source || modalBody.textContent || '';
    modal.setAttribute('aria-label', title || '沉浸预览');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    cleanup = setupViewer();
    const focusables = focusableWithin(modal);
    const preferred = focusables.find((element) => element.matches('[data-modal-close]')) || focusables[0] || modalBody;
    preferred && preferred.focus && preferred.focus({ preventScroll: true });
  };

  if (modal) {
    modal.querySelectorAll('[data-modal-close]').forEach((button) => button.addEventListener('click', closeModal));
    if (modalCopy) modalCopy.addEventListener('click', () => flashButton(modalCopy, modalSource));
    document.addEventListener('keydown', (event) => {
      if (modal.getAttribute('aria-hidden') === 'true') return;
      const key = event.key || '';
      const code = event.code || '';
      if (event.key === 'Escape') {
        closeModal();
        return;
      }
      if (event.key === 'Tab') {
        const focusables = focusableWithin(modal);
        if (!focusables.length) {
          event.preventDefault();
          modalBody && modalBody.focus && modalBody.focus({ preventScroll: true });
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus({ preventScroll: true });
        }
        return;
      }
      if (event.target && event.target.closest && event.target.closest('input,textarea,select')) return;
      if (key === '+' || key === '=' || code === 'Equal' || code === 'NumpadAdd') {
        event.preventDefault();
        zoomIn && zoomIn.click();
      } else if (key === '-' || code === 'Minus' || code === 'NumpadSubtract') {
        event.preventDefault();
        zoomOut && zoomOut.click();
      } else if (key === '0' || code === 'Digit0' || code === 'Numpad0') {
        event.preventDefault();
        zoomReset && zoomReset.click();
      }
    });
  }

  return { openModal, closeModal };
}
