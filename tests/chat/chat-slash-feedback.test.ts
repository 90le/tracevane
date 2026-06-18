import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyRuntimeToTracevaneSlashExecutionFeedback,
  createTracevaneSlashExecutionFeedback,
  describeTracevaneSlashExecutionFeedback,
} from '../../apps/web-vue/src/features/chat/slash-feedback';

function createRuntime(overrides: Record<string, unknown> = {}) {
  return {
    gatewayConnected: true,
    sessionWritable: true,
    activeRunId: null,
    state: 'idle',
    lastEventAt: null,
    lastAckAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    ...overrides,
  };
}

test('slash feedback describes compact lifecycle with dedicated copy', () => {
  const pending = createTracevaneSlashExecutionFeedback({
    sessionKey: 'agent:main:webchat:direct:tracevane-test',
    commandName: 'compact',
    args: '',
    mode: 'send',
    phase: 'accepted',
    startedAt: '2026-04-10T08:00:00.000Z',
    updatedAt: '2026-04-10T08:00:00.000Z',
    runId: null,
    detail: null,
  });

  assert.deepEqual(describeTracevaneSlashExecutionFeedback(pending, 'zh'), {
    tone: 'info',
    title: '已发送 /compact',
    detail: 'Tracevane 已收到命令，等待宿主开始执行上下文压缩。',
    commandText: '/compact',
  });

  const completed = applyRuntimeToTracevaneSlashExecutionFeedback(
    pending,
    createRuntime({
      state: 'completed',
      activeRunId: null,
      lastEventAt: '2026-04-10T08:00:12.000Z',
    }),
    { runId: 'run-compact-1' },
  );

  assert.deepEqual(describeTracevaneSlashExecutionFeedback(completed, 'zh'), {
    tone: 'success',
    title: '上下文压缩已完成',
    detail: '当前会话已经结束这次压缩流程，可以继续对话。',
    commandText: '/compact',
  });
});

test('slash feedback runtime transitions move generic commands into running and error states', () => {
  const accepted = createTracevaneSlashExecutionFeedback({
    sessionKey: 'agent:main:webchat:direct:tracevane-test',
    commandName: 'model',
    args: 'gpt-5.4',
    mode: 'send',
    phase: 'accepted',
    startedAt: '2026-04-10T08:00:00.000Z',
    updatedAt: '2026-04-10T08:00:00.000Z',
    runId: 'run-model-1',
    detail: null,
  });

  const running = applyRuntimeToTracevaneSlashExecutionFeedback(
    accepted,
    createRuntime({
      state: 'running',
      activeRunId: 'run-model-1',
      lastEventAt: '2026-04-10T08:00:04.000Z',
    }),
    { runId: 'run-model-1' },
  );
  assert.equal(running.phase, 'running');

  const failed = applyRuntimeToTracevaneSlashExecutionFeedback(
    running,
    createRuntime({
      state: 'error',
      activeRunId: null,
      lastEventAt: '2026-04-10T08:00:09.000Z',
      lastErrorMessage: 'provider timeout',
    }),
    { runId: 'run-model-1' },
  );

  assert.deepEqual(describeTracevaneSlashExecutionFeedback(failed, 'en'), {
    tone: 'error',
    title: '/model failed',
    detail: 'provider timeout',
    commandText: '/model gpt-5.4',
  });
});

test('slash feedback describes redirect lifecycle with tracked current-session run state', () => {
  const accepted = createTracevaneSlashExecutionFeedback({
    sessionKey: 'agent:main:webchat:direct:tracevane-test',
    commandName: 'redirect',
    args: 'start over with a new plan',
    mode: 'local',
    phase: 'accepted',
    startedAt: '2026-04-10T08:00:00.000Z',
    updatedAt: '2026-04-10T08:00:00.000Z',
    runId: 'run-redirect-1',
    detail: null,
  });

  assert.deepEqual(describeTracevaneSlashExecutionFeedback(accepted, 'zh'), {
    tone: 'info',
    title: '已发送 /redirect',
    detail: 'Tracevane 已请求宿主中止当前运行并开始新的执行。',
    commandText: '/redirect start over with a new plan',
  });

  const running = applyRuntimeToTracevaneSlashExecutionFeedback(
    accepted,
    createRuntime({
      state: 'running',
      activeRunId: 'run-redirect-1',
      lastEventAt: '2026-04-10T08:00:04.000Z',
    }),
    { runId: 'run-redirect-1' },
  );

  assert.deepEqual(describeTracevaneSlashExecutionFeedback(running, 'en'), {
    tone: 'info',
    title: 'Redirecting current run',
    detail: 'The host is interrupting the old run and starting a new execution flow.',
    commandText: '/redirect start over with a new plan',
  });

  const completed = applyRuntimeToTracevaneSlashExecutionFeedback(
    running,
    createRuntime({
      state: 'completed',
      activeRunId: null,
      lastEventAt: '2026-04-10T08:00:12.000Z',
    }),
    { runId: 'run-redirect-1' },
  );

  assert.deepEqual(describeTracevaneSlashExecutionFeedback(completed, 'zh'), {
    tone: 'success',
    title: '重定向已完成',
    detail: '新的执行流程已经稳定接管当前会话。',
    commandText: '/redirect start over with a new plan',
  });
});

test('slash feedback describes btw side-question results with dedicated copy', () => {
  const accepted = createTracevaneSlashExecutionFeedback({
    sessionKey: 'agent:main:webchat:direct:tracevane-test',
    commandName: 'btw',
    args: 'what changed?',
    mode: 'send',
    phase: 'accepted',
    startedAt: '2026-04-10T08:00:00.000Z',
    updatedAt: '2026-04-10T08:00:00.000Z',
    runId: 'run-btw-1',
    detail: null,
  });

  assert.deepEqual(describeTracevaneSlashExecutionFeedback(accepted, 'zh'), {
    tone: 'info',
    title: '已发送 /btw',
    detail: 'Tracevane 已收到侧问，等待宿主给出不进入未来上下文的临时回答。',
    commandText: '/btw what changed?',
  });

  const completed = createTracevaneSlashExecutionFeedback({
    ...accepted,
    phase: 'completed',
    updatedAt: '2026-04-10T08:00:03.000Z',
    detail: 'Only the tests changed.',
  });

  assert.deepEqual(describeTracevaneSlashExecutionFeedback(completed, 'en'), {
    tone: 'success',
    title: '/btw answered',
    detail: 'Only the tests changed.',
    commandText: '/btw what changed?',
  });
});
