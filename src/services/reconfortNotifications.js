import {
  SYMPTOM_UI_TO_DB,
  TYPE_CYCLE,
  dbValueToUi,
  fetchSymptomEntriesForDate,
} from './menstruationSymptoms.js'
import { getEmotionLogForDate } from './emotionLogs.js'
import { listReconfortMessages } from './reconfortMessages.js'
import {
  matchesAllReconfortConditions,
  matchesReconfortCondition,
} from './reconfortMatching.js'
import { envoyerNotificationManuelle } from './notifications.js'
import {
  SCHEDULED_KIND,
  dateTimeLocalToDate,
  getLocalTodayISO,
} from './scheduledReminders.js'

export const MAX_RECONFORT_NOTIFICATIONS_PER_DAY = 3

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
 * Messages avec le plus grand nombre de conditions satisfaites (sans exiger 100 %).
 * @param {Array<{ id: string, qui: string, message: string, conditions?: string[] }>} messages
 * @param {import('./reconfortMatching.js').ReconfortMatchContext} context
 */
export function getBestPartialReconfortMessages(messages, context) {
  let bestCount = 0
  let bestMessages = []

  for (const message of messages) {
    const conditions = message.conditions ?? []
    if (!conditions.length) continue

    const satisfiedCount = countSatisfiedReconfortConditions(conditions, context)
    if (satisfiedCount <= 0) continue

    if (satisfiedCount > bestCount) {
      bestCount = satisfiedCount
      bestMessages = [message]
    } else if (satisfiedCount === bestCount) {
      bestMessages.push(message)
    }
  }

  return bestMessages
}

/**
 * @param {Array<{ id: string }>} messages
 */
export function pickOneRandomReconfortMessage(messages) {
  if (!messages.length) return null
  return messages[Math.floor(Math.random() * messages.length)]
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

    const eligible = getEligibleReconfortMessages(messages, context)
    const usedMessageIds = getUsedReconfortMessageIds(messages, sentToday)
    const available = eligible.filter((message) => !usedMessageIds.has(message.id))

    await deletePendingReconfortForDay(supabase, userId, dateISO)

    const slotsLeft = MAX_RECONFORT_NOTIFICATIONS_PER_DAY - sentToday.length
    if (slotsLeft <= 0) return

    let toSchedule = []

    if (available.length) {
      toSchedule = pickRandomDistinctReconfortMessages(
        available,
        Math.min(slotsLeft, available.length),
      )
    } else {
      const partialCandidates = getBestPartialReconfortMessages(messages, context).filter(
        (message) => !usedMessageIds.has(message.id),
      )
      const picked = pickOneRandomReconfortMessage(partialCandidates)
      if (picked) {
        toSchedule = [picked]
      }
    }

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

  const messages = await listReconfortMessages(supabase, userId)
  if (!messages.length) {
    throw new Error('Aucun message de réconfort enregistré.')
  }

  const picked = messages[Math.floor(Math.random() * messages.length)]
  const ok = await envoyerNotificationManuelle(userId, picked.qui, picked.message)
  if (!ok) {
    throw new Error('Échec de l’envoi de la notification.')
  }

  return picked
}
