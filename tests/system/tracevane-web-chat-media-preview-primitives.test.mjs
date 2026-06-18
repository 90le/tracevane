import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const messageBubble = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/MessageBubble.vue'),
  'utf8',
);
const messageResourceList = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/MessageResourceList.vue'),
  'utf8',
);
const messageBubbleCss = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/message-bubble.css'),
  'utf8',
);

function sourceBlock(startPattern) {
  const match = messageBubble.match(startPattern);
  return match?.[0] || '';
}

test('message media preview uses reka dialog primitives instead of a hand-rolled teleported mask', () => {
  assert.match(messageBubble, /import '\.\/message-bubble\.css';/);
  assert.doesNotMatch(messageBubble, /<style scoped>/);
  assert.match(messageBubble, /from 'reka-ui'/);
  assert.match(messageBubble, /DialogRoot/);
  assert.match(messageBubble, /DialogPortal/);
  assert.match(messageBubble, /DialogOverlay/);
  assert.match(messageBubble, /DialogContent/);
  assert.match(messageBubble, /DialogClose/);
  assert.match(messageBubble, /DialogTitle/);
  assert.match(messageBubble, /DialogDescription/);
  assert.match(messageBubble, /<DialogRoot :open="Boolean\(mediaPreview\)" @update:open="handleMediaPreviewOpenChange">/);
  assert.match(messageBubble, /<DialogOverlay class="chat-image-preview-mask"\s*\/>/);
  assert.match(messageBubble, /<DialogContent as-child @open-auto-focus\.prevent @close-auto-focus\.prevent>/);
  assert.match(messageBubble, /<DialogTitle as-child>[\s\S]*<span class="sr-only">\{\{ mediaPreview\?\.alt \|\| text\('资源预览', 'Media preview'\) \}\}<\/span>/);
  assert.match(messageBubble, /<DialogDescription as-child>[\s\S]*<span class="sr-only">\{\{ text\('预览当前聊天资源，可关闭后回到会话。', 'Preview the current chat media, then close to return to the conversation\.'\) \}\}<\/span>/);
  assert.doesNotMatch(messageBubble, /<Teleport to="body">/);
  assert.doesNotMatch(messageBubble, /role="dialog"/);
  assert.doesNotMatch(messageBubble, /@click\.self="closeMediaPreview"/);
});

test('message media preview closes through a controlled open handler', () => {
  const mountedBlock = sourceBlock(/onMounted\(\(\) => \{[\s\S]*?\n\}\);/);
  assert.match(messageBubble, /:data-chat-media-preview-source-key="inlinePreviewSourceKey\(segment\.item\)"/);
  assert.match(messageBubble, /:data-chat-media-preview-source-key="inlinePreviewSourceKey\(run\.segment\.item\)"/);
  assert.match(messageBubble, /const mediaPreviewSourceKey = ref<string \| null>\(null\);/);
  assert.match(messageBubble, /let mediaPreviewReturnFocusTarget: HTMLElement \| null = null;/);
  assert.match(messageBubble, /function inlinePreviewSourceKey\(item: ChatDisplayResourceItem\): string \{/);
  assert.match(messageBubble, /sourceKey: inlinePreviewSourceKey\(item\)/);
  assert.match(messageBubble, /event\?\.currentTarget instanceof HTMLElement \? event\.currentTarget : null/);
  assert.match(messageBubble, /tracevanePreviewTrigger\.dataset\.chatMediaPreviewSourceKey\?\.trim\(\) \|\| null/);
  assert.match(messageBubble, /function focusMediaPreviewSource\(sourceKey: string \| null, trigger: HTMLElement \| null\): void \{/);
  assert.match(messageBubble, /\[data-chat-media-preview-source-key\]/);
  assert.match(messageBubble, /item\.dataset\.chatMediaPreviewSourceKey === normalizedSourceKey/);
  assert.match(messageBubble, /bubbleRoot\.value\?\.focus\(\{ preventScroll: true \}\);/);
  assert.match(messageBubble, /const sourceKey = mediaPreviewSourceKey\.value;/);
  assert.match(messageBubble, /const trigger = mediaPreviewReturnFocusTarget;/);
  assert.match(messageBubble, /mediaPreviewSourceKey\.value = null;/);
  assert.match(messageBubble, /mediaPreviewReturnFocusTarget = null;/);
  assert.match(messageBubble, /void nextTick\(\(\) => \{[\s\S]*focusMediaPreviewSource\(sourceKey, trigger\);/);
  assert.match(messageResourceList, /:data-chat-media-preview-source-key="mediaPreviewSourceKey\(item\)"/);
  assert.match(messageResourceList, /preview: \[\{ src: string; alt: string; kind: 'image' \| 'video'; sourceKey: string \}\];/);
  assert.match(messageResourceList, /function mediaPreviewSourceKey\(item: ChatResourceItem\): string \{/);
  assert.match(messageResourceList, /sourceKey: mediaPreviewSourceKey\(item\)/);
  assert.match(messageBubble, /function handleMediaPreviewOpenChange\(nextOpen: boolean\): void \{/);
  assert.match(messageBubble, /if \(!nextOpen\) \{\s*closeMediaPreview\(\);\s*\}/);
  assert.match(messageBubble, /let mediaPreviewKeydownBound = false;/);
  assert.match(messageBubble, /function bindMediaPreviewKeydown\(\): void \{/);
  assert.match(messageBubble, /function unbindMediaPreviewKeydown\(\): void \{/);
  assert.match(messageBubble, /watch\(mediaPreview, \(value\) => \{[\s\S]*if \(value\) \{[\s\S]*bindMediaPreviewKeydown\(\);/);
  assert.match(messageBubble, /unbindMediaPreviewKeydown\(\);/);
  assert.doesNotMatch(mountedBlock, /window\.addEventListener\('keydown', handleWindowKeydown\)/);
});

test('message media preview content is layered above its mask', () => {
  assert.match(messageBubbleCss, /\.chat-image-preview-mask\s*\{[\s\S]*z-index:\s*1200;/);
  assert.match(messageBubbleCss, /\.chat-image-preview-dialog\s*\{[\s\S]*position:\s*fixed;/);
  assert.match(messageBubbleCss, /\.chat-image-preview-dialog\s*\{[\s\S]*z-index:\s*1201;/);
  assert.doesNotMatch(messageBubbleCss, /:global|:deep/);
});
