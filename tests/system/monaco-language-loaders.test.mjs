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

test('generated Monaco language loaders cover every installed Monaco language contribution', () => {
  const generated = readFileSync(GENERATED_LOADER_PATH, 'utf8');
  const basicLanguages = contributionDirectories(
    join(MONACO_VS_ROOT, 'basic-languages'),
    (language) => `${language}.contribution.js`,
  );
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
        .filter((alias) => basicLanguages.includes(alias))
        .sort()
        .map((alias) => [alias, sourceLanguage]),
    )
    .sort(([left], [right]) => left.localeCompare(right));

  for (const language of basicLanguages) {
    assert.ok(
      generated.includes(`installMonacoBasicLanguage("${language}", () => import("monaco-editor/esm/vs/basic-languages/${language}/${language}.contribution.js"), () => import("monaco-editor/esm/vs/basic-languages/${language}/${language}.js"))`),
      `missing basic Monaco tokenizer installer for ${language}`,
    );
  }
  for (const language of richLanguages) {
    assert.ok(
      generated.includes(`import("monaco-editor/esm/vs/language/${language}/monaco.contribution.js")`),
      `missing rich Monaco loader for ${language}`,
    );
    if (basicLanguages.includes(language)) {
      assert.ok(
        generated.includes(`"${language}": () => Promise.all([installMonacoBasicLanguage("${language}", () => import("monaco-editor/esm/vs/basic-languages/${language}/${language}.contribution.js"), () => import("monaco-editor/esm/vs/basic-languages/${language}/${language}.js")), import("monaco-editor/esm/vs/language/${language}/monaco.contribution.js")])`),
        `rich Monaco loader for ${language} must also install its basic tokenizer contribution`,
      );
    }
  }
  assert.match(generated, new RegExp(`basic: ${basicLanguages.length},`));
  for (const [alias, sourceLanguage] of richAliasEntries) {
    assert.ok(
      generated.includes(`"${alias}": () => Promise.all([installMonacoBasicLanguage("${alias}", () => import("monaco-editor/esm/vs/basic-languages/${alias}/${alias}.contribution.js"), () => import("monaco-editor/esm/vs/basic-languages/${alias}/${alias}.js")), import("monaco-editor/esm/vs/language/${sourceLanguage}/monaco.contribution.js")])`),
      `missing combined rich Monaco alias loader for ${alias} -> ${sourceLanguage}`,
    );
  }
  assert.match(generated, new RegExp(`rich: ${richLanguages.length},`));
  assert.match(generated, new RegExp(`richAliases: ${richAliasEntries.length},`));
  assert.match(
    generated,
    new RegExp(`total: ${new Set([...basicLanguages, ...richLanguages, ...richAliasEntries.map(([alias]) => alias)]).size},`),
  );
});

test('file language detector can produce every installed Monaco basic language id', () => {
  const languageDetector = readFileSync(LANGUAGE_DETECTOR_PATH, 'utf8');
  const basicLanguages = contributionDirectories(
    join(MONACO_VS_ROOT, 'basic-languages'),
    (language) => `${language}.contribution.js`,
  );

  for (const language of basicLanguages) {
    assert.match(
      languageDetector,
      new RegExp(`"${language.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`),
      `languageForPath cannot emit Monaco language id ${language}`,
    );
  }
});
