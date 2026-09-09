<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { RouterView } from 'vue-router'
import AppSidebar from '../components/Sidebar.vue'
import NotificationPrompt from '../components/NotificationPrompt.vue'
import VisibilityOnboardingModal from '../components/VisibilityOnboardingModal.vue'
import TodoSnoozePromptModal from '../components/TodoSnoozePromptModal.vue'
import { supabase } from '../lib/supabase.js'
import {
  declencherCronNotifications,
  notificationsActives,
} from '../services/notifications.js'
import { hasCompletedVisibilityOnboarding } from '../services/visibilityOnboarding.js'
import {
  applyMorningSnoozeSelection,
  dismissMorningSnoozeCandidates,
  loadPromesseLimitsForSnooze,
  markMorningSnoozePromptShown,
  prepareMorningSnoozePrompt,
} from '../services/todoSnooze.js'
import { getLocalTodayISO } from '../services/scheduledReminders.js'

/** Secours si pg_cron Supabase indisponible — le verrou serveur évite le double envoi avec pg_cron */
const CRON_INTERVAL_MS = 60_000
let cronIntervalId = null

const userId = ref(null)
const showVisibilityOnboarding = ref(false)
const morningSnoozeOpen = ref(false)
const morningSnoozeCandidates = ref([])
const morningSnoozeSaving = ref(false)
const morningSnoozeError = ref('')

const startNotificationCron = () => {
  if (!notificationsActives() || cronIntervalId) return
  // Un seul intervalle (pas d’appel immédiat en parallèle → évite doublons)
  cronIntervalId = window.setInterval(declencherCronNotifications, CRON_INTERVAL_MS)
}

const stopNotificationCron = () => {
  if (cronIntervalId) {
    clearInterval(cronIntervalId)
    cronIntervalId = null
  }
}

function notifyTodosChanged() {
  window.dispatchEvent(new CustomEvent('betterme-todos-changed'))
}

async function maybeShowMorningSnoozePrompt() {
  if (!userId.value || showVisibilityOnboarding.value || morningSnoozeOpen.value) return

  try {
    const { shouldShow, candidates } = await prepareMorningSnoozePrompt(
      supabase,
      userId.value,
    )
    if (!shouldShow) return
    morningSnoozeCandidates.value = candidates
    morningSnoozeError.value = ''
    morningSnoozeOpen.value = true
  } catch (err) {
    console.error('morning snooze prompt:', err)
  }
}

function onVisibilityOnboardingCompleted() {
  showVisibilityOnboarding.value = false
  void maybeShowMorningSnoozePrompt()
}

async function onMorningSnoozeConfirm(selected) {
  if (!userId.value || morningSnoozeSaving.value) return
  morningSnoozeSaving.value = true
  morningSnoozeError.value = ''
  try {
    const limits = await loadPromesseLimitsForSnooze(supabase, userId.value)
    const allCandidates = morningSnoozeCandidates.value
    const result = await applyMorningSnoozeSelection(
      supabase,
      userId.value,
      selected,
      allCandidates,
      limits,
    )
    await markMorningSnoozePromptShown(supabase, userId.value, getLocalTodayISO())
    morningSnoozeOpen.value = false
    morningSnoozeCandidates.value = []
    notifyTodosChanged()
    if (result.errors.length) {
      morningSnoozeError.value = result.errors
        .map((entry) => `${entry.item?.nom || 'Tâche'} : ${entry.message}`)
        .join(' · ')
    }
  } catch (err) {
    console.error(err)
    morningSnoozeError.value = err.message || 'Impossible de reporter la sélection.'
  } finally {
    morningSnoozeSaving.value = false
  }
}

async function onMorningSnoozeSkip() {
  // Ignorer = ne rien reporter ; mémorise les candidats pour ne plus les reproposer.
  if (userId.value) {
    await dismissMorningSnoozeCandidates(
      supabase,
      userId.value,
      morningSnoozeCandidates.value,
    )
    await markMorningSnoozePromptShown(supabase, userId.value, getLocalTodayISO())
  }
  morningSnoozeOpen.value = false
  morningSnoozeCandidates.value = []
  morningSnoozeError.value = ''
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
        { purgeStaleMenstruationNotificationsOnStartup },
        { realignAllDeviceLocalNotifications },
      ] = await Promise.all([
        import('../services/menstruationNotificationSync.js'),
        import('../services/notificationRealign.js'),
      ])
      await realignAllDeviceLocalNotifications(supabase, user.id)
      await purgeStaleMenstruationNotificationsOnStartup(user.id)

      if (!showVisibilityOnboarding.value) {
        await maybeShowMorningSnoozePrompt()
      }
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
    <TodoSnoozePromptModal
      :open="morningSnoozeOpen"
      :candidates="morningSnoozeCandidates"
      :saving="morningSnoozeSaving"
      @confirm="onMorningSnoozeConfirm"
      @skip="onMorningSnoozeSkip"
    />
    <p
      v-if="morningSnoozeError"
      class="app-layout__snooze-error"
      role="alert"
    >
      {{ morningSnoozeError }}
    </p>
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

.app-layout__snooze-error {
  position: fixed;
  z-index: 110;
  left: 50%;
  bottom: 1.25rem;
  transform: translateX(-50%);
  margin: 0;
  max-width: min(420px, calc(100vw - 2rem));
  padding: 0.65rem 0.9rem;
  border-radius: 10px;
  background: #fff5f5;
  color: #9b2c2c;
  border: 1px solid rgba(197, 48, 48, 0.25);
  font-size: 0.85rem;
  font-weight: 600;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
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
