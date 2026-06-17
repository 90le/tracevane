import { defineStore } from 'pinia';
import { ref } from 'vue';

export type Theme = 'dark' | 'light';

export const useUiStore = defineStore('ui', () => {
  const navCollapsed = ref(false);
  const theme = ref<Theme>('dark');

  function toggleNav() {
    navCollapsed.value = !navCollapsed.value;
  }

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
  }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', theme.value);
  }

  return { navCollapsed, theme, toggleNav, toggleTheme, applyTheme };
});
