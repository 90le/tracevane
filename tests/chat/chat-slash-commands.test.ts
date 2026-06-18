import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STUDIO_SLASH_COMMANDS,
  filterStudioSlashCommandArgOptionDetails,
  getStudioSlashCommandCompletions,
  getStudioSlashCommandArgOptions,
  getStudioSlashCommandArgOptionDetails,
  getStudioSlashCommandDescription,
  parseStudioSlashCommand,
} from '../../apps/web-vue/src/features/chat/slash-commands';
import { resolveStudioBashSlashHandling } from '../../apps/web-vue/src/features/chat/slash-bash-policy';
import { executeStudioSlashLocalGatewayCommand } from '../../apps/web-vue/src/features/chat/slash-local-executor';

function createGatewayClientMock(
  handler: (method: string, params: unknown) => unknown | Promise<unknown>,
) {
  const calls: Array<{ method: string; params: unknown }> = [];
  return {
    calls,
    client: {
      async request<T>(method: string, params: unknown): Promise<T> {
        calls.push({ method, params });
        return await handler(method, params) as T;
      },
    },
  };
}

test('studio slash command catalog mirrors key OpenClaw chat commands', () => {
  const names = new Set(STUDIO_SLASH_COMMANDS.map((command) => command.name));

  for (const expected of [
    'help',
    'commands',
    'status',
    'model',
    'think',
    'queue',
    'bash',
    'new',
    'reset',
    'stop',
    'clear',
    'redirect',
  ]) {
    assert.equal(names.has(expected), true, `missing slash command: ${expected}`);
  }
});

test('studio slash parser supports aliases and colon/space argument forms', () => {
  assert.deepEqual(parseStudioSlashCommand('/think: high'), {
    command: STUDIO_SLASH_COMMANDS.find((command) => command.name === 'think'),
    args: 'high',
  });

  assert.deepEqual(parseStudioSlashCommand('/export'), {
    command: STUDIO_SLASH_COMMANDS.find((command) => command.name === 'export-session'),
    args: '',
  });

  assert.deepEqual(parseStudioSlashCommand('/tools verbose'), {
    command: STUDIO_SLASH_COMMANDS.find((command) => command.name === 'tools'),
    args: 'verbose',
  });

  assert.deepEqual(parseStudioSlashCommand('/id'), {
    command: STUDIO_SLASH_COMMANDS.find((command) => command.name === 'whoami'),
    args: '',
  });

  assert.deepEqual(parseStudioSlashCommand('/thinking medium'), {
    command: STUDIO_SLASH_COMMANDS.find((command) => command.name === 'think'),
    args: 'medium',
  });

  assert.deepEqual(parseStudioSlashCommand('/plugin enable studio'), {
    command: STUDIO_SLASH_COMMANDS.find((command) => command.name === 'plugins'),
    args: 'enable studio',
  });
});

test('studio slash completions prioritize matching command prefixes', () => {
  const result = getStudioSlashCommandCompletions('mo').map((command) => command.name);
  assert.deepEqual(result.slice(0, 2), ['model', 'models']);
});

test('studio slash descriptions switch between zh and en locales', () => {
  const help = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'help');
  assert.ok(help);
  assert.equal(getStudioSlashCommandDescription(help, 'zh'), '显示可用命令。');
  assert.equal(getStudioSlashCommandDescription(help, 'en'), 'Show available commands.');
});

test('studio slash help commands execute locally instead of sending through chat', () => {
  const help = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'help');
  const commands = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'commands');
  const status = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'status');
  const tools = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'tools');
  const skill = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'skill');
  const tasks = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'tasks');
  const allowlist = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'allowlist');
  const approve = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'approve');
  const context = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'context');
  const btw = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'btw');
  const compact = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'compact');
  const model = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'model');
  const think = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'think');
  const fast = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'fast');
  const reasoningLocal = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'reasoning');
  const verbose = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'verbose');
  const usage = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'usage');
  const elevated = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'elevated');
  const execCommand = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'exec');
  const bash = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'bash');
  const tts = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'tts');
  const whoami = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'whoami');
  const session = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'session');
  const activation = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'activation');
  const send = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'send');
  const models = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'models');
  const exportSession = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'export-session');
  const queue = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'queue');
  const agents = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'agents');
  const kill = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'kill');
  const steer = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'steer');
  const redirect = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'redirect');
  const config = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'config');
  const plugins = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'plugins');
  const mcp = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'mcp');
  const subagents = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'subagents');
  const acp = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'acp');
  const debug = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'debug');
  const restart = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'restart');
  const focus = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'focus');
  const unfocus = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'unfocus');

  assert.ok(help);
  assert.ok(commands);
  assert.ok(status);
  assert.ok(tools);
  assert.ok(skill);
  assert.ok(tasks);
  assert.ok(allowlist);
  assert.ok(approve);
  assert.ok(context);
  assert.ok(btw);
  assert.ok(compact);
  assert.ok(model);
  assert.ok(think);
  assert.ok(fast);
  assert.ok(reasoningLocal);
  assert.ok(verbose);
  assert.ok(usage);
  assert.ok(elevated);
  assert.ok(execCommand);
  assert.ok(bash);
  assert.ok(tts);
  assert.ok(whoami);
  assert.ok(session);
  assert.ok(activation);
  assert.ok(send);
  assert.ok(models);
  assert.ok(exportSession);
  assert.ok(queue);
  assert.ok(agents);
  assert.ok(kill);
  assert.ok(steer);
  assert.ok(redirect);
  assert.ok(config);
  assert.ok(plugins);
  assert.ok(mcp);
  assert.ok(subagents);
  assert.ok(acp);
  assert.ok(debug);
  assert.ok(restart);
  assert.ok(focus);
  assert.ok(unfocus);
  assert.equal(help.executeMode, 'local');
  assert.equal(help.localAction, 'help');
  assert.equal(commands.executeMode, 'local');
  assert.equal(commands.localAction, 'help');
  assert.equal(status.executeMode, 'local');
  assert.equal(status.localAction, 'status');
  assert.equal(tools.executeMode, 'local');
  assert.equal(tools.localAction, 'tools');
  assert.equal(skill.executeMode, 'hybrid');
  assert.equal(skill.localAction, 'skill');
  assert.equal(tasks.executeMode, 'local');
  assert.equal(tasks.localAction, 'tasks');
  assert.equal(allowlist.executeMode, 'hybrid');
  assert.equal(allowlist.localAction, 'allowlist');
  assert.equal(approve.executeMode, 'local');
  assert.equal(approve.localAction, 'approve');
  assert.equal(context.executeMode, 'local');
  assert.equal(context.localAction, 'context');
  assert.equal(btw.executeMode, 'hybrid');
  assert.equal(btw.localAction, 'forwardSlash');
  assert.equal(compact.executeMode, 'local');
  assert.equal(compact.localAction, 'compact');
  assert.equal(model.executeMode, 'local');
  assert.equal(model.localAction, 'model');
  assert.equal(think.executeMode, 'local');
  assert.equal(think.localAction, 'think');
  assert.equal(fast.executeMode, 'local');
  assert.equal(fast.localAction, 'fast');
  assert.equal(reasoningLocal.executeMode, 'local');
  assert.equal(reasoningLocal.localAction, 'reasoning');
  assert.equal(verbose.executeMode, 'local');
  assert.equal(verbose.localAction, 'verbose');
  assert.equal(usage.executeMode, 'local');
  assert.equal(usage.localAction, 'usage');
  assert.equal(elevated.executeMode, 'local');
  assert.equal(elevated.localAction, 'elevated');
  assert.equal(execCommand.executeMode, 'local');
  assert.equal(execCommand.localAction, 'exec');
  assert.equal(bash.executeMode, 'hybrid');
  assert.equal(bash.localAction, 'bash');
  assert.equal(tts.executeMode, 'hybrid');
  assert.equal(tts.localAction, 'tts');
  assert.equal(whoami.executeMode, 'local');
  assert.equal(whoami.localAction, 'whoami');
  assert.equal(session.executeMode, 'local');
  assert.equal(session.localAction, 'session');
  assert.equal(activation.executeMode, 'local');
  assert.equal(activation.localAction, 'activation');
  assert.equal(send.executeMode, 'local');
  assert.equal(send.localAction, 'send');
  assert.equal(models.executeMode, 'local');
  assert.equal(models.localAction, 'models');
  assert.equal(exportSession.executeMode, 'hybrid');
  assert.equal(exportSession.localAction, 'exportSession');
  assert.equal(queue.executeMode, 'hybrid');
  assert.equal(queue.localAction, 'queue');
  assert.equal(agents.executeMode, 'local');
  assert.equal(agents.localAction, 'agents');
  assert.equal(kill.executeMode, 'local');
  assert.equal(kill.localAction, 'kill');
  assert.equal(steer.executeMode, 'local');
  assert.equal(steer.localAction, 'steer');
  assert.equal(redirect.executeMode, 'local');
  assert.equal(redirect.localAction, 'redirect');
  assert.equal(config.executeMode, 'hybrid');
  assert.equal(config.localAction, 'config');
  assert.equal(plugins.executeMode, 'hybrid');
  assert.equal(plugins.localAction, 'plugins');
  assert.equal(mcp.executeMode, 'hybrid');
  assert.equal(mcp.localAction, 'mcp');
  assert.equal(subagents.executeMode, 'hybrid');
  assert.equal(subagents.localAction, 'subagents');
  assert.equal(acp.executeMode, 'hybrid');
  assert.equal(acp.localAction, 'acp');
  assert.equal(debug.executeMode, 'hybrid');
  assert.equal(debug.localAction, 'debug');
  assert.equal(restart.executeMode, 'hybrid');
  assert.equal(restart.localAction, 'restart');
  assert.equal(focus.executeMode, 'local');
  assert.equal(focus.localAction, 'focus');
  assert.equal(unfocus.executeMode, 'local');
  assert.equal(unfocus.localAction, 'unfocus');
});

test('studio slash catalog no longer leaves any commands on realtime-only send mode', () => {
  const sendOnly = STUDIO_SLASH_COMMANDS.filter((command) => command.executeMode === 'send');
  assert.deepEqual(sendOnly, []);
});

test('studio slash arg options allow dynamic model candidates while preserving static command options', () => {
  const model = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'model');
  const think = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'think');

  assert.ok(model);
  assert.ok(think);

  assert.deepEqual(
    getStudioSlashCommandArgOptions(model, {
      model: ['claude-sonnet-4.5', 'gpt-5.4', 'claude-sonnet-4.5'],
    }),
    ['claude-sonnet-4.5', 'gpt-5.4'],
  );

  assert.deepEqual(
    getStudioSlashCommandArgOptions(think, {
      model: ['should-not-bleed-into-think'],
    }),
    ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'],
  );
});

test('studio slash arg options align with official first-arg choices for common commands', () => {
  const fast = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'fast');
  const usage = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'usage');
  const tts = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'tts');
  const plugins = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'plugins');
  const reasoning = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'reasoning');
  const elevated = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'elevated');
  const execCommand = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'exec');

  assert.ok(fast);
  assert.ok(usage);
  assert.ok(tts);
  assert.ok(plugins);
  assert.ok(reasoning);
  assert.ok(elevated);
  assert.ok(execCommand);

  assert.deepEqual(getStudioSlashCommandArgOptions(fast), ['status', 'off', 'on']);
  assert.deepEqual(getStudioSlashCommandArgOptions(usage), ['off', 'tokens', 'full', 'cost']);
  assert.deepEqual(getStudioSlashCommandArgOptions(tts), ['on', 'off', 'status', 'provider', 'limit', 'summary', 'audio', 'help']);
  assert.deepEqual(getStudioSlashCommandArgOptions(plugins), ['list', 'show', 'get', 'enable', 'disable']);
  assert.deepEqual(getStudioSlashCommandArgOptions(reasoning), ['off', 'on', 'stream']);
  assert.deepEqual(getStudioSlashCommandArgOptions(elevated), ['off', 'on', 'ask', 'full']);
  assert.deepEqual(getStudioSlashCommandArgOptions(execCommand), [
    'host=auto',
    'host=sandbox',
    'host=gateway',
    'host=node',
    'security=deny',
    'security=allowlist',
    'security=full',
    'ask=off',
    'ask=on-miss',
    'ask=always',
    'node=<id>',
  ]);
});

test('studio slash arg option details provide bilingual labels and descriptions', () => {
  const think = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'think');
  const model = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'model');

  assert.ok(think);
  assert.ok(model);

  const thinkDetails = getStudioSlashCommandArgOptionDetails(think, 'zh');
  assert.deepEqual(
    thinkDetails.find((item) => item.value === 'high'),
    {
      value: 'high',
      label: '高',
      description: '更深的思考深度，响应更慢但通常更充分。',
    },
  );

  assert.deepEqual(
    thinkDetails.find((item) => item.value === 'xhigh'),
    {
      value: 'xhigh',
      label: '极高',
      description: '用于复杂任务的最高 thinking 深度。',
    },
  );

  const modelDetails = getStudioSlashCommandArgOptionDetails(model, 'en', {
    model: ['gpt-5.4'],
  });
  assert.deepEqual(
    modelDetails[0],
    {
      value: 'gpt-5.4',
      label: 'gpt-5.4',
      description: 'Configured model candidate from the current OpenClaw settings.',
    },
  );
});

test('studio slash arg option filtering matches localized labels and descriptions', () => {
  const think = STUDIO_SLASH_COMMANDS.find((command) => command.name === 'think');

  assert.ok(think);

  assert.deepEqual(
    filterStudioSlashCommandArgOptionDetails(think, '高', 'zh').map((item) => item.value),
    ['high', 'xhigh'],
  );

  assert.deepEqual(
    filterStudioSlashCommandArgOptionDetails(think, 'deeper', 'en').map((item) => item.value),
    ['high'],
  );

  assert.deepEqual(
    filterStudioSlashCommandArgOptionDetails(think, 'med', 'en').map((item) => item.value),
    ['medium'],
  );
});

test('local slash executor compacts the current session through gateway rpc', async () => {
  const gateway = createGatewayClientMock((method) => {
    if (method === 'sessions.compact') {
      return {
        compacted: true,
        result: {
          tokensBefore: 2400,
          tokensAfter: 900,
        },
      };
    }
    throw new Error(`unexpected method: ${method}`);
  });

  const result = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'compact', '', {});
  assert.ok(result);
  assert.equal(result.phase, 'completed');
  assert.equal(result.refresh, 'conversation');
  assert.match(result.detail.en, /2400/i);
  assert.deepEqual(gateway.calls[0], {
    method: 'sessions.compact',
    params: { key: 'main' },
  });
});

test('local slash executor summarizes plugin config through gateway rpc', async () => {
  const gateway = createGatewayClientMock((method) => {
    if (method === 'config.get') {
      return {
        path: '/tmp/openclaw.json',
        valid: true,
        config: {
          plugins: {
            entries: {
              studio: {
                enabled: true,
                config: {
                  autoStart: true,
                },
              },
              browser: {
                enabled: false,
              },
            },
            installs: {
              studio: {
                source: 'npm',
                version: '0.1.20',
                installPath: '/opt/studio',
              },
            },
            load: {
              paths: ['/opt/studio'],
            },
          },
        },
      };
    }
    throw new Error(`unexpected method: ${method}`);
  });

  const summary = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'plugins', 'list', {});
  assert.ok(summary);
  assert.equal(summary.phase, 'completed');
  assert.match(summary.detail.zh, /studio/);
  assert.match(summary.detail.en, /browser/i);

  const detail = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'plugins', 'show studio', {});
  assert.ok(detail);
  assert.equal(detail.phase, 'completed');
  assert.match(detail.detail.zh, /已启用/);
  assert.match(detail.detail.en, /enabled/i);

  const passthrough = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'plugins', 'enable studio', {});
  assert.equal(passthrough, null);
});

test('local slash executor summarizes mcp config through gateway rpc', async () => {
  const gateway = createGatewayClientMock((method) => {
    if (method === 'config.get') {
      return {
        path: '/tmp/openclaw.json',
        valid: true,
        config: {
          mcp: {
            servers: {
              context7: {
                command: 'uvx',
                args: ['context7-mcp'],
              },
              remote: {
                url: 'https://example.com/mcp',
              },
            },
          },
        },
      };
    }
    throw new Error(`unexpected method: ${method}`);
  });

  const summary = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'mcp', 'show', {});
  assert.ok(summary);
  assert.equal(summary.phase, 'completed');
  assert.match(summary.detail.zh, /context7/);
  assert.match(summary.detail.en, /remote/i);

  const detail = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'mcp', 'get remote', {});
  assert.ok(detail);
  assert.equal(detail.phase, 'completed');
  assert.match(detail.detail.zh, /remote/);
  assert.match(detail.detail.en, /url/i);

  const passthrough = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'mcp', 'set remote {}', {});
  assert.equal(passthrough, null);
});

test('local slash executor summarizes current-session subagents through gateway rpc', async () => {
  const gateway = createGatewayClientMock((method) => {
    if (method === 'sessions.list') {
      return {
        sessions: [
          {
            key: 'agent:main:main',
            status: 'running',
          },
          {
            key: 'agent:main:subagent:researcher',
            label: 'Researcher',
            status: 'running',
            model: 'gpt-5.4',
            spawnedBy: 'agent:main:main',
          },
          {
            key: 'agent:main:subagent:writer',
            label: 'Writer',
            status: 'completed',
            endedAt: '2026-04-10T10:00:00.000Z',
            spawnedBy: 'agent:main:main',
          },
          {
            key: 'agent:main:subagent:researcher:subagent:critic',
            label: 'Critic',
            status: 'running',
            spawnedBy: 'agent:main:subagent:researcher',
          },
          {
            key: 'agent:other:subagent:outsider',
            label: 'Outsider',
            status: 'running',
            spawnedBy: 'agent:other:main',
          },
        ],
      };
    }
    throw new Error(`unexpected method: ${method}`);
  });

  const summary = await executeStudioSlashLocalGatewayCommand(gateway.client, 'agent:main:main', 'subagents', 'list', {});
  assert.ok(summary);
  assert.equal(summary.phase, 'completed');
  assert.match(summary.detail.zh, /Researcher/);
  assert.match(summary.detail.en, /Critic/);

  const detail = await executeStudioSlashLocalGatewayCommand(gateway.client, 'agent:main:main', 'subagents', 'info researcher', {});
  assert.ok(detail);
  assert.equal(detail.phase, 'completed');
  assert.match(detail.detail.zh, /gpt-5\.4/);
  assert.match(detail.detail.en, /running/i);

  const passthrough = await executeStudioSlashLocalGatewayCommand(gateway.client, 'agent:main:main', 'subagents', 'spawn reviewer', {});
  assert.equal(passthrough, null);
});

test('local slash executor summarizes visible background tasks for the current session', async () => {
  const gateway = createGatewayClientMock((method) => {
    if (method === 'sessions.list') {
      return {
        sessions: [
          {
            key: 'agent:main:main',
            label: 'Main',
            status: 'running',
          },
          {
            key: 'agent:main:subagent:researcher',
            label: 'Researcher',
            status: 'running',
            spawnedBy: 'agent:main:main',
          },
          {
            key: 'agent:main:subagent:writer',
            label: 'Writer',
            status: 'queued',
            spawnedBy: 'agent:main:main',
          },
          {
            key: 'agent:main:subagent:critic',
            label: 'Critic',
            status: 'failed',
            spawnedBy: 'agent:main:main',
          },
        ],
      };
    }
    throw new Error(`unexpected method: ${method}`);
  });

  const result = await executeStudioSlashLocalGatewayCommand(
    gateway.client,
    'agent:main:main',
    'tasks',
    '',
    { activeRunId: 'run-main-1' },
  );

  assert.ok(result);
  assert.equal(result.phase, 'completed');
  assert.match(result.detail.zh, /run-main-1/);
  assert.match(result.detail.zh, /Researcher/);
  assert.match(result.detail.en, /queued/i);
  assert.deepEqual(gateway.calls, [
    {
      method: 'sessions.list',
      params: {},
    },
  ]);
});

test('local slash executor provides queue guidance locally but falls back for live overrides', async () => {
  const gateway = createGatewayClientMock(() => {
    throw new Error('queue helper should not hit gateway rpc without a live patch surface');
  });

  const summary = await executeStudioSlashLocalGatewayCommand(
    gateway.client,
    'agent:main:main',
    'queue',
    '',
    { queueLength: 3 },
  );

  assert.ok(summary);
  assert.equal(summary.phase, 'completed');
  assert.match(summary.detail.zh, /待发送队列 3 条/);
  assert.match(summary.detail.en, /queued sends: 3/i);
  assert.deepEqual(gateway.calls, []);

  const fallback = await executeStudioSlashLocalGatewayCommand(
    gateway.client,
    'agent:main:main',
    'queue',
    'interrupt 250 9 old',
    {},
  );

  assert.equal(fallback, null);
  assert.deepEqual(gateway.calls, []);
});

test('local slash executor lists workspace skills locally and falls back for actual skill runs', async () => {
  const gateway = createGatewayClientMock((method, params) => {
    if (method === 'skills.status') {
      assert.deepEqual(params, { agentId: 'main' });
      return {
        workspaceDir: '/tmp/workspace',
        managedSkillsDir: '/tmp/skills',
        skills: [
          {
            name: 'calendar',
            description: 'Calendar helper',
            source: 'workspace',
            bundled: false,
            filePath: '/tmp/workspace/skills/calendar/SKILL.md',
            baseDir: '/tmp/workspace/skills/calendar',
            skillKey: 'calendar',
            always: false,
            disabled: false,
            blockedByAllowlist: false,
            eligible: true,
            requirements: {},
            missing: {},
            configChecks: [],
            install: [],
          },
          {
            name: 'browser',
            description: 'Browser helper',
            source: 'managed',
            bundled: false,
            filePath: '/tmp/skills/browser/SKILL.md',
            baseDir: '/tmp/skills/browser',
            skillKey: 'browser',
            always: false,
            disabled: false,
            blockedByAllowlist: false,
            eligible: false,
            requirements: {},
            missing: { bins: ['playwright'] },
            configChecks: [],
            install: [],
          },
        ],
      };
    }
    throw new Error(`unexpected method: ${method}`);
  });

  const summary = await executeStudioSlashLocalGatewayCommand(
    gateway.client,
    'agent:main:webchat:direct:studio-demo',
    'skill',
    '',
    {},
  );

  assert.ok(summary);
  assert.equal(summary.phase, 'completed');
  assert.match(summary.detail.zh, /calendar/);
  assert.match(summary.detail.zh, /browser/);
  assert.match(summary.detail.en, /2 skills/i);

  const fallback = await executeStudioSlashLocalGatewayCommand(
    gateway.client,
    'agent:main:webchat:direct:studio-demo',
    'skill',
    'calendar next week',
    {},
  );

  assert.equal(fallback, null);
  assert.deepEqual(gateway.calls, [
    {
      method: 'skills.status',
      params: { agentId: 'main' },
    },
  ]);
});

test('local slash executor reports Tracevane-local context summary and detail', async () => {
  const gateway = createGatewayClientMock((method) => {
    if (method === 'sessions.list') {
      return {
        sessions: [
          {
            key: 'agent:main:main',
            label: 'Main',
            status: 'running',
            model: 'gpt-5.4',
            modelProvider: 'openai',
            thinkingLevel: 'high',
            verboseLevel: 'on',
            reasoningLevel: 'stream',
            elevatedLevel: 'ask',
            responseUsage: 'tokens',
            sendPolicy: 'allow',
            groupActivation: 'always',
            fastMode: true,
          },
          {
            key: 'agent:main:subagent:researcher',
            label: 'Researcher',
            status: 'running',
            spawnedBy: 'agent:main:main',
          },
        ],
      };
    }
    throw new Error(`unexpected method: ${method}`);
  });

  const detail = await executeStudioSlashLocalGatewayCommand(
    gateway.client,
    'agent:main:main',
    'context',
    'detail',
    {
      activeRunId: 'run-context-1',
      messageCount: 24,
      queueLength: 2,
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cacheReadTokens: 20,
        cacheWriteTokens: 10,
        costUsd: 0.0123,
      },
    },
  );

  assert.ok(detail);
  assert.equal(detail.phase, 'completed');
  assert.match(detail.detail.zh, /Tracevane 上下文/);
  assert.match(detail.detail.zh, /可见消息 24/);
  assert.match(detail.detail.zh, /Researcher/);
  assert.match(detail.detail.en, /reasoning=stream/i);

  const json = await executeStudioSlashLocalGatewayCommand(
    gateway.client,
    'agent:main:main',
    'context',
    'json',
    {
      activeRunId: 'run-context-1',
      messageCount: 24,
      queueLength: 2,
    },
  );

  assert.ok(json);
  assert.equal(json.phase, 'completed');
  assert.match(json.detail.en, /"activeRunId": "run-context-1"/);
  assert.deepEqual(gateway.calls, [
    {
      method: 'sessions.list',
      params: {},
    },
    {
      method: 'sessions.list',
      params: {},
    },
  ]);
});

test('local slash executor patches the current model through gateway rpc', async () => {
  const gateway = createGatewayClientMock((method) => {
    if (method === 'sessions.patch') {
      return { ok: true };
    }
    throw new Error(`unexpected method: ${method}`);
  });

  const result = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'model', 'gpt-5.4', {});
  assert.ok(result);
  assert.equal(result.phase, 'completed');
  assert.match(result.detail.en, /gpt-5\.4/i);
  assert.deepEqual(gateway.calls[0], {
    method: 'sessions.patch',
    params: { key: 'main', model: 'gpt-5.4' },
  });
});

test('local slash executor reads and patches reasoning visibility through gateway rpc', async () => {
  const gateway = createGatewayClientMock((method) => {
    if (method === 'sessions.list') {
      return {
        sessions: [
          {
            key: 'main',
            reasoningLevel: 'stream',
          },
        ],
      };
    }
    if (method === 'sessions.patch') {
      return { ok: true };
    }
    throw new Error(`unexpected method: ${method}`);
  });

  const current = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'reasoning', '', {});
  assert.ok(current);
  assert.equal(current.phase, 'completed');
  assert.match(current.detail.zh, /stream/);

  const patched = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'reasoning', 'on', {});
  assert.ok(patched);
  assert.equal(patched.phase, 'completed');
  assert.match(patched.detail.en, /enabled|set to on|on/i);

  assert.deepEqual(gateway.calls[1], {
    method: 'sessions.patch',
    params: { key: 'main', reasoningLevel: 'on' },
  });
});

test('local slash executor reads and patches usage footer mode through gateway rpc', async () => {
  const gateway = createGatewayClientMock((method) => {
    if (method === 'sessions.list') {
      return {
        sessions: [
          {
            key: 'main',
            responseUsage: 'tokens',
          },
        ],
      };
    }
    if (method === 'sessions.patch') {
      return { ok: true };
    }
    throw new Error(`unexpected method: ${method}`);
  });

  const current = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'usage', '', {});
  assert.ok(current);
  assert.equal(current.phase, 'completed');
  assert.match(current.detail.zh, /tokens/);

  const patched = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'usage', 'full', {});
  assert.ok(patched);
  assert.equal(patched.phase, 'completed');
  assert.match(patched.detail.en, /full/i);

  assert.deepEqual(gateway.calls[1], {
    method: 'sessions.patch',
    params: { key: 'main', responseUsage: 'full' },
  });
});

test('local slash executor patches elevated, activation, and send policies through gateway rpc', async () => {
  const gateway = createGatewayClientMock((method) => {
    if (method === 'sessions.patch') {
      return { ok: true };
    }
    throw new Error(`unexpected method: ${method}`);
  });

  const elevated = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'elevated', 'ask', {});
  const activation = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'activation', 'always', {});
  const send = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'send', 'inherit', {});

  assert.ok(elevated);
  assert.equal(elevated.phase, 'completed');
  assert.match(elevated.detail.en, /ask/i);

  assert.ok(activation);
  assert.equal(activation.phase, 'completed');
  assert.match(activation.detail.en, /always/i);

  assert.ok(send);
  assert.equal(send.phase, 'completed');
  assert.match(send.detail.en, /inherit/i);

  assert.deepEqual(gateway.calls, [
    {
      method: 'sessions.patch',
      params: { key: 'main', elevatedLevel: 'ask' },
    },
    {
      method: 'sessions.patch',
      params: { key: 'main', groupActivation: 'always' },
    },
    {
      method: 'sessions.patch',
      params: { key: 'main', sendPolicy: null },
    },
  ]);
});

test('local slash executor reports exec query limits locally and patches exec defaults through gateway rpc', async () => {
  const gateway = createGatewayClientMock((method) => {
    if (method === 'sessions.patch') {
      return { ok: true };
    }
    throw new Error(`unexpected method: ${method}`);
  });

  const current = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'exec', '', {});
  assert.ok(current);
  assert.equal(current.phase, 'completed');
  assert.match(current.detail.zh, /当前暂无法直接查询/i);
  assert.match(current.detail.zh, /host=auto/i);

  const patched = await executeStudioSlashLocalGatewayCommand(
    gateway.client,
    'main',
    'exec',
    'host=gateway security:allowlist ask=on-miss node:worker-1',
    {},
  );
  assert.ok(patched);
  assert.equal(patched.phase, 'completed');
  assert.match(patched.detail.en, /host=gateway/i);
  assert.match(patched.detail.en, /security=allowlist/i);
  assert.match(patched.detail.en, /ask=on-miss/i);
  assert.match(patched.detail.en, /node=worker-1/i);

  assert.deepEqual(gateway.calls, [
    {
      method: 'sessions.patch',
      params: {
        key: 'main',
        execHost: 'gateway',
        execSecurity: 'allowlist',
        execAsk: 'on-miss',
        execNode: 'worker-1',
      },
    },
  ]);
});

test('local slash executor rejects invalid exec defaults locally before any gateway patch', async () => {
  const gateway = createGatewayClientMock(() => {
    throw new Error('should not request gateway for invalid exec args');
  });

  const result = await executeStudioSlashLocalGatewayCommand(
    gateway.client,
    'main',
    'exec',
    'host=spaceship',
    {},
  );

  assert.ok(result);
  assert.equal(result.phase, 'error');
  assert.match(result.detail.en, /Unrecognized exec host/i);
  assert.equal(gateway.calls.length, 0);
});

test('local slash executor summarizes and mutates exec allowlist entries through gateway rpc', async () => {
  let hashCounter = 1;
  let snapshot = {
    path: '/tmp/exec-approvals.json',
    exists: true,
    hash: `hash-${hashCounter}`,
    file: {
      version: 1,
      agents: {
        main: {
          allowlist: [{ pattern: 'git status' }],
        },
      },
    },
  };

  const gateway = createGatewayClientMock((method, params) => {
    if (method === 'exec.approvals.get') {
      return snapshot;
    }
    if (method === 'exec.approvals.set') {
      const nextFile = (params as { file?: typeof snapshot.file }).file;
      snapshot = {
        ...snapshot,
        hash: `hash-${++hashCounter}`,
        file: nextFile || snapshot.file,
      };
      return snapshot;
    }
    throw new Error(`unexpected method: ${method}`);
  });

  const listed = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'allowlist', '', {});
  assert.ok(listed);
  assert.equal(listed.phase, 'completed');
  assert.match(listed.detail.zh, /当前 Agent main/);
  assert.match(listed.detail.zh, /git status/);

  const added = await executeStudioSlashLocalGatewayCommand(
    gateway.client,
    'main',
    'allowlist',
    'add npm test',
    {},
  );
  assert.ok(added);
  assert.equal(added.phase, 'completed');
  assert.match(added.detail.en, /Added allowlist entry/i);
  assert.match(added.detail.en, /npm test/);

  const removed = await executeStudioSlashLocalGatewayCommand(
    gateway.client,
    'main',
    'allowlist',
    'remove git status',
    {},
  );
  assert.ok(removed);
  assert.equal(removed.phase, 'completed');
  assert.match(removed.detail.en, /Removed allowlist entry/i);
  assert.match(removed.detail.en, /git status/);

  assert.deepEqual(gateway.calls, [
    { method: 'exec.approvals.get', params: {} },
    { method: 'exec.approvals.get', params: {} },
    {
      method: 'exec.approvals.set',
      params: {
        baseHash: 'hash-1',
        file: {
          version: 1,
          agents: {
            main: {
              allowlist: [{ pattern: 'git status' }, { pattern: 'npm test' }],
            },
          },
        },
      },
    },
    { method: 'exec.approvals.get', params: {} },
    {
      method: 'exec.approvals.set',
      params: {
        baseHash: 'hash-2',
        file: {
          version: 1,
          agents: {
            main: {
              allowlist: [{ pattern: 'npm test' }],
            },
          },
        },
      },
    },
  ]);
});

test('local slash executor summarizes and updates tts through gateway rpc', async () => {
  const gateway = createGatewayClientMock((method, params) => {
    if (method === 'tts.status') {
      return {
        enabled: true,
        auto: 'reply',
        provider: 'elevenlabs',
        fallbackProvider: 'openai',
        providerStates: [
          { id: 'elevenlabs', label: 'ElevenLabs', configured: true },
          { id: 'openai', label: 'OpenAI', configured: true },
          { id: 'azure', label: 'Azure', configured: false },
        ],
      };
    }
    if (method === 'tts.providers') {
      return {
        active: 'elevenlabs',
        providers: [
          { id: 'elevenlabs', name: 'ElevenLabs', configured: true, models: ['multilingual-v2'], voices: ['Rachel'] },
          { id: 'openai', name: 'OpenAI', configured: true, models: ['gpt-4o-mini-tts'], voices: [] },
          { id: 'azure', name: 'Azure', configured: false, models: [], voices: [] },
        ],
      };
    }
    if (method === 'tts.enable') {
      return { enabled: true };
    }
    if (method === 'tts.disable') {
      return { enabled: false };
    }
    if (method === 'tts.setProvider') {
      return { provider: (params as { provider?: string }).provider || null };
    }
    throw new Error(`unexpected method: ${method}`);
  });

  const status = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'tts', '', {});
  assert.ok(status);
  assert.equal(status.phase, 'completed');
  assert.match(status.detail.zh, /已开启/);
  assert.match(status.detail.zh, /elevenlabs/);
  assert.match(status.detail.en, /reply/i);

  const providers = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'tts', 'provider', {});
  assert.ok(providers);
  assert.equal(providers.phase, 'completed');
  assert.match(providers.detail.zh, /ElevenLabs/);
  assert.match(providers.detail.en, /active/i);

  const enabled = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'tts', 'on', {});
  assert.ok(enabled);
  assert.equal(enabled.phase, 'completed');
  assert.match(enabled.detail.en, /enabled/i);

  const disabled = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'tts', 'off', {});
  assert.ok(disabled);
  assert.equal(disabled.phase, 'completed');
  assert.match(disabled.detail.en, /disabled/i);

  const setProvider = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'tts', 'provider openai', {});
  assert.ok(setProvider);
  assert.equal(setProvider.phase, 'completed');
  assert.match(setProvider.detail.zh, /openai/i);

  assert.deepEqual(gateway.calls, [
    {
      method: 'tts.status',
      params: {},
    },
    {
      method: 'tts.providers',
      params: {},
    },
    {
      method: 'tts.enable',
      params: {},
    },
    {
      method: 'tts.disable',
      params: {},
    },
    {
      method: 'tts.setProvider',
      params: {
        provider: 'openai',
      },
    },
  ]);
});

test('local slash executor keeps unsupported tts actions on the host slash path', async () => {
  const gateway = createGatewayClientMock(() => {
    throw new Error('should not request gateway for passthrough tts actions');
  });

  const limit = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'tts', 'limit 2000', {});
  const summary = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'tts', 'summary on', {});
  const audio = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'tts', 'audio hello world', {});

  assert.equal(limit, null);
  assert.equal(summary, null);
  assert.equal(audio, null);
  assert.equal(gateway.calls.length, 0);
});

test('bash slash handling keeps ordinary shell commands but blocks host-management commands without both exec switches', () => {
  assert.equal(
    resolveStudioBashSlashHandling({
      args: '',
      globalHostManagementExecEnabled: false,
      sessionHostManagementExecEnabled: false,
    }).kind,
    'help',
  );

  assert.equal(
    resolveStudioBashSlashHandling({
      args: 'pwd && ls',
      globalHostManagementExecEnabled: false,
      sessionHostManagementExecEnabled: false,
    }).kind,
    'fallback',
  );

  const blocked = resolveStudioBashSlashHandling({
    args: 'openclaw gateway restart',
    globalHostManagementExecEnabled: true,
    sessionHostManagementExecEnabled: false,
  });
  assert.equal(blocked.kind, 'blocked');
  assert.match(blocked.detail.zh, /宿主管理 Exec/);

  assert.equal(
    resolveStudioBashSlashHandling({
      args: 'openclaw gateway restart',
      globalHostManagementExecEnabled: true,
      sessionHostManagementExecEnabled: true,
    }).kind,
    'fallback',
  );
});

test('restart slash is blocked unless both host-management exec switches are enabled', () => {
  assert.equal(
    resolveStudioBashSlashHandling({
      args: 'openclaw gateway restart',
      globalHostManagementExecEnabled: false,
      sessionHostManagementExecEnabled: false,
    }).kind,
    'blocked',
  );

  assert.equal(
    resolveStudioBashSlashHandling({
      args: 'openclaw gateway restart',
      globalHostManagementExecEnabled: true,
      sessionHostManagementExecEnabled: true,
    }).kind,
    'fallback',
  );
});

test('local slash executor returns Tracevane guidance for surface-specific slash commands', async () => {
  const gateway = createGatewayClientMock((method) => {
    if (method === 'sessions.list') {
      return {
        sessions: [
          {
            key: 'main',
            status: 'running',
          },
        ],
      };
    }
    throw new Error(`unexpected method: ${method}`);
  });

  const whoami = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'whoami', '', {});
  const session = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'session', 'idle 1h', {});
  const focus = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'focus', 'agent:main:main', {});
  const unfocus = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'unfocus', '', {});

  assert.ok(whoami);
  assert.equal(whoami.phase, 'completed');
  assert.match(whoami.detail.zh, /sender id/i);

  assert.ok(session);
  assert.equal(session.phase, 'completed');
  assert.match(session.detail.zh, /线程绑定/);

  assert.ok(focus);
  assert.equal(focus.phase, 'completed');
  assert.match(focus.detail.zh, /左侧会话列表/);

  assert.ok(unfocus);
  assert.equal(unfocus.phase, 'completed');
  assert.match(unfocus.detail.en, /does not keep a thread binding/i);

  assert.deepEqual(gateway.calls, [
    {
      method: 'sessions.list',
      params: {},
    },
  ]);
});

test('local slash executor lists and resolves pending approvals through gateway rpc', async () => {
  const gateway = createGatewayClientMock((method, params) => {
    if (method === 'exec.approval.list') {
      return [
        {
          id: 'exec-1',
          request: {
            command: 'npm publish',
            host: 'gateway',
          },
        },
      ];
    }
    if (method === 'plugin.approval.list') {
      return [
        {
          id: 'plugin:1',
          request: {
            title: 'Install studio plugin',
            pluginId: 'studio',
          },
        },
      ];
    }
    if (method === 'exec.approval.resolve') {
      return {
        id: (params as { id?: string }).id || null,
        decision: (params as { decision?: string }).decision || null,
      };
    }
    if (method === 'plugin.approval.resolve') {
      return {
        id: (params as { id?: string }).id || null,
        decision: (params as { decision?: string }).decision || null,
      };
    }
    throw new Error(`unexpected method: ${method}`);
  });

  const list = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'approve', '', {});
  assert.ok(list);
  assert.equal(list.phase, 'completed');
  assert.match(list.detail.zh, /exec-1/);
  assert.match(list.detail.zh, /plugin:1/);

  const execApproval = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'approve', 'exec-1 allow', {});
  assert.ok(execApproval);
  assert.equal(execApproval.phase, 'completed');
  assert.match(execApproval.detail.en, /allow-once/i);

  const pluginApproval = await executeStudioSlashLocalGatewayCommand(gateway.client, 'main', 'approve', 'plugin:1 deny', {});
  assert.ok(pluginApproval);
  assert.equal(pluginApproval.phase, 'completed');
  assert.match(pluginApproval.detail.zh, /deny/i);

  assert.deepEqual(gateway.calls, [
    {
      method: 'exec.approval.list',
      params: {},
    },
    {
      method: 'plugin.approval.list',
      params: {},
    },
    {
      method: 'exec.approval.resolve',
      params: {
        id: 'exec-1',
        decision: 'allow-once',
      },
    },
    {
      method: 'plugin.approval.resolve',
      params: {
        id: 'plugin:1',
        decision: 'deny',
      },
    },
  ]);
});

test('local slash executor steers a matching subagent via chat.send', async () => {
  const gateway = createGatewayClientMock((method, params) => {
    if (method === 'sessions.list') {
      return {
        sessions: [
          {
            key: 'agent:main:main',
            status: 'running',
          },
          {
            key: 'agent:main:subagent:researcher',
            label: 'Researcher',
            status: 'running',
            spawnedBy: 'agent:main:main',
          },
        ],
      };
    }
    if (method === 'chat.send') {
      return { ok: true, params };
    }
    throw new Error(`unexpected method: ${method}`);
  });

  const result = await executeStudioSlashLocalGatewayCommand(
    gateway.client,
    'agent:main:main',
    'steer',
    'researcher try a different approach',
    {},
  );

  assert.ok(result);
  assert.equal(result.phase, 'completed');
  assert.match(result.detail.en, /steered/i);
  assert.equal(gateway.calls[1]?.method, 'chat.send');
  const sendParams = gateway.calls[1]?.params as Record<string, unknown>;
  assert.equal(sendParams.sessionKey, 'agent:main:subagent:researcher');
  assert.equal(sendParams.message, 'try a different approach');
  assert.equal(sendParams.deliver, false);
  assert.match(String(sendParams.idempotencyKey || ''), /^.+$/);
});

test('local slash executor summarizes ACP sessions locally before falling back for write actions', async () => {
  const gateway = createGatewayClientMock((method, params) => {
    if (method === 'sessions.list') {
      return {
        sessions: [
          {
            key: 'agent:main:main',
            label: 'Main',
            status: 'running',
          },
          {
            key: 'agent:main:acp:planner',
            label: 'Planner ACP',
            status: 'running',
          },
        ],
      };
    }
    throw new Error(`unexpected method: ${method}`);
  });

  const result = await executeStudioSlashLocalGatewayCommand(
    gateway.client,
    'agent:main:main',
    'acp',
    'sessions',
    {},
  );

  assert.ok(result);
  assert.equal(result.phase, 'completed');
  assert.match(result.detail.zh, /ACP 会话/);
  assert.match(result.detail.en, /ACP session/i);
  assert.deepEqual(gateway.calls[0], {
    method: 'sessions.list',
    params: {},
  });
});

test('local slash executor marks current-session steer as accepted when the active run is still alive', async () => {
  const gateway = createGatewayClientMock((method, params) => {
    if (method === 'sessions.list') {
      return {
        sessions: [
          {
            key: 'agent:main:main',
            status: 'running',
          },
        ],
      };
    }
    if (method === 'chat.send') {
      return { ok: true, params };
    }
    throw new Error(`unexpected method: ${method}`);
  });

  const result = await executeStudioSlashLocalGatewayCommand(
    gateway.client,
    'agent:main:main',
    'steer',
    'try a different approach',
    {
      activeRunId: 'run-current-1',
    },
  );

  assert.ok(result);
  assert.equal(result.phase, 'accepted');
  assert.equal(result.runId, 'run-current-1');
  assert.match(result.detail.en, /steered the current run/i);
  assert.deepEqual(gateway.calls[1], {
    method: 'chat.send',
    params: {
      sessionKey: 'agent:main:main',
      message: 'try a different approach',
      deliver: false,
      idempotencyKey: gateway.calls[1]?.params && (gateway.calls[1].params as Record<string, unknown>).idempotencyKey,
    },
  });
  assert.match(
    String((gateway.calls[1]?.params as Record<string, unknown>)?.idempotencyKey || ''),
    /^.+$/,
  );
});

test('local slash executor redirects the current session and returns a tracked run id', async () => {
  const gateway = createGatewayClientMock((method) => {
    if (method === 'sessions.list') {
      return {
        sessions: [
          {
            key: 'agent:main:main',
            status: 'running',
          },
        ],
      };
    }
    if (method === 'sessions.steer') {
      return { status: 'started', runId: 'run-redirect-1' };
    }
    throw new Error(`unexpected method: ${method}`);
  });

  const result = await executeStudioSlashLocalGatewayCommand(
    gateway.client,
    'agent:main:main',
    'redirect',
    'start over with a new plan',
    {},
  );

  assert.ok(result);
  assert.equal(result.phase, 'accepted');
  assert.equal(result.runId, 'run-redirect-1');
  assert.match(result.detail.en, /redirected the current run/i);
  assert.deepEqual(gateway.calls[1], {
    method: 'sessions.steer',
    params: {
      key: 'agent:main:main',
      message: 'start over with a new plan',
    },
  });
});

test('local slash executor lists models grouped by provider', async () => {
  const gateway = createGatewayClientMock((method) => {
    if (method === 'models.list') {
      return {
        models: [
          { id: 'gpt-5.4', name: 'GPT-5.4', provider: 'openai' },
          { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', provider: 'openai' },
          { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', provider: 'anthropic' },
        ],
      };
    }
    throw new Error(`unexpected method: ${method}`);
  });

  const result = await executeStudioSlashLocalGatewayCommand(
    gateway.client,
    'agent:main:main',
    'models',
    '',
    {},
  );

  assert.ok(result);
  assert.equal(result.phase, 'completed');
  assert.match(result.detail.zh, /openai/i);
  assert.match(result.detail.zh, /anthropic/i);
  assert.match(result.detail.en, /gpt-5\.4/i);
  assert.match(result.detail.en, /claude-sonnet-4\.5/i);
  assert.deepEqual(gateway.calls[0], {
    method: 'models.list',
    params: {},
  });
});

test('local slash executor lists effective runtime tools for the current session', async () => {
  const gateway = createGatewayClientMock((method) => {
    if (method === 'tools.effective') {
      return {
        agentId: 'main',
        groups: [
          {
            id: 'core',
            label: 'Core',
            tools: [
              { id: 'exec', label: 'Exec', description: 'Run host commands.' },
              { id: 'read_file', label: 'Read File', description: 'Read local files.' },
            ],
          },
          {
            id: 'plugin',
            label: 'Plugin',
            tools: [
              { id: 'browser', label: 'Browser', description: 'Browse the web.' },
            ],
          },
        ],
      };
    }
    throw new Error(`unexpected method: ${method}`);
  });

  const result = await executeStudioSlashLocalGatewayCommand(
    gateway.client,
    'agent:main:main',
    'tools',
    'verbose',
    {},
  );

  assert.ok(result);
  assert.equal(result.phase, 'completed');
  assert.match(result.detail.zh, /Core/i);
  assert.match(result.detail.zh, /Exec/i);
  assert.match(result.detail.en, /browser/i);
  assert.deepEqual(gateway.calls[0], {
    method: 'tools.effective',
    params: {
      sessionKey: 'agent:main:main',
    },
  });
});

test('local slash executor reads config summary and path values for /config show|get', async () => {
  const gateway = createGatewayClientMock((method, params) => {
    if (method === 'config.get') {
      return {
        path: '/home/test/.openclaw/openclaw.json',
        exists: true,
        hash: 'hash-123',
        valid: true,
        config: {
          gateway: {
            bind: 'loopback',
            auth: {
              mode: 'shared-token',
            },
          },
          models: {
            providers: {
              openai: {
                baseUrl: 'https://example.test',
              },
            },
          },
        },
        issues: [],
      };
    }
    if (method === 'config.schema.lookup') {
      return {
        path: (params as Record<string, unknown>).path,
        hintPath: 'gateway.bind',
        children: [],
      };
    }
    throw new Error(`unexpected method: ${method}`);
  });

  const summary = await executeStudioSlashLocalGatewayCommand(
    gateway.client,
    'agent:main:main',
    'config',
    'show',
    {},
  );
  assert.ok(summary);
  assert.equal(summary.phase, 'completed');
  assert.match(summary.detail.zh, /openclaw\.json/i);
  assert.match(summary.detail.zh, /gateway/i);

  const detail = await executeStudioSlashLocalGatewayCommand(
    gateway.client,
    'agent:main:main',
    'config',
    'get gateway.bind',
    {},
  );
  assert.ok(detail);
  assert.equal(detail.phase, 'completed');
  assert.match(detail.detail.en, /gateway\.bind/i);
  assert.match(detail.detail.en, /loopback/i);
});

test('local slash executor returns null for /config write actions so chat can fall back to send mode', async () => {
  const gateway = createGatewayClientMock(() => {
    throw new Error('should not request gateway for unsupported local config action');
  });

  const result = await executeStudioSlashLocalGatewayCommand(
    gateway.client,
    'agent:main:main',
    'config',
    'set gateway.bind loopback',
    {},
  );

  assert.equal(result, null);
  assert.equal(gateway.calls.length, 0);
});

test('local slash executor turns Tracevane-only session identity commands into informational completions', async () => {
  const gateway = createGatewayClientMock((method) => {
    if (method === 'sessions.list') {
      return {
        sessions: [
          {
            key: 'agent:main:main',
            status: 'running',
            model: 'gpt-5.4',
            modelProvider: 'openai',
            thinkingLevel: 'medium',
            verboseLevel: 'on',
            reasoningLevel: 'stream',
            responseUsage: 'tokens',
            elevatedLevel: 'ask',
            sendPolicy: 'allow',
            groupActivation: 'mention',
            fastMode: true,
          },
        ],
      };
    }
    throw new Error(`unexpected method: ${method}`);
  });

  const whoami = await executeStudioSlashLocalGatewayCommand(
    gateway.client,
    'agent:main:main',
    'whoami',
    '',
    {},
  );
  assert.ok(whoami);
  assert.equal(whoami.phase, 'completed');
  assert.match(whoami.detail.zh, /key=agent:main:main/i);

  const session = await executeStudioSlashLocalGatewayCommand(
    gateway.client,
    'agent:main:main',
    'session',
    'status',
    {
      activeRunId: 'run-1',
      messageCount: 6,
      queueLength: 2,
      realtimeReady: true,
      transportMode: 'sse',
      exposureKind: 'gateway',
    },
  );
  assert.ok(session);
  assert.equal(session.phase, 'completed');
  assert.match(session.detail.en, /transport=sse/i);
  assert.match(session.detail.en, /Active run: run-1/i);

  const focus = await executeStudioSlashLocalGatewayCommand(
    gateway.client,
    'agent:main:main',
    'focus',
    '',
    {},
  );
  assert.ok(focus);
  assert.equal(focus.phase, 'completed');
  assert.match(focus.detail.en, /session agent:main:main/i);

  const unfocus = await executeStudioSlashLocalGatewayCommand(
    gateway.client,
    'agent:main:main',
    'unfocus',
    '',
    {},
  );
  assert.ok(unfocus);
  assert.equal(unfocus.phase, 'completed');
  assert.match(unfocus.detail.en, /use \/new/i);
});

test('local slash executor summarizes acp and debug while preserving host fallback for writes', async () => {
  const gateway = createGatewayClientMock((method) => {
    if (method === 'sessions.list') {
      return {
        sessions: [
          {
            key: 'agent:main:main',
            status: 'running',
          },
          {
            key: 'agent:main:acp:run-1',
            label: 'ACP Run 1',
            status: 'queued',
          },
        ],
      };
    }
    if (method === 'config.get') {
      return {
        path: '/home/test/.openclaw/openclaw.json',
        valid: true,
        config: {
          debug: {
            rpc: true,
            events: false,
          },
        },
      };
    }
    throw new Error(`unexpected method: ${method}`);
  });

  const acp = await executeStudioSlashLocalGatewayCommand(
    gateway.client,
    'agent:main:main',
    'acp',
    'status',
    {},
  );
  assert.ok(acp);
  assert.equal(acp.phase, 'completed');
  assert.match(acp.detail.en, /ACP session/i);

  const acpFallback = await executeStudioSlashLocalGatewayCommand(
    gateway.client,
    'agent:main:main',
    'acp',
    'spawn researcher',
    {},
  );
  assert.equal(acpFallback, null);

  const debug = await executeStudioSlashLocalGatewayCommand(
    gateway.client,
    'agent:main:main',
    'debug',
    'show',
    {
      transportMode: 'sse',
      exposureKind: 'gateway',
      realtimeReady: false,
    },
  );
  assert.ok(debug);
  assert.equal(debug.phase, 'completed');
  assert.match(debug.detail.en, /transport=sse/i);
  assert.match(debug.detail.en, /debug keys: rpc, events/i);

  const debugFallback = await executeStudioSlashLocalGatewayCommand(
    gateway.client,
    'agent:main:main',
    'debug',
    'set rpc true',
    {},
  );
  assert.equal(debugFallback, null);
});
