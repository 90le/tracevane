<!-- features/terminal/components/CodePreview.vue
     文件内容预览 —— 编辑器区主体。read API，代码块展示 + 语言标签 + 复制。
     材质：实色编辑器底，材质退后（守则：信息密集）。 -->
<script setup lang="ts">
import { ref } from 'vue';
import { useFilesStore } from '../files-store';

const files = useFilesStore();
const copied = ref(false);

function copy() {
  if (!files.currentFile?.content) return;
  navigator.clipboard?.writeText(files.currentFile.content);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1400);
}
</script>

<template>
  <div class="preview">
    <div v-if="!files.currentFile" class="preview__empty">
      <span class="preview__empty-icon">📄</span>
      <p>从左侧资源管理器选择文件预览</p>
    </div>

    <template v-else>
      <div class="preview__head">
        <span class="preview__name">{{ files.currentFile.name }}</span>
        <span class="preview__lang">{{ files.currentFile.ext || 'text' }}</span>
        <span v-if="files.currentFile.truncated" class="preview__warn">已截断</span>
        <button class="preview__copy" :class="{ 'is-done': copied }" @click="copy">
          {{ copied ? '已复制 ✓' : '复制' }}
        </button>
      </div>

      <div v-if="files.currentFile.textLike && files.currentFile.content !== null" class="preview__code">
        <pre><code>{{ files.currentFile.content }}</code></pre>
      </div>
      <div v-else-if="files.currentFile.imageLike" class="preview__binary">
        <p>图片预览（{{ files.currentFile.mimeType }}）</p>
      </div>
      <div v-else class="preview__binary">
        <p>二进制文件，无法预览（{{ files.currentFile.mimeType || 'binary' }}）</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.preview {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--editor-bg, #0c0d0e);
}
.preview__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-quaternary);
  font-size: 13px;
}
.preview__empty-icon {
  font-size: 32px;
  opacity: 0.4;
}
.preview__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: rgba(120, 120, 128, 0.14);
  border-bottom: 0.5px solid var(--hairline);
  height: 36px;
  flex-shrink: 0;
}
.preview__name {
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview__lang {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  font-family: 'SF Mono', ui-monospace, monospace;
}
.preview__warn {
  font-size: 11px;
  color: var(--sys-orange);
}
.preview__copy {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  padding: 3px 9px;
  border-radius: 6px;
  cursor: pointer;
}
.preview__copy:hover {
  background: var(--fill);
  color: var(--text-primary);
}
.preview__copy.is-done {
  color: var(--sys-green);
}
.preview__code {
  flex: 1;
  overflow: auto;
  padding: 12px 16px;
  font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-primary);
}
.preview__code pre {
  margin: 0;
  white-space: pre;
}
.preview__binary {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: 13px;
}
</style>
