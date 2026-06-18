import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import 'tsx/esm';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runtimeSummaryPath = path.join(rootDir, 'apps/api/modules/system/runtime-summary.ts');
const servicePath = path.join(rootDir, 'apps/api/modules/system/service.ts');
const routesPath = path.join(rootDir, 'apps/api/modules/system/routes.ts');
const runtimeSummaryModuleUrl = `${pathToFileURL(runtimeSummaryPath).href}?t=${Date.now()}`;

test('buildSystemRuntimeSummary derives control center summary fields', async () => {
  const runtimeSummary = await import(runtimeSummaryModuleUrl);
  const summary = runtimeSummary.buildSystemRuntimeSummary({
    checkedAt: '2026-04-13T00:00:00.000Z',
    gatewayConnected: true,
    bootstrapPendingCount: 2,
    updateLatestVersion: '0.2.0',
    updateAvailable: true,
    tracevaneUpgradeRunning: false,
    helperRepairPending: false,
  });

  assert.deepEqual(summary, {
    checkedAt: '2026-04-13T00:00:00.000Z',
    gatewayConnected: true,
    bootstrapPendingCount: 2,
    updateLatestVersion: '0.2.0',
    updateAvailable: true,
    tracevaneUpgradeRunning: false,
    helperRepairPending: false,
    level: 'warn',
  });
});

test('system service and routes consume runtime summary helper seam', () => {
  const serviceSource = fs.readFileSync(servicePath, 'utf8');
  const routesSource = fs.readFileSync(routesPath, 'utf8');

  assert.match(serviceSource, /from '\.\/runtime-summary\.js'/);
  assert.match(serviceSource, /buildSystemRuntimeSummary\(/);
  assert.match(serviceSource, /getRuntimeSummary\(\): Promise<SystemRuntimeSummaryPayload>/);

  assert.match(routesSource, /\/api\/system\/runtime-summary/);
  assert.match(routesSource, /getRuntimeSummary\(\)/);
});
