import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), 'utf8');
}

const channelTypes = read('types/channels.ts');
const navigation = read('apps/web/src/app/navigation.ts');
const modelGatewayPage = read('apps/web/src/features/model-gateway/ModelGatewayPage.tsx');
const imChannelsPage = read('apps/web/src/features/channel-connectors/ChannelConnectorsPage.tsx');
const imChannelsAccounts = read('apps/web/src/features/channel-connectors/views/V3AccountsView.tsx');

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

test('connector surfaces keep gateway and IM channel routes separate', () => {
  assert.match(navigation, /path:\s*["']\/model-gateway["'][\s\S]*?group:\s*["']接入["']/);
  assert.match(navigation, /path:\s*["']\/im-channels["'][\s\S]*?group:\s*["']接入["']/);
  assert.match(modelGatewayPage, /Provider|Gateway|OpenAI/i);
  assert.match(imChannelsPage, /IM|Channel|渠道|平台账号/i);
});

test('connector implementation does not expose raw credential fields in list views', () => {
  assert.doesNotMatch(modelGatewayPage, /credentialValues|sk-[A-Za-z0-9]/);
  assert.match(imChannelsAccounts, /渠道账号|密钥|credentials/);
  assert.doesNotMatch(imChannelsAccounts, /credentialValues|tokenSecret|sk-[A-Za-z0-9]/);
});
