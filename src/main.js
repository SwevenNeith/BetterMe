import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')

if ('serviceWorker' in navigator) {
  const base = import.meta.env.BASE_URL || '/';
  navigator.serviceWorker.register(`${base}sw.js`);
}
