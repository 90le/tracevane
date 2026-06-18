export type InlinePreviewKind = 'mermaid' | 'html' | 'svg' | 'inlineHtml' | 'inlineSvg' | 'inlineScript';
export type InlinePreviewScope = 'global' | 'session';
export type SanitizeLevel = 'strict' | 'moderate' | 'permissive';
export type RenderingRole = 'user' | 'assistant';

export type InlinePreviewPreferences = Record<InlinePreviewKind, boolean>;
export type InlinePreviewOverrides = Record<InlinePreviewKind, boolean | null>;

type InlinePreviewPreferenceChange = {
  kind: InlinePreviewKind | 'sanitizeLevel' | 'roleBased' | 'rolePreview';
  scope: InlinePreviewScope;
  sessionKey: string | null;
  enabled: boolean | null;
  sanitizeLevel?: SanitizeLevel;
  role?: RenderingRole | null;
};

const GLOBAL_SANITIZE_LEVEL_KEY = 'tracevane.chat.sanitize-level';
const ROLE_BASED_ENABLED_KEY = 'tracevane.chat.role-based-rendering';
const ROLE_PREVIEW_PREFIX = 'tracevane.chat.role-preview.';
const SANITIZE_LEVELS: SanitizeLevel[] = ['strict', 'moderate', 'permissive'];
const RENDERING_ROLES: RenderingRole[] = ['user', 'assistant'];

const INLINE_PREVIEW_EVENT = 'tracevane:inline-preview-pref-change';
const GLOBAL_STORAGE_KEYS: Record<InlinePreviewKind, string> = {
  mermaid: 'tracevane.chat.inline-preview.mermaid',
  html: 'tracevane.chat.inline-preview.html',
  svg: 'tracevane.chat.inline-preview.svg',
  inlineHtml: 'tracevane.chat.inline-preview.inline-html',
  inlineSvg: 'tracevane.chat.inline-preview.inline-svg',
  inlineScript: 'tracevane.chat.inline-preview.inline-script',
};

const PREVIEW_KINDS: InlinePreviewKind[] = ['mermaid', 'html', 'svg', 'inlineHtml', 'inlineSvg', 'inlineScript'];

const KIND_DEFAULTS: Record<InlinePreviewKind, boolean> = {
  mermaid: true,
  html: true,
  svg: true,
  inlineHtml: true,
  inlineSvg: true,
  inlineScript: false,
};

function sessionStorageKey(sessionKey: string, kind: InlinePreviewKind): string {
  return `tracevane.chat.inline-preview.session.${sessionKey}.${kind}`;
}

function readStoredBoolean(key: string): boolean | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (raw === '0') return false;
    if (raw === '1') return true;
  } catch {}

  return null;
}

function writeStoredBoolean(key: string, enabled: boolean | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (enabled == null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, enabled ? '1' : '0');
    }
  } catch {}
}

function dispatchInlinePreviewChange(detail: InlinePreviewPreferenceChange): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(INLINE_PREVIEW_EVENT, { detail }));
}

export function readGlobalInlinePreviewPreference(kind: InlinePreviewKind): boolean {
  return readStoredBoolean(GLOBAL_STORAGE_KEYS[kind]) ?? KIND_DEFAULTS[kind];
}

export function readGlobalInlinePreviewPreferences(): InlinePreviewPreferences {
  return {
    mermaid: readGlobalInlinePreviewPreference('mermaid'),
    html: readGlobalInlinePreviewPreference('html'),
    svg: readGlobalInlinePreviewPreference('svg'),
    inlineHtml: readGlobalInlinePreviewPreference('inlineHtml'),
    inlineSvg: readGlobalInlinePreviewPreference('inlineSvg'),
    inlineScript: readGlobalInlinePreviewPreference('inlineScript'),
  };
}

export function readSessionInlinePreviewOverride(
  sessionKey: string | null | undefined,
  kind: InlinePreviewKind,
): boolean | null {
  if (!sessionKey) {
    return null;
  }
  return readStoredBoolean(sessionStorageKey(sessionKey, kind));
}

export function readSessionInlinePreviewOverrides(
  sessionKey: string | null | undefined,
): InlinePreviewOverrides {
  return {
    mermaid: readSessionInlinePreviewOverride(sessionKey, 'mermaid'),
    html: readSessionInlinePreviewOverride(sessionKey, 'html'),
    svg: readSessionInlinePreviewOverride(sessionKey, 'svg'),
    inlineHtml: readSessionInlinePreviewOverride(sessionKey, 'inlineHtml'),
    inlineSvg: readSessionInlinePreviewOverride(sessionKey, 'inlineSvg'),
    inlineScript: readSessionInlinePreviewOverride(sessionKey, 'inlineScript'),
  };
}

export function readEffectiveInlinePreviewPreferences(
  sessionKey: string | null | undefined,
): InlinePreviewPreferences {
  const global = readGlobalInlinePreviewPreferences();
  const overrides = readSessionInlinePreviewOverrides(sessionKey);

  return {
    mermaid: overrides.mermaid ?? global.mermaid,
    html: overrides.html ?? global.html,
    svg: overrides.svg ?? global.svg,
    inlineHtml: overrides.inlineHtml ?? global.inlineHtml,
    inlineSvg: overrides.inlineSvg ?? global.inlineSvg,
    inlineScript: overrides.inlineScript ?? global.inlineScript,
  };
}

export function writeGlobalInlinePreviewPreference(kind: InlinePreviewKind, enabled: boolean): void {
  writeStoredBoolean(GLOBAL_STORAGE_KEYS[kind], enabled);
  dispatchInlinePreviewChange({
    kind,
    scope: 'global',
    sessionKey: null,
    enabled,
  });
}

export function writeSessionInlinePreviewOverride(
  sessionKey: string,
  kind: InlinePreviewKind,
  enabled: boolean | null,
): void {
  writeStoredBoolean(sessionStorageKey(sessionKey, kind), enabled);
  dispatchInlinePreviewChange({
    kind,
    scope: 'session',
    sessionKey,
    enabled,
  });
}

export function clearSessionInlinePreviewOverrides(sessionKey: string): void {
  PREVIEW_KINDS.forEach((kind) => {
    writeSessionInlinePreviewOverride(sessionKey, kind, null);
  });
}

export function listenInlinePreviewPreferenceChange(
  listener: (detail: InlinePreviewPreferenceChange) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleEvent = (event: Event) => {
    const detail = (event as CustomEvent<InlinePreviewPreferenceChange>).detail;
    if (!detail) {
      return;
    }
    // Accept preview kind changes, sanitize level changes, and role-based changes
    if (
      PREVIEW_KINDS.includes(detail.kind as InlinePreviewKind) ||
      detail.kind === 'sanitizeLevel' ||
      detail.kind === 'roleBased' ||
      detail.kind === 'rolePreview'
    ) {
      listener(detail);
    }
  };

  window.addEventListener(INLINE_PREVIEW_EVENT, handleEvent as EventListener);
  return () => {
    window.removeEventListener(INLINE_PREVIEW_EVENT, handleEvent as EventListener);
  };
}

// ---------------------------------------------------------------------------
// Sanitize level
// ---------------------------------------------------------------------------

export function readGlobalSanitizeLevel(): SanitizeLevel {
  if (typeof window === 'undefined') return 'strict';
  try {
    const raw = window.localStorage.getItem(GLOBAL_SANITIZE_LEVEL_KEY);
    if (raw === 'strict' || raw === 'moderate' || raw === 'permissive') return raw;
  } catch {}
  return 'strict';
}

export function writeGlobalSanitizeLevel(level: SanitizeLevel): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GLOBAL_SANITIZE_LEVEL_KEY, level);
  } catch {}
  dispatchInlinePreviewChange({
    kind: 'sanitizeLevel',
    scope: 'global',
    sessionKey: null,
    enabled: null,
    sanitizeLevel: level,
  });
}

// ---------------------------------------------------------------------------
// Role-based rendering toggle
// ---------------------------------------------------------------------------

export function readRoleBasedEnabled(): boolean {
  return readStoredBoolean(ROLE_BASED_ENABLED_KEY) ?? false;
}

export function writeRoleBasedEnabled(enabled: boolean): void {
  writeStoredBoolean(ROLE_BASED_ENABLED_KEY, enabled);
  dispatchInlinePreviewChange({
    kind: 'roleBased',
    scope: 'global',
    sessionKey: null,
    enabled,
  });
}

// ---------------------------------------------------------------------------
// Role-scoped preview preferences
// ---------------------------------------------------------------------------

function rolePreviewStorageKey(role: RenderingRole, kind: InlinePreviewKind): string {
  return `${ROLE_PREVIEW_PREFIX}${role}.${kind}`;
}

export function readRolePreviewPreference(role: RenderingRole, kind: InlinePreviewKind): boolean {
  return readStoredBoolean(rolePreviewStorageKey(role, kind)) ?? KIND_DEFAULTS[kind];
}

export function readRolePreviewPreferences(role: RenderingRole): InlinePreviewPreferences {
  return {
    mermaid: readRolePreviewPreference(role, 'mermaid'),
    html: readRolePreviewPreference(role, 'html'),
    svg: readRolePreviewPreference(role, 'svg'),
    inlineHtml: readRolePreviewPreference(role, 'inlineHtml'),
    inlineSvg: readRolePreviewPreference(role, 'inlineSvg'),
    inlineScript: readRolePreviewPreference(role, 'inlineScript'),
  };
}

export function writeRolePreviewPreference(role: RenderingRole, kind: InlinePreviewKind, enabled: boolean): void {
  writeStoredBoolean(rolePreviewStorageKey(role, kind), enabled);
  dispatchInlinePreviewChange({
    kind: 'rolePreview',
    scope: 'global',
    sessionKey: null,
    enabled,
    role,
  });
}

// ---------------------------------------------------------------------------
// Effective role-aware preference resolution
// ---------------------------------------------------------------------------

export function readEffectiveRoleAwareInlinePreviewPreferences(
  role: RenderingRole | null | undefined,
  sessionKey?: string | null,
): InlinePreviewPreferences {
  if (!readRoleBasedEnabled() || !role) {
    return readEffectiveInlinePreviewPreferences(sessionKey);
  }
  return readRolePreviewPreferences(role);
}

// ---------------------------------------------------------------------------
// Exports for UI iteration
// ---------------------------------------------------------------------------

export { SANITIZE_LEVELS, RENDERING_ROLES };
