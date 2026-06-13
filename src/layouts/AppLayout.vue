<script setup>
import { onMounted, onUnmounted } from 'vue';
import { RouterView } from 'vue-router';
import AppSidebar from '../components/Sidebar.vue';
import NotificationPrompt from '../components/NotificationPrompt.vue';
import {
  declencherCronNotifications,
  notificationsActives,
} from '../services/notifications.js';

/** Secours si pg_cron Supabase indisponible — le verrou serveur évite le double envoi avec pg_cron */
const CRON_INTERVAL_MS = 60_000;
let cronIntervalId = null;

const startNotificationCron = () => {
  if (!notificationsActives() || cronIntervalId) return;
  // Pas d'appel immédiat : évite 2 déclenchements la même seconde que pg_cron au chargement
  cronIntervalId = window.setInterval(declencherCronNotifications, CRON_INTERVAL_MS);
};

const stopNotificationCron = () => {
  if (cronIntervalId) {
    clearInterval(cronIntervalId);
    cronIntervalId = null;
  }
};

onMounted(() => {
  startNotificationCron();
  window.addEventListener('betterme-notifications-granted', startNotificationCron);
});

onUnmounted(() => {
  stopNotificationCron();
  window.removeEventListener('betterme-notifications-granted', startNotificationCron);
});
</script>

<template>
  <div class="app-layout">
    <AppSidebar />
    <main class="app-content">
      <NotificationPrompt />
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  min-height: 100vh;
  width: 100%;
  background-color: #f9f6fd;
  overflow-x: hidden;
}

@media (prefers-color-scheme: dark) {
  .app-layout {
    background-color: #1a1724;
  }
}

.app-content {
  /* Offset for the sidebar width on desktop */
  margin-left: 260px;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 100vh;
  transition: margin-left 0.3s ease;
}

/* On mobile, sidebar is overlaid — no margin needed */
@media (max-width: 768px) {
  .app-content {
    margin-left: 0;
    padding-top: 0;
  }
}
</style>
