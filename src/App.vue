<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { RouterView } from 'vue-router'
import { supabase } from './lib/supabase.js'
import { ensureUserSettings } from './services/menstruationNotifications.js'

const router = useRouter()
const IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

let activityInterval = null
let authSubscription = null
let lastWrite = 0

const updateActivity = () => {
  const now = Date.now()
  if (now - lastWrite > 5000) {
    // Throttle writes to localStorage (max every 5 seconds)
    localStorage.setItem('betterme_last_activity', now.toString())
    lastWrite = now
  }
}

const checkIdleTime = async () => {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return // User is not logged in

    const lastActivity = localStorage.getItem('betterme_last_activity')
    if (lastActivity) {
      const elapsed = Date.now() - parseInt(lastActivity, 10)
      if (elapsed > IDLE_TIMEOUT_MS) {
        // Sign out due to inactivity
        await supabase.auth.signOut()
        localStorage.removeItem('betterme_last_activity')
        router.push('/')
      }
    } else {
      // Initialize if not present
      localStorage.setItem('betterme_last_activity', Date.now().toString())
    }
  } catch (error) {
    console.error('Error during idle check:', error)
  }
}

onMounted(async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (session?.user?.id) {
    try {
      await ensureUserSettings(session.user.id)
    } catch (err) {
      console.error('Impossible de créer les réglages par défaut:', err)
    }
  }

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user?.id) {
      try {
        await ensureUserSettings(session.user.id)
      } catch (err) {
        console.error('Impossible de créer les réglages par défaut:', err)
      }
    }
  })
  authSubscription = subscription

  // Check immediately on load
  await checkIdleTime()

  // Monitor user activity
  window.addEventListener('mousemove', updateActivity)
  window.addEventListener('keydown', updateActivity)
  window.addEventListener('click', updateActivity)
  window.addEventListener('touchstart', updateActivity)
  window.addEventListener('scroll', updateActivity)

  // Periodically check inactivity (every 30 seconds)
  activityInterval = setInterval(checkIdleTime, 30000)
})

onUnmounted(() => {
  authSubscription?.unsubscribe()
  window.removeEventListener('mousemove', updateActivity)
  window.removeEventListener('keydown', updateActivity)
  window.removeEventListener('click', updateActivity)
  window.removeEventListener('touchstart', updateActivity)
  window.removeEventListener('scroll', updateActivity)
  if (activityInterval) clearInterval(activityInterval)
})
</script>

<template>
  <RouterView />
</template>

<style>
/* Any global styling resets specific to the app can go here */
</style>
