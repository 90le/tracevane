import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { setActivePinia, createPinia } from 'pinia';
import GlobalNav from '@/components/nav/GlobalNav.vue';

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/dashboard', component: { template: '<div/>' } },
      { path: '/chat', component: { template: '<div/>' } },
    ],
  });
}

describe('GlobalNav', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('渲染四个分组标题', () => {
    const w = mount(GlobalNav, { global: { plugins: [makeRouter()] } });
    expect(w.text()).toContain('总览');
    expect(w.text()).toContain('运维');
    expect(w.text()).toContain('管理');
    expect(w.text()).toContain('系统');
  });

  it('点击导航项触发路由跳转', async () => {
    const r = makeRouter();
    await r.push('/dashboard');
    const w = mount(GlobalNav, { global: { plugins: [r] } });
    await w.find('[data-nav-key="chat"]').trigger('click');
    await flushPromises();
    expect(r.currentRoute.value.path).toBe('/chat');
  });
});
