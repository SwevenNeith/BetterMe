import { ensureServiceWorker } from '../common/notifications.js'
import { mergeDeviceNotificationPrefs } from '../../constants/settings/deviceNotificationPrefs.js'

const DEVICE_SELECT_FULL =
  'id, created_at, updated_at, user_agent, device_name, notification_prefs, subscription'
const DEVICE_SELECT_NAMED =
  'id, created_at, updated_at, user_agent, device_name, subscription'
const DEVICE_SELECT_META = 'id, created_at, updated_at, user_agent, subscription'
const DEVICE_SELECT_BASIC = 'id, created_at, subscription'

const DEVICE_NAME_MAX_LENGTH = 80

function isMissingColumnError(error) {
  const msg = String(error?.message || error?.details || '').toLowerCase()
  return (
    msg.includes('user_agent') ||
    msg.includes('updated_at') ||
    msg.includes('device_name') ||
    msg.includes('notification_prefs') ||
    msg.includes('schema cache') ||
    msg.includes('does not exist') ||
    msg.includes('could not find')
  )
}

function subscriptionEndpoint(subscription) {
  if (!subscription || typeof subscription !== 'object') return ''
  return String(subscription.endpoint || '').trim()
}

function labelFromUserAgent(userAgent) {
  const ua = String(userAgent || '').trim()
  if (!ua) return null

  const isIos = /iPhone|iPad|iPod/i.test(ua)
  const isAndroid = /Android/i.test(ua)
  const isMac = /Macintosh|Mac OS X/i.test(ua)
  const isWindows = /Windows/i.test(ua)
  const isLinux = /Linux/i.test(ua) && !isAndroid

  let browser = 'Navigateur'
  if (/Edg\//i.test(ua)) browser = 'Edge'
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera'
  else if (/Firefox\//i.test(ua)) browser = 'Firefox'
  else if (/CriOS\//i.test(ua)) browser = 'Chrome'
  else if (/FxiOS\//i.test(ua)) browser = 'Firefox'
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua) && !/CriOS\//i.test(ua)) browser = 'Safari'
  else if (/Chrome\//i.test(ua)) browser = 'Chrome'

  let device = 'ordinateur'
  if (isIos) device = /iPad/i.test(ua) ? 'iPad' : 'iPhone'
  else if (isAndroid) device = 'Android'
  else if (isMac) device = 'Mac'
  else if (isWindows) device = 'Windows'
  else if (isLinux) device = 'Linux'

  return `${browser} · ${device}`
}

function labelFromEndpoint(endpoint) {
  const url = String(endpoint || '').toLowerCase()
  if (!url) return 'Appareil inconnu'
  if (url.includes('web.push.apple.com')) return 'Safari / Apple'
  if (url.includes('updates.push.services.mozilla.com') || url.includes('mozilla.com')) {
    return 'Firefox'
  }
  if (url.includes('fcm.googleapis.com') || url.includes('android.googleapis.com')) {
    return 'Chrome / Edge'
  }
  if (url.includes('notify.windows.com')) return 'Windows / Edge'
  try {
    return new URL(endpoint).hostname.replace(/^www\./, '')
  } catch {
    return 'Appareil enregistré'
  }
}

/** Libellé auto pour le navigateur courant (placeholder à l’activation). */
export function getDefaultPushDeviceLabel() {
  if (typeof navigator === 'undefined') return 'Cet appareil'
  return labelFromUserAgent(navigator.userAgent) || 'Cet appareil'
}

function formatDeviceDate(iso) {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return String(iso).slice(0, 16).replace('T', ' ')
  }
}

export function normalizeDeviceName(name) {
  return String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, DEVICE_NAME_MAX_LENGTH)
}

export function describePushDevice(row, { currentEndpoint = '' } = {}) {
  const endpoint = subscriptionEndpoint(row?.subscription)
  const autoLabel =
    labelFromUserAgent(row?.user_agent) || labelFromEndpoint(endpoint) || 'Appareil enregistré'
  const deviceName = normalizeDeviceName(row?.device_name)
  const seenAt = row?.updated_at || row?.created_at || null
  return {
    id: row.id,
    label: deviceName || autoLabel,
    autoLabel,
    deviceName: deviceName || null,
    endpoint,
    userAgent: row?.user_agent || null,
    notificationPrefs: mergeDeviceNotificationPrefs(row?.notification_prefs),
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
    seenAt,
    seenAtLabel: formatDeviceDate(seenAt),
    isCurrent: Boolean(currentEndpoint && endpoint && currentEndpoint === endpoint),
  }
}

export async function getCurrentPushEndpoint() {
  try {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return ''
    const registration = await ensureServiceWorker()
    if (!registration?.pushManager) return ''
    const subscription = await registration.pushManager.getSubscription()
    return subscriptionEndpoint(subscription?.toJSON?.() ?? subscription)
  } catch {
    return ''
  }
}

export async function listPushDevices(supabase, userId) {
  if (!supabase || !userId) return []

  const attempts = [
    DEVICE_SELECT_FULL,
    DEVICE_SELECT_NAMED,
    DEVICE_SELECT_META,
    DEVICE_SELECT_BASIC,
  ]
  let rows = null
  let error = null

  for (const select of attempts) {
    ;({ data: rows, error } = await supabase
      .from('push_subscriptions')
      .select(select)
      .eq('user_id', userId)
      .order('created_at', { ascending: false }))

    if (!error) break
    if (!isMissingColumnError(error)) break
  }

  if (error) {
    throw new Error(error.message || 'Impossible de charger les appareils.')
  }

  const currentEndpoint = await getCurrentPushEndpoint()
  return (rows ?? []).map((row) => describePushDevice(row, { currentEndpoint }))
}

export async function renamePushDevice(supabase, userId, deviceId, name) {
  if (!supabase || !userId || !deviceId) {
    throw new Error('Renommage impossible.')
  }

  const deviceName = normalizeDeviceName(name) || null
  const payload = {
    device_name: deviceName,
    updated_at: new Date().toISOString(),
  }

  let { error } = await supabase
    .from('push_subscriptions')
    .update(payload)
    .eq('id', deviceId)
    .eq('user_id', userId)

  if (error && isMissingColumnError(error)) {
    ;({ error } = await supabase
      .from('push_subscriptions')
      .update({ device_name: deviceName })
      .eq('id', deviceId)
      .eq('user_id', userId))
  }

  if (error) {
    if (isMissingColumnError(error)) {
      throw new Error(
        'La colonne device_name n’existe pas encore. Exécute le script SQL add-push-subscription-device-meta.sql.',
      )
    }
    throw new Error(error.message || 'Impossible de renommer cet appareil.')
  }

  return deviceName
}

export async function updateDeviceNotificationPrefs(supabase, userId, deviceId, prefs) {
  if (!supabase || !userId || !deviceId) {
    throw new Error('Enregistrement des préférences impossible.')
  }

  const notificationPrefs = mergeDeviceNotificationPrefs(prefs)
  const payload = {
    notification_prefs: notificationPrefs,
    updated_at: new Date().toISOString(),
  }

  let { error } = await supabase
    .from('push_subscriptions')
    .update(payload)
    .eq('id', deviceId)
    .eq('user_id', userId)

  if (error && isMissingColumnError(error) && String(error.message || '').includes('updated_at')) {
    ;({ error } = await supabase
      .from('push_subscriptions')
      .update({ notification_prefs: notificationPrefs })
      .eq('id', deviceId)
      .eq('user_id', userId))
  }

  if (error) {
    if (isMissingColumnError(error)) {
      throw new Error(
        'La colonne notification_prefs n’existe pas encore. Exécute le script SQL add-push-subscription-device-meta.sql.',
      )
    }
    throw new Error(error.message || 'Impossible d’enregistrer ces préférences.')
  }

  return notificationPrefs
}

export async function deletePushDevice(supabase, userId, deviceId, { endpoint = '' } = {}) {
  if (!supabase || !userId || !deviceId) {
    throw new Error('Suppression impossible.')
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('id', deviceId)
    .eq('user_id', userId)

  if (error) {
    throw new Error(error.message || 'Impossible de supprimer cet appareil.')
  }

  const currentEndpoint = await getCurrentPushEndpoint()
  if (endpoint && currentEndpoint && endpoint === currentEndpoint) {
    try {
      const registration = await ensureServiceWorker()
      const subscription = await registration?.pushManager?.getSubscription()
      if (subscription) await subscription.unsubscribe()
    } catch (err) {
      console.warn('Désabonnement push local:', err)
    }
  }

  return true
}
