export type TracevaneResourceRefScheme = 'workspace' | 'uploads' | 'tracevane-file' | 'files';

export interface TracevaneResourceRefParts {
  scheme: TracevaneResourceRefScheme;
  path: string;
}

export interface TracevaneFilesResourceRefParts {
  scheme: 'files';
  rootId: string;
  path: string;
}

function normalizePortablePath(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\.\/+/, '');
  return normalized ? normalized : null;
}

export function buildTracevaneResourceRefFromRelativePath(relativePath: string | null | undefined): string | null {
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

export function buildTracevaneFileResourceRef(absolutePath: string | null | undefined): string | null {
  const trimmed = typeof absolutePath === 'string' ? absolutePath.trim() : '';
  return trimmed ? `tracevane-file:${trimmed}` : null;
}

export function buildTracevaneFilesResourceRef(
  rootId: string | null | undefined,
  relativePath: string | null | undefined,
): string | null {
  const normalizedRootId = typeof rootId === 'string' ? rootId.trim() : '';
  const normalizedPath = normalizePortablePath(relativePath);
  if (!normalizedRootId || !normalizedPath) {
    return null;
  }
  return `files:${normalizedRootId}:${normalizedPath}`;
}

export function parseTracevaneFilesResourceRef(value: string | null | undefined): TracevaneFilesResourceRefParts | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed.toLowerCase().startsWith('files:')) {
    return null;
  }
  const body = trimmed.slice('files:'.length);
  const delimiterIndex = body.indexOf(':');
  if (delimiterIndex <= 0) {
    return null;
  }
  const rootId = body.slice(0, delimiterIndex).trim();
  const refPath = normalizePortablePath(body.slice(delimiterIndex + 1));
  if (!rootId || !refPath) {
    return null;
  }
  return {
    scheme: 'files',
    rootId,
    path: refPath,
  };
}

export function parseTracevaneResourceRef(value: string | null | undefined): TracevaneResourceRefParts | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  const filesRef = parseTracevaneFilesResourceRef(trimmed);
  if (filesRef) {
    return {
      scheme: 'files',
      path: `${filesRef.rootId}:${filesRef.path}`,
    };
  }
  const match = /^(workspace|uploads|tracevane-file):/i.exec(trimmed);
  if (!match) {
    return null;
  }
  const scheme = match[1]?.toLowerCase() as TracevaneResourceRefScheme;
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
