import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')

// Ajouter à la fin de ton main.js existant
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
}
