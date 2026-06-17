<!-- components/nav/NavItem.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import type { NavItem } from '@/routes/nav-manifest';
import { useUiStore } from '@/stores/ui-store';

const props = defineProps<{ item: NavItem }>();
const route = useRoute();
const ui = useUiStore();
const active = computed(() => route.path === props.item.to);
</script>

<template>
  <RouterLink
    :to="item.to"
    :data-nav-key="item.key"
    :class="['nav-item', { active, collapsed: ui.navCollapsed }]"
    :data-tip="item.label"
  >
    <span class="nav-item__icon">{{ item.label.charAt(0) }}</span>
    <span v-if="!ui.navCollapsed" class="nav-item__label">{{ item.label }}</span>
    <span v-if="!ui.navCollapsed && item.badge" class="nav-item__badge">{{ item.badge }}</span>
  </RouterLink>
</template>

<style scoped>
.nav-item {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 7px 10px;
  border-radius: var(--radius-control);
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 13px;
  white-space: nowrap;
  text-decoration: none;
  transition: background 0.1s;
  position: relative;
}
.nav-item:hover {
  background: var(--fill);
  color: var(--text-primary);
}
.nav-item.active {
  background: var(--accent-soft);
  color: var(--text-primary);
  font-weight: 500;
}
.nav-item.active .nav-item__icon {
  color: var(--accent);
}
.nav-item__icon {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: var(--text-tertiary);
  font-size: 13px;
  font-weight: 600;
}
.nav-item__label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nav-item__badge {
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  background: var(--sys-orange);
  color: var(--surface-desktop);
  font-size: 9px;
  font-weight: 700;
  display: grid;
  place-items: center;
  padding: 0 4px;
}
.nav-item.collapsed {
  justify-content: center;
}
/* 折叠态 tooltip 向右弹，固定 left 不遮挡内容（守则 §6） */
.nav-item.collapsed::after {
  content: attr(data-tip);
  position: fixed;
  opacity: 0;
  pointer-events: none;
  background: var(--material-floating);
  backdrop-filter: var(--blur-floating);
  color: var(--text-primary);
  font-size: 12px;
  padding: 5px 10px;
  border-radius: 7px;
  border: 0.5px solid var(--hairline-strong);
  box-shadow: var(--shadow-3);
  white-space: nowrap;
  z-index: 200;
  left: 76px;
  transition: opacity 0.1s 0.15s;
}
.nav-item.collapsed:hover::after {
  opacity: 1;
}
</style>
