import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildChannelCatalog } from '../../dist/apps/api/modules/channels/catalog.js';
import { createChannelsService } from '../../dist/apps/api/modules/channels/service.js';

function makeTempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'studio-channels-align-'));
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createStudioConfig(root: string) {
  return {
    pluginId: 'studio',
    pluginName: 'OpenClaw Studio',
    version: '0.1.0',
    port: 3760,
    autoStart: true,
    openclawRoot: root,
    openclawConfigFile: path.join(root, 'openclaw.json'),
    projectRoot: '/tmp/openclaw-studio-extension',
    webDistDir: '/tmp/openclaw-studio-extension/apps/web-vue/dist',
    gatewayPort: 31879,
    gatewayWsUrl: 'ws://127.0.0.1:31879',
    gatewayControlUiBasePath: '',
    transport: {
      standalone: { enabled: true, port: 3760 },
      gateway: { enabled: true, basePath: '/studio' },
    },
  };
}

test('unknown plugin-like channel types fall back to generic catalog entries instead of hard failing', () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, { channels: {} });

  const service = createChannelsService(config);
  const response = service.createChannel('plugin:custom-bridge', true);
  const custom = response.summary.catalog.find((entry) => entry.type === 'plugin:custom-bridge');

  assert.ok(custom);
  assert.equal(custom?.label, 'Plugin Custom Bridge');
  assert.equal(response.summary.channels.some((channel) => channel.type === 'plugin:custom-bridge'), true);
});

test('discord nested scalar fields round-trip through catalog and service', () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    channels: {
      discord: {
        enabled: true,
        accounts: {
          default: {
            enabled: true,
            allowBots: 'mentions',
            markdown: { tables: 'block' },
            retry: { attempts: 2, minDelayMs: 400, maxDelayMs: 2000, jitter: 0.25 },
            actions: { reactions: true, threads: false },
            intents: { presence: true, guildMembers: false },
            autoPresence: {
              enabled: true,
              intervalMs: 30000,
              minUpdateIntervalMs: 15000,
              healthyText: 'healthy',
            },
          },
        },
      },
    },
  });

  const service = createChannelsService(config);
  const summary = service.getSummary();
  const discord = summary.channels.find((channel) => channel.type === 'discord');

  assert.ok(discord);
  assert.equal(discord?.accounts[0]?.fieldValues.allowBots, 'mentions');
  assert.equal(discord?.accounts[0]?.fieldValues['markdown.tables'], 'block');
  assert.equal(discord?.accounts[0]?.fieldValues['retry.attempts'], 2);
  assert.equal(discord?.accounts[0]?.fieldValues['actions.reactions'], true);
  assert.equal(discord?.accounts[0]?.fieldValues['intents.presence'], true);
  assert.equal(discord?.accounts[0]?.fieldValues['autoPresence.intervalMs'], 30000);

  service.updateAccount('discord', 'default', {
    id: 'default',
    enabled: true,
    fieldValues: {
      allowBots: 'true',
      'markdown.tables': 'code',
      'retry.attempts': 4,
      'retry.minDelayMs': 900,
      'retry.maxDelayMs': 4000,
      'retry.jitter': 0.1,
      'actions.reactions': false,
      'actions.threads': false,
      'intents.presence': false,
      'intents.guildMembers': false,
      'autoPresence.intervalMs': 120000,
      'autoPresence.degradedText': 'busy',
      'pluralkit.token': 'pk-updated',
    },
  });

  const nextConfig = JSON.parse(fs.readFileSync(config.openclawConfigFile, 'utf8'));
  const account = nextConfig.channels.discord;

  assert.equal(account.allowBots, true);
  assert.deepEqual(account.markdown, { tables: 'code' });
  assert.deepEqual(account.retry, { attempts: 4, minDelayMs: 900, maxDelayMs: 4000, jitter: 0.1 });
  assert.deepEqual(account.actions, { reactions: false, threads: false });
  assert.deepEqual(account.intents, { presence: false, guildMembers: false });
  assert.equal(account.autoPresence.intervalMs, 120000);
  assert.equal(account.autoPresence.degradedText, 'busy');
  assert.equal(account.pluralkit.token, 'pk-updated');
});

test('whatsapp nested scalar fields round-trip through catalog and service', () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    channels: {
      whatsapp: {
        enabled: true,
        accounts: {
          default: {
            enabled: true,
            sendReadReceipts: false,
            selfChatMode: true,
            chunkMode: 'newline',
            blockStreaming: true,
            blockStreamingCoalesce: { minChars: 80, maxChars: 180, idleMs: 1200 },
            ackReaction: { emoji: '👍', direct: false, group: 'always' },
            reactionLevel: 'minimal',
            actions: { reactions: true, sendMessage: false, polls: true },
            markdown: { tables: 'bullets' },
          },
        },
      },
    },
  });

  const service = createChannelsService(config);
  const summary = service.getSummary();
  const whatsapp = summary.channels.find((channel) => channel.type === 'whatsapp');

  assert.ok(whatsapp);
  assert.equal(whatsapp?.accounts[0]?.fieldValues.sendReadReceipts, false);
  assert.equal(whatsapp?.accounts[0]?.fieldValues.selfChatMode, true);
  assert.equal(whatsapp?.accounts[0]?.fieldValues.chunkMode, 'newline');
  assert.equal(whatsapp?.accounts[0]?.fieldValues['blockStreamingCoalesce.maxChars'], 180);
  assert.equal(whatsapp?.accounts[0]?.fieldValues['ackReaction.group'], 'always');

  service.updateAccount('whatsapp', 'default', {
    id: 'default',
    enabled: true,
    fieldValues: {
      sendReadReceipts: true,
      selfChatMode: false,
      chunkMode: 'length',
      'blockStreamingCoalesce.minChars': 120,
      'blockStreamingCoalesce.maxChars': 240,
      'blockStreamingCoalesce.idleMs': 800,
      'ackReaction.emoji': '👀',
      'ackReaction.direct': true,
      'ackReaction.group': 'mentions',
      reactionLevel: 'extensive',
      'actions.reactions': false,
      'actions.sendMessage': true,
      'actions.polls': false,
      'markdown.tables': 'code',
      messagePrefix: '[whatsapp]',
    },
  });

  const nextConfig = JSON.parse(fs.readFileSync(config.openclawConfigFile, 'utf8'));
  const account = nextConfig.channels.whatsapp;

  assert.equal(account.sendReadReceipts, true);
  assert.equal(account.selfChatMode, false);
  assert.equal(account.chunkMode, 'length');
  assert.deepEqual(account.blockStreamingCoalesce, { minChars: 120, maxChars: 240, idleMs: 800 });
  assert.deepEqual(account.ackReaction, { emoji: '👀', direct: true, group: 'mentions' });
  assert.equal(account.reactionLevel, 'extensive');
  assert.deepEqual(account.actions, { reactions: false, sendMessage: true, polls: false });
  assert.deepEqual(account.markdown, { tables: 'code' });
  assert.equal(account.messagePrefix, '[whatsapp]');
});
