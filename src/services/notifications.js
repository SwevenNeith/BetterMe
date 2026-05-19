import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase.js'

// ============================================
// CONFIGURATION TECHNIQUE (VAPID, Edge Function)
// ============================================

const VAPID_PUBLIC_KEY =
  'BBhVBoaApvqEOSFlmunhMwXCeZXr-k2HNi8faBumTBtws8Kq8r8EnPDP2bOMZ_s_tNOpABLdCHwPRn6vIWjDouc'

const EDGE_FUNCTION_URL = `${supabaseUrl}/functions/v1/send-notification`
const APP_TIMEZONE = 'Europe/Paris'

// ============================================
// HELPERS
// ============================================

/** Composantes calendrier/heure pour un instant donné à Paris */
function getParisDateTimeParts(ms) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(ms)).map((p) => [p.type, p.value]),
  )
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  }
}

/**
 * Date YYYY-MM-DD + heure HH:mm interprétées en Europe/Paris → Date UTC.
 * Aligné sur le cron serveur (fuseau Paris).
 */
export function dateTimeParisToUtc(dateStr, timeStr) {
  const [targetYear, targetMonth, targetDay] = dateStr.split('-').map(Number)
  const [targetHour, targetMinute] = String(timeStr || '00:00')
    .slice(0, 5)
    .split(':')
    .map(Number)

  let utcMs = Date.UTC(targetYear, targetMonth - 1, targetDay, targetHour, targetMinute)

  for (let i = 0; i < 8; i++) {
    const p = getParisDateTimeParts(utcMs)
    const dayDiff =
      (targetYear - p.year) * 372 +
      (targetMonth - p.month) * 31 +
      (targetDay - p.day)
    const minuteDiff = dayDiff * 24 * 60 + (targetHour - p.hour) * 60 + (targetMinute - p.minute)
    if (minuteDiff === 0) break
    utcMs += minuteDiff * 60 * 1000
  }

  return new Date(utcMs)
}

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

/** Libellé humain pour un délai heures + minutes avant l'événement */
export function formatDelaiAvantEvenement(heures, minutes) {
  const h = Math.min(23, Math.max(0, Number(heures) || 0))
  const m = Math.min(59, Math.max(0, Number(minutes) || 0))
  if (h > 0 && m > 0) return `${h} h ${m} min`
  if (h > 0) return `${h} h`
  return `${m} min`
}

/** Décompose un délai stocké en minutes (ex. 60 → 1 h 0 min) */
export function decomposerDelaiEnMinutes(totalMinutes) {
  const total = Math.max(0, Number(totalMinutes) || 0)
  return {
    heures: Math.floor(total / 60),
    minutes: total % 60,
  }
}

/** Libellé à partir du total en minutes (ex. 60 → "1 h") */
export function formatDelaiDepuisMinutes(totalMinutes) {
  const { heures, minutes } = decomposerDelaiEnMinutes(totalMinutes)
  return formatDelaiAvantEvenement(heures, minutes)
}

/**
 * Rappel avant une activité EDT.
 * - dateStart + timeStart : heure de début en Europe/Paris
 * - minutesAvant : délai total (heures×60 + minutes) stocké dans reminder_time
 */
export async function planifierNotificationActivite(userId, activite) {
  const minutesAvant = activite.minutesAvant ?? 15
  if (minutesAvant <= 0) return false

  const heureActivite =
    activite.dateStart && activite.timeStart
      ? dateTimeParisToUtc(activite.dateStart, activite.timeStart)
      : new Date(activite.heure)

  const heureNotification = new Date(heureActivite.getTime() - minutesAvant * 60 * 1000)

  if (heureNotification.getTime() >= heureActivite.getTime()) {
    console.warn('planifierNotificationActivite: rappel après le début de l’événement, ignoré')
    return false
  }

  const delaiLabel =
    activite.delaiLabel ?? formatDelaiDepuisMinutes(minutesAvant)

  return callEdgeFunction({
    type: 'activite',
    userId,
    eventId: activite.eventId,
    title: 'BetterMe - Rappel',
    body: `Dans ${delaiLabel} : ${activite.nom}`,
    scheduledAt: heureNotification.toISOString(),
  })
}

/** Supprime les rappels planifiés non envoyés liés à un événement */
export async function supprimerRappelsEvenement(eventId) {
  const { error } = await supabase
    .from('scheduled_notifications')
    .delete()
    .eq('event_id', eventId)
    .eq('sent', false)

  if (error) {
    console.error('supprimerRappelsEvenement:', error)
  }
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
