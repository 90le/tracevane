import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createChannelsService } from '../../dist/apps/api/modules/channels/service.js';

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'studio-channels-service-'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createStudioConfig(root) {
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

test('channels summary normalizes legacy streaming booleans and allowall group policy', () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    channels: {
      slack: {
        enabled: true,
        groupPolicy: 'allowall',
        streaming: true,
        accounts: {
          work: {
            enabled: true,
            groupPolicy: 'allowall',
            streaming: false,
          },
        },
      },
    },
  });

  const service = createChannelsService(config);
  const summary = service.getSummary();
  const slack = summary.channels.find((channel) => channel.type === 'slack');
  const work = slack?.accounts.find((account) => account.id === 'work');

  assert.ok(slack);
  assert.equal(slack.groupPolicy, 'open');
  assert.equal(slack.streaming, 'partial');
  assert.equal(slack.accounts[0]?.id, 'default');
  assert.equal(slack.accounts[0]?.groupPolicy, 'open');
  assert.equal(slack.accounts[0]?.streaming, 'partial');
  assert.equal(work?.groupPolicy, 'open');
  assert.equal(work?.streaming, 'off');
});

test('channels update writes schema-compatible streaming objects instead of legacy booleans', () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    channels: {
      discord: {
        enabled: true,
        streaming: true,
        accounts: {
          default: {
            enabled: true,
            streaming: false,
          },
        },
      },
    },
  });

  const service = createChannelsService(config);
  service.updateChannel('discord', {
    enabled: true,
    streaming: 'off',
  });
  service.updateAccount('discord', 'default', {
    id: 'default',
    enabled: true,
    streaming: 'partial',
  });

  const nextConfig = JSON.parse(fs.readFileSync(config.openclawConfigFile, 'utf8'));
  assert.deepEqual(nextConfig.channels.discord.streaming, { mode: 'partial' });
  assert.equal(nextConfig.channels.discord.accounts?.default?.streaming, undefined);
});

test('channels summary exposes advanced provider and account json blocks', () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    channels: {
      discord: {
        enabled: true,
        dm: { policy: 'pairing' },
        guilds: { '123': { requireMention: true } },
        execApprovals: { enabled: 'auto', target: 'dm' },
        accounts: {
          default: {
            enabled: true,
            groups: { '*': { requireMention: false } },
            execApprovals: { enabled: true, approvers: ['ops'] },
          },
        },
      },
    },
  });

  const service = createChannelsService(config);
  const summary = service.getSummary();
  const discord = summary.channels.find((channel) => channel.type === 'discord');

  assert.ok(discord);
  assert.deepEqual(discord.dmConfig, { policy: 'pairing' });
  assert.deepEqual(discord.guildsConfig, { '123': { requireMention: true } });
  assert.deepEqual(discord.execApprovalsConfig, { enabled: 'auto', target: 'dm' });
  assert.deepEqual(discord.accounts[0]?.groupsConfig, { '*': { requireMention: false } });
  assert.deepEqual(discord.accounts[0]?.execApprovalsConfig, { enabled: true, target: 'dm', approvers: ['ops'] });
});

test('channels update persists advanced provider and account json blocks', () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    channels: {
      discord: {
        enabled: true,
        accounts: {
          default: {
            enabled: true,
          },
        },
      },
    },
  });

  const service = createChannelsService(config);
  service.updateChannel('discord', {
    enabled: true,
    dm: { policy: 'open' },
    guilds: { '456': { channels: { '789': { requireMention: true } } } },
    execApprovals: { enabled: 'auto', target: 'both' },
  });
  service.updateAccount('discord', 'default', {
    id: 'default',
    enabled: true,
    groups: { '*': { requireMention: false } },
    execApprovals: { enabled: true, approvers: ['ops'] },
  });

  const nextConfig = JSON.parse(fs.readFileSync(config.openclawConfigFile, 'utf8'));
  assert.deepEqual(nextConfig.channels.discord.dm, { policy: 'open' });
  assert.deepEqual(nextConfig.channels.discord.guilds, { '456': { channels: { '789': { requireMention: true } } } });
  assert.deepEqual(nextConfig.channels.discord.execApprovals, { enabled: true, approvers: ['ops'] });
  assert.deepEqual(nextConfig.channels.discord.groups, { '*': { requireMention: false } });
  assert.equal(nextConfig.channels.discord.accounts?.default, undefined);
});

test('channels summary exposes synthetic default agent option when no agents list exists', () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    agents: {
      defaults: {
        model: {
          primary: 'openai/gpt-5.4',
        },
      },
    },
    channels: {
      discord: {
        enabled: true,
        accounts: {
          default: {
            enabled: true,
          },
        },
      },
    },
  });

  const service = createChannelsService(config);
  const summary = service.getSummary();

  assert.deepEqual(summary.agents, [
    {
      id: 'main',
      name: 'main',
      model: 'openai/gpt-5.4',
      enabled: true,
    },
  ]);
});

test('channels summary and update support context visibility, response prefix, config writes, and health monitor', () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    channels: {
      telegram: {
        enabled: true,
        contextVisibility: 'allowlist_quote',
        responsePrefix: '[TG]',
        configWrites: false,
        healthMonitor: { enabled: true },
        accounts: {
          default: {
            enabled: true,
            contextVisibility: 'all',
            responsePrefix: '[default]',
            configWrites: true,
            healthMonitor: { enabled: false },
          },
        },
      },
    },
  });

  const service = createChannelsService(config);
  const summary = service.getSummary();
  const telegram = summary.channels.find((channel) => channel.type === 'telegram');
  assert.ok(telegram);
  assert.equal(telegram.contextVisibility, 'all');
  assert.equal(telegram.responsePrefix, '[default]');
  assert.equal(telegram.configWrites, true);
  assert.equal(telegram.healthMonitor, false);
  assert.equal(telegram.accounts[0]?.contextVisibility, 'all');
  assert.equal(telegram.accounts[0]?.responsePrefix, '[default]');
  assert.equal(telegram.accounts[0]?.configWrites, true);
  assert.equal(telegram.accounts[0]?.healthMonitor, false);

  service.updateChannel('telegram', {
    enabled: true,
    contextVisibility: 'allowlist',
    responsePrefix: '[Channel]',
    configWrites: true,
    healthMonitor: false,
  });
  service.updateAccount('telegram', 'default', {
    id: 'default',
    enabled: true,
    contextVisibility: 'allowlist_quote',
    responsePrefix: '[Account]',
    configWrites: false,
    healthMonitor: true,
  });

  const nextConfig = JSON.parse(fs.readFileSync(config.openclawConfigFile, 'utf8'));
  assert.equal(nextConfig.channels.telegram.contextVisibility, 'allowlist_quote');
  assert.equal(nextConfig.channels.telegram.responsePrefix, '[Account]');
  assert.equal(nextConfig.channels.telegram.configWrites, false);
  assert.deepEqual(nextConfig.channels.telegram.healthMonitor, { enabled: true });
  assert.equal(nextConfig.channels.telegram.accounts?.default?.contextVisibility, undefined);
});

test('channels catalog exposes all official providers plus dmwork field descriptors', () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    channels: {},
  });

  const service = createChannelsService(config);
  const summary = service.getSummary();
  const catalogTypes = new Set(summary.catalog.map((entry) => entry.type));

  assert.ok(summary.catalog.length >= 24);

  for (const type of [
    'bluebubbles',
    'discord',
    'dmwork',
    'feishu',
    'googlechat',
    'imessage',
    'irc',
    'line',
    'matrix',
    'mattermost',
    'msteams',
    'nextcloud-talk',
    'nostr',
    'qa-channel',
    'qqbot',
    'signal',
    'slack',
    'synology-chat',
    'telegram',
    'tlon',
    'twitch',
    'whatsapp',
    'zalo',
    'zalouser',
  ]) {
    assert.ok(catalogTypes.has(type), `missing catalog entry for ${type}`);
  }

  const dmwork = summary.catalog.find((entry) => entry.type === 'dmwork');
  assert.ok(dmwork);
  assert.deepEqual(dmwork.credentialFields.map((field) => field.key), ['botToken']);
  assert.deepEqual(
    dmwork.accountFields.map((field) => field.key),
    ['apiUrl', 'wsUrl', 'cdnUrl', 'pollIntervalMs', 'heartbeatIntervalMs', 'requireMention', 'botUid', 'historyLimit', 'historyPromptTemplate']
  );

  const qqbot = summary.catalog.find((entry) => entry.type === 'qqbot');
  assert.ok(qqbot);
  assert.deepEqual(qqbot.credentialFields.map((field) => field.key), ['appId', 'clientSecret']);

  const whatsapp = summary.catalog.find((entry) => entry.type === 'whatsapp');
  assert.ok(whatsapp);
  assert.deepEqual(whatsapp.credentialFields.map((field) => field.key), ['botToken']);

  const matrix = summary.catalog.find((entry) => entry.type === 'matrix');
  assert.ok(matrix);
  assert.equal(matrix.defaultAccountConfigScope, 'account');

  const msteams = summary.catalog.find((entry) => entry.type === 'msteams');
  assert.ok(msteams);
  assert.equal(msteams.supportsNamedAccounts, false);

  const bluebubbles = summary.catalog.find((entry) => entry.type === 'bluebubbles');
  assert.ok(bluebubbles);
  assert.deepEqual(bluebubbles.accountFields.map((field) => field.key), ['serverUrl', 'webhookPath']);

  const irc = summary.catalog.find((entry) => entry.type === 'irc');
  assert.ok(irc);
  assert.deepEqual(irc.credentialFields.map((field) => field.key), ['password']);
  assert.deepEqual(
    irc.accountFields.map((field) => field.key),
    ['host', 'port', 'tls', 'nick', 'username', 'realname', 'channels', 'passwordFile']
  );

  const nextcloudTalk = summary.catalog.find((entry) => entry.type === 'nextcloud-talk');
  assert.ok(nextcloudTalk);
  assert.deepEqual(nextcloudTalk.credentialFields.map((field) => field.key), ['botSecret', 'apiPassword']);
  assert.deepEqual(
    nextcloudTalk.accountFields.map((field) => field.key),
    ['baseUrl', 'apiUser', 'botSecretFile', 'apiPasswordFile', 'webhookPath']
  );

  const nostr = summary.catalog.find((entry) => entry.type === 'nostr');
  assert.ok(nostr);
  assert.deepEqual(nostr.accountFields.map((field) => field.key), ['relays']);

  const signal = summary.catalog.find((entry) => entry.type === 'signal');
  assert.ok(signal);
  assert.deepEqual(
    signal.accountFields.map((field) => field.key),
    ['cliPath', 'account', 'httpUrl', 'sendReadReceipts', 'defaultTo']
  );

  const synologyChat = summary.catalog.find((entry) => entry.type === 'synology-chat');
  assert.ok(synologyChat);
  assert.deepEqual(
    synologyChat.accountFields.map((field) => field.key),
    ['incomingUrl', 'webhookPath', 'allowedUserIds', 'dangerouslyAllowInheritedWebhookPath']
  );

  const zalouser = summary.catalog.find((entry) => entry.type === 'zalouser');
  assert.ok(zalouser);
  assert.deepEqual(
    zalouser.accountFields.map((field) => field.key),
    ['profile', 'dangerouslyAllowNameMatching', 'historyLimit', 'messagePrefix']
  );
});

test('channels catalog enriches static official providers from official manifests without reintroducing alias keys', () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    channels: {},
  });
  writeJson(
    path.join(root, 'projects', 'openclaw', 'v2026.4.8', 'extensions', 'qqbot', 'openclaw.plugin.json'),
    {
      id: 'qqbot',
      channels: ['qqbot'],
      configSchema: {
        type: 'object',
        additionalProperties: false,
        $defs: {
          secretRef: {
            type: 'object',
            additionalProperties: false,
            properties: {
              source: { type: 'string' },
              provider: { type: 'string' },
              id: { type: 'string' },
            },
          },
          secretInput: {
            anyOf: [{ type: 'string', minLength: 1 }, { $ref: '#/$defs/secretRef' }],
          },
          account: {
            type: 'object',
            additionalProperties: false,
            properties: {
              enabled: { type: 'boolean' },
              name: { type: 'string' },
              appId: { type: 'string' },
              clientSecret: { $ref: '#/$defs/secretInput' },
              clientSecretFile: { type: 'string' },
              allowFrom: {
                type: 'array',
                items: { type: 'string' },
              },
              systemPrompt: { type: 'string' },
              markdownSupport: { type: 'boolean' },
              voiceDirectUploadFormats: {
                type: 'array',
                items: { type: 'string' },
              },
              audioFormatPolicy: {
                type: 'object',
                additionalProperties: false,
              },
              urlDirectUpload: { type: 'boolean' },
              upgradeUrl: { type: 'string' },
              upgradeMode: { type: 'string' },
            },
          },
        },
        properties: {
          enabled: { type: 'boolean' },
          name: { type: 'string' },
          appId: { type: 'string' },
          clientSecret: { $ref: '#/$defs/secretInput' },
          clientSecretFile: { type: 'string' },
          allowFrom: {
            type: 'array',
            items: { type: 'string' },
          },
          systemPrompt: { type: 'string' },
          markdownSupport: { type: 'boolean' },
          voiceDirectUploadFormats: {
            type: 'array',
            items: { type: 'string' },
          },
          audioFormatPolicy: {
            type: 'object',
            additionalProperties: false,
          },
          urlDirectUpload: { type: 'boolean' },
          upgradeUrl: { type: 'string' },
          upgradeMode: { type: 'string' },
          accounts: {
            type: 'object',
            additionalProperties: {
              $ref: '#/$defs/account',
            },
          },
          defaultAccount: { type: 'string' },
        },
      },
    }
  );
  writeJson(
    path.join(
      root,
      'projects',
      'openclaw',
      'v2026.4.8',
      'extensions',
      'bluebubbles',
      'openclaw.plugin.json'
    ),
    {
      id: 'bluebubbles',
      channels: ['bluebubbles'],
      configSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          httpUrl: { type: 'string' },
          webhookPath: { type: 'string' },
          password: { type: 'string' },
        },
      },
    }
  );

  const service = createChannelsService(config);
  const summary = service.getSummary();

  const qqbot = summary.catalog.find((entry) => entry.type === 'qqbot');
  assert.ok(qqbot);
  assert.deepEqual(qqbot.credentialFields.map((field) => field.key), ['appId', 'clientSecret']);
  assert.deepEqual(
    qqbot.accountFields.map((field) => field.key),
    [
      'clientSecretFile',
      'systemPrompt',
      'markdownSupport',
      'voiceDirectUploadFormats',
      'urlDirectUpload',
      'upgradeUrl',
      'upgradeMode',
    ]
  );

  const bluebubbles = summary.catalog.find((entry) => entry.type === 'bluebubbles');
  assert.ok(bluebubbles);
  assert.deepEqual(bluebubbles.accountFields.map((field) => field.key), ['serverUrl', 'webhookPath']);
});

test('channels catalog falls back to installed openclaw package manifests when project sources are absent', () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    channels: {},
  });
  writeJson(
    path.join(
      root,
      '.npm-global',
      'lib',
      'node_modules',
      'openclaw',
      'dist',
      'extensions',
      'qqbot',
      'openclaw.plugin.json'
    ),
    {
      id: 'qqbot',
      channels: ['qqbot'],
      configSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          enabled: { type: 'boolean' },
          appId: { type: 'string' },
          clientSecret: {
            anyOf: [{ type: 'string', minLength: 1 }],
          },
          clientSecretFile: { type: 'string' },
          markdownSupport: { type: 'boolean' },
          voiceDirectUploadFormats: {
            type: 'array',
            items: { type: 'string' },
          },
          accounts: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              additionalProperties: false,
              properties: {
                enabled: { type: 'boolean' },
                appId: { type: 'string' },
                clientSecret: {
                  anyOf: [{ type: 'string', minLength: 1 }],
                },
                clientSecretFile: { type: 'string' },
                markdownSupport: { type: 'boolean' },
                voiceDirectUploadFormats: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
            },
          },
        },
      },
    }
  );

  const service = createChannelsService(config);
  const summary = service.getSummary();
  const qqbot = summary.catalog.find((entry) => entry.type === 'qqbot');

  assert.ok(qqbot);
  assert.deepEqual(qqbot.credentialFields.map((field) => field.key), ['appId', 'clientSecret']);
  assert.deepEqual(
    qqbot.accountFields.map((field) => field.key),
    ['clientSecretFile', 'markdownSupport', 'voiceDirectUploadFormats']
  );
});

test('channels catalog carries manifest field metadata for placeholders, help text, and enum options', () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    channels: {},
  });
  writeJson(
    path.join(root, 'projects', 'openclaw', 'v2026.4.8', 'extensions', 'qqbot', 'openclaw.plugin.json'),
    {
      id: 'qqbot',
      channels: ['qqbot'],
      configSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          enabled: { type: 'boolean' },
          appId: { type: 'string' },
          clientSecret: {
            anyOf: [{ type: 'string', minLength: 1 }],
          },
          accounts: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              additionalProperties: false,
              properties: {
                enabled: { type: 'boolean' },
                appId: { type: 'string' },
                clientSecret: {
                  anyOf: [{ type: 'string', minLength: 1 }],
                },
                systemPrompt: {
                  type: 'string',
                  title: 'Prompt Template',
                  description: 'Controls the instruction prefix injected for this QQ account.',
                  examples: ['You are the QQ workspace copilot.'],
                },
                upgradeMode: {
                  type: 'string',
                  title: 'Upgrade Behaviour',
                  description: 'Choose how the client should guide upgrades.',
                  enum: ['doc', 'hot-reload'],
                },
              },
            },
          },
        },
      },
    }
  );

  const service = createChannelsService(config);
  const summary = service.getSummary();
  const qqbot = summary.catalog.find((entry) => entry.type === 'qqbot');

  assert.ok(qqbot);

  const systemPrompt = qqbot.accountFields.find((field) => field.key === 'systemPrompt');
  assert.ok(systemPrompt);
  assert.equal(systemPrompt.label, 'Prompt Template');
  assert.equal(systemPrompt.input, 'text');
  assert.equal(systemPrompt.helpText, 'Controls the instruction prefix injected for this QQ account.');
  assert.equal(systemPrompt.placeholder, 'You are the QQ workspace copilot.');

  const upgradeMode = qqbot.accountFields.find((field) => field.key === 'upgradeMode');
  assert.ok(upgradeMode);
  assert.equal(upgradeMode.label, 'Upgrade Behaviour');
  assert.equal(upgradeMode.input, 'select');
  assert.equal(upgradeMode.helpText, 'Choose how the client should guide upgrades.');
  assert.deepEqual(upgradeMode.options, [
    { value: 'doc', label: 'Doc' },
    { value: 'hot-reload', label: 'Hot Reload' },
  ]);
});

test('channels catalog backfills metadata onto static fields via matching keys and legacy aliases', () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    channels: {},
  });
  writeJson(
    path.join(root, 'projects', 'openclaw', 'v2026.4.8', 'extensions', 'qqbot', 'openclaw.plugin.json'),
    {
      id: 'qqbot',
      channels: ['qqbot'],
      configSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          enabled: { type: 'boolean' },
          appId: { type: 'string' },
          clientSecret: {
            anyOf: [{ type: 'string', minLength: 1 }],
          },
          accounts: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              additionalProperties: false,
              properties: {
                enabled: { type: 'boolean' },
                clientSecretFile: {
                  type: 'string',
                  description: 'Read the QQ app secret from this file path.',
                  placeholder: '/etc/openclaw/qqbot.secret',
                },
              },
            },
          },
        },
      },
    }
  );
  writeJson(
    path.join(root, 'projects', 'openclaw', 'v2026.4.8', 'extensions', 'bluebubbles', 'openclaw.plugin.json'),
    {
      id: 'bluebubbles',
      channels: ['bluebubbles'],
      configSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          httpUrl: {
            type: 'string',
            description: 'Reachable BlueBubbles bridge URL.',
            placeholder: 'https://bluebubbles.example.com',
          },
          password: {
            type: 'string',
          },
        },
      },
    }
  );

  const service = createChannelsService(config);
  const summary = service.getSummary();

  const qqbot = summary.catalog.find((entry) => entry.type === 'qqbot');
  assert.ok(qqbot);
  const clientSecretFile = qqbot.accountFields.find((field) => field.key === 'clientSecretFile');
  assert.ok(clientSecretFile);
  assert.equal(clientSecretFile.label, 'Client Secret File');
  assert.equal(clientSecretFile.helpText, 'Read the QQ app secret from this file path.');
  assert.equal(clientSecretFile.placeholder, '/etc/openclaw/qqbot.secret');

  const bluebubbles = summary.catalog.find((entry) => entry.type === 'bluebubbles');
  assert.ok(bluebubbles);
  const serverUrl = bluebubbles.accountFields.find((field) => field.key === 'serverUrl');
  assert.ok(serverUrl);
  assert.equal(serverUrl.label, 'Server URL');
  assert.equal(serverUrl.helpText, 'Reachable BlueBubbles bridge URL.');
  assert.equal(serverUrl.placeholder, 'https://bluebubbles.example.com');
});

test('channels catalog backfills env-var help text for static fields when manifest schema is empty', () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    channels: {},
  });
  writeJson(
    path.join(root, 'projects', 'openclaw', 'v2026.4.8', 'extensions', 'telegram', 'openclaw.plugin.json'),
    {
      id: 'telegram',
      channels: ['telegram'],
      channelEnvVars: {
        telegram: ['TELEGRAM_BOT_TOKEN'],
      },
      configSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {},
      },
    }
  );
  writeJson(
    path.join(root, 'projects', 'openclaw', 'v2026.4.8', 'extensions', 'googlechat', 'openclaw.plugin.json'),
    {
      id: 'googlechat',
      channels: ['googlechat'],
      channelEnvVars: {
        googlechat: ['GOOGLE_CHAT_SERVICE_ACCOUNT', 'GOOGLE_CHAT_SERVICE_ACCOUNT_FILE'],
      },
      configSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {},
      },
    }
  );

  const service = createChannelsService(config);
  const summary = service.getSummary();

  const telegram = summary.catalog.find((entry) => entry.type === 'telegram');
  assert.ok(telegram);
  const botToken = telegram.credentialFields.find((field) => field.key === 'botToken');
  assert.ok(botToken);
  assert.equal(botToken.helpText, 'Supports env var: TELEGRAM_BOT_TOKEN.');

  const googlechat = summary.catalog.find((entry) => entry.type === 'googlechat');
  assert.ok(googlechat);
  const serviceAccount = googlechat.credentialFields.find((field) => field.key === 'serviceAccount');
  const serviceAccountFile = googlechat.accountFields.find((field) => field.key === 'serviceAccountFile');
  assert.ok(serviceAccount);
  assert.ok(serviceAccountFile);
  assert.equal(serviceAccount.helpText, 'Supports env var: GOOGLE_CHAT_SERVICE_ACCOUNT.');
  assert.equal(serviceAccountFile.helpText, 'Supports env var: GOOGLE_CHAT_SERVICE_ACCOUNT_FILE.');
});

test('channels catalog assigns stable field groups for provider-specific fields', () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    channels: {},
  });
  writeJson(
    path.join(root, 'projects', 'openclaw', 'v2026.4.8', 'extensions', 'qqbot', 'openclaw.plugin.json'),
    {
      id: 'qqbot',
      channels: ['qqbot'],
      configSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          enabled: { type: 'boolean' },
          appId: { type: 'string' },
          clientSecret: {
            anyOf: [{ type: 'string', minLength: 1 }],
          },
          accounts: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              additionalProperties: false,
              properties: {
                enabled: { type: 'boolean' },
                clientSecretFile: { type: 'string' },
                systemPrompt: { type: 'string' },
                voiceDirectUploadFormats: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
            },
          },
        },
      },
    }
  );

  const service = createChannelsService(config);
  const summary = service.getSummary();

  const dmwork = summary.catalog.find((entry) => entry.type === 'dmwork');
  assert.ok(dmwork);
  assert.equal(dmwork.credentialFields.find((field) => field.key === 'botToken')?.group, 'credentials');
  assert.equal(dmwork.accountFields.find((field) => field.key === 'apiUrl')?.group, 'connection');
  assert.equal(dmwork.accountFields.find((field) => field.key === 'wsUrl')?.group, 'connection');
  assert.equal(dmwork.accountFields.find((field) => field.key === 'cdnUrl')?.group, 'connection');
  assert.equal(dmwork.accountFields.find((field) => field.key === 'botUid')?.group, 'identity');
  assert.equal(dmwork.accountFields.find((field) => field.key === 'historyPromptTemplate')?.group, 'behavior');

  const qqbot = summary.catalog.find((entry) => entry.type === 'qqbot');
  assert.ok(qqbot);
  assert.equal(qqbot.accountFields.find((field) => field.key === 'clientSecretFile')?.group, 'files');
  assert.equal(qqbot.accountFields.find((field) => field.key === 'systemPrompt')?.group, 'behavior');
  assert.equal(qqbot.accountFields.find((field) => field.key === 'voiceDirectUploadFormats')?.group, 'media');
});

test('channels catalog infers semantic input hints for url, file, and path fields', () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    channels: {},
  });

  const service = createChannelsService(config);
  const summary = service.getSummary();

  const dmwork = summary.catalog.find((entry) => entry.type === 'dmwork');
  assert.ok(dmwork);
  assert.equal(dmwork.accountFields.find((field) => field.key === 'apiUrl')?.semantic, 'url');
  assert.equal(dmwork.accountFields.find((field) => field.key === 'wsUrl')?.semantic, 'url');
  assert.equal(dmwork.accountFields.find((field) => field.key === 'cdnUrl')?.semantic, 'url');

  const qqbot = summary.catalog.find((entry) => entry.type === 'qqbot');
  assert.ok(qqbot);
  assert.equal(qqbot.accountFields.find((field) => field.key === 'clientSecretFile')?.semantic, 'file');

  const signal = summary.catalog.find((entry) => entry.type === 'signal');
  assert.ok(signal);
  assert.equal(signal.accountFields.find((field) => field.key === 'cliPath')?.semantic, 'path');
});

test('channels service persists dmwork dynamic credential and account fields', () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    channels: {
      dmwork: {
        enabled: true,
        accounts: {
          default: {
            enabled: true,
          },
        },
      },
    },
  });

  const service = createChannelsService(config);
  service.updateAccount('dmwork', 'default', {
    id: 'default',
    enabled: true,
    fieldValues: {
      botToken: 'bf_dynamic_token',
      apiUrl: 'http://127.0.0.1:8090',
      wsUrl: 'ws://127.0.0.1:5200',
      cdnUrl: 'https://cdn.example.com/bucket',
      pollIntervalMs: 2500,
      heartbeatIntervalMs: 45000,
      requireMention: true,
      historyLimit: 40,
      historyPromptTemplate: 'History: {messages}',
    },
  });

  const nextConfig = JSON.parse(fs.readFileSync(config.openclawConfigFile, 'utf8'));
  assert.equal(nextConfig.channels.dmwork.botToken, 'bf_dynamic_token');
  assert.equal(nextConfig.channels.dmwork.apiUrl, 'http://127.0.0.1:8090');
  assert.equal(nextConfig.channels.dmwork.wsUrl, 'ws://127.0.0.1:5200');
  assert.equal(nextConfig.channels.dmwork.cdnUrl, 'https://cdn.example.com/bucket');
  assert.equal(nextConfig.channels.dmwork.pollIntervalMs, 2500);
  assert.equal(nextConfig.channels.dmwork.heartbeatIntervalMs, 45000);
  assert.equal(nextConfig.channels.dmwork.requireMention, true);
  assert.equal(nextConfig.channels.dmwork.historyLimit, 40);
  assert.equal(nextConfig.channels.dmwork.historyPromptTemplate, 'History: {messages}');

  const summary = service.getSummary();
  const dmwork = summary.channels.find((channel) => channel.type === 'dmwork');
  assert.ok(dmwork);
  assert.equal(dmwork.accounts[0]?.credentialStates[0]?.key, 'botToken');
  assert.equal(dmwork.accounts[0]?.credentialStates[0]?.configured, true);
  assert.equal(dmwork.accounts[0]?.fieldValues.apiUrl, 'http://127.0.0.1:8090');
  assert.equal(dmwork.accounts[0]?.fieldValues.pollIntervalMs, 2500);
  assert.equal(dmwork.accounts[0]?.fieldValues.requireMention, true);

  const credentials = service.getAccountCredentials('dmwork', 'default');
  assert.equal(credentials.values.botToken, 'bf_dynamic_token');
});

test('channels service persists official credential fields that were not part of the legacy studio schema', () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    channels: {
      qqbot: {
        enabled: true,
        accounts: {
          default: {
            enabled: true,
          },
        },
      },
    },
  });

  const service = createChannelsService(config);
  service.updateAccount('qqbot', 'default', {
    id: 'default',
    enabled: true,
    fieldValues: {
      appId: 'qq-app-id',
      clientSecret: 'qq-client-secret',
    },
  });

  const nextConfig = JSON.parse(fs.readFileSync(config.openclawConfigFile, 'utf8'));
  assert.equal(nextConfig.channels.qqbot.appId, 'qq-app-id');
  assert.equal(nextConfig.channels.qqbot.clientSecret, 'qq-client-secret');

  const credentials = service.getAccountCredentials('qqbot', 'default');
  assert.equal(credentials.values.appId, 'qq-app-id');
  assert.equal(credentials.values.clientSecret, 'qq-client-secret');
});

test('channels service exposes and updates synthetic default profiles at top level', async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    channels: {
      line: {
        enabled: true,
        channelAccessToken: 'line-token',
        channelSecret: 'line-secret',
        groupAllowFrom: ['room-1'],
        accounts: {
          default: {
            groupAllowFrom: ['legacy-room'],
          },
        },
      },
    },
  });

  const service = createChannelsService(config);
  const summary = service.getSummary();
  const line = summary.channels.find((channel) => channel.type === 'line');
  assert.ok(line);
  assert.equal(line.accountCount, 0);
  assert.equal(line.profileCount, 1);
  assert.equal(line.accounts[0]?.id, 'default');
  assert.equal(line.accounts[0]?.credentialStates[0]?.configured, true);

  const credentials = service.getAccountCredentials('line', 'default');
  assert.equal(credentials.values.channelAccessToken, 'line-token');
  assert.equal(credentials.values.channelSecret, 'line-secret');

  const access = await service.getAccountAccess('line', 'default');
  assert.deepEqual(access.groupAllowFrom, ['legacy-room']);

  service.updateAccount('line', 'default', {
    id: 'default',
    enabled: true,
    fieldValues: {
      channelAccessToken: 'line-token-next',
      channelSecret: 'line-secret-next',
      tokenFile: '/tmp/line.token',
    },
  });

  await service.updateAccountAccess('line', 'default', {
    allowFrom: ['user-1'],
    groupAllowFrom: ['room-2'],
  });

  const nextConfig = JSON.parse(fs.readFileSync(config.openclawConfigFile, 'utf8'));
  assert.equal(nextConfig.channels.line.channelAccessToken, 'line-token-next');
  assert.equal(nextConfig.channels.line.channelSecret, 'line-secret-next');
  assert.equal(nextConfig.channels.line.tokenFile, '/tmp/line.token');
  assert.deepEqual(nextConfig.channels.line.allowFrom, ['room-2']);
  assert.equal(nextConfig.channels.line.groupAllowFrom, undefined);
  assert.equal(nextConfig.channels.line.accounts?.default, undefined);
});

test('channels service blocks named accounts for default-only providers', () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    channels: {
      msteams: {
        enabled: true,
      },
    },
  });

  const service = createChannelsService(config);

  assert.throws(
    () =>
      service.createAccount('msteams', {
        id: 'ops',
        enabled: true,
      }),
    /does not support named accounts/
  );
});

test('channels service maps aliased studio field keys onto real channel config fields', () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    channels: {
      bluebubbles: {
        enabled: true,
        httpUrl: 'http://127.0.0.1:1234',
        password: 'blue-secret',
      },
      irc: {
        enabled: true,
        httpHost: 'irc.example.com',
        httpPort: 6697,
        userId: 'lobster',
        deviceName: 'OpenClaw Bot',
        groupChannels: ['#ops'],
        token: 'irc-secret',
      },
      'nextcloud-talk': {
        enabled: true,
        httpUrl: 'https://cloud.example.com',
        token: 'nextcloud-bot-secret',
        userId: 'nc-bot',
        password: 'nextcloud-api-secret',
      },
      nostr: {
        enabled: true,
        relayUrls: ['wss://relay.example.com'],
      },
      signal: {
        enabled: true,
        signalNumber: '+15550001111',
        cliPath: '/usr/bin/signal-cli',
        httpUrl: 'http://127.0.0.1:8080',
      },
      'synology-chat': {
        enabled: true,
        token: 'synology-token',
        url: 'https://nas.example.com/webhook',
      },
    },
  });

  const service = createChannelsService(config);
  const summary = service.getSummary();

  const bluebubbles = summary.channels.find((channel) => channel.type === 'bluebubbles');
  assert.equal(bluebubbles?.accounts[0]?.fieldValues.serverUrl, 'http://127.0.0.1:1234');

  const irc = summary.channels.find((channel) => channel.type === 'irc');
  assert.equal(irc?.accounts[0]?.fieldValues.host, 'irc.example.com');
  assert.equal(irc?.accounts[0]?.fieldValues.port, 6697);
  assert.equal(irc?.accounts[0]?.fieldValues.nick, 'lobster');
  assert.equal(irc?.accounts[0]?.fieldValues.realname, 'OpenClaw Bot');
  assert.deepEqual(irc?.accounts[0]?.fieldValues.channels, ['#ops']);
  assert.equal(irc?.accounts[0]?.credentialStates[0]?.key, 'password');
  assert.equal(irc?.accounts[0]?.credentialStates[0]?.configured, true);

  const nextcloudTalk = summary.channels.find((channel) => channel.type === 'nextcloud-talk');
  assert.equal(nextcloudTalk?.accounts[0]?.fieldValues.baseUrl, 'https://cloud.example.com');
  assert.equal(nextcloudTalk?.accounts[0]?.fieldValues.apiUser, 'nc-bot');
  assert.equal(nextcloudTalk?.accounts[0]?.credentialStates[0]?.configured, true);
  assert.equal(nextcloudTalk?.accounts[0]?.credentialStates[1]?.configured, true);

  const nostr = summary.channels.find((channel) => channel.type === 'nostr');
  assert.deepEqual(nostr?.accounts[0]?.fieldValues.relays, ['wss://relay.example.com']);

  const signal = summary.channels.find((channel) => channel.type === 'signal');
  assert.equal(signal?.accounts[0]?.fieldValues.account, '+15550001111');

  const synologyChat = summary.channels.find((channel) => channel.type === 'synology-chat');
  assert.equal(
    synologyChat?.accounts[0]?.fieldValues.incomingUrl,
    'https://nas.example.com/webhook'
  );

  service.updateAccount('bluebubbles', 'default', {
    id: 'default',
    enabled: true,
    fieldValues: {
      serverUrl: 'https://bb.example.com',
      password: 'blue-secret-next',
    },
  });
  service.updateAccount('irc', 'default', {
    id: 'default',
    enabled: true,
    fieldValues: {
      host: 'irc-updated.example.com',
      port: 7000,
      nick: 'lobster-bot',
      realname: 'OpenClaw Runtime',
      channels: ['#prod'],
      password: 'irc-secret-next',
    },
  });
  service.updateAccount('nextcloud-talk', 'default', {
    id: 'default',
    enabled: true,
    fieldValues: {
      baseUrl: 'https://cloud-next.example.com',
      botSecret: 'nextcloud-bot-next',
      apiUser: 'nc-runtime',
      apiPassword: 'nextcloud-api-next',
    },
  });
  service.updateAccount('nostr', 'default', {
    id: 'default',
    enabled: true,
    fieldValues: {
      relays: ['wss://relay-2.example.com'],
    },
  });
  service.updateAccount('signal', 'default', {
    id: 'default',
    enabled: true,
    fieldValues: {
      account: '+15550002222',
    },
  });
  service.updateAccount('synology-chat', 'default', {
    id: 'default',
    enabled: true,
    fieldValues: {
      incomingUrl: 'https://nas.example.com/incoming-next',
    },
  });

  const nextConfig = JSON.parse(fs.readFileSync(config.openclawConfigFile, 'utf8'));
  assert.equal(nextConfig.channels.bluebubbles.serverUrl, 'https://bb.example.com');
  assert.equal(nextConfig.channels.bluebubbles.password, 'blue-secret-next');
  assert.equal(nextConfig.channels.bluebubbles.httpUrl, undefined);

  assert.equal(nextConfig.channels.irc.host, 'irc-updated.example.com');
  assert.equal(nextConfig.channels.irc.port, 7000);
  assert.equal(nextConfig.channels.irc.nick, 'lobster-bot');
  assert.equal(nextConfig.channels.irc.realname, 'OpenClaw Runtime');
  assert.deepEqual(nextConfig.channels.irc.channels, ['#prod']);
  assert.equal(nextConfig.channels.irc.password, 'irc-secret-next');
  assert.equal(nextConfig.channels.irc.httpHost, undefined);
  assert.equal(nextConfig.channels.irc.httpPort, undefined);
  assert.equal(nextConfig.channels.irc.userId, undefined);
  assert.equal(nextConfig.channels.irc.deviceName, undefined);
  assert.equal(nextConfig.channels.irc.groupChannels, undefined);
  assert.equal(nextConfig.channels.irc.token, undefined);

  assert.equal(nextConfig.channels['nextcloud-talk'].baseUrl, 'https://cloud-next.example.com');
  assert.equal(nextConfig.channels['nextcloud-talk'].botSecret, 'nextcloud-bot-next');
  assert.equal(nextConfig.channels['nextcloud-talk'].apiUser, 'nc-runtime');
  assert.equal(nextConfig.channels['nextcloud-talk'].apiPassword, 'nextcloud-api-next');
  assert.equal(nextConfig.channels['nextcloud-talk'].httpUrl, undefined);
  assert.equal(nextConfig.channels['nextcloud-talk'].token, undefined);
  assert.equal(nextConfig.channels['nextcloud-talk'].userId, undefined);
  assert.equal(nextConfig.channels['nextcloud-talk'].password, undefined);

  assert.deepEqual(nextConfig.channels.nostr.relays, ['wss://relay-2.example.com']);
  assert.equal(nextConfig.channels.nostr.relayUrls, undefined);

  assert.equal(nextConfig.channels.signal.account, '+15550002222');
  assert.equal(nextConfig.channels.signal.signalNumber, undefined);

  assert.equal(nextConfig.channels['synology-chat'].incomingUrl, 'https://nas.example.com/incoming-next');
  assert.equal(nextConfig.channels['synology-chat'].url, undefined);
});

test('channels service exposes and updates zalouser dedicated account fields', () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    channels: {
      zalouser: {
        enabled: true,
        profile: 'default-profile',
        historyLimit: 12,
        messagePrefix: '[zalo]',
        dangerouslyAllowNameMatching: true,
      },
    },
  });

  const service = createChannelsService(config);
  const summary = service.getSummary();
  const zalouser = summary.channels.find((channel) => channel.type === 'zalouser');

  assert.ok(zalouser);
  assert.equal(zalouser.accounts[0]?.id, 'default');
  assert.equal(zalouser.accounts[0]?.fieldValues.profile, 'default-profile');
  assert.equal(zalouser.accounts[0]?.fieldValues.historyLimit, 12);
  assert.equal(zalouser.accounts[0]?.fieldValues.messagePrefix, '[zalo]');
  assert.equal(zalouser.accounts[0]?.fieldValues.dangerouslyAllowNameMatching, true);

  service.updateAccount('zalouser', 'default', {
    id: 'default',
    enabled: true,
    fieldValues: {
      profile: 'ops-profile',
      historyLimit: 24,
      messagePrefix: '[ops]',
      dangerouslyAllowNameMatching: false,
    },
  });

  const nextConfig = JSON.parse(fs.readFileSync(config.openclawConfigFile, 'utf8'));
  assert.equal(nextConfig.channels.zalouser.profile, 'ops-profile');
  assert.equal(nextConfig.channels.zalouser.historyLimit, 24);
  assert.equal(nextConfig.channels.zalouser.messagePrefix, '[ops]');
  assert.equal(nextConfig.channels.zalouser.dangerouslyAllowNameMatching, false);
});

test('channels catalog derives fallback fields for custom extensions with config schema metadata', () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    channels: {},
  });
  writeJson(path.join(root, 'extensions', 'acme-chat', 'openclaw.plugin.json'), {
    id: 'acme-chat',
    channels: ['acme-chat'],
    configSchema: {
      type: 'object',
      additionalProperties: false,
      $defs: {
        secretInput: {
          anyOf: [{ type: 'string', minLength: 1 }],
        },
      },
      properties: {
        enabled: { type: 'boolean' },
        defaultAccount: { type: 'string' },
        accounts: { type: 'object' },
        allowFrom: { type: 'array', items: { type: 'string' } },
        apiUrl: { type: 'string' },
        retryIntervalMs: { type: 'number' },
        notifyOnMention: { type: 'boolean' },
        roomIds: { type: 'array', items: { type: 'string' } },
        botToken: { $ref: '#/$defs/secretInput' },
      },
    },
  });

  const service = createChannelsService(config);
  const summary = service.getSummary();
  const acmeChat = summary.catalog.find((entry) => entry.type === 'acme-chat');

  assert.ok(acmeChat);
  assert.deepEqual(acmeChat.credentialFields.map((field) => field.key), ['botToken']);
  assert.deepEqual(
    acmeChat.accountFields.map((field) => field.key),
    ['apiUrl', 'retryIntervalMs', 'notifyOnMention', 'roomIds']
  );
});
