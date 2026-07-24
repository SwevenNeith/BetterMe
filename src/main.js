import './assets/main.css'
import './styles/reading-dark.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')

import { ensureServiceWorker } from './services/notifications.js'

if ('serviceWorker' in navigator) {
  ensureServiceWorker().catch((err) => console.warn('Service Worker:', err))
}
