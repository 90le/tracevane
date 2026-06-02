export type TerminalFileKind =
  | 'archive'
  | 'audio'
  | 'binary'
  | 'code'
  | 'config'
  | 'data'
  | 'database'
  | 'document'
  | 'font'
  | 'image'
  | 'key'
  | 'lock'
  | 'log'
  | 'markdown'
  | 'package'
  | 'pdf'
  | 'presentation'
  | 'script'
  | 'spreadsheet'
  | 'style'
  | 'test'
  | 'text'
  | 'video';

export interface TerminalFileKindInput {
  name?: string | null;
  ext?: string | null;
  mimeType?: string | null;
  textLike?: boolean | null;
  imageLike?: boolean | null;
}

const PACKAGE_FILE_NAMES = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'composer.json',
  'go.mod',
  'go.sum',
  'cargo.toml',
  'cargo.lock',
  'pyproject.toml',
  'poetry.lock',
  'requirements.txt',
  'gemfile',
  'gemfile.lock',
  'pom.xml',
  'build.gradle',
  'gradle.properties',
]);

const SCRIPT_FILE_NAMES = new Set([
  'dockerfile',
  'makefile',
  'justfile',
  'rakefile',
  '.bashrc',
  '.zshrc',
  '.profile',
  '.bash_profile',
  '.bash_aliases',
]);

const CONFIG_FILE_NAMES = new Set([
  '.env',
  '.env.local',
  '.gitignore',
  '.gitattributes',
  '.npmrc',
  '.yarnrc',
  '.editorconfig',
  '.prettierrc',
  '.eslintrc',
  'tsconfig.json',
  'vite.config.ts',
  'vite.config.js',
  'webpack.config.js',
  'rollup.config.js',
  'tailwind.config.js',
  'postcss.config.js',
]);

const LOCK_FILE_NAMES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'cargo.lock',
  'poetry.lock',
  'gemfile.lock',
]);

const IMAGE_EXTENSIONS = new Set([
  'apng',
  'avif',
  'bmp',
  'gif',
  'heic',
  'heif',
  'ico',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'tif',
  'tiff',
  'webp',
]);

const VIDEO_EXTENSIONS = new Set([
  '3g2',
  '3gp',
  'avi',
  'm4v',
  'mkv',
  'mov',
  'mp4',
  'mpeg',
  'mpg',
  'ogm',
  'ogv',
  'webm',
]);

const AUDIO_EXTENSIONS = new Set([
  'aac',
  'aif',
  'aiff',
  'amr',
  'flac',
  'm4a',
  'mid',
  'midi',
  'mp3',
  'oga',
  'ogg',
  'opus',
  'wav',
  'weba',
]);

const ARCHIVE_EXTENSIONS = new Set([
  '7z',
  'bz2',
  'gz',
  'rar',
  'tar',
  'tgz',
  'txz',
  'xz',
  'zip',
  'zst',
]);

const DATA_EXTENSIONS = new Set([
  'csv',
  'geojson',
  'json',
  'json5',
  'jsonc',
  'jsonl',
  'ndjson',
  'parquet',
  'toml',
  'tsv',
  'xml',
  'yaml',
  'yml',
]);

const DATABASE_EXTENSIONS = new Set([
  'db',
  'sqlite',
  'sqlite3',
  'sqlitedb',
]);

const DOCUMENT_EXTENSIONS = new Set([
  'doc',
  'docx',
  'odt',
  'pages',
  'rtf',
]);

const SPREADSHEET_EXTENSIONS = new Set([
  'ods',
  'xls',
  'xlsm',
  'xlsx',
]);

const PRESENTATION_EXTENSIONS = new Set([
  'key',
  'odp',
  'ppt',
  'pptx',
]);

const FONT_EXTENSIONS = new Set([
  'eot',
  'otf',
  'ttf',
  'woff',
  'woff2',
]);

const KEY_EXTENSIONS = new Set([
  'asc',
  'cer',
  'crt',
  'csr',
  'key',
  'pem',
  'pfx',
  'p12',
]);

const MARKDOWN_EXTENSIONS = new Set([
  'md',
  'markdown',
  'mdx',
]);

const STYLE_EXTENSIONS = new Set([
  'css',
  'less',
  'sass',
  'scss',
  'styl',
]);

const TEXT_EXTENSIONS = new Set([
  'adoc',
  'rst',
  'text',
  'txt',
]);

const SCRIPT_EXTENSIONS = new Set([
  'bat',
  'bash',
  'cmd',
  'fish',
  'ps1',
  'sh',
  'zsh',
]);

const CODE_EXTENSIONS = new Set([
  'astro',
  'c',
  'cjs',
  'clj',
  'cpp',
  'cs',
  'dart',
  'ex',
  'exs',
  'go',
  'h',
  'htm',
  'html',
  'hpp',
  'java',
  'jl',
  'js',
  'jsx',
  'kt',
  'lua',
  'mjs',
  'php',
  'py',
  'r',
  'rb',
  'rs',
  'scala',
  'sql',
  'svelte',
  'swift',
  'ts',
  'tsx',
  'vue',
  'xhtml',
]);

export function normalizeTerminalFileExtension(input: TerminalFileKindInput): string {
  const rawExt = String(input.ext || '').trim().replace(/^\./, '').toLocaleLowerCase();
  if (rawExt) return rawExt;
  const match = String(input.name || '').trim().toLocaleLowerCase().match(/\.([^.]+)$/);
  return match?.[1] || '';
}

export function resolveTerminalFileKind(input: TerminalFileKindInput): TerminalFileKind {
  const name = String(input.name || '').trim().toLocaleLowerCase();
  const ext = normalizeTerminalFileExtension(input);
  const mimeType = String(input.mimeType || '').trim().toLocaleLowerCase();

  if (input.imageLike || mimeType.startsWith('image/') || IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (mimeType.startsWith('video/') || VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (mimeType.startsWith('audio/') || AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (mimeType === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mimeType.startsWith('font/') || FONT_EXTENSIONS.has(ext)) return 'font';
  if (LOCK_FILE_NAMES.has(name) || ext === 'lock') return 'lock';
  if (PACKAGE_FILE_NAMES.has(name)) return 'package';
  if (SCRIPT_FILE_NAMES.has(name) || SCRIPT_EXTENSIONS.has(ext)) return 'script';
  if (CONFIG_FILE_NAMES.has(name) || ['conf', 'config', 'env', 'ini'].includes(ext)) return 'config';
  if (KEY_EXTENSIONS.has(ext)) return 'key';
  if (ARCHIVE_EXTENSIONS.has(ext)) return 'archive';
  if (DATABASE_EXTENSIONS.has(ext) || mimeType.includes('sqlite')) return 'database';
  if (SPREADSHEET_EXTENSIONS.has(ext) || mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'spreadsheet';
  if (PRESENTATION_EXTENSIONS.has(ext) || mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'presentation';
  if (DOCUMENT_EXTENSIONS.has(ext) || mimeType.includes('wordprocessingml') || mimeType.includes('msword')) return 'document';
  if (MARKDOWN_EXTENSIONS.has(ext)) return 'markdown';
  if (isTestFileName(name)) return 'test';
  if (ext === 'log') return 'log';
  if (STYLE_EXTENSIONS.has(ext)) return 'style';
  if (DATA_EXTENSIONS.has(ext)) return 'data';
  if (CODE_EXTENSIONS.has(ext)) return 'code';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  if (input.textLike) return 'text';
  return ext ? 'binary' : 'text';
}

export function isTerminalFileKindEmbeddable(kind: TerminalFileKind | null): boolean {
  return kind === 'audio' || kind === 'video' || kind === 'pdf' || kind === 'font';
}

function isTestFileName(name: string): boolean {
  return (
    name.endsWith('.test.ts') ||
    name.endsWith('.test.tsx') ||
    name.endsWith('.test.js') ||
    name.endsWith('.test.jsx') ||
    name.endsWith('.spec.ts') ||
    name.endsWith('.spec.tsx') ||
    name.endsWith('.spec.js') ||
    name.endsWith('.spec.jsx')
  );
}
