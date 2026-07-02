import { MONACO_LANGUAGE_METADATA, type MonacoLanguageMetadata } from "./monacoLanguageMetadata";

const TRACEVANE_LANGUAGE_OVERRIDES: Record<string, string> = {
  containerfile: "dockerfile",
  makefile: "shell",
  rakefile: "ruby",
  gemfile: "ruby",
  podfile: "ruby",
};

const TRACEVANE_EXTENSION_OVERRIDES = [
  [".env", "shell"],
  [".vue", "html"],
  [".svelte", "html"],
  [".astro", "html"],
  [".toml", "ini"],
] as const;

const LANGUAGE_METADATA: readonly MonacoLanguageMetadata[] = MONACO_LANGUAGE_METADATA;

const LANGUAGE_DETECTION_SAMPLE_CHARS = 32_768;
const LANGUAGE_DETECTION_LEADING_SCAN_CHARS = 65_536;
const JSON_STRICT_PARSE_LIMIT_CHARS = 8_192;

const METADATA_BY_EXTENSION = LANGUAGE_METADATA
  .flatMap((language) => (language.extensions ?? []).map((extension) => [extension.toLowerCase(), language.id] as const))
  .sort((left, right) => right[0].length - left[0].length);

const METADATA_BY_FILENAME = new Map(
  LANGUAGE_METADATA.flatMap((language) =>
    (language.filenames ?? []).map((filename) => [filename.toLowerCase(), language.id] as const),
  ),
);

const METADATA_BY_MIMETYPE = new Map(
  LANGUAGE_METADATA.flatMap((language) =>
    (language.mimetypes ?? []).map((mimeType) => [mimeType.toLowerCase(), language.id] as const),
  ),
);

const FIRST_LINE_LANGUAGES = LANGUAGE_METADATA.filter((language) => Boolean(language.firstLine));
const FILENAME_PATTERN_LANGUAGES = LANGUAGE_METADATA.filter((language) => language.filenamePatterns?.length);
const COMPOUND_BACKUP_SUFFIX_SEGMENTS = new Set([
  "bak",
  "backup",
  "copy",
  "disabled",
  "last-good",
  "last_good",
  "old",
  "orig",
  "original",
  "save",
  "saved",
  "tmp",
]);

export interface MonacoRegisteredLanguageMetadata {
  id: string;
  extensions?: readonly string[];
  filenames?: readonly string[];
  filenamePatterns?: readonly string[];
  firstLine?: string;
  mimetypes?: readonly string[];
}

export interface DetectLanguageForFileInput {
  path: string;
  content?: string | null;
  mimeType?: string | null;
  registeredLanguages?: readonly MonacoRegisteredLanguageMetadata[];
}

export function languageForPath(path: string): string {
  return detectLanguageForFile({ path });
}

export function detectLanguageForFile({
  path,
  content,
  mimeType,
  registeredLanguages,
}: DetectLanguageForFileInput): string {
  const normalized = path.replace(/\\/g, "/");
  const fileName = normalized.split("/").pop()?.toLowerCase() ?? "";
  const lowerPath = normalized.toLowerCase();

  const override = languageOverrideForFile(fileName, lowerPath);
  if (override) return override;

  const registeredPathLanguage = registeredLanguages ? matchRegisteredLanguageByPath(fileName, lowerPath, registeredLanguages) : null;
  const metadataPathLanguage = matchMetadataLanguageByPath(fileName, lowerPath);
  const strongPathLanguage = registeredPathLanguage ?? metadataPathLanguage;
  const compoundPathLanguage = matchCompoundSourceExtension(fileName);
  const mimeLanguage = mimeType ? matchLanguageByMimeType(mimeType, registeredLanguages) : null;
  const firstLine = readFirstLine(content);
  const firstLineLanguage = firstLine ? matchLanguageByFirstLine(firstLine, registeredLanguages) : null;
  const contentLanguage = content ? inferLanguageFromContent(content) : null;

  // Mainstream editors do not rely on extensions alone. Keep exact/known
  // filename-extension matches stable, but let content win for unknown,
  // extensionless, or backup-style names such as openclaw.json.pre-update,
  // openclaw.json.clobbered.<timestamp>, and arbitrary names like "123".
  if (isBackupLikeFileName(fileName) || !strongPathLanguage) {
    if (contentLanguage) return contentLanguage;
    if (firstLineLanguage) return firstLineLanguage;
    if (mimeLanguage) return mimeLanguage;
    if (compoundPathLanguage) return compoundPathLanguage;
  }

  if (strongPathLanguage) return strongPathLanguage;
  if (contentLanguage) return contentLanguage;
  if (firstLineLanguage) return firstLineLanguage;
  if (mimeLanguage) return mimeLanguage;
  if (compoundPathLanguage) return compoundPathLanguage;

  if (fileName.endsWith("rc") && !fileName.includes(".")) return "ini";
  return "plaintext";
}

function languageOverrideForFile(fileName: string, lowerPath: string): string | null {
  const exact = TRACEVANE_LANGUAGE_OVERRIDES[fileName];
  if (exact) return exact;
  for (const [suffix, language] of TRACEVANE_EXTENSION_OVERRIDES) {
    if (fileName === suffix.slice(1) || fileName.endsWith(suffix)) return language;
  }
  if (fileName.startsWith(".env")) return "shell";
  if (lowerPath.includes("/dockerfile.")) return "dockerfile";
  return null;
}

function matchMetadataLanguageByPath(fileName: string, lowerPath: string): string | null {
  const exact = METADATA_BY_FILENAME.get(fileName);
  if (exact) return exact;
  const pattern = matchFilenamePattern(fileName, lowerPath, FILENAME_PATTERN_LANGUAGES);
  if (pattern) return pattern;
  return matchExtensionSuffix(fileName);
}

function matchExtensionSuffix(fileName: string): string | null {
  for (const [extension, language] of METADATA_BY_EXTENSION) {
    if (fileName.endsWith(extension)) return language;
  }
  return null;
}

function matchCompoundSourceExtension(fileName: string): string | null {
  const segments = fileName.split(".").filter(Boolean);
  if (segments.length < 3) return null;
  for (let index = segments.length - 1; index >= 1; index -= 1) {
    const candidate = segments.slice(0, index).join(".");
    const language = matchExtensionSuffix(candidate);
    if (language) return language;
  }
  return null;
}

function isBackupLikeFileName(fileName: string): boolean {
  const segments = fileName.split(".").filter(Boolean);
  if (segments.length < 3) return false;
  return segments.slice(1).some((segment) => isBackupSuffixSegment(segment));
}

function isBackupSuffixSegment(segment: string): boolean {
  return /^\d+$/.test(segment)
    || /^\d{4}-\d{2}-\d{2}t/i.test(segment)
    || segment.startsWith("clobbered")
    || segment.startsWith("pre-")
    || segment.startsWith("post-")
    || COMPOUND_BACKUP_SUFFIX_SEGMENTS.has(segment);
}

function matchRegisteredLanguageByPath(
  fileName: string,
  lowerPath: string,
  registeredLanguages: readonly MonacoRegisteredLanguageMetadata[],
): string | null {
  const exact = registeredLanguages.find((language) =>
    language.filenames?.some((filename) => filename.toLowerCase() === fileName),
  );
  if (exact) return exact.id;

  const pattern = matchFilenamePattern(fileName, lowerPath, registeredLanguages);
  if (pattern) return pattern;

  const extension = registeredLanguages
    .flatMap((language) => (language.extensions ?? []).map((value) => [value.toLowerCase(), language.id] as const))
    .sort((left, right) => right[0].length - left[0].length)
    .find(([value]) => fileName.endsWith(value));
  return extension?.[1] ?? null;
}

function matchFilenamePattern(
  fileName: string,
  lowerPath: string,
  languages: readonly Pick<MonacoRegisteredLanguageMetadata, "id" | "filenamePatterns">[],
): string | null {
  for (const language of languages) {
    for (const pattern of language.filenamePatterns ?? []) {
      const matcher = globLikePatternToRegExp(pattern.toLowerCase());
      if (matcher.test(fileName) || matcher.test(lowerPath)) return language.id;
    }
  }
  return null;
}

function matchLanguageByMimeType(
  mimeType: string,
  registeredLanguages?: readonly MonacoRegisteredLanguageMetadata[],
): string | null {
  const normalized = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!normalized) return null;
  const registered = registeredLanguages?.find((language) =>
    language.mimetypes?.some((candidate) => candidate.toLowerCase() === normalized),
  );
  return registered?.id ?? METADATA_BY_MIMETYPE.get(normalized) ?? null;
}

function matchLanguageByFirstLine(
  firstLine: string,
  registeredLanguages?: readonly MonacoRegisteredLanguageMetadata[],
): string | null {
  const registered = registeredLanguages ? matchFirstLine(firstLine, registeredLanguages) : null;
  return registered ?? matchFirstLine(firstLine, FIRST_LINE_LANGUAGES);
}

function matchFirstLine(
  firstLine: string,
  languages: readonly Pick<MonacoRegisteredLanguageMetadata, "id" | "firstLine">[],
): string | null {
  for (const language of languages) {
    if (!language.firstLine) continue;
    try {
      if (new RegExp(language.firstLine, "i").test(firstLine)) return language.id;
    } catch {
      // Ignore malformed upstream patterns rather than breaking editor open.
    }
  }
  return null;
}

function inferLanguageFromContent(content: string): string | null {
  const { sample, truncated } = createLanguageDetectionSample(content);
  if (!sample) return null;
  if (looksLikeJson(sample, truncated)) return "json";

  const firstLine = readFirstLine(sample)?.toLowerCase() ?? "";

  if (firstLine.startsWith("#!")) {
    if (/\b(?:python|python3)\b/.test(firstLine)) return "python";
    if (/\b(?:node|deno|bun)\b/.test(firstLine)) return "javascript";
    if (/\b(?:bash|sh|zsh|fish)\b/.test(firstLine)) return "shell";
    if (/\bruby\b/.test(firstLine)) return "ruby";
    if (/\bperl\b/.test(firstLine)) return "perl";
    if (/\bphp\b/.test(firstLine)) return "php";
  }

  if (/^<\?xml\b/i.test(sample)) return "xml";
  if (/^(?:<!doctype\s+html\b|<html[\s>])/i.test(sample)) return "html";
  if (/^<svg[\s>]/i.test(sample)) return "xml";
  if (/^\s*FROM\s+\S+/im.test(sample) && /^\s*(?:RUN|COPY|ADD|CMD|ENTRYPOINT|WORKDIR|ENV)\b/im.test(sample)) return "dockerfile";
  if (/^\s*<\?php\b/i.test(sample)) return "php";
  if (/\bSELECT\b[\s\S]{0,240}\bFROM\b/i.test(sample) || /\bCREATE\s+(?:TABLE|INDEX|VIEW|DATABASE)\b/i.test(sample)) return "sql";
  if (/^[\w.-]+:\s+\S/m.test(sample) && /\n\s+(?:-|[\w.-]+:)/.test(sample)) return "yaml";
  if (/^\s*[\w.-]+\s*=\s*.+$/m.test(sample) && !/[{};]/.test(sample.slice(0, 500))) return "ini";
  if (/^(?:\s*[.#]?[\w-]+(?:\s+[.#]?[\w-]+)*\s*\{|\s*@media\b)/m.test(sample)) return "css";

  const codeLanguage = inferProgrammingLanguageFromContent(sample);
  if (codeLanguage) return codeLanguage;

  return null;
}

function inferProgrammingLanguageFromContent(sample: string): string | null {
  if (/^\s*#include\s*<[^>]+>/m.test(sample)) {
    if (/\b(?:std::|using\s+namespace\s+std|template\s*<|class\s+\w+\s*[:{])/.test(sample)) return "cpp";
    return "c";
  }
  if (/\bint\s+main\s*\([^)]*\)\s*[{]/.test(sample) || /\bprintf\s*\(/.test(sample)) return "c";
  if (/\bpublic\s+(?:final\s+)?class\s+\w+/.test(sample) || /\bSystem\.out\.println\s*\(/.test(sample)) return "java";
  if (/^\s*package\s+\w+/m.test(sample) && /\bfunc\s+\w+\s*\(/.test(sample)) return "go";
  if (/^\s*(?:from\s+[\w.]+\s+import\s+\w+|import\s+[\w.]+|def\s+\w+\s*\(|class\s+\w+\s*[:(])/m.test(sample)) return "python";
  if (/\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=/.test(sample) || /\bfunction\s+[A-Za-z_$][\w$]*\s*\(/.test(sample) || /=>/.test(sample)) {
    if (/\binterface\s+\w+\s*[{]/.test(sample) || /:\s*(?:string|number|boolean|unknown|Record<|readonly\s+)/.test(sample)) return "typescript";
    return "javascript";
  }
  if (/^\s*(?:import|export)\s+(?:type\s+)?(?:[\w${}* ,]+\s+from\s+)?["'][^"']+["'];?/m.test(sample)) return "javascript";
  if (/\bfn\s+main\s*\(/.test(sample) || /\blet\s+mut\s+\w+/.test(sample)) return "rust";
  if (/\b(?:echo|set\s+-e|export\s+\w+=|if\s+\[[^\]]+\];\s*then)\b/.test(sample)) return "shell";
  return null;
}

function createLanguageDetectionSample(content: string): { sample: string; truncated: boolean } {
  const scanLimit = Math.min(content.length, LANGUAGE_DETECTION_LEADING_SCAN_CHARS);
  let start = 0;
  while (start < scanLimit && /\s/.test(content[start] ?? "")) start += 1;
  if (start >= scanLimit) return { sample: "", truncated: content.length > scanLimit };
  const end = Math.min(content.length, start + LANGUAGE_DETECTION_SAMPLE_CHARS);
  return {
    sample: content.slice(start, end),
    truncated: end < content.length,
  };
}

function looksLikeJson(sample: string, truncated: boolean): boolean {
  const trimmed = sample.trim();
  const first = trimmed[0] ?? "";
  if (!trimmed || !["{", "["].includes(first)) return false;

  // For small complete samples, use the real JSON parser to avoid false
  // positives. For large/truncated files, do not parse the whole document just
  // to select syntax highlighting; infer from the opening JSON structure.
  if (!truncated && trimmed.length <= JSON_STRICT_PARSE_LIMIT_CHARS) {
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      return false;
    }
  }

  if (first === "{") return looksLikeJsonObjectPrefix(trimmed);
  return looksLikeJsonArrayPrefix(trimmed);
}

function looksLikeJsonObjectPrefix(trimmed: string): boolean {
  if (/^\{\s*\}/.test(trimmed)) return true;
  // JSON object keys must be quoted; JS object literals like { foo: 1 } should
  // not be classified as JSON by the extensionless-content fallback.
  return /^\{\s*"(?:[^"\\]|\\.)*"\s*:/.test(trimmed);
}

function looksLikeJsonArrayPrefix(trimmed: string): boolean {
  if (/^\[\s*\]/.test(trimmed)) return true;
  return /^\[\s*(?:\{|\[|"|-?\d|true\b|false\b|null\b)/.test(trimmed);
}

function readFirstLine(content: string | null | undefined): string | null {
  if (!content) return null;
  return content.split(/\r?\n/, 1)[0] ?? null;
}

function globLikePatternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

export const languageExtensionForPath = languageForPath;
