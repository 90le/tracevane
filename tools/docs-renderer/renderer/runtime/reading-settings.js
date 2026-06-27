const storageKey = 'tracevane-docs-reader-settings';

const defaults = {
  size: 'normal',
  width: 'normal',
  leading: 'normal',
  density: 'normal',
  focus: 'off',
};

const allowed = {
  size: new Set(['compact', 'normal', 'large']),
  width: new Set(['narrow', 'normal', 'wide']),
  leading: new Set(['tight', 'normal', 'loose']),
  density: new Set(['calm', 'normal', 'dense']),
  focus: new Set(['off', 'on']),
};

function readSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return Object.fromEntries(Object.keys(defaults).map((key) => {
      const value = parsed && allowed[key].has(parsed[key]) ? parsed[key] : defaults[key];
      return [key, value];
    }));
  } catch {
    return { ...defaults };
  }
}

function writeSettings(settings) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(settings));
  } catch {}
}

function applySettings(settings, panel) {
  const root = document.documentElement;
  Object.entries(settings).forEach(([key, value]) => {
    root.dataset['reader' + key.charAt(0).toUpperCase() + key.slice(1)] = value;
  });
  if (!panel) return;
  panel.querySelectorAll('[data-reader-option]').forEach((button) => {
    const active = settings[button.dataset.readerOption] === button.dataset.readerValue;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

export function initReadingSettings() {
  const wrapper = document.querySelector('[data-reader-settings]');
  const toggle = wrapper && wrapper.querySelector('[data-reader-settings-toggle]');
  const panel = wrapper && wrapper.querySelector('[data-reader-settings-panel]');
  const reset = wrapper && wrapper.querySelector('[data-reader-settings-reset]');
  if (!wrapper || !toggle || !panel) return;

  let settings = readSettings();
  applySettings(settings, panel);

  const close = () => {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  };
  const open = () => {
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
  };

  toggle.addEventListener('click', () => {
    if (panel.hidden) open();
    else close();
  });

  panel.addEventListener('click', (event) => {
    const button = event.target && event.target.closest ? event.target.closest('[data-reader-option]') : null;
    if (!button || !panel.contains(button)) return;
    const key = button.dataset.readerOption;
    const value = button.dataset.readerValue;
    if (!allowed[key] || !allowed[key].has(value)) return;
    settings = { ...settings, [key]: value };
    writeSettings(settings);
    applySettings(settings, panel);
  });

  if (reset) reset.addEventListener('click', () => {
    settings = { ...defaults };
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    applySettings(settings, panel);
  });

  document.addEventListener('click', (event) => {
    if (panel.hidden || wrapper.contains(event.target)) return;
    close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      close();
      toggle.focus({ preventScroll: true });
    }
  });
}
