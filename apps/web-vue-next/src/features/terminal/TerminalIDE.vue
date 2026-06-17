<!-- features/terminal/TerminalIDE.vue
     终端 IDE —— MVP 骨架。五区布局：
     活动栏 | 资源管理器 | 编辑器区(文件预览) | (底部)终端面板
     材质退后：信息极密集，实色为主，圆角收紧到 10px（守则 §1/§9）。 -->
<script setup lang="ts">
import { ref } from 'vue';
import ResourceExplorer from './components/ResourceExplorer.vue';
import CodePreview from './components/CodePreview.vue';
import TerminalPanel from './components/TerminalPanel.vue';
import { useFilesStore } from './files-store';
import type { FileEntrySummary } from '../../../../../types/files';

const files = useFilesStore();
const openedFile = ref<FileEntrySummary | null>(null);

async function openFile(entry: FileEntrySummary) {
  if (entry.kind !== 'file') return;
  openedFile.value = entry;
  const rootId = files.summary?.defaultRootId || '';
  if (rootId) await files.readFile(rootId, entry.path);
}
</script>

<template>
  <div class="ide">
    <!-- 活动栏 -->
    <nav class="ide__activity">
      <div class="ide__brand">◉</div>
      <button class="ide__act ide__act--on" title="资源管理器">☶</button>
      <button class="ide__act" title="搜索">⌕</button>
      <button class="ide__act" title="源代码管理">⎇</button>
      <button class="ide__act" title="会话历史">◷</button>
    </nav>

    <!-- 资源管理器 -->
    <aside class="ide__explorer">
      <ResourceExplorer @open-file="openFile" />
    </aside>

    <!-- 编辑器区 + 终端面板（纵向分割） -->
    <main class="ide__main">
      <section class="ide__editor">
        <CodePreview />
      </section>
      <section class="ide__terminal">
        <TerminalPanel />
      </section>
    </main>
  </div>
</template>

<style scoped>
.ide {
  display: grid;
  grid-template-columns: 48px 236px 1fr;
  height: 100%;
  gap: 8px;
  padding: 8px;
  overflow: hidden;
}

/* 活动栏 */
.ide__activity {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 10px 0;
  background: var(--material-sidebar);
  backdrop-filter: var(--blur-thin);
  -webkit-backdrop-filter: var(--blur-thin);
  border: 0.5px solid var(--hairline);
  border-radius: 10px;
  box-shadow: var(--shadow-1);
}
.ide__brand {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--sys-blue), var(--sys-teal));
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 6px;
}
.ide__act {
  width: 38px;
  height: 38px;
  border-radius: var(--radius-control);
  display: grid;
  place-items: center;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 15px;
  cursor: pointer;
}
.ide__act:hover {
  background: var(--fill);
  color: var(--text-secondary);
}
.ide__act--on {
  color: var(--text-primary);
  position: relative;
}
.ide__act--on::before {
  content: '';
  position: absolute;
  left: -10px;
  top: 7px;
  bottom: 7px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--accent);
}

/* 资源管理器 */
.ide__explorer {
  background: var(--material-sidebar);
  backdrop-filter: var(--blur-thin);
  -webkit-backdrop-filter: var(--blur-thin);
  border: 0.5px solid var(--hairline);
  border-radius: 10px;
  box-shadow: var(--shadow-1);
  overflow: hidden;
  min-width: 0;
}

/* 主区：编辑器(上) + 终端(下) */
.ide__main {
  display: grid;
  grid-template-rows: 1fr 220px;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
}
.ide__editor {
  background: var(--material-thick);
  border: 0.5px solid var(--hairline);
  border-radius: 10px;
  box-shadow: var(--shadow-1);
  overflow: hidden;
  min-height: 0;
}
.ide__terminal {
  background: #08090a;
  border: 0.5px solid var(--hairline);
  border-radius: 10px;
  box-shadow: var(--shadow-1);
  overflow: hidden;
  min-height: 0;
}
</style>
