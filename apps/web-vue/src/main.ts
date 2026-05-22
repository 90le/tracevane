import { createApp } from 'vue';
import ui from '@nuxt/ui/vue-plugin';
import App from './App.vue';
import { router } from './router';
import { initializeLocale } from './shared/locale';
import { initializeTheme } from './shared/theme';
import './style.css';

initializeTheme();
initializeLocale();

createApp(App)
  .use(router)
  .use(ui)
  .mount('#app');
