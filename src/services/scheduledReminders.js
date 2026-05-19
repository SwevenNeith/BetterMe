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

const ONE_TIME_SELECT = 'id, title, body, scheduled_at, sent'

/** Marge après l’heure prévue pour laisser le cron envoyer avant d’afficher l’échec */
const OVERDUE_GRACE_MS = 90 * 1000

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

/** Rappels ponctuels : à venir vs échec (heure dépassée + non envoyé) */
export async function loadOneTimeRemindersGrouped(supabase, userId) {
  await purgeSentOneTimeReminders(supabase, userId)

  const { data, error } = await supabase
    .from('scheduled_notifications')
    .select(ONE_TIME_SELECT)
    .eq('user_id', userId)
    .is('event_id', null)
    .eq('sent', false)
    .order('scheduled_at', { ascending: true })

  if (error) throw error

  const now = Date.now()
  const upcoming = []
  const failed = []

  for (const row of data ?? []) {
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

  const { data, error } = await supabase
    .from('scheduled_notifications')
    .insert({
      user_id: userId,
      title: trimmedTitle,
      body: (body || '').trim(),
      scheduled_at: scheduledAt.toISOString(),
      event_id: null,
    })
    .select(ONE_TIME_SELECT)
    .single()

  if (error) throw error
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
