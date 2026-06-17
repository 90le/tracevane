import { createRouter, createWebHistory } from 'vue-router';
import PlaceholderView from '@/views/PlaceholderView.vue';
import { allNavItems } from './nav-manifest';

export const router = createRouter({
  history: createWebHistory('/'),
  routes: [
    ...allNavItems.map((item) => ({
      path: item.to,
      name: item.key,
      component: PlaceholderView,
      props: { title: item.label },
    })),
    { path: '/', redirect: '/dashboard' },
  ],
});
