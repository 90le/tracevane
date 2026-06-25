import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const serviceSource = readFileSync(new URL('../../apps/api/modules/chat/service.ts', import.meta.url), 'utf8');
const openClawAdapterSource = readFileSync(new URL('../../apps/api/modules/chat/openclaw-runtime/adapter.ts', import.meta.url), 'utf8');

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

test('ChatService keeps raw OpenClaw gateway calls inside the OpenClaw runtime adapter boundary', () => {
  const adapterBody = sliceFunctionBody(serviceSource, 'createCurrentChatRuntimeAdapter');
  assert.match(adapterBody, /createOpenClawGatewayChatRuntimeAdapter/, 'ChatService should delegate OpenClaw adapter creation');
  assert.doesNotMatch(adapterBody, /requestGateway\(/, 'ChatService adapter selector must not own gateway RPC calls');
  assert.doesNotMatch(adapterBody, /requestViaSessionBridge</, 'ChatService adapter selector must not own bridge RPC calls');

  const bridgeDefinitionPattern = /async function requestViaSessionBridge<T>[\s\S]*?return await requestViaBridge<T>\(bridge, method, params\);\n  }/;
  const serviceMain = serviceSource.replace(bridgeDefinitionPattern, '');

  assert.doesNotMatch(
    serviceMain,
    /requestGateway(?:<[^>]+>)?\(/,
    'ChatService main logic must not call requestGateway directly; add a ChatRuntimeAdapter method instead',
  );

  assert.match(openClawAdapterSource, /requestGateway(?:<[^>]+>)?\(/, 'OpenClaw adapter owns gateway RPC calls');
  assert.match(openClawAdapterSource, /requestViaSessionBridge/, 'OpenClaw adapter receives the bridge requester explicitly');
});


test('Chat frontend streams only attach the OpenClaw session bridge for OpenClaw runtime targets', () => {
  assert.ok(
    serviceSource.includes("function shouldUseOpenClawGatewayBridge(session: ChatSessionRow | null | undefined): boolean {\n    return session?.runtimeTarget?.adapterKind === 'openclaw-gateway';\n  }"),
    'OpenClaw bridge eligibility must be explicit and allow only OpenClaw runtime sessions',
  );


  const keepAliveBody = sliceFunctionBody(serviceSource, 'shouldKeepBridgeAlive');
  assert.match(
    keepAliveBody,
    /if \(!shouldUseOpenClawGatewayBridge\(session\)\) return false;/,
    'bridge keepalive must dispose if a session is migrated away from OpenClaw runtime',
  );

  const ensureBridgeBody = sliceFunctionBody(serviceSource, 'ensureSessionBridge');
  assert.match(
    ensureBridgeBody,
    /if \(!shouldUseOpenClawGatewayBridge\(session\)\) \{/,
    'bridge creation must reject native-cli and future non-OpenClaw sessions',
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
