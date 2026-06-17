import { createRouter, createWebHistory } from 'vue-router';
import PlaceholderView from '@/views/PlaceholderView.vue';
import DashboardView from '@/features/dashboard/DashboardView.vue';
import TerminalIDE from '@/features/terminal/TerminalIDE.vue';
import { allNavItems } from './nav-manifest';

const realRoutes: Record<string, typeof PlaceholderView> = {
  dashboard: DashboardView,
  terminal: TerminalIDE,
};

export const router = createRouter({
  history: createWebHistory('/'),
  routes: [
    ...allNavItems.map((item) => ({
      path: item.to,
      name: item.key,
      component: realRoutes[item.key] || PlaceholderView,
      ...(realRoutes[item.key] ? {} : { props: { title: item.label } }),
    })),
    { path: '/', redirect: '/dashboard' },
  ],
});
