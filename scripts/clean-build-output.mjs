import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = process.env.TRACEVANE_CLEAN_ROOT
  ? path.resolve(process.env.TRACEVANE_CLEAN_ROOT)
  : path.resolve(scriptDir, '..');

const targetMap = new Map([
  ['api', ['dist']],
  ['web', ['apps/web/dist']],
]);

function usage() {
  return [
    'Usage: node scripts/clean-build-output.mjs <api|web|all>',
    '',
    'Removes generated build output before producing a fresh artifact.',
  ].join('\n');
}

function resolveTargets(scope) {
  if (scope === 'all') {
    return [...targetMap.values()].flat();
  }
  const targets = targetMap.get(scope);
  if (!targets) {
    throw new Error(usage());
  }
  return targets;
}

const scope = String(process.argv[2] || '').trim() || 'all';
for (const relativePath of resolveTargets(scope)) {
  const absolutePath = path.join(projectRoot, relativePath);
  fs.rmSync(absolutePath, { recursive: true, force: true });
  process.stdout.write(`[tracevane-clean] removed ${relativePath}\n`);
}
