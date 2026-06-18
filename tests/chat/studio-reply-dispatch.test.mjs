import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STUDIO_PRIVATE_CHAT_BLOCKED_TOOL_NAMES,
  buildStudioReplyDispatchConfigOverride,
  maybeHandleStudioReplyDispatch,
} from '../../dist/lib/studio-reply-dispatch.js';

function createDispatcher() {
  const counts = {
    tool: 0,
    block: 0,
    final: 0,
  };

  return {
    counts,
    sendToolResult(payload) {
      counts.tool += 1;
      return Boolean(payload);
    },
    sendBlockReply(payload) {
      counts.block += 1;
      return Boolean(payload);
    },
    sendFinalReply(payload) {
      counts.final += 1;
      return Boolean(payload);
    },
    getQueuedCounts() {
      return { ...counts };
    },
  };
}

test('buildStudioReplyDispatchConfigOverride merges blocked management tools into global deny list', () => {
  const override = buildStudioReplyDispatchConfigOverride({
    tools: {
      deny: ['exec', 'gateway'],
    },
  });

  assert.deepEqual(override, {
    tools: {
      deny: [
        'exec',
        ...STUDIO_PRIVATE_CHAT_BLOCKED_TOOL_NAMES,
      ],
    },
  });
});

test('maybeHandleStudioReplyDispatch ignores non-studio or routed sessions', async () => {
  const dispatcher = createDispatcher();
  const handledExternal = await maybeHandleStudioReplyDispatch(
    {
      ctx: {
        SessionKey: 'agent:main:webchat:direct:user-123',
        Surface: 'webchat',
      },
      sessionKey: 'agent:main:webchat:direct:user-123',
      shouldRouteToOriginating: false,
    },
    {
      cfg: {},
      dispatcher,
      recordProcessed() {},
      markIdle() {},
    },
    async () => {
      throw new Error('should not run');
    },
  );
  assert.equal(handledExternal, undefined);

  const handledRouted = await maybeHandleStudioReplyDispatch(
    {
      ctx: {
        SessionKey: 'agent:main:webchat:direct:studio-test',
        Surface: 'webchat',
      },
      sessionKey: 'agent:main:webchat:direct:studio-test',
      shouldRouteToOriginating: true,
    },
    {
      cfg: {},
      dispatcher,
      recordProcessed() {},
      markIdle() {},
    },
    async () => {
      throw new Error('should not run');
    },
  );
  assert.equal(handledRouted, undefined);
});

test('maybeHandleStudioReplyDispatch reuses default reply runtime with temporary blocked tools for Tracevane private chat without queueing a duplicate final reply', async () => {
  const dispatcher = createDispatcher();
  const calls = [];

  const result = await maybeHandleStudioReplyDispatch(
    {
      ctx: {
        SessionKey: 'agent:main:webchat:direct:studio-test',
        Surface: 'webchat',
        Provider: 'webchat',
      },
      runId: 'run-1',
      sessionKey: 'agent:main:webchat:direct:studio-test',
      shouldRouteToOriginating: false,
    },
    {
      cfg: {
        tools: {
          deny: ['exec'],
        },
      },
      dispatcher,
      abortSignal: undefined,
      async onReplyStart() {},
      recordProcessed() {},
      markIdle() {},
    },
    async (ctx, opts, configOverride) => {
      calls.push({ ctx, opts, configOverride });
      await opts?.onToolResult?.({ text: 'tool status' });
      await opts?.onBlockReply?.({ text: 'stream chunk' });
      return { text: 'final answer' };
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.ctx?.SessionKey, 'agent:main:webchat:direct:studio-test');
  assert.equal(calls[0]?.opts?.runId, 'run-1');
  assert.ok(Array.isArray(calls[0]?.configOverride?.tools?.deny));
  assert.deepEqual(calls[0]?.configOverride?.tools?.deny, [
    'exec',
    ...STUDIO_PRIVATE_CHAT_BLOCKED_TOOL_NAMES,
  ]);
  assert.deepEqual(dispatcher.getQueuedCounts(), {
    tool: 1,
    block: 1,
    final: 0,
  });
  assert.deepEqual(result, {
    handled: true,
    queuedFinal: false,
    counts: {
      tool: 1,
      block: 1,
      final: 0,
    },
  });
});
