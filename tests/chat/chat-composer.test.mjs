import test from 'node:test';
import assert from 'node:assert/strict';

import {
  areComposerAttachmentsReady,
  buildOptimisticResourcesFromComposerAttachments,
} from '../../dist/lib/chat-composer.js';
import {
  buildComposerMessageBlocks,
  countComposerAttachmentReferences,
  createEmptyComposerDocument,
  insertComposerResourceNodeAtOffset,
  normalizeComposerDocument,
  removeComposerAttachmentReferences,
  serializeComposerDocumentToMarkdown,
} from '../../dist/lib/composer-model.js';

test('composer attachments block send while uploading or failed', () => {
  assert.equal(areComposerAttachmentsReady([]), true);
  assert.equal(areComposerAttachmentsReady([
    { uploadState: 'ready', relativePath: 'uploads/a.png' },
    { uploadState: 'ready', relativePath: 'uploads/b.pdf' },
  ]), true);
  assert.equal(areComposerAttachmentsReady([
    { uploadState: 'uploading', relativePath: null },
  ]), false);
  assert.equal(areComposerAttachmentsReady([
    { uploadState: 'failed', relativePath: null },
  ]), false);
});

test('optimistic resources only include ready attachments', () => {
  const resources = buildOptimisticResourcesFromComposerAttachments([
    {
      id: 'ready-1',
      type: 'image',
      fileName: 'a.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,aaaa',
      relativePath: 'uploads/a.png',
      uploadState: 'ready',
    },
    {
      id: 'uploading-1',
      type: 'file',
      fileName: 'b.pdf',
      mimeType: 'application/pdf',
      dataUrl: 'data:application/pdf;base64,bbbb',
      relativePath: null,
      uploadState: 'uploading',
    },
    {
      id: 'failed-1',
      type: 'file',
      fileName: 'c.pdf',
      mimeType: 'application/pdf',
      dataUrl: 'data:application/pdf;base64,cccc',
      relativePath: null,
      uploadState: 'failed',
    },
  ]);

  assert.equal(resources.length, 1);
  assert.equal(resources[0]?.fileName, 'a.png');
  assert.equal(resources[0]?.status, 'ready');
});

test('composer resource insertion supports click insertion and multiple references', () => {
  let document = normalizeComposerDocument([
    { type: 'text', id: 'text-1', text: '请参考 ' },
    { type: 'text', id: 'text-2', text: '，再看一遍。' },
  ], { editorSurface: true });

  document = insertComposerResourceNodeAtOffset(document, 'img-1', 'inline-image', 4);
  document = insertComposerResourceNodeAtOffset(document, 'img-1', 'inline-image', 6);

  assert.equal(countComposerAttachmentReferences(document, 'img-1'), 2);
  assert.deepEqual(
    document.filter((node) => node.type === 'resource-ref').map((node) => node.attachmentId),
    ['img-1', 'img-1'],
  );
});

test('composer resource insertion supports drag insertion into text middle', () => {
  const document = insertComposerResourceNodeAtOffset([
    { type: 'text', id: 'text-1', text: '前文后文' },
  ], 'file-1', 'inline-chip', 2);

  assert.deepEqual(
    document.map((node) => {
      if (node.type === 'text') {
        return node.text;
      }
      return `${node.type}:${node.attachmentId}:${node.display}`;
    }),
    ['前文', 'resource-ref:file-1:inline-chip', '后文'],
  );
});

test('composer remove attachment prunes every inline reference', () => {
  const document = removeComposerAttachmentReferences([
    { type: 'text', id: 'text-1', text: 'A' },
    { type: 'resource-ref', id: 'ref-1', attachmentId: 'img-1', display: 'inline-image' },
    { type: 'text', id: 'text-2', text: 'B' },
    { type: 'resource-ref', id: 'ref-2', attachmentId: 'img-1', display: 'inline-image' },
  ], 'img-1');

  assert.equal(countComposerAttachmentReferences(document, 'img-1'), 0);
  assert.equal(document.some((node) => node.type === 'resource-ref'), false);
});

test('composer serialization keeps inline resource order and explicit Studio refs', () => {
  const markdown = serializeComposerDocumentToMarkdown([
    { type: 'text', id: 'text-1', text: '请参考 ' },
    { type: 'resource-ref', id: 'ref-1', attachmentId: 'img-1', display: 'inline-image' },
    { type: 'text', id: 'text-2', text: '，再结合 ' },
    { type: 'resource-ref', id: 'ref-2', attachmentId: 'file-1', display: 'inline-chip' },
    { type: 'text', id: 'text-3', text: '。' },
  ], [
    { id: 'img-1', type: 'image', fileName: 'diagram.png', relativePath: 'uploads/123-diagram.png' },
    { id: 'file-1', type: 'file', fileName: 'report.pdf', relativePath: 'uploads/456-report.pdf' },
  ]);

  assert.equal(
    markdown,
    '请参考 [@diagram.png](uploads:123-diagram.png "studio:inline-image")，再结合 [@report.pdf](uploads:456-report.pdf "studio:inline-chip")。',
  );
});

test('composer message blocks keep referenced resources inline and unreferenced resources as fallback cards', () => {
  const blocks = buildComposerMessageBlocks([
    { type: 'text', id: 'text-1', text: '请参考 ' },
    { type: 'resource-ref', id: 'ref-1', attachmentId: 'img-1', display: 'inline-image' },
    { type: 'text', id: 'text-2', text: '。' },
  ], [
    { id: 'img-1', type: 'image', fileName: 'diagram.png', relativePath: 'uploads/diagram.png' },
    { id: 'file-1', type: 'file', fileName: 'report.pdf', relativePath: 'uploads/report.pdf' },
  ]);

  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]?.type, 'paragraph');
  assert.deepEqual(blocks[0]?.segments, [
    { type: 'text', text: '请参考 ' },
    { type: 'resource', resourceId: 'img-1', display: 'inline-image' },
    { type: 'text', text: '。' },
  ]);
  assert.deepEqual(blocks[1], {
    type: 'resource',
    resourceId: 'file-1',
    display: 'card',
  });
});
