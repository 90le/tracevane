import test from 'node:test';
import assert from 'node:assert/strict';

import {
  areComposerAttachmentsReady,
  buildComposerSendPlan,
  buildOptimisticResourcesFromComposerAttachments,
  canSendComposerDraft,
  runLimitedComposerUploadQueue,
  summarizeComposerAttachmentUploadStates,
} from '../../dist/lib/chat-composer.js';
import {
  buildComposerMessageBlocks,
  buildComposerFileRefs,
  countComposerAttachmentReferences,
  createEmptyComposerDocument,
  insertComposerResourceNodeAtOffset,
  normalizeComposerDocument,
  removeComposerAttachmentReferences,
  serializeComposerDocumentToMarkdown,
} from '../../dist/lib/composer-model.js';
import {
  buildStudioResourceRefFromRelativePath,
  formatMarkdownResourceDestination,
} from '../../dist/lib/studio-resource-refs.js';

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

test('composer attachment summary exposes blocking upload states', () => {
  const summary = summarizeComposerAttachmentUploadStates([
    { uploadState: 'ready', relativePath: 'uploads/a.png' },
    { uploadState: 'uploading', relativePath: null },
    { uploadState: 'failed', relativePath: null },
    { uploadState: 'ready', relativePath: null },
  ]);

  assert.deepEqual(summary, {
    total: 4,
    ready: 1,
    uploading: 1,
    failed: 2,
    allReady: false,
    hasBlocking: true,
  });
});

test('composer draft send gate requires content and ready attachments', () => {
  assert.equal(canSendComposerDraft({
    canSend: true,
    hasContent: false,
    attachments: [],
  }), false);
  assert.equal(canSendComposerDraft({
    canSend: true,
    hasContent: true,
    attachments: [{ uploadState: 'uploading', relativePath: null }],
  }), false);
  assert.equal(canSendComposerDraft({
    canSend: true,
    hasContent: false,
    attachments: [{ uploadState: 'ready', relativePath: 'uploads/a.png' }],
  }), true);
  assert.equal(canSendComposerDraft({
    canSend: false,
    hasContent: true,
    attachments: [{ uploadState: 'ready', relativePath: 'uploads/a.png' }],
  }), false);
});

test('limited composer upload queue caps concurrency and completes all items', async () => {
  const items = [1, 2, 3, 4, 5];
  const completed = [];
  let active = 0;
  let maxActive = 0;

  await runLimitedComposerUploadQueue(items, 2, async (item) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
    completed.push(item);
    active -= 1;
  });

  assert.equal(maxActive, 2);
  assert.deepEqual(completed.sort((a, b) => a - b), items);
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

test('composer serialization uses stable markdown destinations for refs with spaces', () => {
  const markdown = serializeComposerDocumentToMarkdown([
    { type: 'text', id: 'text-1', text: '请看 ' },
    { type: 'resource-ref', id: 'ref-1', attachmentId: 'file-1', display: 'inline-chip' },
  ], [
    { id: 'file-1', type: 'file', fileName: 'report final.pdf', relativePath: 'uploads/2026 report final.pdf' },
  ]);

  assert.equal(
    markdown,
    '请看 [@report final.pdf](<uploads:2026 report final.pdf> "studio:inline-chip")',
  );
});

test('composer file refs carry canonical studio resource refs', () => {
  const refs = buildComposerFileRefs([
    { id: 'img-1', type: 'image', fileName: 'diagram.png', relativePath: 'uploads/diagram.png' },
    { id: 'doc-1', type: 'file', fileName: 'notes.md', relativePath: 'docs/notes.md' },
  ]);

  assert.equal(refs[0]?.resourceRef, 'uploads:diagram.png');
  assert.equal(refs[1]?.resourceRef, 'workspace:docs/notes.md');
});

test('studio resource ref helpers keep display refs portable', () => {
  assert.equal(buildStudioResourceRefFromRelativePath('uploads/a.png'), 'uploads:a.png');
  assert.equal(buildStudioResourceRefFromRelativePath('docs/a.md'), 'workspace:docs/a.md');
  assert.equal(formatMarkdownResourceDestination('uploads:a b.png'), '<uploads:a b.png>');
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

test('composer send plan centralizes markdown, file refs, resources, and payload shape', () => {
  const plan = buildComposerSendPlan({
    clientRequestId: 'ui-send-plan',
    document: [
      { type: 'text', id: 'text-1', text: '请参考 ' },
      { type: 'resource-ref', id: 'ref-1', attachmentId: 'img-1', display: 'inline-image' },
      { type: 'text', id: 'text-2', text: '，并阅读附件。' },
    ],
    attachments: [
      {
        id: 'img-1',
        type: 'image',
        fileName: 'diagram.png',
        mimeType: 'image/png',
        content: '',
        dataUrl: '/api/chat/sessions/demo/media/diagram.png',
        downloadUrl: '/api/chat/sessions/demo/media/diagram.png?download=1',
        relativePath: 'uploads/diagram.png',
        uploadState: 'ready',
      },
      {
        id: 'doc-1',
        type: 'file',
        fileName: 'notes.md',
        mimeType: 'text/markdown',
        content: '',
        dataUrl: '/api/chat/sessions/demo/media/notes.md',
        downloadUrl: '/api/chat/sessions/demo/media/notes.md?download=1',
        relativePath: 'uploads/notes.md',
        uploadState: 'ready',
      },
    ],
  });

  assert.equal(
    plan.text,
    '请参考 [@diagram.png](uploads:diagram.png "studio:inline-image")，并阅读附件。',
  );
  assert.equal(plan.previewText, '请参考 ，并阅读附件。');
  assert.equal(plan.payload.clientRequestId, 'ui-send-plan');
  assert.equal(plan.payload.text, plan.text);
  assert.deepEqual(plan.payload.composerDocument, plan.document);
  assert.equal(plan.payload.attachments, undefined);
  assert.equal(plan.fileRefs.length, 2);
  assert.deepEqual(plan.payload.fileRefs, plan.fileRefs);
  assert.equal(plan.resources?.length, 2);
  assert.deepEqual(plan.blocks, [
    {
      type: 'paragraph',
      segments: [
        { type: 'text', text: '请参考 ' },
        { type: 'resource', resourceId: 'img-1', display: 'inline-image' },
        { type: 'text', text: '，并阅读附件。' },
      ],
    },
    {
      type: 'resource',
      resourceId: 'doc-1',
      display: 'card',
    },
  ]);
});

test('composer send plan keeps legacy inline image fallback isolated from uploaded file refs', () => {
  const plan = buildComposerSendPlan({
    clientRequestId: 'ui-legacy-image',
    document: [{ type: 'text', id: 'text-1', text: 'image only' }],
    attachments: [
      {
        id: 'inline-img',
        type: 'image',
        fileName: 'inline.png',
        mimeType: 'image/png',
        content: 'base64-inline',
        dataUrl: 'data:image/png;base64,base64-inline',
        relativePath: null,
        uploadState: 'uploading',
      },
    ],
  });

  assert.deepEqual(plan.fileRefs, []);
  assert.deepEqual(plan.payload.fileRefs, []);
  assert.deepEqual(plan.inlineAttachments, [
    {
      type: 'image',
      mimeType: 'image/png',
      fileName: 'inline.png',
      content: 'base64-inline',
    },
  ]);
  assert.deepEqual(plan.payload.attachments, plan.inlineAttachments);
});
