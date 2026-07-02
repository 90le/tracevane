import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const MONACO_VS_ROOT = 'node_modules/monaco-editor/esm/vs';
const GENERATED_LOADER_PATH = 'apps/web/src/features/file-manager/code-editor/monacoLanguageLoaders.ts';
const LANGUAGE_DETECTOR_PATH = 'apps/web/src/shared/editor-core/language.ts';

function contributionDirectories(root, contributionFileFor) {
  return readdirSync(root)
    .filter((entry) => {
      const directory = join(root, entry);
      return statSync(directory).isDirectory() && readdirSync(directory).includes(contributionFileFor(entry));
    })
    .sort();
}

function contributionLanguageIds(root, language, contributionFileFor) {
  const source = readFileSync(join(root, language, contributionFileFor(language)), 'utf8');
  return [...source.matchAll(/\bid:\s*["']([^"']+)["']/g)].map((match) => match[1]);
}

function basicLanguageEntries() {
  const root = join(MONACO_VS_ROOT, 'basic-languages');
  return contributionDirectories(root, (language) => `${language}.contribution.js`)
    .flatMap((directory) =>
      contributionLanguageIds(root, directory, (language) => `${language}.contribution.js`)
        .map((id) => ({ directory, id })),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

test('generated Monaco language loaders cover every installed Monaco language contribution', () => {
  const generated = readFileSync(GENERATED_LOADER_PATH, 'utf8');
  const basicEntries = basicLanguageEntries();
  const basicIds = new Set(basicEntries.map((entry) => entry.id));
  const basicDirectoryById = new Map(basicEntries.map((entry) => [entry.id, entry.directory]));
  const richLanguages = contributionDirectories(
    join(MONACO_VS_ROOT, 'language'),
    () => 'monaco.contribution.js',
  ).filter((language) => language !== 'common');

  const richLanguageAliases = {
    css: ['scss', 'less'],
    html: ['handlebars', 'razor'],
    typescript: ['javascript'],
  };
  const richAliasEntries = Object.entries(richLanguageAliases)
    .filter(([sourceLanguage]) => richLanguages.includes(sourceLanguage))
    .flatMap(([sourceLanguage, aliases]) =>
      aliases
        .filter((alias) => basicIds.has(alias))
        .sort()
        .map((alias) => [alias, sourceLanguage]),
    )
    .sort(([left], [right]) => left.localeCompare(right));

  for (const { directory, id } of basicEntries) {
    assert.ok(
      generated.includes(`installMonacoBasicLanguage("${id}", () => import("monaco-editor/esm/vs/basic-languages/${directory}/${directory}.contribution.js"), () => import("monaco-editor/esm/vs/basic-languages/${directory}/${directory}.js"))`),
      `missing basic Monaco tokenizer installer for ${id} from ${directory}`,
    );
  }
  for (const language of richLanguages) {
    assert.ok(
      generated.includes(`import("monaco-editor/esm/vs/language/${language}/monaco.contribution.js")`),
      `missing rich Monaco loader for ${language}`,
    );
    const basicDirectory = basicDirectoryById.get(language);
    if (basicDirectory) {
      assert.ok(
        generated.includes(`"${language}": () => Promise.all([installMonacoBasicLanguage("${language}", () => import("monaco-editor/esm/vs/basic-languages/${basicDirectory}/${basicDirectory}.contribution.js"), () => import("monaco-editor/esm/vs/basic-languages/${basicDirectory}/${basicDirectory}.js")), import("monaco-editor/esm/vs/language/${language}/monaco.contribution.js")])`),
        `rich Monaco loader for ${language} must also install its basic tokenizer contribution`,
      );
    }
  }
  assert.match(generated, new RegExp(`basic: ${basicEntries.length},`));
  for (const [alias, sourceLanguage] of richAliasEntries) {
    const basicDirectory = basicDirectoryById.get(alias);
    assert.ok(
      generated.includes(`"${alias}": () => Promise.all([installMonacoBasicLanguage("${alias}", () => import("monaco-editor/esm/vs/basic-languages/${basicDirectory}/${basicDirectory}.contribution.js"), () => import("monaco-editor/esm/vs/basic-languages/${basicDirectory}/${basicDirectory}.js")), import("monaco-editor/esm/vs/language/${sourceLanguage}/monaco.contribution.js")])`),
      `missing combined rich Monaco alias loader for ${alias} -> ${sourceLanguage}`,
    );
  }
  assert.match(generated, new RegExp(`rich: ${richLanguages.length},`));
  assert.match(generated, new RegExp(`richAliases: ${richAliasEntries.length},`));
  assert.match(
    generated,
    new RegExp(`total: ${new Set([...basicEntries.map((entry) => entry.id), ...richLanguages, ...richAliasEntries.map(([alias]) => alias)]).size},`),
  );
});

test('generated Monaco language metadata exposes every installed Monaco language id', () => {
  const metadata = readFileSync('apps/web/src/shared/editor-core/monacoLanguageMetadata.ts', 'utf8');
  const languageDetector = readFileSync(LANGUAGE_DETECTOR_PATH, 'utf8');
  const basicEntries = basicLanguageEntries();

  assert.match(languageDetector, /MONACO_LANGUAGE_METADATA/);
  for (const { id } of basicEntries) {
    assert.match(
      metadata,
      new RegExp(`"id": "${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`),
      `generated metadata cannot emit Monaco language id ${id}`,
    );
  }
});
