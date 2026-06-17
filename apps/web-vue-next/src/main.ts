// main.ts
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './routes';
import { pinia } from './stores';
import { useUiStore } from './stores/ui-store';
import './style/main.css';

const app = createApp(App);
app.use(pinia);
app.use(router);
app.mount('#app');

// 应用初始主题
useUiStore().applyTheme();
