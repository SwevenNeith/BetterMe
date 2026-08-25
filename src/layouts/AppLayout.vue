<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { RouterView } from 'vue-router'
import AppSidebar from '../components/Sidebar.vue'
import NotificationPrompt from '../components/NotificationPrompt.vue'
import VisibilityOnboardingModal from '../components/VisibilityOnboardingModal.vue'
import { supabase } from '../lib/supabase.js'
import {
  declencherCronNotifications,
  notificationsActives,
} from '../services/notifications.js'
import { hasCompletedVisibilityOnboarding } from '../services/visibilityOnboarding.js'

/** Secours si pg_cron Supabase indisponible — le verrou serveur évite le double envoi avec pg_cron */
const CRON_INTERVAL_MS = 60_000
let cronIntervalId = null

const userId = ref(null)
const showVisibilityOnboarding = ref(false)

const startNotificationCron = () => {
  if (!notificationsActives() || cronIntervalId) return
  // Pas d'appel immédiat : évite 2 déclenchements la même seconde que pg_cron au chargement
  cronIntervalId = window.setInterval(declencherCronNotifications, CRON_INTERVAL_MS)
}

const stopNotificationCron = () => {
  if (cronIntervalId) {
    clearInterval(cronIntervalId)
    cronIntervalId = null
  }
}

function onVisibilityOnboardingCompleted() {
  showVisibilityOnboarding.value = false
}

onMounted(() => {
  startNotificationCron()
  window.addEventListener('betterme-notifications-granted', startNotificationCron)
  void (async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user?.id) return

      userId.value = user.id

      try {
        const completed = await hasCompletedVisibilityOnboarding(supabase, user.id)
        showVisibilityOnboarding.value = !completed
      } catch (onboardingErr) {
        console.error('visibility onboarding:', onboardingErr)
      }

      const [
        { rescheduleTodoPromesseReminder },
        { purgeStaleMenstruationNotificationsOnStartup },
        { rescheduleAllTodoItemReminders },
      ] = await Promise.all([
        import('../services/todoPromesseNotifications.js'),
        import('../services/menstruationNotificationSync.js'),
        import('../services/todoItemReminders.js'),
      ])
      await Promise.all([
        rescheduleTodoPromesseReminder(user.id),
        purgeStaleMenstruationNotificationsOnStartup(user.id),
        rescheduleAllTodoItemReminders(user.id),
      ])
    } catch (err) {
      console.error(
        'rescheduleTodoPromesseReminder / syncMenstruationNotifications / todoReminders:',
        err,
      )
    }
  })()
})

onUnmounted(() => {
  stopNotificationCron()
  window.removeEventListener('betterme-notifications-granted', startNotificationCron)
})
</script>

<template>
  <div class="app-layout" :class="{ 'app-layout--onboarding': showVisibilityOnboarding }">
    <div class="app-layout__shell" :aria-hidden="showVisibilityOnboarding ? 'true' : undefined">
      <AppSidebar />
      <main class="app-content">
        <NotificationPrompt />
        <RouterView />
      </main>
    </div>
    <VisibilityOnboardingModal
      v-if="showVisibilityOnboarding && userId"
      :user-id="userId"
      @completed="onVisibilityOnboardingCompleted"
    />
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  min-height: 100vh;
  width: 100%;
  background-color: #f9f6fd;
  overflow-x: hidden;
  position: relative;
}

.app-layout__shell {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 100vh;
  width: 100%;
  transition: filter 0.25s ease;
}

.app-layout--onboarding {
  overflow: hidden;
  height: 100vh;
  max-height: 100vh;
}

.app-layout--onboarding .app-layout__shell {
  filter: blur(10px) saturate(0.85);
  pointer-events: none;
  user-select: none;
  touch-action: none;
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

<style>
html.visibility-onboarding-open,
body.visibility-onboarding-open {
  overflow: hidden !important;
  height: 100%;
  overscroll-behavior: none;
}

@media (max-width: 768px) {
  .reading-book-page__back,
  .journal-entry-page__back,
  .spoil-reader-page__back,
  .spoil-chapter-page__back,
  .project-detail-back {
    padding-left: 2.75rem !important;
  }
}
</style>
