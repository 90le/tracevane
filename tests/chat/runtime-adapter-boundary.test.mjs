import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const serviceSource = readFileSync(new URL('../../apps/api/modules/chat/service.ts', import.meta.url), 'utf8');
const openClawAdapterSource = readFileSync(new URL('../../apps/api/modules/chat/openclaw-runtime/adapter.ts', import.meta.url), 'utf8');
const nativeCliAdapterSource = readFileSync(new URL('../../apps/api/modules/chat/native-cli-runtime/adapter.ts', import.meta.url), 'utf8');

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

test('ChatService keeps native CLI runner details inside the native runtime adapter boundary', () => {
  const adapterBody = sliceFunctionBody(serviceSource, 'createCurrentChatRuntimeAdapter');
  assert.match(adapterBody, /createNativeCliChatRuntimeAdapter/, 'ChatService should delegate native adapter creation');
  assert.doesNotMatch(adapterBody, /runChannelConnectorAgentTurn/, 'ChatService adapter selector must not own native CLI process execution');
  assert.doesNotMatch(adapterBody, /resolveChannelConnectorGatewayClientKey/, 'ChatService adapter selector must not own gateway client key wiring');

  assert.doesNotMatch(
    serviceSource,
    /function buildChatNativeProject/,
    'ChatService should not own native CLI project construction',
  );
  assert.doesNotMatch(
    serviceSource,
    /function buildChatNativeMessage/,
    'ChatService should not own native CLI inbound message construction',
  );
  assert.match(nativeCliAdapterSource, /runChannelConnectorAgentTurn/, 'native CLI adapter owns process execution');
  assert.match(nativeCliAdapterSource, /resolveChannelConnectorGatewayClientKey/, 'native CLI adapter owns gateway client key wiring');
  assert.match(nativeCliAdapterSource, /export function assertSupportedNativeRuntimeTarget/, 'native runtime validation stays with native adapter');
});



test('Native CLI adapter keeps supported agent ids centralized', () => {
  assert.match(nativeCliAdapterSource, /import \{ CHANNEL_CONNECTOR_RUNTIME_AGENT_IDS \}/);
  assert.match(nativeCliAdapterSource, /export const SUPPORTED_NATIVE_CHAT_AGENT_IDS = CHANNEL_CONNECTOR_RUNTIME_AGENT_IDS/);
  assert.match(nativeCliAdapterSource, /const NATIVE_CHAT_AGENT_ALIASES: Record<string, ChannelConnectorAgentId>/);
  assert.match(nativeCliAdapterSource, /const candidate = NATIVE_CHAT_AGENT_ALIASES\[normalized\] \?\? normalized/);
  assert.match(nativeCliAdapterSource, /SUPPORTED_NATIVE_CHAT_AGENT_ID_SET\.has\(candidate\)/);
  assert.match(nativeCliAdapterSource, /SUPPORTED_NATIVE_CHAT_AGENT_IDS\.join\(', '\)/);
  assert.doesNotMatch(
    nativeCliAdapterSource,
    /normalized === 'codex'[\s\S]*?normalized === 'claude-code'[\s\S]*?normalized === 'opencode'/,
    'supported native Chat agent ids should not be re-listed inside normalizeNativeChatAgent',
  );
});



test('Native CLI adapter rejects unsupported sends instead of returning a fake started run', () => {
  assert.match(nativeCliAdapterSource, /throw new ChatServiceError\(400, buildChatError\(/);
  assert.match(nativeCliAdapterSource, /Native CLI agent '\$\{session\.runtimeTarget\.agent \|\| 'unknown'\}' is not supported/);
  assert.doesNotMatch(
    nativeCliAdapterSource,
    /status: 'started',[\s\S]*not supported by the native Chat runner yet/,
    'unsupported native agents must fail before run creation, not masquerade as started terminal runs',
  );
});

test('Native Chat runner marks web Chat messages instead of leaking IM prompt semantics', () => {
  assert.match(
    nativeCliAdapterSource,
    /metadata: \{\n\s*source: 'tracevane-chat',\n\s*surface: 'agent-chat',\n\s*runtimeAdapter: 'native-cli'/,
  );
  const runnerSource = readFileSync(new URL('../../apps/api/modules/channel-connectors/agent-runner.ts', import.meta.url), 'utf8');
  assert.match(runnerSource, /function currentMessageBlock\(message: ChannelConnectorOctoInboundMessage, content: string\)/);
  assert.match(runnerSource, /Current Tracevane Chat message - respond to this ONLY/);
  assert.match(runnerSource, /Current IM message - respond to this ONLY/);
  assert.match(runnerSource, /function isTracevaneChatMessage\(message: ChannelConnectorOctoInboundMessage\): boolean/);
  assert.match(runnerSource, /inboundMessageSource\(message\) === "tracevane-chat" \|\| inboundMessageSurface\(message\) === "agent-chat"/);
  assert.match(runnerSource, /const skills = isTracevaneChat \? "" : normalizeString\(channelSkillContext\)/);
  assert.match(runnerSource, /const groupContext = isTracevaneChat \? "" : buildGroupContext\(message, binding\)/);
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


test('ChatService delegates gateway file-reference text formatting to shared transport helper', () => {
  assert.match(serviceSource, /compileGatewayMessageText/, 'service should import the shared gateway transport compiler');
  assert.doesNotMatch(serviceSource, /function formatGatewayFileRef/, 'service must not own gateway @file formatting');
  assert.doesNotMatch(serviceSource, /function compileOpenClawGatewayMessageText/, 'service must not own OpenClaw-specific message compilation');
  assert.match(serviceSource, /function compileRuntimeTransportMessage/, 'service may only select runtime transport behavior');
});


test('OpenClaw runtime adapter forwards structured fileRefs beside transport text', () => {
  assert.match(openClawAdapterSource, /fileRefs: input\.fileRefs \|\| \[\]/, 'OpenClaw adapter should pass structured Files API refs to compatible gateways');
});
