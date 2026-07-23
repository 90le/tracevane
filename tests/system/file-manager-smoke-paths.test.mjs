import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolveWritableSmokeDirectory } from '../file-manager/file-manager-smoke-paths.mjs';

test('file-manager smokes prefer their owned temp directory inside the selected root', () => {
  const originalTempDir = process.env.TRACEVANE_SMOKE_TEMP_DIR;
  const homeRoot = path.parse(os.homedir()).root;
  const rootPath = process.platform === 'win32'
    ? (/^c:/i.test(homeRoot) ? 'D:\\' : 'C:\\')
    : '/';
  const smokeTempDir = path.join(rootPath, 'tracevane-ci', 'owned-smoke-temp');
  process.env.TRACEVANE_SMOKE_TEMP_DIR = smokeTempDir;

  try {
    const result = resolveWritableSmokeDirectory({
      defaultRootId: 'fixture-root',
      roots: [{ id: 'fixture-root', absolutePath: rootPath }],
    }, 'online-editor-fixture');

    assert.equal(
      result.directoryPath,
      ['tracevane-ci', 'owned-smoke-temp', 'online-editor-fixture'].join('/'),
    );
  } finally {
    if (originalTempDir === undefined) {
      delete process.env.TRACEVANE_SMOKE_TEMP_DIR;
    } else {
      process.env.TRACEVANE_SMOKE_TEMP_DIR = originalTempDir;
    }
  }
});
