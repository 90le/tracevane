import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), 'utf8');
}

const channelTypes = read('types/channels.ts');
const channelAccountDetailPage = read('apps/web-vue/src/features/channels/ChannelAccountDetailPage.vue');

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

test('channel account detail page keeps grouped dynamic field rendering instead of flattening the schema', () => {
  assert.match(channelAccountDetailPage, /v-for="fieldGroup in groupedAccountFields"/);
  assert.match(channelAccountDetailPage, /accountFieldGroupLabel\(fieldGroup\.id\)/);
  assert.match(channelAccountDetailPage, /function accountFieldGroupLabel\(groupId: ChannelFieldGroupId \| ''\): string/);
  assert.match(channelAccountDetailPage, /field\.group \|\| ''/);
  assert.match(channelAccountDetailPage, /field\.semantic/);
  assert.match(channelAccountDetailPage, /accountFieldOptions\(field: ChannelFieldDescriptor\): GlassSelectOption\[\]/);
  assert.match(channelAccountDetailPage, /accountFieldInputType\(field: ChannelFieldDescriptor\): 'text' \| 'url'/);
  assert.doesNotMatch(channelAccountDetailPage, /v-for="field in selectedCatalog\.accountFields"/);
});
