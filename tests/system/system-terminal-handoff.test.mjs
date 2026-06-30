import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import 'tsx/esm';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const handoffPath = path.join(rootDir, 'apps/api/modules/system/terminal-handoff.ts');
const servicePath = path.join(rootDir, 'apps/api/modules/system/service.ts');
const routesPath = path.join(rootDir, 'apps/api/modules/system/routes.ts');
const terminalServicePath = path.join(rootDir, 'apps/api/modules/terminal/service.ts');
const skillsServicePath = path.join(rootDir, 'apps/api/modules/skills/service.ts');
const handoffModuleUrl = `${pathToFileURL(handoffPath).href}?t=${Date.now()}`;

test('buildSystemTerminalActionSuggestions derives terminal action suggestions', async () => {
  const handoff = await import(handoffModuleUrl);
  const suggestions = handoff.buildSystemTerminalActionSuggestions({
    bootstrapRepairNeeded: true,
    helperPendingRepair: false,
  });

  assert.equal(suggestions.length, 1);
  assert.deepEqual(suggestions[0], {
    key: 'bootstrap-repair',
    title: '修复系统引导配置',
    routePath: '/terminal/system-bootstrap-repair',
    commandHint: 'openclaw doctor && openclaw gateway status --json',
  });
});

test('system service and routes consume terminal handoff helper seam', () => {
  const serviceSource = fs.readFileSync(servicePath, 'utf8');
  const routesSource = fs.readFileSync(routesPath, 'utf8');

  assert.match(serviceSource, /from '\.\/terminal-handoff\.js'/);
  assert.match(serviceSource, /buildSystemTerminalActionSuggestions\(/);
  assert.match(serviceSource, /getTerminalActionSuggestions\(\): Promise<SystemTerminalActionSuggestion\[]>/);

  assert.match(routesSource, /\/api\/system\/terminal-handoff/);
  assert.match(routesSource, /getTerminalActionSuggestions\(\)/);
});

test('terminal status uses bounded fast probes for first-page readiness', () => {
  const terminalSource = fs.readFileSync(terminalServicePath, 'utf8');
  const skillsSource = fs.readFileSync(skillsServicePath, 'utf8');

  assert.match(terminalSource, /TERMINAL_BINARY_VERIFY_TIMEOUT_MS = 2_500/);
  assert.match(terminalSource, /TERMINAL_STATUS_CACHE_TTL_MS = 30_000/);
  assert.match(terminalSource, /hasOnlyWindowsMountedCandidates/);
  assert.match(
    terminalSource,
    /verifyFromPath\?\.success \|\| hasOnlyWindowsMountedCandidates/,
  );
  assert.match(terminalSource, /options\.skills\.getSummary\(\{ fast: true \}\)/);
  assert.match(
    skillsSource,
    /loadSummary\(Boolean\(options\.refresh\), Boolean\(options\.fast\)\)/,
  );
});
