import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import StudioPanel from '@/components/studio/StudioPanel.vue';
import StudioButton from '@/components/studio/StudioButton.vue';

describe('StudioPanel', () => {
  it('按 material 属性应用对应材质 class', () => {
    const w = mount(StudioPanel, { props: { material: 'thick' } });
    expect(w.classes()).toContain('studio-panel--thick');
  });
  it('默认材质为 thin', () => {
    const w = mount(StudioPanel);
    expect(w.classes()).toContain('studio-panel--thin');
  });
});

describe('StudioButton', () => {
  it('variant=primary 应用主按钮样式', () => {
    const w = mount(StudioButton, { props: { variant: 'primary' } });
    expect(w.classes()).toContain('studio-btn--primary');
  });
  it('点击触发 click 事件', async () => {
    const w = mount(StudioButton);
    await w.trigger('click');
    expect(w.emitted('click')).toHaveLength(1);
  });
});
