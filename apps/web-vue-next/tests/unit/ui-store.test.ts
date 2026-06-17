import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useUiStore } from '@/stores/ui-store';

describe('useUiStore', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('导航默认展开，可切换折叠', () => {
    const ui = useUiStore();
    expect(ui.navCollapsed).toBe(false);
    ui.toggleNav();
    expect(ui.navCollapsed).toBe(true);
  });

  it('主题默认深色，可切换浅色', () => {
    const ui = useUiStore();
    expect(ui.theme).toBe('dark');
    ui.toggleTheme();
    expect(ui.theme).toBe('light');
  });
});
