import {
  SYMPTOM_UI_TO_DB,
  TYPE_CYCLE,
  dbValueToUi,
  fetchSymptomEntriesForDate,
} from './menstruationSymptoms.js'
import { getEmotionLogForDate } from './emotionLogs.js'
import { listReconfortMessages, markReconfortMessageSent } from './reconfortMessages.js'
import {
  matchesAllReconfortConditions,
  matchesReconfortCondition,
} from './reconfortMatching.js'
import { envoyerNotificationManuelle } from './notifications.js'
import { addDaysToISODate, daysBetweenISO } from './menstruationCycles.js'
import {
  SCHEDULED_KIND,
  dateTimeLocalToDate,
  getLocalTodayISO,
} from './scheduledReminders.js'

export const MAX_RECONFORT_NOTIFICATIONS_PER_DAY = 3
/** Évite de renvoyer un message déjà utilisé sur les N derniers jours (si d'autres existent). */
export const RECENT_RECONFORT_LOOKBACK_DAYS = 3

const RECONFORT_WINDOW_START = '09:00'
const RECONFORT_WINDOW_END = '23:30'

function rowToSymptomsMap(row) {
  const map = {}
  for (const [uiKey, dbCol] of Object.entries(SYMPTOM_UI_TO_DB)) {
    if (row?.[dbCol] != null && row[dbCol] !== '') {
      map[uiKey] = dbValueToUi(uiKey, row[dbCol])
    }
  }
  return map
}

function mapEmotionRowToCheckin(row) {
  if (!row) return null
  return {
    humeurGenerale: row['humeur_générale'],
    energieEmotionnelle: row['énergie_émotionnelle'],
    besoinReassurance: row['besoin_réassurance'],
    sentimentGeneral: row['sentiment_général'],
  }
}

function getDayBoundsIso(dateISO) {
  return {
    dayStart: dateTimeLocalToDate(dateISO, '00:00').toISOString(),
    dayEnd: dateTimeLocalToDate(dateISO, '23:59').toISOString(),
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} dateISO
 * @param {{ symptomsPartial?: Record<string, unknown>, checkinPartial?: object|null }} [overrides]
 */
export async function buildReconfortContext(supabase, userId, dateISO, overrides = {}) {
  let symptoms = {}

  for (const typeCycle of [TYPE_CYCLE.PILULE, TYPE_CYCLE.NATUREL]) {
    const entries = await fetchSymptomEntriesForDate(supabase, userId, dateISO, typeCycle)
    for (const entry of entries) {
      symptoms = { ...symptoms, ...rowToSymptomsMap(entry) }
    }
  }

  if (overrides.symptomsPartial) {
    symptoms = { ...symptoms, ...overrides.symptomsPartial }
  }

  let checkin = overrides.checkinPartial ?? null
  if (!checkin) {
    const row = await getEmotionLogForDate(supabase, userId, dateISO)
    checkin = mapEmotionRowToCheckin(row)
  }

  return {
    symptoms,
    checkin: checkin || {},
  }
}

/**
 * Messages dont toutes les conditions sont satisfaites (logique ET).
 * Un message 3/5 n'est pas éligible tant que ses 5 conditions ne le sont pas.
 * @param {Array<{ id: string, qui: string, message: string, conditions?: string[] }>} messages
 * @param {import('./reconfortMatching.js').ReconfortMatchContext} context
 */
export function getEligibleReconfortMessages(messages, context) {
  return messages.filter((message) => {
    const conditions = message.conditions ?? []
    if (conditions.length < 1) return false
    return matchesAllReconfortConditions(conditions, context)
  })
}

/**
 * @param {string[]} conditionIds
 * @param {import('./reconfortMatching.js').ReconfortMatchContext} context
 */
export function countSatisfiedReconfortConditions(conditionIds, context) {
  return (conditionIds ?? []).filter((id) => matchesReconfortCondition(id, context)).length
}

/**
 * Messages regroupés par nombre de conditions satisfaites (du plus au moins proche).
 * @param {Array<{ id: string, qui: string, message: string, conditions?: string[] }>} messages
 * @param {import('./reconfortMatching.js').ReconfortMatchContext} context
 */
export function getReconfortMessagesGroupedByMatchScore(messages, context) {
  /** @type {Map<number, Array<{ id: string, qui: string, message: string, conditions?: string[] }>>} */
  const groups = new Map()

  for (const message of messages) {
    const conditions = message.conditions ?? []
    if (!conditions.length) continue

    const score = countSatisfiedReconfortConditions(conditions, context)
    if (score <= 0) continue

    if (!groups.has(score)) groups.set(score, [])
    groups.get(score).push(message)
  }

  return [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([score, tierMessages]) => ({ score, messages: tierMessages }))
}

/**
 * Messages du N-ième palier de proximité (1 = le plus proche, 2 = le suivant, etc.).
 * @param {Array<{ id: string, qui: string, message: string, conditions?: string[] }>} messages
 * @param {import('./reconfortMatching.js').ReconfortMatchContext} context
 * @param {number} tier
 * @param {{ excludeIds?: Set<string>|string[] }} [options]
 */
export function getNthBestPartialReconfortMessages(messages, context, tier = 1, options = {}) {
  const excluded = toRecentIdSet(options.excludeIds)
  const groups = getReconfortMessagesGroupedByMatchScore(messages, context)
  if (tier < 1 || tier > groups.length) return []
  return (groups[tier - 1]?.messages ?? []).filter((message) => !excluded.has(message.id))
}

/**
 * Messages avec le plus grand nombre de conditions satisfaites (sans exiger 100 %).
 * @param {Array<{ id: string, qui: string, message: string, conditions?: string[] }>} messages
 * @param {import('./reconfortMatching.js').ReconfortMatchContext} context
 */
export function getBestPartialReconfortMessages(messages, context) {
  return getNthBestPartialReconfortMessages(messages, context, 1)
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

/**
 * Choisit les messages à planifier selon l'éligibilité, la rotation et le 2e palier de proximité.
 * @param {{
 *   messages: Array<{ id: string, qui: string, message: string, conditions?: string[] }>,
 *   context: import('./reconfortMatching.js').ReconfortMatchContext,
 *   usedTodayIds: Set<string>,
 *   recentMessageIds: Set<string>,
 *   lastSentMessageId: string|null,
 *   slotsLeft: number,
 * }} params
 */
export function pickReconfortMessagesForScheduling({
  messages,
  context,
  usedTodayIds,
  recentMessageIds,
  lastSentMessageId,
  slotsLeft,
}) {
  if (slotsLeft <= 0) return []

  const eligible = getEligibleReconfortMessages(messages, context).filter(
    (message) => !usedTodayIds.has(message.id),
  )

  if (eligible.length > 1) {
    return pickRandomDistinctReconfortMessagesAvoidingRecent(
      eligible,
      Math.min(slotsLeft, eligible.length),
      recentMessageIds,
    )
  }

  if (eligible.length === 1) {
    const soleMatch = eligible[0]
    const wouldRepeat =
      soleMatch.id === lastSentMessageId || recentMessageIds.has(soleMatch.id)

    if (wouldRepeat) {
      const secondClosest = getNthBestPartialReconfortMessages(messages, context, 2, {
        excludeIds: new Set([soleMatch.id, ...usedTodayIds]),
      })
      const alternate = pickOneRandomReconfortMessageAvoidingRecent(
        secondClosest,
        recentMessageIds,
      )
      if (alternate) return [alternate]
    }

    return [soleMatch]
  }

  const partialCandidates = getBestPartialReconfortMessages(messages, context).filter(
    (message) => !usedTodayIds.has(message.id),
  )
  const picked = pickOneRandomReconfortMessageAvoidingRecent(
    partialCandidates,
    recentMessageIds,
  )
  return picked ? [picked] : []
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
 * @param {{ title: string, body: string, scheduledAt: Date }} payload
 */
export async function scheduleReconfortNotification(supabase, userId, payload) {
  const title = (payload.title || '').trim()
  const body = (payload.body || '').trim()
  if (!title || !body || !payload.scheduledAt) {
    throw new Error('Données de notification réconfort invalides.')
  }

  const scheduledAtIso = payload.scheduledAt.toISOString()

  const { error } = await supabase.from('scheduled_notifications').insert({
    user_id: userId,
    event_id: null,
    kind: SCHEDULED_KIND.RECONFORT,
    title,
    body,
    scheduled_at: scheduledAtIso,
    sent: false,
  })

  if (error) throw error
}

/**
 * Évalue les messages réconfort et planifie des notifications (kind: reconfort uniquement).
 * - Un message n'est envoyé que si toutes ses conditions sont remplies (ET).
 * - Chaque message compte pour une seule notification, même s'il a plusieurs conditions.
 * - Maximum 3 notifications réconfort par jour (les autres types ne comptent pas).
 * - Si 2 messages sont entièrement éligibles, seulement 2 notifications sont planifiées.
 * - Sinon, un message au hasard parmi ceux qui remplissent le plus de conditions (partiel).
 * - Si un seul message correspond parfaitement mais qu'il vient d'être envoyé, on prend le 2e palier.
 * - Évite de renvoyer un message dont last_sent remonte à moins de 3 jours (si d'autres existent).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ dateISO?: string, symptomsPartial?: Record<string, unknown>, checkinPartial?: object|null }} [options]
 */
export async function maybeScheduleReconfortNotification(supabase, userId, options = {}) {
  if (!userId) return

  const dateISO = options.dateISO || getLocalTodayISO()

  try {
    const [messages, context, existingNotifications] = await Promise.all([
      listReconfortMessages(supabase, userId),
      buildReconfortContext(supabase, userId, dateISO, {
        symptomsPartial: options.symptomsPartial,
        checkinPartial: options.checkinPartial,
      }),
      listReconfortNotificationsForDay(supabase, userId, dateISO),
    ])

    if (!messages.length) return

    const sentToday = existingNotifications.filter((row) => row.sent)
    if (sentToday.length >= MAX_RECONFORT_NOTIFICATIONS_PER_DAY) return

    const usedTodayIds = getUsedReconfortMessageIds(messages, sentToday)
    const recentMessageIds = getRecentlySentReconfortMessageIds(messages, dateISO)
    const lastSentMessageId = getMostRecentlySentReconfortMessageIdFromLastSent(
      messages,
      dateISO,
    )

    await deletePendingReconfortForDay(supabase, userId, dateISO)

    const slotsLeft = MAX_RECONFORT_NOTIFICATIONS_PER_DAY - sentToday.length
    if (slotsLeft <= 0) return

    const toSchedule = pickReconfortMessagesForScheduling({
      messages,
      context,
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
  const picked = pickOneRandomReconfortMessageAvoidingRecent(messages, recentMessageIds)
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
