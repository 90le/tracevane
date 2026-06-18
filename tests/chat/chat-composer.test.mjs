import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  buildTracevaneResourceRefFromRelativePath,
  formatMarkdownResourceDestination,
} from '../../dist/lib/tracevane-resource-refs.js';
import {
  buildPersistableComposerDraft,
  parsePersistedComposerDraft,
} from '../../dist/lib/chat-composer-draft.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const chatComposerSource = fs.readFileSync(path.join(rootDir, 'lib/chat-composer.ts'), 'utf8');
const composerModelSource = fs.readFileSync(path.join(rootDir, 'lib/composer-model.ts'), 'utf8');

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

test('composer serialization keeps inline resource order and explicit Tracevane refs', () => {
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
    '请参考 [@diagram.png](uploads:123-diagram.png "tracevane:inline-image")，再结合 [@report.pdf](uploads:456-report.pdf "tracevane:inline-chip")。',
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
    '请看 [@report final.pdf](<uploads:2026 report final.pdf> "tracevane:inline-chip")',
  );
});

test('composer file refs carry canonical tracevane resource refs', () => {
  const refs = buildComposerFileRefs([
    { id: 'img-1', type: 'image', fileName: 'diagram.png', relativePath: 'uploads/diagram.png' },
    { id: 'doc-1', type: 'file', fileName: 'notes.md', relativePath: 'docs/notes.md' },
  ]);

  assert.equal(refs[0]?.resourceRef, 'uploads:diagram.png');
  assert.equal(refs[1]?.resourceRef, 'workspace:docs/notes.md');
});

test('tracevane resource ref helpers keep display refs portable', () => {
  assert.equal(buildTracevaneResourceRefFromRelativePath('uploads/a.png'), 'uploads:a.png');
  assert.equal(buildTracevaneResourceRefFromRelativePath('docs/a.md'), 'workspace:docs/a.md');
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
    '请参考 [@diagram.png](uploads:diagram.png "tracevane:inline-image")，并阅读附件。',
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

test('composer send plan can reuse a normalized document without re-normalizing', () => {
  const normalizedDocument = [
    { type: 'text', id: 'text-1', text: '  hello ' },
    { type: 'resource-ref', id: 'ref-1', attachmentId: 'doc-1', display: 'inline-chip' },
    { type: 'text', id: 'text-2', text: ' world  ' },
  ];
  const plan = buildComposerSendPlan({
    clientRequestId: 'ui-normalized-send-plan',
    normalizedDocument: true,
    document: normalizedDocument,
    attachments: [
      {
        id: 'doc-1',
        type: 'file',
        fileName: 'brief.md',
        mimeType: 'text/markdown',
        content: '',
        dataUrl: '/api/chat/sessions/demo/media/brief.md',
        downloadUrl: '/api/chat/sessions/demo/media/brief.md?download=1',
        relativePath: 'uploads/brief.md',
        uploadState: 'ready',
      },
    ],
  });

  assert.equal(plan.document, normalizedDocument);
  assert.equal(plan.payload.composerDocument, normalizedDocument);
  assert.equal(plan.previewText, 'hello  world');
  assert.equal(
    plan.text,
    '  hello [@brief.md](uploads:brief.md "tracevane:inline-chip") world  ',
  );
  assert.deepEqual(plan.payload.fileRefs, plan.fileRefs);
});

test('composer send plan forwards normalized document fast path into model builders', () => {
  assert.match(chatComposerSource, /normalizedDocument\?: boolean;/);
  assert.match(chatComposerSource, /input\.normalizedDocument\s*\?\s*\(input\.document \|\| \[\]\)\s*:\s*normalizeComposerDocument\(input\.document\)/);
  assert.match(
    chatComposerSource,
    /serializeComposerDocumentToMarkdown\(document, attachments, \{ normalizedDocument: true \}\)/,
  );
  assert.match(
    chatComposerSource,
    /buildComposerMessageBlocks\(document, attachments, \{ normalizedDocument: true \}\)/,
  );
  assert.match(chatComposerSource, /previewText: extractNormalizedComposerPlainText\(document\)\.trim\(\)/);
  assert.doesNotMatch(chatComposerSource, /extractComposerPlainText/);

  const serializeStart = composerModelSource.indexOf('export function serializeComposerDocumentToMarkdown');
  assert.notEqual(serializeStart, -1);
  const serializeEnd = composerModelSource.indexOf('function buildParagraphSegments', serializeStart);
  assert.notEqual(serializeEnd, -1);
  const serializeSource = composerModelSource.slice(serializeStart, serializeEnd);
  assert.match(serializeSource, /options: \{ normalizedDocument\?: boolean \} = \{\}/);
  assert.match(serializeSource, /const nodes = options\.normalizedDocument \? \(document \|\| \[\]\) : normalizeComposerDocument\(document\);/);

  const blocksStart = composerModelSource.indexOf('export function buildComposerMessageBlocks');
  assert.notEqual(blocksStart, -1);
  const blocksEnd = composerModelSource.indexOf('export function buildComposerFileRefs', blocksStart);
  assert.notEqual(blocksEnd, -1);
  const blocksSource = composerModelSource.slice(blocksStart, blocksEnd);
  assert.match(blocksSource, /options: \{ normalizedDocument\?: boolean \} = \{\}/);
  assert.match(blocksSource, /const normalized = options\.normalizedDocument \? \(document \|\| \[\]\) : normalizeComposerDocument\(document\);/);
  assert.match(blocksSource, /serializeComposerDocumentToMarkdown\(normalized, attachments, \{ normalizedDocument: true \}\)/);
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

test('composer send plan preserves file refs when preparing queued flush payloads', () => {
  const plan = buildComposerSendPlan({
    clientRequestId: 'ui-queued-with-file',
    flushWhenIdle: true,
    document: [
      { type: 'text', id: 'text-1', text: 'queued file ' },
      { type: 'resource-ref', id: 'ref-1', attachmentId: 'doc-1', display: 'inline-chip' },
    ],
    attachments: [
      {
        id: 'doc-1',
        type: 'file',
        fileName: 'brief final.pdf',
        mimeType: 'application/pdf',
        content: '',
        dataUrl: '/api/chat/sessions/demo/media/brief-final.pdf',
        downloadUrl: '/api/chat/sessions/demo/media/brief-final.pdf?download=1',
        relativePath: 'uploads/brief final.pdf',
        uploadState: 'ready',
      },
    ],
  });

  assert.equal(plan.payload.flushWhenIdle, true);
  assert.equal(
    plan.payload.text,
    'queued file [@brief final.pdf](<uploads:brief final.pdf> "tracevane:inline-chip")',
  );
  assert.deepEqual(plan.payload.fileRefs, [
    {
      id: 'doc-1',
      fileName: 'brief final.pdf',
      kind: 'file',
      mimeType: 'application/pdf',
      relativePath: 'uploads/brief final.pdf',
      resourceRef: 'uploads:brief final.pdf',
    },
  ]);
  assert.equal(plan.payload.attachments, undefined);
});

test('composer draft persistence keeps ready uploads and prunes volatile resource refs', () => {
  const draft = buildPersistableComposerDraft({
    updatedAt: '2026-06-01T10:00:00.000Z',
    document: [
      { type: 'text', id: 'text-1', text: '请看 ' },
      { type: 'resource-ref', id: 'ref-ready', attachmentId: 'ready-doc', display: 'inline-chip' },
      { type: 'text', id: 'text-2', text: ' 和 ' },
      { type: 'resource-ref', id: 'ref-uploading', attachmentId: 'uploading-doc', display: 'inline-chip' },
    ],
    attachments: [
      {
        id: 'ready-doc',
        type: 'file',
        fileName: 'ready.pdf',
        mimeType: 'application/pdf',
        content: 'local-cache-is-not-persisted',
        dataUrl: '/api/chat/sessions/demo/media/ready.pdf',
        downloadUrl: '/api/chat/sessions/demo/media/ready.pdf?download=1',
        relativePath: 'uploads/ready.pdf',
        uploadState: 'ready',
        size: 128,
      },
      {
        id: 'uploading-doc',
        type: 'file',
        fileName: 'uploading.pdf',
        mimeType: 'application/pdf',
        content: 'base64',
        dataUrl: 'data:application/pdf;base64,base64',
        relativePath: null,
        uploadState: 'uploading',
      },
    ],
  });

  assert.ok(draft);
  assert.equal(draft.updatedAt, '2026-06-01T10:00:00.000Z');
  assert.equal(draft.attachments.length, 1);
  assert.equal(draft.attachments[0]?.id, 'ready-doc');
  assert.equal('content' in draft.attachments[0], false);
  assert.equal(
    draft.document.some((node) => node.type === 'resource-ref' && node.attachmentId === 'uploading-doc'),
    false,
  );
});

test('composer persisted draft parser rejects broken drafts and restores ready attachment state', () => {
  assert.equal(parsePersistedComposerDraft({ version: 2 }), null);
  assert.equal(parsePersistedComposerDraft({ version: 1, document: [], attachments: [] }), null);

  const parsed = parsePersistedComposerDraft({
    version: 1,
    updatedAt: '2026-06-01T11:00:00.000Z',
    document: [
      { type: 'text', id: 'text-1', text: 'draft with file ' },
      { type: 'resource-ref', id: 'ref-1', attachmentId: 'doc-1', display: 'inline-chip' },
      { type: 'resource-ref', id: 'ref-missing', attachmentId: 'missing-doc', display: 'inline-chip' },
    ],
    attachments: [
      {
        id: 'doc-1',
        type: 'file',
        fileName: 'notes.md',
        mimeType: 'text/markdown',
        dataUrl: '/api/chat/sessions/demo/media/notes.md',
        downloadUrl: '/api/chat/sessions/demo/media/notes.md?download=1',
        relativePath: 'uploads/notes.md',
        uploadState: 'failed',
      },
    ],
  });

  assert.ok(parsed);
  assert.equal(parsed.attachments[0]?.uploadState, 'ready');
  assert.equal(
    parsed.document.some((node) => node.type === 'resource-ref' && node.attachmentId === 'missing-doc'),
    false,
  );
});
