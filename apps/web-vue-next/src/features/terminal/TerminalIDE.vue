<!-- features/terminal/TerminalIDE.vue
     终端 IDE —— 活动栏切换视图：资源管理器 / Git。
     布局：活动栏 | 侧面板(资源/Git) | 编辑器区(文件预览) | (底部)终端面板。
     材质退后：信息极密集，实色为主，圆角收紧到 10px（守则 §1/§9）。 -->
<script setup lang="ts">
import { ref } from 'vue';
import ResourceExplorer from './components/ResourceExplorer.vue';
import GitPanel from './components/GitPanel.vue';
import SearchPanel from './components/SearchPanel.vue';
import CodePreview from './components/CodePreview.vue';
import TerminalPanel from './components/TerminalPanel.vue';
import { useFilesStore } from './files-store';
import type { FileEntrySummary } from '../../../../../types/files';

type SideView = 'explorer' | 'git' | 'search';

const sideView = ref<SideView>('explorer');
const files = useFilesStore();

async function openFile(entry: FileEntrySummary) {
  if (entry.kind !== 'file') return;
  const rootId = files.summary?.defaultRootId || 'project-root';
  await files.readFile(rootId, entry.path);
}
</script>

<template>
  <div class="ide">
    <!-- 活动栏 -->
    <nav class="ide__activity">
      <div class="ide__brand">◉</div>
      <button class="ide__act" :class="{ 'ide__act--on': sideView === 'explorer' }" title="资源管理器" @click="sideView = 'explorer'">☶</button>
      <button class="ide__act" :class="{ 'ide__act--on': sideView === 'git' }" title="源代码管理" @click="sideView = 'git'">⎇</button>
      <button class="ide__act" :class="{ 'ide__act--on': sideView === 'search' }" title="搜索" @click="sideView = 'search'">⌕</button>
      <button class="ide__act" title="会话历史" disabled>◷</button>
    </nav>

    <!-- 侧面板：资源管理器 / Git / 搜索 切换 -->
    <aside class="ide__side">
      <ResourceExplorer v-show="sideView === 'explorer'" @open-file="openFile" />
      <GitPanel v-show="sideView === 'git'" />
      <SearchPanel v-show="sideView === 'search'" />
    </aside>

    <!-- 编辑器区 + 终端面板 -->
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
  position: relative;
}
.ide__act:hover:not(:disabled) {
  background: var(--fill);
  color: var(--text-secondary);
}
.ide__act:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.ide__act--on {
  color: var(--text-primary);
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

.ide__side {
  background: var(--material-sidebar);
  backdrop-filter: var(--blur-thin);
  -webkit-backdrop-filter: var(--blur-thin);
  border: 0.5px solid var(--hairline);
  border-radius: 10px;
  box-shadow: var(--shadow-1);
  overflow: hidden;
  min-width: 0;
}

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
