import { getDurationMinutes } from './durationUtils.js'

/** Ancien marqueur (lignes créées avant la colonne kind) */
const LEGACY_TIMER_BODY_MARKER = '__betterme_kind:timer__'

export const SCHEDULED_KIND = {
  PONCTUEL: 'ponctuel',
  TIMER: 'timer',
  TIMER_START: 'timer_start',
  RECONFORT: 'reconfort',
  TODO_PROMESSE_REMINDER: 'todo_promesse_reminder',
}

export function isStandaloneTimer(row) {
  if (row?.kind === SCHEDULED_KIND.TIMER) return true
  const body = String(row?.body ?? '').trim()
  return body === LEGACY_TIMER_BODY_MARKER || body.startsWith(`${LEGACY_TIMER_BODY_MARKER}\n`)
}

/** Corps affiché dans l’UI (Réglages) */
export function getScheduledDisplayBody(row) {
  if (isStandaloneTimer(row)) {
    const text = cleanTimerBodyFromStorage(row.body)
    return text || null
  }
  return row.body?.trim() || null
}

/** Corps envoyé dans la push (sans marqueur) */
export function pushBodyFromStored(stored, kind) {
  if (kind === SCHEDULED_KIND.TIMER || isStandaloneTimer({ body: stored, kind })) {
    const text = cleanTimerBodyFromStorage(stored)
    return text || 'Le timer est terminé !'
  }
  return String(stored ?? '').trim()
}

function cleanTimerBodyFromStorage(body) {
  const raw = String(body ?? '').trim()
  if (!raw) return ''
  if (raw === LEGACY_TIMER_BODY_MARKER || raw.startsWith(`${LEGACY_TIMER_BODY_MARKER}\n`)) {
    return raw.slice(LEGACY_TIMER_BODY_MARKER.length).replace(/^\n/, '').trim()
  }
  return raw
}

/** Date du jour locale (YYYY-MM-DD) — alignée sur l’appareil */
export function getLocalTodayISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function normalizeScheduledTime(time) {
  if (!time) return '12:00'
  const part = String(time).trim().slice(0, 5)
  const [hRaw, mRaw] = part.split(':')
  const h = String(Math.min(23, Math.max(0, parseInt(hRaw, 10) || 0))).padStart(2, '0')
  const m = String(Math.min(59, Math.max(0, parseInt(mRaw, 10) || 0))).padStart(2, '0')
  return `${h}:${m}`
}

/** Date + heure du formulaire → instant absolu (heure locale appareil) */
export function dateTimeLocalToDate(dateStr, timeStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hour, minute] = normalizeScheduledTime(timeStr).split(':').map(Number)
  return new Date(year, month - 1, day, hour, minute, 0, 0)
}

/**
 * Parse scheduled_at renvoyé par Supabase.
 * Sans fuseau explicite → UTC (ce qu’on écrit via toISOString()), pas l’heure locale.
 */
export function parseScheduledAt(value) {
  if (value == null || value === '') return new Date(NaN)

  if (value instanceof Date) {
    return new Date(value.getTime())
  }

  let raw = String(value).trim().replace(' ', 'T')

  const hasExplicitZone =
    /Z$/i.test(raw) || /[+-]\d{2}:?\d{2}$/.test(raw) || /[+-]\d{2}$/.test(raw)

  if (!hasExplicitZone) {
    raw = raw.replace(/\.\d{3}$/, '')
    if (!raw.endsWith('Z')) {
      raw = `${raw}Z`
    }
  }

  return new Date(raw)
}

export function getDeviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}

/** Affichage dans le fuseau de l’appareil (identique au champ date/heure) */
export function formatScheduledAtLocal(value) {
  const date = parseScheduledAt(value)
  if (Number.isNaN(date.getTime())) return ''

  const options = {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }
  const timeZone = getDeviceTimeZone()
  if (timeZone) {
    options.timeZone = timeZone
  }

  return new Intl.DateTimeFormat('fr-FR', options).format(date)
}

/** True si l’heure d’envoi est dépassée (échec potentiel) */
export function isScheduledOverdue(value, nowMs = Date.now()) {
  const scheduledMs = parseScheduledAt(value).getTime()
  if (Number.isNaN(scheduledMs)) return false
  return scheduledMs <= nowMs
}

const SCHEDULED_SELECT = 'id, title, body, scheduled_at, sent, kind'
const MENSTRUATION_KIND_PREFIX = 'menstruation_'

/** Marge après l’heure prévue pour laisser le cron envoyer avant d’afficher l’échec */
const OVERDUE_GRACE_MS = 90 * 1000

/** Supprime les planifications en attente identiques (évite doublons en base) */
export async function deletePendingScheduledDuplicate(
  supabase,
  userId,
  { scheduledAt, kind, eventId = null },
) {
  let query = supabase
    .from('scheduled_notifications')
    .delete()
    .eq('user_id', userId)
    .eq('sent', false)
    .eq('kind', kind)
    .eq('scheduled_at', scheduledAt)

  if (eventId) {
    query = query.eq('event_id', eventId)
  } else {
    query = query.is('event_id', null)
  }

  const { error } = await query
  if (error) throw error
}

/** Supprime les notifications en attente pour une liste de kinds. */
export async function deletePendingByKinds(supabase, userId, kinds) {
  if (!kinds?.length) return

  const { error } = await supabase
    .from('scheduled_notifications')
    .delete()
    .eq('user_id', userId)
    .eq('sent', false)
    .in('kind', kinds)

  if (error) throw error
}

/** Supprime les notifications en attente dont le kind commence par un préfixe. */
export async function deletePendingByKindPrefix(supabase, userId, prefix) {
  if (!prefix) return

  const { data: pending, error: fetchErr } = await supabase
    .from('scheduled_notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('sent', false)
    .like('kind', `${prefix}%`)

  if (fetchErr) throw fetchErr
  if (!pending?.length) return

  const { error: delErr } = await supabase
    .from('scheduled_notifications')
    .delete()
    .in(
      'id',
      pending.map((row) => row.id),
    )

  if (delErr) throw delErr
}

/** Insère des planifications en évitant les doublons (contrainte pending_uq). */
export async function insertPendingNotifications(supabase, userId, rows) {
  if (!rows?.length) return

  const seen = new Set()
  const unique = []

  for (const row of rows) {
    const key = `${row.kind}|${row.scheduled_at}|${row.event_id ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(row)
  }

  for (const row of unique) {
    await deletePendingScheduledDuplicate(supabase, userId, {
      scheduledAt: row.scheduled_at,
      kind: row.kind,
      eventId: row.event_id ?? null,
    })
  }

  const { error } = await supabase.from('scheduled_notifications').insert(unique)
  if (error) throw error
}

/** Supprime les rappels ponctuels déjà envoyés (nettoyage) */
export async function purgeSentOneTimeReminders(supabase, userId) {
  const { error } = await supabase
    .from('scheduled_notifications')
    .delete()
    .eq('user_id', userId)
    .is('event_id', null)
    .eq('sent', true)

  if (error) throw error
}

function splitUpcomingFailed(rows) {
  const now = Date.now()
  const upcoming = []
  const failed = []

  for (const row of rows) {
    const scheduledMs = parseScheduledAt(row.scheduled_at).getTime()
    if (Number.isNaN(scheduledMs)) continue

    if (scheduledMs + OVERDUE_GRACE_MS <= now) {
      failed.push(row)
    } else {
      upcoming.push(row)
    }
  }

  return { upcoming, failed }
}

/** Rappels ponctuels + timers seuls (scheduled_notifications, sans event_id) */
export async function loadStandaloneScheduledGrouped(supabase, userId) {
  await purgeSentOneTimeReminders(supabase, userId)

  const { data, error } = await supabase
    .from('scheduled_notifications')
    .select(SCHEDULED_SELECT)
    .eq('user_id', userId)
    .is('event_id', null)
    .eq('sent', false)
    .order('scheduled_at', { ascending: true })

  if (error) throw error

  const ponctuelRows = []
  const timerRows = []

  for (const row of data ?? []) {
    if (String(row?.kind || '').startsWith(MENSTRUATION_KIND_PREFIX)) {
      continue
    }
    if (row?.kind === SCHEDULED_KIND.RECONFORT) {
      continue
    }
    if (row?.kind === SCHEDULED_KIND.TODO_PROMESSE_REMINDER) {
      continue
    }
    if (isStandaloneTimer(row)) {
      timerRows.push(row)
    } else {
      ponctuelRows.push(row)
    }
  }

  return {
    ponctuel: splitUpcomingFailed(ponctuelRows),
    timers: splitUpcomingFailed(timerRows),
  }
}

/** @deprecated Utiliser loadStandaloneScheduledGrouped */
export async function loadOneTimeRemindersGrouped(supabase, userId) {
  const { ponctuel } = await loadStandaloneScheduledGrouped(supabase, userId)
  return ponctuel
}

export async function createOneTimeReminder(supabase, userId, { title, body, scheduledDate, scheduledTime }) {
  const trimmedTitle = (title || '').trim()
  if (!trimmedTitle) {
    throw new Error('Le titre est obligatoire.')
  }

  const dateStr = String(scheduledDate || '').trim()
  const timeStr = normalizeScheduledTime(scheduledTime)
  if (!dateStr) {
    throw new Error('Choisis une date d’envoi.')
  }

  const scheduledAt = dateTimeLocalToDate(dateStr, timeStr)
  if (scheduledAt.getTime() <= Date.now()) {
    throw new Error('La date et l’heure doivent être dans le futur.')
  }

  const scheduledAtIso = scheduledAt.toISOString()
  await deletePendingScheduledDuplicate(supabase, userId, {
    scheduledAt: scheduledAtIso,
    kind: SCHEDULED_KIND.PONCTUEL,
  })

  const { data, error } = await supabase
    .from('scheduled_notifications')
    .insert({
      user_id: userId,
      title: trimmedTitle,
      body: (body || '').trim() || null,
      scheduled_at: scheduledAtIso,
      event_id: null,
      kind: SCHEDULED_KIND.PONCTUEL,
    })
    .select(SCHEDULED_SELECT)
    .single()

  if (error) {
    if (String(error.message || '').includes('kind')) {
      throw new Error(
        'Colonne kind manquante sur scheduled_notifications. Exécute la migration Supabase (voir supabase/migrations/20250519170000_scheduled_notifications_kind.sql).',
      )
    }
    throw error
  }
  return data
}

export async function deleteOneTimeReminder(supabase, userId, reminderId) {
  const { error } = await supabase
    .from('scheduled_notifications')
    .delete()
    .eq('id', reminderId)
    .eq('user_id', userId)
    .is('event_id', null)

  if (error) throw error
}

/** Supprime les notifications de début de timer non envoyées. */
export async function deletePendingTimerStartNotifications(supabase, { eventId, userId }) {
  if (eventId) {
    await supabase
      .from('scheduled_notifications')
      .delete()
      .eq('event_id', eventId)
      .eq('sent', false)
      .eq('kind', SCHEDULED_KIND.TIMER_START)

    await supabase
      .from('scheduled_notifications')
      .delete()
      .eq('event_id', eventId)
      .eq('sent', false)
      .like('body', "C'est parti ! Timer de%")
  }

  if (userId) {
    await supabase
      .from('scheduled_notifications')
      .delete()
      .eq('user_id', userId)
      .eq('sent', false)
      .eq('kind', SCHEDULED_KIND.TIMER_START)

    await supabase
      .from('scheduled_notifications')
      .delete()
      .eq('user_id', userId)
      .eq('sent', false)
      .like('body', "C'est parti ! Timer de%")
  }
}

/** Supprime les fins de timer non envoyées (évite doublons avant replanification). */
export async function deletePendingTimerEndNotifications(supabase, { eventId, userId }) {
  if (eventId) {
    await supabase
      .from('scheduled_notifications')
      .delete()
      .eq('event_id', eventId)
      .eq('sent', false)
      .eq('kind', SCHEDULED_KIND.TIMER)

    await supabase
      .from('scheduled_notifications')
      .delete()
      .eq('event_id', eventId)
      .eq('sent', false)
      .like('body', '%timer est terminé%')
    return
  }

  if (userId) {
    await supabase
      .from('scheduled_notifications')
      .delete()
      .eq('user_id', userId)
      .is('event_id', null)
      .eq('sent', false)
      .eq('kind', SCHEDULED_KIND.TIMER)
  }
}

export async function createStandaloneTimer(supabase, userId, { title, body, durationHours, durationMinutes }) {
  const trimmedTitle = (title || '').trim()
  if (!trimmedTitle) {
    throw new Error('Le titre est obligatoire.')
  }

  const totalMinutes = getDurationMinutes(durationHours, durationMinutes)
  if (totalMinutes <= 0) {
    throw new Error('Indique une durée d’au moins 1 minute.')
  }

  const scheduledAt = new Date(Date.now() + totalMinutes * 60 * 1000)
  const scheduledAtIso = scheduledAt.toISOString()
  const userBody = (body || '').trim() || null

  await deletePendingTimerEndNotifications(supabase, { userId })
  await deletePendingScheduledDuplicate(supabase, userId, {
    scheduledAt: scheduledAtIso,
    kind: SCHEDULED_KIND.TIMER,
  })

  const { data, error } = await supabase
    .from('scheduled_notifications')
    .insert({
      user_id: userId,
      title: trimmedTitle,
      body: userBody,
      scheduled_at: scheduledAtIso,
      event_id: null,
      kind: SCHEDULED_KIND.TIMER,
    })
    .select(SCHEDULED_SELECT)
    .single()

  if (error) {
    if (String(error.message || '').includes('kind')) {
      throw new Error(
        'Colonne kind manquante sur scheduled_notifications. Exécute la migration Supabase (voir supabase/migrations/20250519170000_scheduled_notifications_kind.sql).',
      )
    }
    throw error
  }
  return data
}
