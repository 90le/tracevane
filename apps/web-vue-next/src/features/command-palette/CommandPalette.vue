<!-- features/command-palette/CommandPalette.vue -->
<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { allNavItems } from '@/routes/nav-manifest';

const router = useRouter();
const open = ref(false);
const query = ref('');

const results = computed(() => {
  const q = query.value.trim();
  if (!q) return allNavItems;
  return allNavItems.filter((i) => i.label.includes(q));
});

function openPalette() {
  open.value = true;
  query.value = '';
}
function close() {
  open.value = false;
}
function go(key: string) {
  const item = allNavItems.find((i) => i.key === key);
  if (item) router.push(item.to);
  close();
}
function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    openPalette();
  }
  if (e.key === 'Escape') close();
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="cmd-backdrop" @click="close">
      <div class="cmd-palette" @click.stop>
        <input v-model="query" class="cmd-input" placeholder="跳转到页面…" autofocus />
        <div class="cmd-list">
          <button v-for="item in results" :key="item.key" class="cmd-item" @click="go(item.key)">
            <span class="cmd-item__icon">{{ item.label.charAt(0) }}</span>
            {{ item.label }}
          </button>
          <div v-if="results.length === 0" class="cmd-empty">无匹配页面</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cmd-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: grid;
  place-items: start center;
  padding-top: 90px;
  z-index: 300;
}
.cmd-palette {
  width: 540px;
  max-width: 90vw;
  background: var(--material-floating);
  backdrop-filter: var(--blur-floating);
  -webkit-backdrop-filter: var(--blur-floating);
  border: 0.5px solid var(--hairline-strong);
  border-radius: 14px;
  box-shadow: var(--shadow-3);
  padding: 8px;
}
.cmd-input {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font: inherit;
  font-size: 14px;
  padding: 9px 11px;
}
.cmd-list {
  max-height: 340px;
  overflow-y: auto;
}
.cmd-item {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 9px 11px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 13px;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
}
.cmd-item:hover {
  background: var(--accent);
  color: #fff;
}
.cmd-item__icon {
  width: 20px;
  text-align: center;
}
.cmd-empty {
  padding: 16px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
}
</style>
