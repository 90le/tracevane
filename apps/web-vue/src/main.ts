import { createApp } from 'vue';
import VueFinderPlugin from 'vuefinder';
import zhCN from 'vuefinder/dist/locales/zhCN.js';
import en from 'vuefinder/dist/locales/en.js';
import App from './App.vue';
import { router } from './router';
import { initializeLocale } from './shared/locale';
import { initializeTheme } from './shared/theme';
import './style.css';
import 'vuefinder/dist/vuefinder.css';

initializeTheme();
initializeLocale();

createApp(App)
  .use(router)
  .use(VueFinderPlugin, {
    locale: 'zhCN',
    i18n: {
      zhCN,
      en,
    },
  })
  .mount('#app');
