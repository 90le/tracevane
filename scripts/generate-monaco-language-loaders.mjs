import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const packageRoot = 'node_modules/monaco-editor/esm/vs';

function contributionDirectories(root, contributionName) {
  return readdirSync(root)
    .filter((entry) => {
      const directory = join(root, entry);
      return statSync(directory).isDirectory() && readdirSync(directory).includes(contributionName);
    })
    .sort();
}

function basicContributionImport(language) {
  return `import("monaco-editor/esm/vs/basic-languages/${language}/${language}.contribution.js")`;
}

function basicLanguageImport(language) {
  return `import("monaco-editor/esm/vs/basic-languages/${language}/${language}.js")`;
}

function richContributionImport(language) {
  return `import("monaco-editor/esm/vs/language/${language}/monaco.contribution.js")`;
}

function installBasicCall(languageId, directory = languageId) {
  return `installMonacoBasicLanguage(${JSON.stringify(languageId)}, () => ${basicContributionImport(directory)}, () => ${basicLanguageImport(directory)})`;
}


function readContribution(language, kind) {
  const filePath = kind === 'basic'
    ? join(packageRoot, 'basic-languages', language, `${language}.contribution.js`)
    : join(packageRoot, 'language', language, 'monaco.contribution.js');
  return readFileSync(filePath, 'utf8');
}

function extractStringArray(source, propertyName) {
  const start = source.indexOf(`${propertyName}:`);
  if (start < 0) return undefined;
  const arrayStart = source.indexOf('[', start);
  if (arrayStart < 0) return undefined;
  let depth = 0;
  for (let index = arrayStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        const arrayText = source.slice(arrayStart, index + 1);
        return [...arrayText.matchAll(/(['"])((?:\\.|(?!\1).)*)\1/g)].map((match) =>
          match[2].replace(/\\(['"\\])/g, '$1'),
        );
      }
    }
  }
  return undefined;
}

function extractString(source, propertyName) {
  const match = source.match(new RegExp(`${propertyName}:\\s*([\"'])((?:\\\\.|(?!\\1).)*)\\1`));
  return match?.[2]?.replace(/\\\\(['\"\\\\])/g, '$1');
}

function extractRegisteredLanguageBlocks(source) {
  const blocks = [];
  const markers = ['registerLanguage({', 'languages.register({'];
  let searchStart = 0;
  while (searchStart < source.length) {
    const matches = markers
      .map((marker) => ({ marker, index: source.indexOf(marker, searchStart) }))
      .filter((match) => match.index >= 0)
      .sort((left, right) => left.index - right.index);
    const match = matches[0];
    if (!match) break;
    const objectStart = source.indexOf('{', match.index);
    let depth = 0;
    for (let index = objectStart; index < source.length; index += 1) {
      const char = source[index];
      if (char === '{') depth += 1;
      if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          blocks.push(source.slice(objectStart, index + 1));
          searchStart = index + 1;
          break;
        }
      }
    }
    if (searchStart <= match.index) break;
  }
  return blocks;
}

function extractLanguageMetadataFromBlock(source, fallbackId) {
  const id = extractString(source, 'id') ?? fallbackId;
  const metadata = { id };
  for (const propertyName of ['extensions', 'filenames', 'filenamePatterns', 'aliases', 'mimetypes']) {
    const values = extractStringArray(source, propertyName);
    if (values?.length) metadata[propertyName] = [...new Set(values)].sort();
  }
  const firstLine = extractString(source, 'firstLine');
  if (firstLine) metadata.firstLine = firstLine;
  return metadata;
}

function extractLanguageMetadataItems(language, kind) {
  const source = readContribution(language, kind);
  const blocks = extractRegisteredLanguageBlocks(source);
  if (!blocks.length) return [extractLanguageMetadataFromBlock(source, language)];
  return blocks.map((block) => extractLanguageMetadataFromBlock(block, language));
}

function mergeMetadata(items) {
  const merged = new Map();
  for (const item of items) {
    const existing = merged.get(item.id) ?? { id: item.id };
    for (const propertyName of ['extensions', 'filenames', 'filenamePatterns', 'aliases', 'mimetypes']) {
      const values = item[propertyName];
      if (values?.length) existing[propertyName] = [...new Set([...(existing[propertyName] ?? []), ...values])].sort();
    }
    if (!existing.firstLine && item.firstLine) existing.firstLine = item.firstLine;
    merged.set(item.id, existing);
  }
  return [...merged.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function combinedLoader(importExpressions) {
  return `() => Promise.all([${importExpressions.join(', ')}])`;
}

const richLanguages = contributionDirectories(
  join(packageRoot, 'language'),
  'monaco.contribution.js',
).filter((language) => language !== 'common');
const basicLanguages = readdirSync(join(packageRoot, 'basic-languages'))
  .filter((language) => {
    const directory = join(packageRoot, 'basic-languages', language);
    return statSync(directory).isDirectory() && readdirSync(directory).includes(`${language}.contribution.js`);
  })
  .sort();

const richLanguageAliases = {
  css: ['scss', 'less'],
  html: ['handlebars', 'razor'],
  typescript: ['javascript'],
};

const basicLanguageEntries = basicLanguages
  .flatMap((directory) =>
    extractLanguageMetadataItems(directory, 'basic').map((metadata) => ({
      directory,
      metadata,
      id: metadata.id,
    })),
  )
  .sort((left, right) => left.id.localeCompare(right.id));
const basicLanguageIds = basicLanguageEntries.map((entry) => entry.id);
const basicLanguageDirectoryById = new Map(basicLanguageEntries.map((entry) => [entry.id, entry.directory]));

const richLanguageAliasEntries = Object.entries(richLanguageAliases)
  .filter(([sourceLanguage]) => richLanguages.includes(sourceLanguage))
  .flatMap(([sourceLanguage, aliases]) =>
    aliases
      .filter((alias) => basicLanguageIds.includes(alias))
      .sort()
      .map((alias) => [alias, sourceLanguage]),
  )
  .sort(([left], [right]) => left.localeCompare(right));

const allLanguageIds = new Set([
  ...basicLanguageIds,
  ...richLanguages,
  ...richLanguageAliasEntries.map(([alias]) => alias),
]);

const languageMetadata = mergeMetadata([
  ...basicLanguageEntries.map((entry) => entry.metadata),
  ...richLanguages.flatMap((language) => extractLanguageMetadataItems(language, 'rich')),
]);

const lines = [
  '// Generated by scripts/generate-monaco-language-loaders.mjs from the installed monaco-editor package.',
  '// Do not hand-edit language coverage here; update the generator when Monaco packaging changes.',
  '',
  'import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";',
  '',
  'export type MonacoLanguageLoader = () => Promise<unknown>;',
  '',
  'type MonacoBasicLanguageModule = {',
  '  conf?: monaco.languages.LanguageConfiguration;',
  '  language?: monaco.languages.IMonarchLanguage;',
  '};',
  '',
  'async function installMonacoBasicLanguage(',
  '  languageId: string,',
  '  loadContribution: () => Promise<unknown>,',
  '  loadLanguage: () => Promise<MonacoBasicLanguageModule>,',
  '): Promise<unknown> {',
  '  const [contribution, languageModule] = await Promise.all([loadContribution(), loadLanguage()]);',
  '  if (languageModule.conf) monaco.languages.setLanguageConfiguration(languageId, languageModule.conf);',
  '  if (languageModule.language) monaco.languages.setMonarchTokensProvider(languageId, languageModule.language);',
  '  return { contribution, languageModule };',
  '}',
  '',
  'export const MONACO_BASIC_LANGUAGE_LOADERS: Record<string, MonacoLanguageLoader> = {',
  ...basicLanguageEntries.map((entry) => `  ${JSON.stringify(entry.id)}: () => ${installBasicCall(entry.id, entry.directory)},`),
  '};',
  '',
  'export const MONACO_RICH_LANGUAGE_LOADERS: Record<string, MonacoLanguageLoader> = {',
  ...richLanguages.map((language) => {
    const basicDirectory = basicLanguageDirectoryById.get(language);
    const imports = basicDirectory
      ? [installBasicCall(language, basicDirectory), richContributionImport(language)]
      : [richContributionImport(language)];
    return `  ${JSON.stringify(language)}: ${combinedLoader(imports)},`;
  }),
  '};',
  '',
  'export const MONACO_RICH_LANGUAGE_ALIAS_LOADERS: Record<string, MonacoLanguageLoader> = {',
  ...richLanguageAliasEntries.map(([alias, sourceLanguage]) => {
    const imports = [installBasicCall(alias, basicLanguageDirectoryById.get(alias)), richContributionImport(sourceLanguage)];
    return `  ${JSON.stringify(alias)}: ${combinedLoader(imports)},`;
  }),
  '};',
  '',
  'export const MONACO_LANGUAGE_LOADERS: Record<string, MonacoLanguageLoader> = {',
  '  ...MONACO_BASIC_LANGUAGE_LOADERS,',
  '  ...MONACO_RICH_LANGUAGE_LOADERS,',
  '  ...MONACO_RICH_LANGUAGE_ALIAS_LOADERS,',
  '};',
  '',
  'export const MONACO_LANGUAGE_LOADER_COUNTS = {',
  `  basic: ${basicLanguageEntries.length},`,
  `  rich: ${richLanguages.length},`,
  `  richAliases: ${richLanguageAliasEntries.length},`,
  `  total: ${allLanguageIds.size},`,
  '} as const;',
  '',
];

writeFileSync(
  'apps/web/src/features/file-manager/code-editor/monacoLanguageLoaders.ts',
  `${lines.join('\n')}\n`,
);


const metadataLines = [
  '// Generated by scripts/generate-monaco-language-loaders.mjs from the installed monaco-editor package.',
  '// Do not hand-edit Monaco language metadata here.',
  '',
  'export interface MonacoLanguageMetadata {',
  '  id: string;',
  '  aliases?: readonly string[];',
  '  extensions?: readonly string[];',
  '  filenames?: readonly string[];',
  '  filenamePatterns?: readonly string[];',
  '  firstLine?: string;',
  '  mimetypes?: readonly string[];',
  '}',
  '',
  'export const MONACO_LANGUAGE_METADATA = ',
  `${JSON.stringify(languageMetadata, null, 2)} as const satisfies readonly MonacoLanguageMetadata[];`,
  '',
];

writeFileSync(
  'apps/web/src/shared/editor-core/monacoLanguageMetadata.ts',
  `${metadataLines.join('\n')}\n`,
);

const declarationLines = [
  '// Generated by scripts/generate-monaco-language-loaders.mjs from the installed monaco-editor package.',
  '// Do not hand-edit Monaco basic-language module declarations here.',
  '',
  ...basicLanguages.flatMap((language) => [
    `declare module "monaco-editor/esm/vs/basic-languages/${language}/${language}.js" {`,
    '  export const conf: import("monaco-editor/esm/vs/editor/editor.api.js").languages.LanguageConfiguration | undefined;',
    '  export const language: import("monaco-editor/esm/vs/editor/editor.api.js").languages.IMonarchLanguage | undefined;',
    '}',
    '',
  ]),
];

writeFileSync(
  'apps/web/src/features/file-manager/code-editor/monacoBasicLanguageModules.d.ts',
  `${declarationLines.join('\n')}\n`,
);
