
let feedbackTimer = 0;

function ensureFeedbackToast() {
  let toast = document.querySelector('[data-doc-feedback-toast]');
  if (toast) return toast;
  toast = document.createElement('div');
  toast.className = 'doc-feedback-toast';
  toast.setAttribute('data-doc-feedback-toast', '');
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.setAttribute('aria-atomic', 'true');
  toast.hidden = true;
  document.body.appendChild(toast);
  return toast;
}

export function showDocFeedback(message, state = 'success', timeout = 1800) {
  const toast = ensureFeedbackToast();
  window.clearTimeout(feedbackTimer);
  toast.textContent = message;
  toast.dataset.feedbackState = state;
  toast.hidden = false;
  toast.classList.add('is-visible');
  feedbackTimer = window.setTimeout(() => {
    toast.classList.remove('is-visible');
    window.setTimeout(() => {
      if (!toast.classList.contains('is-visible')) toast.hidden = true;
    }, 180);
  }, timeout);
}

function fallbackCopyText(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.focus({ preventScroll: true });
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } finally {
    textarea.remove();
  }
  return copied;
}

export async function copyText(text) {
  const value = text || '';
  if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // file:// previews and some embedded contexts expose Clipboard API but
      // still reject writes. Fall back to the user-gesture execCommand path.
    }
  }
  return fallbackCopyText(value);
}

export async function flashButton(button, text, options = {}) {
  let copied = false;
  try {
    copied = await copyText(text || '');
    button.dataset.copyState = copied ? 'copied' : 'error';
    const message = copied ? (options.successText || '已复制') : (options.errorText || '复制失败，请手动选择');
    if (options.status) options.status.textContent = message;
    showDocFeedback(message, copied ? 'success' : 'error');
  } catch {
    button.dataset.copyState = 'error';
    const message = options.errorText || '复制失败，请手动选择';
    if (options.status) options.status.textContent = message;
    showDocFeedback(message, 'error');
  }
  window.setTimeout(() => {
    delete button.dataset.copyState;
    if (options.status && options.clear !== false) options.status.textContent = '';
  }, options.timeout || 1600);
  return copied;
}
