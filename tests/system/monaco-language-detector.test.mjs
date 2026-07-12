import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const tsxCliPath = createRequire(import.meta.url).resolve('tsx/cli');

function detect(path, content) {
  const directory = mkdtempSync(join(tmpdir(), 'tracevane-language-detect-'));
  const inputPath = join(directory, 'input.json');
  writeFileSync(inputPath, JSON.stringify({ path, content }));
  try {
    const script = `import { readFileSync } from 'node:fs';\nimport { detectLanguageForFile } from './apps/web/src/shared/editor-core/language.ts';\nconst input = JSON.parse(readFileSync(${JSON.stringify(inputPath)}, 'utf8'));\nconsole.log(detectLanguageForFile(input));\n`;
    return execFileSync(process.execPath, [tsxCliPath, '--eval', script], { encoding: 'utf8' }).trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('Monaco language detector recognizes compound backup filenames', () => {
  assert.equal(detect('/home/binbin/.openclaw/openclaw.json.last-good', '{"ok":true}\n'), 'json');
  assert.equal(detect('/home/binbin/.openclaw/openclaw.json.bak.2', '{"ok":true}\n'), 'json');
  assert.equal(detect('/home/binbin/.openclaw/openclaw.json.backup', '{"ok":true}\n'), 'json');
  assert.equal(detect('/home/binbin/.openclaw/openclaw.json.pre-update', '{"ok":true}\n'), 'json');
  assert.equal(detect('/home/binbin/.openclaw/openclaw.json.clobbered.2026-05-07T04-40-40-752Z', '{"ok":true}\n'), 'json');
});

test('Monaco language detector recognizes code by content when extension is absent or unrelated', () => {
  assert.equal(detect('123', '{"ok":true}\n'), 'json');
  const largeExtensionlessJson = JSON.stringify({
    meta: { fixture: 'extensionless-large-json' },
    items: Array.from({ length: 900 }, (_, index) => ({ index, enabled: index % 2 === 0, value: `entry-${index}` })),
  }, null, 2);
  assert.ok(largeExtensionlessJson.length > 8192);
  assert.equal(detect('/home/binbin/.openclaw/123', largeExtensionlessJson), 'json');
  const hugeExtensionlessJson = `[{\n${Array.from({ length: 10_000 }, (_, index) => `  {\"index\": ${index}, \"enabled\": ${index % 2 === 0}},`).join('\n')}\n  {\"done\": true}\n]`;
  assert.ok(hugeExtensionlessJson.length > 300_000);
  assert.equal(detect('/home/binbin/.openclaw/huge-json-without-extension', hugeExtensionlessJson), 'json');
  assert.equal(detect('object-literal', '{ foo: 1, bar: true }\n'), 'plaintext');
  assert.equal(detect('component.snapshot', 'const answer = 42;\nfunction greet(name) { return `hello ${name}`; }\n'), 'javascript');
  assert.equal(detect('native-source.unknown', '#include <stdio.h>\nint main(void) { printf("tracevane\\n"); return 0; }\n'), 'c');
  assert.equal(detect('serverfile', 'package main\nfunc main() {}\n'), 'go');
  assert.equal(detect('script', '#!/usr/bin/env python3\nprint("tracevane")\n'), 'python');
});
