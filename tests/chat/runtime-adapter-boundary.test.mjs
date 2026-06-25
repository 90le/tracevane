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
