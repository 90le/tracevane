import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/tracevane';

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), 'utf8');
}

const channelTypes = read('types/channels.ts');
const routeManifest = read('apps/web-vue/src/app/route-manifest.ts');
const modelGatewayPrototype = read('docs/prototypes/pages/model-gateway.html');
const imChannelsPrototype = read('docs/prototypes/pages/im-channels.html');

test('channel field descriptors expose metadata for select inputs and helper copy', () => {
  assert.match(channelTypes, /export type ChannelFieldInputType = 'text' \| 'textarea' \| 'number' \| 'boolean' \| 'stringList' \| 'select';/);
  assert.match(channelTypes, /export type ChannelFieldGroupId =/);
  assert.match(channelTypes, /export type ChannelFieldSemanticType =/);
  assert.match(channelTypes, /export interface ChannelFieldOption \{/);
  assert.match(channelTypes, /group\?: ChannelFieldGroupId;/);
  assert.match(channelTypes, /semantic\?: ChannelFieldSemanticType;/);
  assert.match(channelTypes, /helpText\?: string;/);
  assert.match(channelTypes, /options\?: ChannelFieldOption\[\];/);
});

test('Aurora connector surfaces keep gateway and IM channel routes separate', () => {
  assert.match(routeManifest, /path:\s*"model-gateway"[\s\S]*group:\s*"连接"/);
  assert.match(routeManifest, /path:\s*"im-channels"[\s\S]*group:\s*"连接"/);
  assert.match(modelGatewayPrototype, /Provider|GLM|Codex|OpenAI/i);
  assert.match(imChannelsPrototype, /Feishu|IM|Channel|飞书/i);
});

test('Aurora connector prototypes do not expose raw credential fields in list views', () => {
  assert.doesNotMatch(modelGatewayPrototype, /apiKey|secretKey|credentialValues/);
  assert.match(imChannelsPrototype, /App Secret 引用[\s\S]*feishu\.app_secret · &bull;&bull;&bull;&bull;/);
  assert.doesNotMatch(imChannelsPrototype, /credentialValues|tokenSecret|sk-[A-Za-z0-9]/);
});
