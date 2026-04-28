export type StudioResourceRefScheme = 'workspace' | 'uploads' | 'studio-file';

export interface StudioResourceRefParts {
  scheme: StudioResourceRefScheme;
  path: string;
}

function normalizePortablePath(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\.\/+/, '');
  return normalized ? normalized : null;
}

export function buildStudioResourceRefFromRelativePath(relativePath: string | null | undefined): string | null {
  const normalized = normalizePortablePath(relativePath);
  if (!normalized) {
    return null;
  }
  if (normalized === 'uploads') {
    return null;
  }
  if (normalized.startsWith('uploads/')) {
    const uploadPath = normalized.slice('uploads/'.length);
    return uploadPath ? `uploads:${uploadPath}` : null;
  }
  return `workspace:${normalized}`;
}

export function buildStudioFileResourceRef(absolutePath: string | null | undefined): string | null {
  const trimmed = typeof absolutePath === 'string' ? absolutePath.trim() : '';
  return trimmed ? `studio-file:${trimmed}` : null;
}

export function parseStudioResourceRef(value: string | null | undefined): StudioResourceRefParts | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  const match = /^(workspace|uploads|studio-file):/i.exec(trimmed);
  if (!match) {
    return null;
  }
  const scheme = match[1]?.toLowerCase() as StudioResourceRefScheme;
  const refPath = trimmed.slice(match[0].length).trim();
  if (!refPath) {
    return null;
  }
  return {
    scheme,
    path: refPath,
  };
}

export function formatMarkdownResourceDestination(ref: string): string {
  const trimmed = typeof ref === 'string' ? ref.trim() : '';
  if (!trimmed) {
    return '';
  }
  if (!/[\s()<>]/.test(trimmed)) {
    return trimmed;
  }
  return `<${trimmed.replace(/</g, '%3C').replace(/>/g, '%3E')}>`;
}
