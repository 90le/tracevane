<!-- components/nav/GlobalNav.vue -->
<script setup lang="ts">
import { useUiStore } from '@/stores/ui-store';
import { navGroups } from '@/routes/nav-manifest';
import NavItem from './NavItem.vue';

const ui = useUiStore();
</script>

<template>
  <nav :class="['global-nav', { collapsed: ui.navCollapsed }]">
    <div class="global-nav__top">
      <div class="global-nav__brand">◉</div>
      <span v-if="!ui.navCollapsed" class="global-nav__brandname">OpenClaw Studio</span>
      <button
        class="global-nav__collapse"
        :title="ui.navCollapsed ? '展开' : '收起'"
        @click="ui.toggleNav()"
      >«</button>
    </div>

    <div class="global-nav__list">
      <div v-for="group in navGroups" :key="group.key" class="global-nav__group">
        <div v-if="!ui.navCollapsed" class="global-nav__gtitle">{{ group.title }}</div>
        <div v-else class="global-nav__gsep"></div>
        <NavItem v-for="item in group.items" :key="item.key" :item="item" />
      </div>
    </div>
  </nav>
</template>

<style scoped>
.global-nav {
  background: var(--material-sidebar);
  backdrop-filter: var(--blur-thin);
  -webkit-backdrop-filter: var(--blur-thin);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-1);
  border: 0.5px solid var(--hairline);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
  width: 240px;
  transition: width 0.24s cubic-bezier(0.4, 0, 0.2, 1);
}
.global-nav.collapsed {
  width: 56px;
}
.global-nav__top {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
}
.global-nav__brand {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--sys-blue), var(--sys-teal));
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
}
.global-nav__brandname {
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}
.global-nav__collapse {
  margin-left: auto;
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  border-radius: 6px;
  cursor: pointer;
  flex-shrink: 0;
}
.global-nav__collapse:hover {
  background: var(--fill);
}
.global-nav__list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 8px 12px;
}
.global-nav__group {
  margin-top: 6px;
}
.global-nav__gtitle {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-quaternary);
  letter-spacing: 0.05em;
  padding: 8px 10px 4px;
  white-space: nowrap;
}
.global-nav__gsep {
  height: 0.5px;
  background: var(--hairline);
  margin: 8px 14px;
}
</style>
