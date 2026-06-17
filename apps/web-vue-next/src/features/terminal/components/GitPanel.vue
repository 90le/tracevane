<!-- features/terminal/components/GitPanel.vue
     Git 面板 —— 源代码管理。status + stage/unstage + 分支。
     挂在活动栏 ⎇，替代资源管理器时显示。材质：thin，密集。 -->
<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useGitStore } from '../git-store';
import type { GitFileChange } from '../../../../../types/git';

const git = useGitStore();

onMounted(() => git.loadStatus());

const changes = computed(() => git.status?.changes ?? []);
const staged = computed(() => changes.value.filter((c) => c.staged));
const unstaged = computed(() => changes.value.filter((c) => !c.staged && c.kind !== 'untracked'));
const untracked = computed(() => changes.value.filter((c) => c.kind === 'untracked'));

const kindLabel: Record<string, string> = {
  added: 'A', modified: 'M', deleted: 'D', renamed: 'R', copied: 'C',
  untracked: 'U', conflicted: '!', unknown: '?',
};
const kindClass: Record<string, string> = {
  added: 'is-add', modified: 'is-mod', deleted: 'is-del', untracked: 'is-un',
  conflicted: 'is-conf', renamed: 'is-add', copied: 'is-add', unknown: 'is-un',
};

function shortPath(p: string): string {
  const parts = p.split('/');
  return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : p;
}
</script>

<template>
  <div class="git">
    <div class="git__head">
      <span class="git__title">源代码管理</span>
      <button class="git__refresh" title="刷新" @click="git.loadStatus()">↻</button>
    </div>

    <div v-if="git.errorMessage" class="git__msg git__msg--error">{{ git.errorMessage }}</div>

    <div v-else-if="!git.status?.available" class="git__msg">选中的目录不在 Git 仓库内</div>

    <div v-else-if="git.status.clean && changes.length === 0" class="git__msg">工作区干净 · 无变更</div>

    <template v-else>
      <div v-if="git.status.branch" class="git__branch">
        <span class="git__branch-icon">⎇</span>
        <span class="git__branch-name">{{ git.status.branch }}</span>
        <span v-if="git.status.ahead || git.status.behind" class="git__sync">
          ↑{{ git.status.ahead }} ↓{{ git.status.behind }}
        </span>
      </div>

      <!-- 暂存区 -->
      <div v-if="staged.length > 0" class="git__group">
        <div class="git__group-head">
          <span>暂存的更改</span>
          <span class="git__count">{{ staged.length }}</span>
        </div>
        <div v-for="c in staged" :key="c.path" class="git__row" :title="c.path">
          <span class="git__kind" :class="kindClass[c.kind]">{{ kindLabel[c.kind] }}</span>
          <span class="git__path">{{ shortPath(c.path) }}</span>
          <button class="git__act" title="取消暂存" @click="git.unstagePath(c.path)">−</button>
        </div>
      </div>

      <!-- 已修改未暂存 -->
      <div v-if="unstaged.length > 0" class="git__group">
        <div class="git__group-head">
          <span>更改</span>
          <span class="git__count">{{ unstaged.length }}</span>
        </div>
        <div v-for="c in unstaged" :key="c.path" class="git__row" :title="c.path">
          <span class="git__kind" :class="kindClass[c.kind]">{{ kindLabel[c.kind] }}</span>
          <span class="git__path">{{ shortPath(c.path) }}</span>
          <button class="git__act" title="暂存" @click="git.stagePath(c.path)">+</button>
        </div>
      </div>

      <!-- 未跟踪 -->
      <div v-if="untracked.length > 0" class="git__group">
        <div class="git__group-head">
          <span>未跟踪</span>
          <span class="git__count">{{ untracked.length }}</span>
        </div>
        <div v-for="c in untracked" :key="c.path" class="git__row" :title="c.path">
          <span class="git__kind is-un">U</span>
          <span class="git__path">{{ shortPath(c.path) }}</span>
          <button class="git__act" title="暂存" @click="git.stagePath(c.path)">+</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.git {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  font-size: 12.5px;
}
.git__head {
  display: flex;
  align-items: center;
  padding: 12px 14px 8px;
}
.git__title {
  flex: 1;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-tertiary);
}
.git__refresh {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  border-radius: 5px;
  cursor: pointer;
}
.git__refresh:hover {
  background: var(--fill);
  color: var(--text-secondary);
}
.git__msg {
  padding: 14px;
  color: var(--text-tertiary);
  font-size: 12px;
}
.git__msg--error {
  color: var(--sys-red);
}
.git__branch {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px 10px;
  color: var(--text-secondary);
  font-size: 12px;
}
.git__branch-icon {
  color: var(--text-tertiary);
}
.git__branch-name {
  font-weight: 600;
}
.git__sync {
  margin-left: auto;
  font-size: 11px;
  color: var(--sys-green);
}
.git__group {
  padding: 0 8px;
}
.git__group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 8px 4px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
}
.git__count {
  font-size: 10px;
  background: var(--fill);
  border-radius: 8px;
  padding: 0 6px;
  color: var(--text-tertiary);
}
.git__row {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 24px;
  padding: 0 8px;
  border-radius: var(--radius-control);
  cursor: default;
}
.git__row:hover {
  background: var(--fill);
}
.git__kind {
  width: 14px;
  text-align: center;
  font-family: 'SF Mono', monospace;
  font-size: 10px;
  font-weight: 700;
}
.is-add { color: var(--sys-green); }
.is-mod { color: var(--sys-orange); }
.is-del { color: var(--sys-red); }
.is-un { color: var(--text-tertiary); }
.is-conf { color: var(--sys-red); }
.git__path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
}
.git__act {
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  display: grid;
  place-items: center;
}
.git__act:hover {
  background: var(--accent);
  color: #fff;
}
</style>
