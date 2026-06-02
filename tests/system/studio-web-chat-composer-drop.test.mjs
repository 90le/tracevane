import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const composerBar = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/ComposerBar.vue'),
  'utf8',
);

test('composer editor file drops do not bubble into the shell drop handler', () => {
  const editorDropStart = composerBar.indexOf('function handleEditorDrop(event: DragEvent): void {');
  assert.notEqual(editorDropStart, -1);
  const editorDropEnd = composerBar.indexOf('function handlePaste', editorDropStart);
  assert.notEqual(editorDropEnd, -1);
  const editorDropSource = composerBar.slice(editorDropStart, editorDropEnd);

  const stopPropagationIndex = editorDropSource.indexOf('event.stopPropagation();');
  const clearShellDragIndex = editorDropSource.indexOf('isFileDragOver.value = false;');
  const emitFilesIndex = editorDropSource.indexOf("emit('select-files', files);");

  assert.notEqual(stopPropagationIndex, -1);
  assert.notEqual(clearShellDragIndex, -1);
  assert.notEqual(emitFilesIndex, -1);
  assert.ok(stopPropagationIndex < emitFilesIndex);
  assert.ok(clearShellDragIndex < emitFilesIndex);

  const shellDropStart = composerBar.indexOf('function handleShellDrop(event: DragEvent): void {');
  assert.notEqual(shellDropStart, -1);
  const shellDropEnd = composerBar.indexOf('function openAttachmentPreview', shellDropStart);
  assert.notEqual(shellDropEnd, -1);
  const shellDropSource = composerBar.slice(shellDropStart, shellDropEnd);
  assert.match(shellDropSource, /emit\('select-files', files\);/);
});
