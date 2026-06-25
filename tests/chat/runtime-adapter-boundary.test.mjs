import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const serviceSource = readFileSync(new URL('../../apps/api/modules/chat/service.ts', import.meta.url), 'utf8');

function sliceFunctionBody(source, functionName) {
  const marker = `function ${functionName}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const open = source.indexOf('{', start);
  assert.notEqual(open, -1, `${functionName} should have a body`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`${functionName} body was not closed`);
}

test('ChatService keeps raw OpenClaw gateway calls inside the runtime adapter boundary', () => {
  const adapterBody = sliceFunctionBody(serviceSource, 'createCurrentChatRuntimeAdapter');
  assert.match(adapterBody, /requestGateway\(/, 'adapter should own gateway RPC calls');
  assert.match(adapterBody, /requestViaSessionBridge</, 'adapter should own session bridge RPC calls');

  const withoutAdapter = serviceSource.replace(adapterBody, '');
  const bridgeDefinitionPattern = /async function requestViaSessionBridge<T>[\s\S]*?return await requestViaBridge<T>\(bridge, method, params\);\n  }/;
  const serviceMain = withoutAdapter.replace(bridgeDefinitionPattern, '');

  assert.doesNotMatch(
    serviceMain,
    /requestGateway(?:<[^>]+>)?\(/,
    'ChatService main logic must not call requestGateway directly; add a ChatRuntimeAdapter method instead',
  );
  assert.doesNotMatch(
    serviceMain,
    /requestViaSessionBridge(?:<[^>]+>)?\(/,
    'ChatService main logic must not call requestViaSessionBridge directly; add a ChatRuntimeAdapter method instead',
  );
});


test('Chat frontend streams only attach the OpenClaw session bridge for OpenClaw runtime targets', () => {
  assert.ok(
    serviceSource.includes("function shouldUseOpenClawGatewayBridge(session: ChatSessionRow | null | undefined): boolean {\n    return Boolean(session && session.runtimeTarget?.adapterKind !== 'native-cli');\n  }"),
    'OpenClaw bridge eligibility should be explicit and exclude native CLI sessions',
  );

  const attachStart = serviceSource.indexOf('async attachGatewayClient(');
  const openStreamStart = serviceSource.indexOf('async openEventStream(');
  const handleUpgradeStart = serviceSource.indexOf('handleUpgrade(req: http.IncomingMessage', openStreamStart);
  assert.notEqual(attachStart, -1, 'attachGatewayClient should exist');
  assert.notEqual(openStreamStart, -1, 'openEventStream should exist');
  assert.notEqual(handleUpgradeStart, -1, 'handleUpgrade should exist');

  const attachBody = serviceSource.slice(attachStart, openStreamStart);
  const streamBody = serviceSource.slice(openStreamStart, handleUpgradeStart);
  assert.match(attachBody, /if \(shouldUseOpenClawGatewayBridge\(session\)\) \{\n\s*void ensureSessionBridge\(sessionKey\)/);
  assert.match(streamBody, /if \(shouldUseOpenClawGatewayBridge\(session\)\) \{\n\s*void ensureSessionBridge\(normalizedSessionKey\)/);

  const wsStart = serviceSource.indexOf("wss.on('connection'");
  assert.notEqual(wsStart, -1, 'websocket frontend stream handler should exist');
  const wsBody = serviceSource.slice(wsStart, serviceSource.indexOf('function broadcastImmediateCanonicalUserMessage', wsStart));
  assert.match(wsBody, /const session = state\?\.row \|\| null;\n\s*if \(shouldUseOpenClawGatewayBridge\(session\)\) \{/);
});
