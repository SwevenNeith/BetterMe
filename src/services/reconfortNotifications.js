import { listReconfortMessages, markReconfortMessageSent } from './reconfortMessages.js'
import { envoyerNotificationManuelle } from './notifications.js'
import { addDaysToISODate, daysBetweenISO } from './menstruationCycles.js'
import {
  SCHEDULED_KIND,
  dateTimeLocalToDate,
  getLocalTodayISO,
} from './scheduledReminders.js'

export const MAX_RECONFORT_NOTIFICATIONS_PER_DAY = 1
/** Évite de renvoyer un message déjà utilisé sur les N derniers jours (si d'autres existent). */
export const RECENT_RECONFORT_LOOKBACK_DAYS = 7

const RECONFORT_WINDOW_START = '09:00'
const RECONFORT_WINDOW_END = '23:30'
const APP_TIMEZONE = 'Europe/Paris'

function normalizeReconfortText(value) {
  return (value || '').trim().replace(/\s+/g, ' ')
}

function localDateParisFromIso(iso) {
  if (!iso) return null
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(new Date(iso))
}

function getDayBoundsIso(dateISO) {
  return {
    dayStart: dateTimeLocalToDate(dateISO, '00:00').toISOString(),
    dayEnd: dateTimeLocalToDate(dateISO, '23:59').toISOString(),
  }
}

/**
 * Associe une notification envoyée au message réconfort correspondant.
 * @param {Array<{ id: string, qui: string, message: string }>} messages
 * @param {string} title
 * @param {string} body
 */
export function findReconfortMessageForNotification(messages, title, body) {
  const normTitle = normalizeReconfortText(title)
  const normBody = normalizeReconfortText(body)
  if (!normTitle || !normBody) return null

  return (
    messages.find(
      (message) =>
        normalizeReconfortText(message.qui) === normTitle &&
        normalizeReconfortText(message.message) === normBody,
    ) ?? null
  )
}

/**
 * Met à jour last_sent depuis les notifications réconfort déjà envoyées (secours si le cron edge ne l'a pas fait).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function syncReconfortLastSentFromSentNotifications(supabase, userId) {
  if (!userId) return

  const messages = await listReconfortMessages(supabase, userId)

  let notifResult = await supabase
    .from('scheduled_notifications')
    .select('title, body, scheduled_at, reconfort_id')
    .eq('user_id', userId)
    .eq('kind', SCHEDULED_KIND.RECONFORT)
    .eq('sent', true)

  if (notifResult.error && String(notifResult.error.message || '').includes('reconfort_id')) {
    notifResult = await supabase
      .from('scheduled_notifications')
      .select('title, body, scheduled_at')
      .eq('user_id', userId)
      .eq('kind', SCHEDULED_KIND.RECONFORT)
      .eq('sent', true)
  }

  if (notifResult.error) throw notifResult.error
  if (!messages.length || !notifResult.data?.length) return

  /** @type {Map<string, string>} messageId → date ISO la plus récente */
  const latestSentByMessageId = new Map()

  for (const row of notifResult.data) {
    const sentDate = localDateParisFromIso(row.scheduled_at)
    if (!sentDate) continue

    let messageId = row.reconfort_id ?? null
    if (!messageId) {
      messageId = findReconfortMessageForNotification(messages, row.title, row.body)?.id ?? null
    }
    if (!messageId) continue

    const prev = latestSentByMessageId.get(messageId)
    if (!prev || sentDate > prev) {
      latestSentByMessageId.set(messageId, sentDate)
    }
  }

  for (const [messageId, sentDate] of latestSentByMessageId) {
    const current = messages.find((message) => message.id === messageId)
    if (current?.last_sent && current.last_sent >= sentDate) continue
    await markReconfortMessageSent(supabase, userId, { messageId, sentDateISO: sentDate })
  }
}

/**
 * @param {Array<{ id: string }>} messages
 */
export function pickOneRandomReconfortMessage(messages) {
  if (!messages.length) return null
  return messages[Math.floor(Math.random() * messages.length)]
}

function toRecentIdSet(recentIds) {
  if (recentIds instanceof Set) return recentIds
  return new Set(recentIds ?? [])
}

function preferFreshReconfortPool(messages, recentIds) {
  const recent = toRecentIdSet(recentIds)
  const fresh = messages.filter((message) => !recent.has(message.id))
  return fresh.length ? fresh : messages
}

/**
 * @param {Array<{ id: string }>} messages
 * @param {Set<string>|string[]} [recentIds]
 */
export function pickOneRandomReconfortMessageAvoidingRecent(messages, recentIds) {
  if (!messages.length) return null
  return pickOneRandomReconfortMessage(preferFreshReconfortPool(messages, recentIds))
}

/**
 * @param {Array<{ id: string }>} messages
 * @param {number} count
 */
export function pickRandomDistinctReconfortMessages(messages, count) {
  if (!messages.length || count <= 0) return []
  const shuffled = [...messages].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, shuffled.length))
}

/**
 * @param {Array<{ id: string }>} messages
 * @param {number} count
 * @param {Set<string>|string[]} [recentIds]
 */
export function pickRandomDistinctReconfortMessagesAvoidingRecent(messages, count, recentIds) {
  if (!messages.length || count <= 0) return []
  return pickRandomDistinctReconfortMessages(
    preferFreshReconfortPool(messages, recentIds),
    count,
  )
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} dateISO
 */
export async function listReconfortNotificationsForDay(supabase, userId, dateISO) {
  const { dayStart, dayEnd } = getDayBoundsIso(dateISO)

  const { data, error } = await supabase
    .from('scheduled_notifications')
    .select('id, title, body, scheduled_at, sent')
    .eq('user_id', userId)
    .eq('kind', SCHEDULED_KIND.RECONFORT)
    .gte('scheduled_at', dayStart)
    .lte('scheduled_at', dayEnd)

  if (error) throw error
  return data ?? []
}

/**
 * Notifications réconfort déjà envoyées sur les N derniers jours calendaires (aujourd'hui inclus).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} dateISO
 * @param {number} [lookbackDays]
 */
export async function listRecentSentReconfortNotifications(
  supabase,
  userId,
  dateISO,
  lookbackDays = RECENT_RECONFORT_LOOKBACK_DAYS,
) {
  const days = Math.max(1, lookbackDays)
  const rangeStartISO = addDaysToISODate(dateISO, -(days - 1))
  const { dayStart } = getDayBoundsIso(rangeStartISO)
  const { dayEnd } = getDayBoundsIso(dateISO)

  const { data, error } = await supabase
    .from('scheduled_notifications')
    .select('id, title, body, scheduled_at, sent')
    .eq('user_id', userId)
    .eq('kind', SCHEDULED_KIND.RECONFORT)
    .eq('sent', true)
    .gte('scheduled_at', dayStart)
    .lte('scheduled_at', dayEnd)

  if (error) throw error
  return data ?? []
}

/**
 * Identifie les messages déjà planifiés ou envoyés aujourd'hui.
 * @param {Array<{ id: string, qui: string, message: string }>} messages
 * @param {Array<{ title: string, body: string|null }>} notifications
 */
export function getUsedReconfortMessageIds(messages, notifications) {
  const used = new Set()

  for (const row of notifications) {
    const match = messages.find(
      (message) => message.qui === row.title && message.message === (row.body || '').trim(),
    )
    if (match?.id) {
      used.add(match.id)
    }
  }

  return used
}

/**
 * Message envoyé il y a moins de N jours calendaires (last_sent sur la table reconfort).
 * @param {{ id: string, last_sent?: string|null }} message
 * @param {string} todayISO
 * @param {number} [lookbackDays]
 */
export function isReconfortMessageRecentlySent(
  message,
  todayISO,
  lookbackDays = RECENT_RECONFORT_LOOKBACK_DAYS,
) {
  if (!message?.last_sent || !todayISO) return false
  const days = daysBetweenISO(message.last_sent, todayISO)
  return days != null && days < lookbackDays
}

/**
 * IDs des messages envoyés il y a moins de N jours (via colonne last_sent).
 * @param {Array<{ id: string, last_sent?: string|null }>} messages
 * @param {string} todayISO
 * @param {number} [lookbackDays]
 */
export function getRecentlySentReconfortMessageIds(
  messages,
  todayISO,
  lookbackDays = RECENT_RECONFORT_LOOKBACK_DAYS,
) {
  const ids = new Set()
  for (const message of messages) {
    if (isReconfortMessageRecentlySent(message, todayISO, lookbackDays)) {
      ids.add(message.id)
    }
  }
  return ids
}

/**
 * Message envoyé le plus récemment parmi ceux encore dans la fenêtre de rotation.
 * @param {Array<{ id: string, last_sent?: string|null }>} messages
 * @param {string} todayISO
 * @param {number} [lookbackDays]
 */
export function getMostRecentlySentReconfortMessageIdFromLastSent(
  messages,
  todayISO,
  lookbackDays = RECENT_RECONFORT_LOOKBACK_DAYS,
) {
  let bestId = null
  let bestDate = null

  for (const message of messages) {
    if (!isReconfortMessageRecentlySent(message, todayISO, lookbackDays)) continue
    if (!bestDate || message.last_sent > bestDate) {
      bestDate = message.last_sent
      bestId = message.id
    }
  }

  return bestId
}

function pickFromPoolAvoidingRecent(
  messages,
  usedTodayIds,
  recentMessageIds,
  lastSentMessageId,
  count = 1,
  { allowRepeatIfOnlyOption = true } = {},
) {
  if (!messages.length || count <= 0) return []

  const usedToday = toRecentIdSet(usedTodayIds)
  const recent = toRecentIdSet(recentMessageIds)

  const available = messages.filter((message) => !usedToday.has(message.id))
  if (!available.length) return []

  const fresh = available.filter((message) => !recent.has(message.id))
  if (fresh.length) {
    return pickRandomDistinctReconfortMessages(fresh, Math.min(count, fresh.length))
  }

  const notLastSent = available.filter((message) => message.id !== lastSentMessageId)
  if (notLastSent.length) {
    return pickRandomDistinctReconfortMessages(
      notLastSent,
      Math.min(count, notLastSent.length),
    )
  }

  if (!allowRepeatIfOnlyOption) return []

  return pickRandomDistinctReconfortMessages(
    available,
    Math.min(count, available.length),
  )
}

/**
 * Choisit les messages à planifier : tirage aléatoire en évitant les messages envoyés récemment.
 * @param {{
 *   messages: Array<{ id: string, qui: string, message: string }>,
 *   usedTodayIds: Set<string>,
 *   recentMessageIds: Set<string>,
 *   lastSentMessageId: string|null,
 *   slotsLeft: number,
 * }} params
 */
export function pickReconfortMessagesForScheduling({
  messages,
  usedTodayIds,
  recentMessageIds,
  lastSentMessageId,
  slotsLeft,
}) {
  if (slotsLeft <= 0 || !messages.length) return []

  return pickFromPoolAvoidingRecent(
    messages,
    usedTodayIds,
    recentMessageIds,
    lastSentMessageId,
    slotsLeft,
    { allowRepeatIfOnlyOption: true },
  )
}

/**
 * Instants aléatoires répartis entre 9h00 et 23h30 (heure locale), pas avant maintenant.
 * @param {string} dateISO
 * @param {number} count
 * @returns {Date[]}
 */
export function pickRandomReconfortScheduleDates(dateISO = getLocalTodayISO(), count = 1) {
  if (count <= 0) return []

  const nowMs = Date.now()
  const windowStartMs = dateTimeLocalToDate(dateISO, RECONFORT_WINDOW_START).getTime()
  const windowEndMs = dateTimeLocalToDate(dateISO, RECONFORT_WINDOW_END).getTime()
  const minMs = Math.max(nowMs, windowStartMs)

  if (minMs >= windowEndMs) return []

  const span = windowEndMs - minMs
  const slice = span / count
  const dates = []

  for (let i = 0; i < count; i++) {
    const sliceStart = minMs + i * slice
    const sliceEnd = i === count - 1 ? windowEndMs : minMs + (i + 1) * slice
    if (sliceEnd <= sliceStart) continue
    const randomMs = sliceStart + Math.floor(Math.random() * (sliceEnd - sliceStart))
    dates.push(new Date(randomMs))
  }

  dates.sort((a, b) => a.getTime() - b.getTime())
  return dates
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} dateISO
 */
export async function deletePendingReconfortForDay(supabase, userId, dateISO) {
  const { dayStart, dayEnd } = getDayBoundsIso(dateISO)

  const { error } = await supabase
    .from('scheduled_notifications')
    .delete()
    .eq('user_id', userId)
    .eq('kind', SCHEDULED_KIND.RECONFORT)
    .eq('sent', false)
    .gte('scheduled_at', dayStart)
    .lte('scheduled_at', dayEnd)

  if (error) throw error
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ title: string, body: string, scheduledAt: Date, reconfortId?: string }} payload
 */
export async function scheduleReconfortNotification(supabase, userId, payload) {
  const title = (payload.title || '').trim()
  const body = (payload.body || '').trim()
  if (!title || !body || !payload.scheduledAt) {
    throw new Error('Données de notification réconfort invalides.')
  }

  const scheduledAtIso = payload.scheduledAt.toISOString()

  const row = {
    user_id: userId,
    event_id: null,
    kind: SCHEDULED_KIND.RECONFORT,
    title,
    body,
    scheduled_at: scheduledAtIso,
    sent: false,
  }
  if (payload.reconfortId) {
    row.reconfort_id = payload.reconfortId
  }

  let { error } = await supabase.from('scheduled_notifications').insert(row)

  if (error && payload.reconfortId && String(error.message || '').includes('reconfort_id')) {
    delete row.reconfort_id
    ;({ error } = await supabase.from('scheduled_notifications').insert(row))
  }

  if (error) throw error
}

/**
 * Planifie une notification réconfort après check-in Dashboard ou saisie de symptômes.
 * - Maximum 1 notification réconfort par jour.
 * - Tirage aléatoire parmi les messages disponibles.
 * - Évite de renvoyer un message dont last_sent remonte à moins de 7 jours (si d'autres existent).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ dateISO?: string }} [options]
 */
export async function maybeScheduleReconfortNotification(supabase, userId, options = {}) {
  if (!userId) return

  const dateISO = options.dateISO || getLocalTodayISO()

  try {
    const existingNotifications = await listReconfortNotificationsForDay(
      supabase,
      userId,
      dateISO,
    )

    await syncReconfortLastSentFromSentNotifications(supabase, userId)

    const messagesFresh = await listReconfortMessages(supabase, userId)

    if (!messagesFresh.length) return

    const sentToday = existingNotifications.filter((row) => row.sent)
    if (sentToday.length >= MAX_RECONFORT_NOTIFICATIONS_PER_DAY) return

    const usedTodayIds = getUsedReconfortMessageIds(messagesFresh, sentToday)
    const recentMessageIds = getRecentlySentReconfortMessageIds(messagesFresh, dateISO)
    const lastSentMessageId = getMostRecentlySentReconfortMessageIdFromLastSent(
      messagesFresh,
      dateISO,
    )

    await deletePendingReconfortForDay(supabase, userId, dateISO)

    const slotsLeft = MAX_RECONFORT_NOTIFICATIONS_PER_DAY - sentToday.length
    if (slotsLeft <= 0) return

    const toSchedule = pickReconfortMessagesForScheduling({
      messages: messagesFresh,
      usedTodayIds,
      recentMessageIds,
      lastSentMessageId,
      slotsLeft,
    })

    if (!toSchedule.length) return

    const scheduleDates = pickRandomReconfortScheduleDates(dateISO, toSchedule.length)
    if (!scheduleDates.length) return

    for (let i = 0; i < toSchedule.length; i++) {
      const scheduledAt = scheduleDates[i]
      if (!scheduledAt) continue

      await scheduleReconfortNotification(supabase, userId, {
        reconfortId: toSchedule[i].id,
        title: toSchedule[i].qui,
        body: toSchedule[i].message,
        scheduledAt,
      })
    }
  } catch (err) {
    console.error('maybeScheduleReconfortNotification:', err)
  }
}

/**
 * Envoie immédiatement une notification avec un message réconfort aléatoire.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function sendRandomReconfortNotificationNow(supabase, userId) {
  if (!userId) {
    throw new Error('Utilisateur non connecté.')
  }

  const dateISO = getLocalTodayISO()
  const messages = await listReconfortMessages(supabase, userId)
  if (!messages.length) {
    throw new Error('Aucun message de réconfort enregistré.')
  }

  const recentMessageIds = getRecentlySentReconfortMessageIds(messages, dateISO)
  const lastSentMessageId = getMostRecentlySentReconfortMessageIdFromLastSent(
    messages,
    dateISO,
  )

  const [picked] = pickReconfortMessagesForScheduling({
    messages,
    usedTodayIds: new Set(),
    recentMessageIds,
    lastSentMessageId,
    slotsLeft: 1,
  })

  if (!picked) {
    throw new Error('Aucun message de réconfort disponible pour le moment.')
  }

  const ok = await envoyerNotificationManuelle(userId, picked.qui, picked.message)
  if (!ok) {
    throw new Error('Échec de l’envoi de la notification.')
  }

  await markReconfortMessageSent(supabase, userId, {
    messageId: picked.id,
    sentDateISO: dateISO,
  })

  return picked
}
