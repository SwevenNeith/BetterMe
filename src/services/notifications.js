import { supabaseUrl, supabaseAnonKey } from '../lib/supabase.js'

// ============================================
// CONFIGURATION TECHNIQUE (VAPID, Edge Function)
// ============================================

const VAPID_PUBLIC_KEY =
  'BBhVBoaApvqEOSFlmunhMwXCeZXr-k2HNi8faBumTBtws8Kq8r8EnPDP2bOMZ_s_tNOpABLdCHwPRn6vIWjDouc'

const EDGE_FUNCTION_URL = `${supabaseUrl}/functions/v1/send-notification`

// ============================================
// HELPERS
// ============================================

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

async function callEdgeFunction(payload) {
  try {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      console.error('Edge Function send-notification:', response.status, text)
      return false
    }

    return true
  } catch (err) {
    console.error('Edge Function send-notification:', err)
    return false
  }
}

export async function getAuthUserId(supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

export function notificationsSupportees() {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

export function notificationsActives() {
  return notificationsSupportees() && Notification.permission === 'granted'
}

export async function ensureServiceWorker() {
  if (!('serviceWorker' in navigator)) return null

  const base = import.meta.env.BASE_URL || '/'
  const swUrl = `${base}sw.js`

  const existing = await navigator.serviceWorker.getRegistration()
  if (!existing) {
    await navigator.serviceWorker.register(swUrl, { scope: base })
  }

  return navigator.serviceWorker.ready
}

export async function obtenirEtatNotifications() {
  if (!notificationsSupportees()) {
    return { supported: false, permission: 'unsupported', showPrompt: false }
  }

  const permission = Notification.permission

  return {
    supported: true,
    permission,
    showPrompt: permission === 'default',
    showDeniedHelp: permission === 'denied',
  }
}

// ============================================
// ABONNEMENT PUSH (permission navigateur)
// ============================================

async function enregistrerSubscription(supabase, userId) {
  try {
    const registration = await ensureServiceWorker()
    if (!registration) return false

    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }

    const subscriptionJson = subscription.toJSON()
    const endpoint = subscriptionJson.endpoint
    if (!endpoint) return false

    const { data: rows, error: selectError } = await supabase
      .from('push_subscriptions')
      .select('id, subscription')
      .eq('user_id', userId)

    if (selectError) {
      console.error('Lecture push_subscriptions:', selectError.message)
      return false
    }

    const existing = (rows ?? []).find((row) => row.subscription?.endpoint === endpoint)

    if (existing) {
      const { error } = await supabase
        .from('push_subscriptions')
        .update({ subscription: subscriptionJson })
        .eq('id', existing.id)
      if (error) {
        console.error('Mise à jour subscription:', error)
        return false
      }
    } else {
      const { error } = await supabase.from('push_subscriptions').insert({
        user_id: userId,
        subscription: subscriptionJson,
      })
      if (error) {
        console.error('Sauvegarde subscription:', error)
        return false
      }
    }

    return true
  } catch (err) {
    console.error('enregistrerSubscription:', err)
    return false
  }
}

/** Sync abonnement si la permission est déjà accordée (sans popup). */
export async function synchroniserNotificationsAccordees(supabase) {
  if (Notification.permission !== 'granted') {
    return { success: false, reason: 'not_granted' }
  }

  const userId = await getAuthUserId(supabase)
  if (!userId) return { success: false, reason: 'no_user' }

  const ok = await enregistrerSubscription(supabase, userId)
  return { success: ok }
}

/** Popup navigateur + enregistrement abonnement (clic utilisateur requis). */
export async function activerNotificationsUtilisateur(supabase) {
  if (!notificationsSupportees()) {
    return { success: false, reason: 'unsupported' }
  }

  await ensureServiceWorker()

  const userId = await getAuthUserId(supabase)
  if (!userId) return { success: false, reason: 'no_user' }

  const permission = await Notification.requestPermission()

  if (permission === 'denied') {
    return { success: false, reason: 'denied' }
  }

  if (permission !== 'granted') {
    return { success: false, reason: 'pending' }
  }

  const ok = await enregistrerSubscription(supabase, userId)
  if (!ok) {
    return { success: false, reason: 'subscription_failed' }
  }

  window.dispatchEvent(new CustomEvent('betterme-notifications-granted'))
  return { success: true }
}

// ============================================
// APPELS MÉTIER → Edge Function (depuis les vues)
// ============================================

/** Envoi immédiat à l'utilisateur connecté */
export async function envoyerNotificationManuelle(userId, title, body) {
  return callEdgeFunction({
    type: 'manuel',
    userId,
    title,
    body,
  })
}

/** Rappel X minutes avant une activité EDT */
export async function planifierNotificationActivite(userId, activite, minutesAvant = 15) {
  const heureActivite = new Date(activite.heure)
  const heureNotification = new Date(heureActivite.getTime() - minutesAvant * 60 * 1000)

  return callEdgeFunction({
    type: 'activite',
    userId,
    title: 'BetterMe - Rappel',
    body: `Dans ${minutesAvant} minutes : ${activite.nom}`,
    scheduledAt: heureNotification.toISOString(),
  })
}

/** Timer : notification à la fin */
export async function lancerTimer(userId, dureeEnMinutes, label) {
  const maintenant = new Date()
  const heureFin = new Date(maintenant.getTime() + dureeEnMinutes * 60 * 1000)
  const base = import.meta.env.BASE_URL || '/'

  if (document.visibilityState === 'visible') {
    setTimeout(
      () => {
        new Notification(`⏱️ ${label}`, {
          body: 'Le timer est terminé !',
          icon: `${base}icon-192.png`,
        })
      },
      dureeEnMinutes * 60 * 1000,
    )
  }

  return callEdgeFunction({
    type: 'timer',
    userId,
    title: `⏱️ ${label}`,
    body: 'Le timer est terminé !',
    scheduledAt: heureFin.toISOString(),
  })
}

/** Déclenche l'envoi des rappels dus (quotidiens + planifiés). À appeler chaque minute (cron serveur ou app ouverte). */
export async function declencherCronNotifications() {
  return callEdgeFunction({ type: 'cron' })
}

/** Notification push immédiate sur cet appareil / compte */
export async function testerNotificationPush(userId, title = 'BetterMe', body = 'Notification Test') {
  return callEdgeFunction({
    type: 'manuel',
    userId,
    title,
    body,
  })
}

/** @deprecated Préférer saveDailyReminders (dailyReminders.js) depuis Réglages */
export async function activerRappelQuotidien(
  userId,
  heureRappel,
  { title = 'BetterMe', body = "C'est l'heure d'écrire dans ton journal 📓" } = {},
) {
  return callEdgeFunction({
    type: 'quotidien',
    userId,
    title,
    body,
    heureRappel,
  })
}
