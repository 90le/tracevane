import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBoundedCollapsedPreview,
  hasCollapsedPreviewContent,
  hasTrimmedLineCountAtLeast,
} from '../../dist/lib/chat-deferred-preview.js';

test('bounded deferred previews collapse whitespace and preserve visible order', () => {
  assert.equal(
    buildBoundedCollapsedPreview('  alpha\n\n beta\tgamma  ', 80),
    'alpha beta gamma',
  );
});

test('bounded deferred previews stop at the preview window for huge messages', () => {
  const huge = `alpha ${'x'.repeat(50_000)} omega`;
  const preview = buildBoundedCollapsedPreview(huge, 24);

  assert.equal(preview, 'alpha xxxxxxxxxxxxxxxxx…');
  assert.equal(preview.length, 24);
  assert.equal(preview.includes('omega'), false);
});

test('deferred preview content detection avoids trim allocation semantics', () => {
  assert.equal(hasCollapsedPreviewContent(' \n\t\r '), false);
  assert.equal(hasCollapsedPreviewContent('\n\n alpha '), true);
});

test('trimmed line threshold ignores outer whitespace without splitting lines', () => {
  assert.equal(hasTrimmedLineCountAtLeast('\n\nalpha\nbeta\n\n', 2), true);
  assert.equal(hasTrimmedLineCountAtLeast('\n\nalpha\n\n', 2), false);
  assert.equal(hasTrimmedLineCountAtLeast('alpha\r\nbeta\r\ncharlie', 3), true);
  assert.equal(hasTrimmedLineCountAtLeast(' \n\t ', 1), false);
});
