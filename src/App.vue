<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { RouterView } from 'vue-router'
import { useAppTabResume } from './composables/useAppTabResume.js'
import { supabase } from './lib/supabase.js'
import { ensureUserSettings } from './services/menstruation/menstruationNotifications.js'
import { loadSettingsBootBundle } from './services/settings/settingsBoot.js'
import {
  syncSessionUserCache,
  cacheSessionUser,
  resolveSessionUser,
} from './utils/auth/sessionUser.js'

useAppTabResume()

const router = useRouter()
const IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

let activityInterval = null
let authSubscription = null
let lastWrite = 0

const updateActivity = () => {
  const now = Date.now()
  if (now - lastWrite > 5000) {
    localStorage.setItem('betterme_last_activity', now.toString())
    lastWrite = now
  }
}

const onVisibilityActivity = () => {
  if (document.visibilityState === 'visible') updateActivity()
}

const checkIdleTime = async () => {
  try {
    const user = await resolveSessionUser()
    if (!user?.id) return

    const lastActivity = localStorage.getItem('betterme_last_activity')
    if (lastActivity) {
      const elapsed = Date.now() - parseInt(lastActivity, 10)
      if (elapsed > IDLE_TIMEOUT_MS) {
        await supabase.auth.signOut()
        localStorage.removeItem('betterme_last_activity')
        cacheSessionUser(null)
        router.push('/')
      }
    } else {
      localStorage.setItem('betterme_last_activity', Date.now().toString())
    }
  } catch (error) {
    console.error('Error during idle check:', error)
  }
}

onMounted(() => {
  void (async () => {
    try {
      const user = await resolveSessionUser()
      if (user?.id) {
        void ensureUserSettings(user.id).catch((err) => {
          console.error('Impossible de créer les réglages par défaut:', err)
        })
        // Prefetch settings groupé avant le montage des vues / widgets.
        void loadSettingsBootBundle(supabase, user.id).catch((err) => {
          console.error('settings boot prefetch:', err)
        })
      }
    } catch (err) {
      console.error('session boot:', err)
    }
  })()

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    syncSessionUserCache(event, session)
    if (event === 'SIGNED_IN' && session?.user?.id) {
      void ensureUserSettings(session.user.id).catch((err) => {
        console.error('Impossible de créer les réglages par défaut:', err)
      })
    }
  })
  authSubscription = subscription

  void checkIdleTime()

  window.addEventListener('mousemove', updateActivity)
  window.addEventListener('keydown', updateActivity)
  window.addEventListener('click', updateActivity)
  window.addEventListener('touchstart', updateActivity)
  window.addEventListener('scroll', updateActivity)
  document.addEventListener('visibilitychange', onVisibilityActivity)

  activityInterval = setInterval(checkIdleTime, 30000)
})

onUnmounted(() => {
  authSubscription?.unsubscribe()
  window.removeEventListener('mousemove', updateActivity)
  window.removeEventListener('keydown', updateActivity)
  window.removeEventListener('click', updateActivity)
  window.removeEventListener('touchstart', updateActivity)
  window.removeEventListener('scroll', updateActivity)
  document.removeEventListener('visibilitychange', onVisibilityActivity)
  if (activityInterval) clearInterval(activityInterval)
})
</script>

<template>
  <RouterView />
</template>

<style>
/* Any global styling resets specific to the app can go here */
</style>
