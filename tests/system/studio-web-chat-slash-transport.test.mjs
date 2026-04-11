import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';
const chatShellPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/ChatShellPage.vue'),
  'utf8',
);

test('chat shell routes local slash gateway commands through the Studio HTTP backend', () => {
  assert.match(chatShellPage, /requestChatSlashGateway/);
  assert.match(chatShellPage, /requestStudioSlashGatewayChat/);
  assert.match(chatShellPage, /executeStudioSlashLocalGatewayCommand\(\s*\{\s*request:\s*\(method,\s*params\)\s*=>\s*requestStudioSlashGatewayChat\(sessionKey,\s*method,\s*params\)\s*\}/);
  assert.doesNotMatch(chatShellPage, /executeStudioSlashLocalGatewayCommand\(\s*\{\s*request:\s*requestCoreGatewayChat\s*\}/);
});

test('sendMessage parses and handles slash commands before the realtime-ready send guard', () => {
  assert.match(
    chatShellPage,
    /const parsedSlashCommand = slashCommandText \? parseStudioSlashCommand\(slashCommandText\) : null;[\s\S]+if \(parsedSlashCommand\?\.command\.executeMode === 'local'\)[\s\S]+if \(parsedSlashCommand\?\.command\.executeMode === 'hybrid'\)[\s\S]+const shouldForwardSlashViaBackend = Boolean\([\s\S]+slashCommandText\.startsWith\('\/'\)[\s\S]+if \(shouldForwardSlashViaBackend\) \{[\s\S]+dispatchSlashCommandViaBackend\(slashCommandText\)[\s\S]+if \(!session\?\.permissions\.canSend \|\| accessError\.value \|\| !selectedSessionRealtimeReady\.value\) \{/,
  );
});

test('sendMessage forwards unknown or fallback slash commands through the backend before checking realtime readiness', () => {
  assert.match(chatShellPage, /async function dispatchSlashCommandViaBackend\(commandText: string\): Promise<boolean> \{/);
  assert.match(
    chatShellPage,
    /requestStudioSlashGatewayChat<\{ runId\?: string \| null \}>\(\s*sessionKey,\s*'chat\.send',\s*\{/,
  );
  assert.match(chatShellPage, /The command was submitted through the Studio backend and is waiting for the host\./);
});

test('executeLocalSlashCommand keeps /exec on the local gateway executor path and surfaces unexpected gaps', () => {
  assert.match(chatShellPage, /case 'elevated':[\s\S]+case 'exec':[\s\S]+case 'activation':/);
  assert.match(chatShellPage, /Studio has not wired this local slash command yet\. Update Studio or try again later\./);
});
