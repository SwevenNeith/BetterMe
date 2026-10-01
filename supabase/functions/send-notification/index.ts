import webpush from 'npm:web-push'
import { createClient } from 'npm:@supabase/supabase-js'

webpush.setVapidDetails(
  'mailto:camille.four@efrei.net',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

/** Logs verbeux : activer avec SEND_NOTIFICATION_VERBOSE=1 (off en prod par défaut). */
const VERBOSE_LOGS = Deno.env.get('SEND_NOTIFICATION_VERBOSE') === '1'
function logDebug(...args: unknown[]) {
  if (VERBOSE_LOGS) console.log(...args)
}

// Headers CORS pour autoriser les requêtes depuis ton app
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TODO_FREQUENCY = {
  ONE_OFF: 'ponctuel',
  DAILY: 'quotidien',
  WEEKLY: 'hebdomadaire',
  WEEK_GOAL: 'semaine',
}

function normalizeDateISO(value: unknown): string | null {
  if (value == null || value === '') return null
  return String(value).slice(0, 10)
}

function normalizeTimeHHmm(value: unknown): string {
  if (value == null || value === '') return '00:00'
  const raw = String(value).trim()
  const match = raw.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return '00:00'
  const h = Math.min(23, Math.max(0, parseInt(match[1], 10) || 0))
  const m = Math.min(59, Math.max(0, parseInt(match[2], 10) || 0))
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function getIsoWeekdayFromYMD(year: number, month: number, day: number): number {
  const date = new Date(year, month - 1, day)
  const jsDay = date.getDay()
  return jsDay === 0 ? 7 : jsDay
}

function isTodoDueOnDate(
  item: {
    frequence?: string
    date_echeance?: string
    jour_semaine?: number | null
  },
  dateISO: string,
): boolean {
  const target = normalizeDateISO(dateISO)
  const start = normalizeDateISO(item.date_echeance)
  if (!target || !start || target < start) return false

  if (item.frequence === TODO_FREQUENCY.ONE_OFF) {
    return target === start
  }

  if (item.frequence === TODO_FREQUENCY.DAILY) {
    return true
  }

  if (item.frequence === TODO_FREQUENCY.WEEKLY) {
    const [year, month, day] = target.split('-').map(Number)
    return getIsoWeekdayFromYMD(year, month, day) === Number(item.jour_semaine)
  }

  if (item.frequence === TODO_FREQUENCY.WEEK_GOAL) {
    const weekStart = normalizeDateISO(item.date_echeance)
    if (!weekStart) return false
    const [wsY, wsM, wsD] = weekStart.split('-').map(Number)
    const [tY, tM, tD] = target.split('-').map(Number)
    const weekStartMs = Date.UTC(wsY, wsM - 1, wsD)
    const targetMs = Date.UTC(tY, tM - 1, tD)
    const weekEndMs = weekStartMs + 6 * 24 * 60 * 60 * 1000
    return targetMs >= weekStartMs && targetMs <= weekEndMs
  }

  return false
}

function countDayScopedPromessesForDate(
  items: Array<{ is_promesse?: boolean; frequence?: string; date_echeance?: string; jour_semaine?: number | null }>,
  dateISO: string,
): number {
  return items.filter(
    (item) =>
      Boolean(item.is_promesse) &&
      item.frequence !== TODO_FREQUENCY.WEEK_GOAL &&
      isTodoDueOnDate(item, dateISO),
  ).length
}

const DEFAULT_NOTIFICATION_TIMEZONE = 'Europe/Paris'

function normalizeTimeZone(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!raw) return DEFAULT_NOTIFICATION_TIMEZONE
  try {
    // Valide le fuseau ; lève si invalide
    Intl.DateTimeFormat('en-GB', { timeZone: raw }).format(new Date())
    return raw
  } catch {
    return DEFAULT_NOTIFICATION_TIMEZONE
  }
}

/** Heure locale via offset minutes (fiable même si Intl TZ est cassé dans Deno). */
function getNowFromUtcOffsetMinutes(offsetMinutes: unknown) {
  const offset = Number(offsetMinutes)
  if (!Number.isFinite(offset)) return null
  const shifted = new Date(Date.now() + offset * 60 * 1000)
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const d = String(shifted.getUTCDate()).padStart(2, '0')
  const h = String(shifted.getUTCHours()).padStart(2, '0')
  const min = String(shifted.getUTCMinutes()).padStart(2, '0')
  return {
    timeZone: `offset:${offset}`,
    dateISO: `${y}-${m}-${d}`,
    timeHHmm: `${h}:${min}`,
    utcOffsetMinutes: offset,
  }
}

function getNowInTimeZone(timeZoneInput: unknown, utcOffsetMinutes?: unknown) {
  const fromOffset = getNowFromUtcOffsetMinutes(utcOffsetMinutes)
  if (fromOffset) return fromOffset

  const timeZone = normalizeTimeZone(timeZoneInput)
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date()).map((part) => [part.type, part.value]),
  )
  return {
    timeZone,
    dateISO: `${parts.year}-${parts.month}-${parts.day}`,
    timeHHmm: normalizeTimeHHmm(`${parts.hour}:${parts.minute}`),
    utcOffsetMinutes: null as number | null,
  }
}

/** Wall-clock locale → UTC ISO (offset = minutes à ajouter à UTC pour obtenir le local). */
function localDateTimeToUtcISO(
  dateISO: string,
  timeHHmm: string,
  utcOffsetMinutes: number,
): string {
  const [year, month, day] = dateISO.split('-').map(Number)
  const [hour, minute] = normalizeTimeHHmm(timeHHmm).split(':').map(Number)
  const utcMs =
    Date.UTC(year, month - 1, day, hour, minute, 0, 0) - utcOffsetMinutes * 60 * 1000
  return new Date(utcMs).toISOString()
}

function zonedDateTimeToUtcISO(
  dateISO: string,
  timeHHmm: string,
  timeZoneInput: unknown,
  utcOffsetMinutes?: unknown,
): string {
  const offset = Number(utcOffsetMinutes)
  if (Number.isFinite(offset)) {
    return localDateTimeToUtcISO(dateISO, timeHHmm, offset)
  }

  const timeZone = normalizeTimeZone(timeZoneInput)
  const [targetYear, targetMonth, targetDay] = dateISO.split('-').map(Number)
  const [targetHour, targetMinute] = normalizeTimeHHmm(timeHHmm).split(':').map(Number)

  let utcMs = Date.UTC(targetYear, targetMonth - 1, targetDay, targetHour, targetMinute)

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  for (let i = 0; i < 8; i++) {
    const partMap = Object.fromEntries(
      formatter.formatToParts(new Date(utcMs)).map((part) => [part.type, part.value]),
    )
    const pYear = Number(partMap.year)
    const pMonth = Number(partMap.month)
    const pDay = Number(partMap.day)
    const pHour = Number(partMap.hour)
    const pMinute = Number(partMap.minute)
    const dayDiff =
      (targetYear - pYear) * 372 + (targetMonth - pMonth) * 31 + (targetDay - pDay)
    const minuteDiff = dayDiff * 24 * 60 + (targetHour - pHour) * 60 + (targetMinute - pMinute)
    if (minuteDiff === 0) break
    utcMs += minuteDiff * 60 * 1000
  }

  return new Date(utcMs).toISOString()
}

function addDaysISO(dateISO: string, delta: number): string {
  const [year, month, day] = dateISO.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + delta)
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDateInTimeZone(iso: string | null | undefined, timeZoneInput: unknown): string {
  if (!iso) return new Date().toISOString().slice(0, 10)
  const timeZone = normalizeTimeZone(timeZoneInput)
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(iso))
}

function getTodoPageLabel(pageVisibility: unknown): string {
  if (!pageVisibility || typeof pageVisibility !== 'object' || Array.isArray(pageVisibility)) {
    return 'TODO'
  }
  const entry = (pageVisibility as Record<string, { label?: string | null }>).todo
  const custom = typeof entry?.label === 'string' ? entry.label.trim() : ''
  return custom || 'TODO'
}

const TODO_PROMESSE_KIND = 'todo_promesse_reminder'
const TODO_PROMESSE_BODY =
  'Tu n’as pas encore de promesse pour demain. Penses à en ajouter une 💜'
/** Au-delà de cette latence, on annule l’envoi (pas de rattrapage). */
const SCHEDULED_SEND_GRACE_MS = 5 * 60 * 1000

async function ensureTodoPromesseReminders() {
  let settingsRows = null
  let settingsError = null

  ;({ data: settingsRows, error: settingsError } = await supabase
    .from('settings')
    .select(
      'user_id, todo_promesse_reminder_enabled, todo_promesse_reminder_time, page_visibility, notification_timezone, notification_utc_offset_minutes',
    )
    .eq('todo_promesse_reminder_enabled', true))

  if (
    settingsError &&
    (String(settingsError.message || '').includes('notification_timezone') ||
      String(settingsError.message || '').includes('notification_utc_offset_minutes'))
  ) {
    ;({ data: settingsRows, error: settingsError } = await supabase
      .from('settings')
      .select(
        'user_id, todo_promesse_reminder_enabled, todo_promesse_reminder_time, page_visibility',
      )
      .eq('todo_promesse_reminder_enabled', true))
  }

  if (settingsError) {
    console.error('Erreur récupération réglages promesses TODO :', settingsError)
    return
  }

  const rows = (settingsRows ?? []).filter((row) => Boolean(row?.user_id))
  if (!rows.length) return

  const userIds = [...new Set(rows.map((row) => String(row.user_id)))]
  const nowMs = Date.now()

  // Lectures batchées (O(1) requêtes) au lieu de O(N) par utilisateur
  const { data: allItems, error: itemsError } = await supabase
    .from('todo_items')
    .select('user_id, frequence, jour_semaine, date_echeance, is_promesse')
    .in('user_id', userIds)
    .eq('is_promesse', true)

  if (itemsError) {
    console.error('Erreur lecture promesses TODO :', itemsError)
    return
  }

  /** Fenêtre UTC large pour couvrir « aujourd’hui local » quel que soit le fuseau. */
  const windowStartMs = nowMs - 48 * 60 * 60 * 1000
  const windowEndMs = nowMs + 48 * 60 * 60 * 1000

  // Une seule lecture scheduled_notifications du kind (volume faible : app perso + purge 30j)
  const { data: scheduledRows, error: scheduledError } = await supabase
    .from('scheduled_notifications')
    .select('id, user_id, sent, scheduled_at')
    .in('user_id', userIds)
    .eq('kind', TODO_PROMESSE_KIND)

  if (scheduledError) {
    console.error('Lecture rappels promesses TODO :', scheduledError)
    return
  }

  /** @type {Map<string, Array<{ frequence?: string, jour_semaine?: number|null, date_echeance?: string, is_promesse?: boolean }>>} */
  const itemsByUser = new Map()
  for (const item of allItems ?? []) {
    const uid = String(item.user_id || '')
    if (!uid) continue
    const list = itemsByUser.get(uid) || []
    list.push(item)
    itemsByUser.set(uid, list)
  }

  /** @type {Map<string, Array<{ id: string, scheduled_at: string }>>} */
  const pendingByUser = new Map()
  /** @type {Map<string, Array<{ id: string, scheduled_at: string }>>} */
  const sentByUser = new Map()
  for (const row of scheduledRows ?? []) {
    const uid = String(row.user_id || '')
    if (!uid) continue
    if (row.sent) {
      const t = new Date(row.scheduled_at).getTime()
      if (!Number.isFinite(t) || t < windowStartMs || t > windowEndMs) continue
      const list = sentByUser.get(uid) || []
      list.push(row)
      sentByUser.set(uid, list)
    } else {
      const list = pendingByUser.get(uid) || []
      list.push(row)
      pendingByUser.set(uid, list)
    }
  }

  const userIdsToCancel: string[] = []
  const inserts: Array<{
    user_id: string
    event_id: null
    kind: string
    title: string
    body: string
    scheduled_at: string
    sent: false
  }> = []
  const processedUsers = new Set<string>()

  for (const row of rows) {
    const userId = String(row.user_id)
    if (processedUsers.has(userId)) continue
    processedUsers.add(userId)

    const userNow = getNowInTimeZone(
      row.notification_timezone,
      row.notification_utc_offset_minutes,
    )
    const tomorrowISO = addDaysISO(userNow.dateISO, 1)
    const dayStartISO = zonedDateTimeToUtcISO(
      userNow.dateISO,
      '00:00',
      userNow.timeZone,
      userNow.utcOffsetMinutes,
    )
    const dayEndISO = zonedDateTimeToUtcISO(
      userNow.dateISO,
      '23:59',
      userNow.timeZone,
      userNow.utcOffsetMinutes,
    )
    const dayStartMs = new Date(dayStartISO).getTime()
    const dayEndMs = new Date(dayEndISO).getTime()

    const reminderTime = normalizeTimeHHmm(row.todo_promesse_reminder_time)
    const scheduledAtISO = zonedDateTimeToUtcISO(
      userNow.dateISO,
      reminderTime,
      userNow.timeZone,
      userNow.utcOffsetMinutes,
    )
    const scheduledMs = new Date(scheduledAtISO).getTime()

    const items = itemsByUser.get(userId) || []

    if (countDayScopedPromessesForDate(items, tomorrowISO) > 0) {
      if ((pendingByUser.get(userId) || []).length > 0) {
        userIdsToCancel.push(userId)
      }
      continue
    }

    const hasSentToday = (sentByUser.get(userId) || []).some((n) => {
      const t = new Date(n.scheduled_at).getTime()
      return t >= dayStartMs && t <= dayEndMs
    })
    if (hasSentToday) continue

    const hasPendingToday = (pendingByUser.get(userId) || []).some((n) => {
      const t = new Date(n.scheduled_at).getTime()
      return t >= dayStartMs && t <= dayEndMs
    })
    if (hasPendingToday) continue

    // Pas de rattrapage : si l’heure du jour est déjà passée, on attend demain
    // (le cron / l’ouverture de l’app replanifiera pour le prochain créneau).
    if (scheduledMs <= nowMs) continue

    inserts.push({
      user_id: userId,
      event_id: null,
      kind: TODO_PROMESSE_KIND,
      title: getTodoPageLabel(row.page_visibility),
      body: TODO_PROMESSE_BODY,
      scheduled_at: scheduledAtISO,
      sent: false,
    })
  }

  if (userIdsToCancel.length) {
    const { error: deleteError } = await supabase
      .from('scheduled_notifications')
      .delete()
      .in('user_id', userIdsToCancel)
      .eq('kind', TODO_PROMESSE_KIND)
      .eq('sent', false)

    if (deleteError) {
      console.error('Annulation rappel promesses TODO :', deleteError)
    }
  }

  if (inserts.length) {
    const { error: insertError } = await supabase.from('scheduled_notifications').insert(inserts)

    if (insertError) {
      console.error('Planification rappel promesses TODO :', insertError)
    } else {
      logDebug('Rappels promesses TODO planifiés :', inserts.length)
    }
  }
}

function parseSubscriptionObject(subscription: unknown): Record<string, unknown> | null {
  if (!subscription) return null
  if (typeof subscription === 'string') {
    try {
      const parsed = JSON.parse(subscription)
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  if (typeof subscription === 'object') return subscription as Record<string, unknown>
  return null
}

function subscriptionEndpoint(subscription: unknown): string {
  const obj = parseSubscriptionObject(subscription)
  return obj?.endpoint != null ? String(obj.endpoint) : ''
}

function subscriptionsForUser(
  subscriptions: Array<{ user_id?: string | null; subscription: unknown }>,
  userId: string | null | undefined,
) {
  if (!userId) return []
  return subscriptions.filter((row) => row.user_id === userId)
}

/** Une seule entrée par endpoint (évite les doublons push_subscriptions). */
function uniqueSubscriptionsByEndpoint(
  rows: Array<{
    user_id?: string | null
    subscription: unknown
    notification_prefs?: unknown
  }>,
) {
  const seen = new Set<string>()
  const unique: Array<{
    user_id?: string | null
    subscription: unknown
    notification_prefs?: unknown
  }> = []
  for (const row of rows) {
    const endpoint = subscriptionEndpoint(row.subscription)
    const key = endpoint || JSON.stringify(parseSubscriptionObject(row.subscription) ?? row)
    if (seen.has(key)) continue
    seen.add(key)
    const parsed = parseSubscriptionObject(row.subscription)
    unique.push(parsed ? { ...row, subscription: parsed } : row)
  }
  return unique
}

/** Catégorie appareil pour filtrer les push (null = toujours envoyer, ex. tests manuels). */
function mapNotificationKindToDeviceCategory(kind: unknown): string | null {
  const raw = String(kind ?? '').trim()
  if (!raw) return null
  if (raw === 'daily_reminder' || raw.startsWith('daily_reminder:')) return 'daily'
  if (raw === 'ponctuel') return 'ponctuel'
  if (raw === 'activite') return 'activite'
  if (raw === 'timer' || raw === 'timer_start') return 'timer'
  if (raw === 'todo_item_reminder') return 'todo_item'
  if (raw === 'todo_promesse_reminder') return 'todo_promesse'
  if (raw === 'reconfort') return 'reconfort'
  if (raw.startsWith('menstruation_')) return 'menstruation'
  if (
    raw.startsWith('television_movie_release:') ||
    raw.startsWith('television_episode_air:')
  ) {
    return 'television'
  }
  return null
}

function isSubscriptionEnabledForCategory(
  row: { notification_prefs?: unknown },
  category: string | null,
): boolean {
  if (!category) return true
  const prefs = row.notification_prefs
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) return true
  return (prefs as Record<string, unknown>)[category] !== false
}

function filterSubscriptionsByCategory(
  rows: Array<{
    user_id?: string | null
    subscription: unknown
    notification_prefs?: unknown
  }>,
  category: string | null,
) {
  return rows.filter((row) => isSubscriptionEnabledForCategory(row, category))
}

const DAILY_REMINDER_KIND_PREFIX = 'daily_reminder:'

function parseDailyReminderIdFromKind(kind: unknown): string | null {
  const raw = String(kind ?? '')
  if (raw.startsWith(DAILY_REMINDER_KIND_PREFIX)) {
    const id = raw.slice(DAILY_REMINDER_KIND_PREFIX.length).trim()
    return id || null
  }
  return null
}

function isDailyReminderKind(kind: unknown): boolean {
  const raw = String(kind ?? '')
  return raw === 'daily_reminder' || raw.startsWith(DAILY_REMINDER_KIND_PREFIX)
}

function dailyReminderScheduledKind(reminderId: string): string {
  return `${DAILY_REMINDER_KIND_PREFIX}${reminderId}`
}

type PushSubscriptionRow = {
  user_id?: string | null
  subscription: unknown
  notification_prefs?: unknown
}

/**
 * Charge les push_subscriptions.
 * - userIds omis : toutes (envoi manuel sans user)
 * - userIds [] : aucune requête
 * - userIds […] : filtrées
 */
async function loadPushSubscriptions(userIds?: string[] | null): Promise<PushSubscriptionRow[]> {
  if (Array.isArray(userIds) && userIds.length === 0) return []

  let query = supabase
    .from('push_subscriptions')
    .select('user_id, subscription, notification_prefs')

  if (Array.isArray(userIds)) {
    query = query.in('user_id', userIds)
  }

  let { data, error } = await query

  if (error && String(error.message || '').toLowerCase().includes('notification_prefs')) {
    let fallback = supabase.from('push_subscriptions').select('user_id, subscription')
    if (Array.isArray(userIds)) {
      fallback = fallback.in('user_id', userIds)
    }
    ;({ data, error } = await fallback)
  }

  if (error) throw error
  return (data ?? []) as PushSubscriptionRow[]
}

const DUE_NOTIFICATION_COLUMNS =
  'id, user_id, event_id, kind, title, body, scheduled_at, reconfort_id'
const DUE_NOTIFICATION_COLUMNS_FALLBACK =
  'id, user_id, event_id, kind, title, body, scheduled_at'

type DueNotificationRow = {
  id: string
  user_id?: string | null
  event_id?: string | null
  kind?: string | null
  title?: string | null
  body?: string | null
  scheduled_at: string
  reconfort_id?: string | null
  sent?: boolean
}

/**
 * Notifications dues pour le cron (lecture seule — fallback legacy).
 * Colonnes : id, user_id, event_id, kind, title, body, scheduled_at, reconfort_id
 */
async function fetchDueScheduledNotifications(nowISO: string) {
  let { data, error } = await supabase
    .from('scheduled_notifications')
    .select(DUE_NOTIFICATION_COLUMNS)
    .eq('sent', false)
    .lte('scheduled_at', nowISO)

  if (error && String(error.message || '').toLowerCase().includes('reconfort_id')) {
    ;({ data, error } = await supabase
      .from('scheduled_notifications')
      .select(DUE_NOTIFICATION_COLUMNS_FALLBACK)
      .eq('sent', false)
      .lte('scheduled_at', nowISO))
  }

  return { data: data as DueNotificationRow[] | null, error }
}

function isMissingClaimRpcError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false
  const msg = String(error.message || '').toLowerCase()
  const code = String(error.code || '')
  return (
    code === 'PGRST202' ||
    msg.includes('could not find the function') ||
    msg.includes('claim_due_scheduled_notifications') ||
    msg.includes('does not exist')
  )
}

/**
 * Claim atomique des dues via RPC (1 appel = SELECT+UPDATE).
 * Fallback : SELECT puis claim unitaire si la RPC n’est pas encore déployée.
 * scripts/rpc-claim-due-scheduled-notifications.sql
 */
async function claimDueScheduledNotifications(nowISO: string): Promise<{
  data: DueNotificationRow[] | null
  error: { message: string } | null
}> {
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'claim_due_scheduled_notifications',
    { p_now: nowISO },
  )

  if (!rpcError) {
    return { data: (rpcData ?? []) as DueNotificationRow[], error: null }
  }

  if (!isMissingClaimRpcError(rpcError)) {
    console.error('RPC claim_due_scheduled_notifications :', rpcError)
    return { data: null, error: rpcError }
  }

  // Fallback legacy (avant application du script SQL)
  const { data: due, error: fetchError } = await fetchDueScheduledNotifications(nowISO)
  if (fetchError) return { data: null, error: fetchError }

  const claimed: DueNotificationRow[] = []
  for (const notif of due ?? []) {
    let { data: row, error: claimError } = await supabase
      .from('scheduled_notifications')
      .update({ sent: true })
      .eq('id', notif.id)
      .eq('sent', false)
      .select(DUE_NOTIFICATION_COLUMNS)
      .maybeSingle()

    if (claimError && String(claimError.message || '').toLowerCase().includes('reconfort_id')) {
      ;({ data: row, error: claimError } = await supabase
        .from('scheduled_notifications')
        .update({ sent: true })
        .eq('id', notif.id)
        .eq('sent', false)
        .select(DUE_NOTIFICATION_COLUMNS_FALLBACK)
        .maybeSingle())
    }

    if (claimError) {
      console.error('Erreur claim notification :', claimError)
      continue
    }
    if (!row) continue
    claimed.push(row as DueNotificationRow)
  }

  return { data: claimed, error: null }
}

function notificationPushTag(notif: {
  id?: string | number
  kind?: string | null
  event_id?: string | null
  scheduled_at?: string | null
}) {
  const dailyId = parseDailyReminderIdFromKind(notif.kind)
  if (dailyId) {
    // Tag stable dans la journée → le navigateur regroupe les doublons
    const day = String(notif.scheduled_at || new Date().toISOString()).slice(0, 10)
    return `betterme-daily_reminder-${dailyId}-${day}`
  }
  const kind = String(notif.kind ?? '')
  if (
    kind.startsWith('television_movie_release:') ||
    kind.startsWith('television_episode_air:')
  ) {
    const day = String(notif.scheduled_at || new Date().toISOString()).slice(0, 10)
    return `betterme-${kind}-${day}`
  }
  if (notif.event_id && notif.kind) return `betterme-${notif.kind}-${notif.event_id}`
  if (notif.kind) return `betterme-${notif.kind}-${notif.id ?? 'x'}`
  return `betterme-${notif.id ?? 'default'}`
}

Deno.serve(async (req) => {
  // Répond aux requêtes preflight OPTIONS du navigateur
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    logDebug('Body reçu :', JSON.stringify(body))

    const {
      type,
      title,
      body: msgBody,
      scheduledAt,
      heureRappel,
      userId,
      eventId,
      kind,
      tag,
      reminderId,
      dayISO,
    } = body

    const payload = JSON.stringify({
      title,
      body: msgBody,
      ...(tag ? { tag: String(tag) } : {}),
    })

    if (type === 'manuel' || type === 'daily_push') {
      // Envoi immédiat — toujours limité au user (obligatoire pour daily_push)
      if (type === 'daily_push' && !userId) {
        return new Response(JSON.stringify({ error: 'userId requis' }), {
          status: 400,
          headers: corsHeaders,
        })
      }

      let subscriptions: PushSubscriptionRow[] = []
      try {
        subscriptions = await loadPushSubscriptions(userId ? [String(userId)] : null)
      } catch (subErr) {
        const message = subErr instanceof Error ? subErr.message : String(subErr)
        console.error('Erreur récupération subscriptions :', subErr)
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: corsHeaders,
        })
      }

      logDebug('Subscriptions trouvées :', subscriptions.length)

      const targets = filterSubscriptionsByCategory(
        uniqueSubscriptionsByEndpoint(
          userId
            ? subscriptionsForUser(subscriptions, userId)
            : type === 'daily_push'
              ? []
              : subscriptions,
        ),
        type === 'daily_push' ? 'daily' : null,
      )

      for (const row of targets) {
        try {
          await webpush.sendNotification(
            row.subscription,
            type === 'daily_push'
              ? JSON.stringify({
                  title,
                  body: msgBody,
                  tag:
                    tag ||
                    `betterme-daily_reminder-${reminderId || 'x'}-${String(dayISO || '').slice(0, 10) || 'day'}`,
                })
              : payload,
          )
          logDebug('Notification envoyée avec succès')
        } catch (e) {
          console.error('Erreur envoi notification :', e)
        }
      }
    } else if (type === 'activite' || type === 'timer') {
      // Stocke la notification planifiée, le cron l'enverra au bon moment
      const resolvedKind = kind || (type === 'timer' ? 'timer' : 'activite')

      if (eventId) {
        await supabase
          .from('scheduled_notifications')
          .delete()
          .eq('event_id', eventId)
          .eq('sent', false)
          .eq('kind', resolvedKind)
      } else if (userId) {
        await supabase
          .from('scheduled_notifications')
          .delete()
          .eq('user_id', userId)
          .is('event_id', null)
          .eq('sent', false)
          .eq('kind', resolvedKind)
      }

      const { error: insertError } = await supabase
        .from('scheduled_notifications')
        .insert({
          user_id: userId ?? null,
          event_id: eventId ?? null,
          kind: resolvedKind,
          title,
          body: msgBody,
          scheduled_at: scheduledAt,
          sent: false,
        })

      if (insertError) {
        console.error('Erreur insertion scheduled_notification :', insertError)
      } else {
        logDebug('Notification planifiée à :', scheduledAt)
      }
    } else if (type === 'quotidien') {
      // Stocke l'heure du rappel quotidien
      const { error: insertError } = await supabase
        .from('daily_reminders')
        .insert({ title, body: msgBody, reminder_time: heureRappel })

      if (insertError) {
        console.error('Erreur insertion daily_reminder :', insertError)
      } else {
        logDebug('Rappel quotidien planifié à :', heureRappel)
      }
    } else if (type === 'cron') {
      // Flux idle-first :
      // 1) RPC claim dues (1 appel = SELECT+UPDATE atomique) — 0 ligne si rien à faire
      // 2) si vide → pas de subscriptions / settings / todo (sauf filet promesse espacé)
      // 3) si dues → charger uniquement les user_id / daily ids concernés
      const maintenant = new Date().toISOString()
      logDebug('Cron exécuté à :', maintenant)

      const { data: notificationsAEnvoyer, error: fetchError } =
        await claimDueScheduledNotifications(maintenant)

      if (fetchError) {
        console.error('Erreur récupération / claim notifications planifiées :', fetchError)
        return new Response(JSON.stringify({ error: fetchError.message }), {
          status: 500,
          headers: corsHeaders,
        })
      }

      const dueList = notificationsAEnvoyer ?? []
      logDebug('Notifications à envoyer :', dueList.length)

      if (dueList.length) {
      const dueUserIds = [
        ...new Set(
          dueList.map((n) => n.user_id).filter((id): id is string => Boolean(id)).map(String),
        ),
      ]

      const dailyReminderIds = [
        ...new Set(
          dueList
            .map((n) => {
              const fromKind = parseDailyReminderIdFromKind(n.kind)
              if (fromKind) return fromKind
              if (n.kind === 'daily_reminder' && n.event_id) return String(n.event_id)
              return null
            })
            .filter((id): id is string => Boolean(id)),
        ),
      ]

      let subscriptions: PushSubscriptionRow[] = []
      try {
        subscriptions = await loadPushSubscriptions(dueUserIds)
      } catch (subErr) {
        console.error('Erreur récupération subscriptions :', subErr)
        subscriptions = []
      }

      /** Cache fuseau / offset par user_id (préchargé) */
      const timeContextByUser = new Map<
        string,
        { timeZone: string; utcOffsetMinutes: number | null }
      >()

      if (dueUserIds.length) {
        let settingsData:
          | Array<{
              user_id: string
              notification_timezone?: string | null
              notification_utc_offset_minutes?: number | null
            }>
          | null = null
        let settingsErr = null
        ;({ data: settingsData, error: settingsErr } = await supabase
          .from('settings')
          .select('user_id, notification_timezone, notification_utc_offset_minutes')
          .in('user_id', dueUserIds))

        if (
          settingsErr &&
          (String(settingsErr.message || '').includes('notification_timezone') ||
            String(settingsErr.message || '').includes('notification_utc_offset_minutes'))
        ) {
          ;({ data: settingsData, error: settingsErr } = await supabase
            .from('settings')
            .select('user_id, notification_timezone')
            .in('user_id', dueUserIds))
        }

        if (settingsErr) {
          console.error('Lecture timezone utilisateurs (batch) :', settingsErr)
        } else {
          for (const row of settingsData ?? []) {
            const uid = String(row.user_id || '')
            if (!uid) continue
            const offsetRaw = row.notification_utc_offset_minutes
            const offset = offsetRaw == null ? null : Number(offsetRaw)
            timeContextByUser.set(uid, {
              timeZone: normalizeTimeZone(row.notification_timezone),
              utcOffsetMinutes: Number.isFinite(offset as number) ? (offset as number) : null,
            })
          }
        }
      }

      function getUserTimeContext(uid: string | null | undefined) {
        if (!uid) {
          return { timeZone: DEFAULT_NOTIFICATION_TIMEZONE, utcOffsetMinutes: null as number | null }
        }
        return (
          timeContextByUser.get(String(uid)) || {
            timeZone: DEFAULT_NOTIFICATION_TIMEZONE,
            utcOffsetMinutes: null as number | null,
          }
        )
      }

      /** Cache daily_reminders (last_sent + replanif) — 1 SELECT pour tout le tick */
      type DailyReminderCacheRow = {
        id: string
        user_id: string
        last_sent_on?: string | null
        reminder_time?: string | null
        title?: string | null
        body?: string | null
      }
      const dailyReminderById = new Map<string, DailyReminderCacheRow>()

      if (dailyReminderIds.length) {
        const { data: dailyRows, error: dailyErr } = await supabase
          .from('daily_reminders')
          .select('id, user_id, last_sent_on, reminder_time, title, body')
          .in('id', dailyReminderIds)

        if (dailyErr) {
          console.error('Lecture daily_reminders (batch) :', dailyErr)
        } else {
          for (const row of dailyRows ?? []) {
            dailyReminderById.set(String(row.id), row as DailyReminderCacheRow)
          }
        }
      }

      for (const notif of dueList) {
        // Déjà claimées atomiquement via RPC (ou claim unitaire en fallback)
        const scheduledMs = new Date(notif.scheduled_at).getTime()
        if (
          Number.isFinite(scheduledMs) &&
          Date.now() - scheduledMs > SCHEDULED_SEND_GRACE_MS
        ) {
          logDebug(
            'Notification expirée (pas de rattrapage) :',
            notif.id,
            notif.scheduled_at,
          )
          continue
        }

        const dailyReminderId =
          parseDailyReminderIdFromKind(notif.kind) ||
          (notif.kind === 'daily_reminder' ? notif.event_id : null)

        let skipDailyPush = false
        if (isDailyReminderKind(notif.kind) && notif.user_id && dailyReminderId) {
          const ctxEarly = getUserTimeContext(notif.user_id)
          const userNowEarly = getNowInTimeZone(ctxEarly.timeZone, ctxEarly.utcOffsetMinutes)
          const cachedDaily = dailyReminderById.get(String(dailyReminderId))
          const currentRow =
            cachedDaily && String(cachedDaily.user_id) === String(notif.user_id)
              ? cachedDaily
              : null

          const already = String(currentRow?.last_sent_on ?? '').slice(0, 10)
          if (already === userNowEarly.dateISO) {
            logDebug('Rappel quotidien déjà envoyé aujourd’hui, skip :', dailyReminderId)
            skipDailyPush = true
          } else {
            const prev = currentRow?.last_sent_on
            let dayQuery = supabase
              .from('daily_reminders')
              .update({ last_sent_on: userNowEarly.dateISO })
              .eq('id', dailyReminderId)
              .eq('user_id', notif.user_id)
            if (prev == null || prev === '') {
              dayQuery = dayQuery.is('last_sent_on', null)
            } else {
              dayQuery = dayQuery.eq('last_sent_on', prev)
            }
            const { data: claimedDay } = await dayQuery.select('id').maybeSingle()
            if (!claimedDay) {
              skipDailyPush = true
            } else if (currentRow) {
              // Garde le cache cohérent pour la suite du tick / replanif
              currentRow.last_sent_on = userNowEarly.dateISO
            }
          }
        }

        if (!skipDailyPush) {
          const category = mapNotificationKindToDeviceCategory(notif.kind)
          const targets = filterSubscriptionsByCategory(
            uniqueSubscriptionsByEndpoint(
              subscriptionsForUser(subscriptions, notif.user_id),
            ),
            category,
          )
          if (!targets.length) {
            logDebug(
              'Aucune subscription (ou catégorie désactivée) pour',
              notif.user_id ?? 'inconnu',
              category ?? 'all',
            )
          }

          const pushPayload = JSON.stringify({
            title: notif.title,
            body: notif.body,
            tag: notificationPushTag(notif),
          })

          for (const row of targets) {
            try {
              await webpush.sendNotification(row.subscription, pushPayload)
              logDebug('Notification planifiée envoyée :', notif.id)
            } catch (e) {
              console.error('Erreur envoi notification planifiée :', e)
            }
          }
        }

        if (isDailyReminderKind(notif.kind) && notif.user_id && dailyReminderId) {
          const ctx = getUserTimeContext(notif.user_id)
          const userNow = getNowInTimeZone(ctx.timeZone, ctx.utcOffsetMinutes)

          // Sans offset fiable, ne pas écraser la prochaine occurrence calculée par le client
          if (ctx.utcOffsetMinutes == null) {
            continue
          }

          const rappelRowRaw = dailyReminderById.get(String(dailyReminderId))
          const rappelRow =
            rappelRowRaw && String(rappelRowRaw.user_id) === String(notif.user_id)
              ? rappelRowRaw
              : null
          const reminderTime = normalizeTimeHHmm(rappelRow?.reminder_time)
          const nextAt = zonedDateTimeToUtcISO(
            addDaysISO(userNow.dateISO, 1),
            reminderTime,
            ctx.timeZone,
            ctx.utcOffsetMinutes,
          )
          const nextKind = dailyReminderScheduledKind(String(dailyReminderId))

          await supabase
            .from('scheduled_notifications')
            .delete()
            .eq('user_id', notif.user_id)
            .eq('kind', nextKind)
            .eq('sent', false)

          const { error: nextInsertError } = await supabase
            .from('scheduled_notifications')
            .insert({
              user_id: notif.user_id,
              event_id: null,
              kind: nextKind,
              title: (rappelRow?.title || notif.title || 'BetterMe').trim() || 'BetterMe',
              body: (rappelRow?.body ?? notif.body ?? '').trim() || null,
              scheduled_at: nextAt,
              sent: false,
            })

          if (nextInsertError) {
            console.error('Replanification daily_reminder :', nextInsertError)
          }
        }

        if (notif.kind === 'reconfort' && notif.user_id) {
          const ctx = getUserTimeContext(notif.user_id)
          const sentDate =
            ctx.utcOffsetMinutes != null
              ? getNowFromUtcOffsetMinutes(ctx.utcOffsetMinutes)?.dateISO ??
                formatDateInTimeZone(notif.scheduled_at, ctx.timeZone)
              : formatDateInTimeZone(notif.scheduled_at, ctx.timeZone)

          if (notif.reconfort_id) {
            const { error: reconfortError } = await supabase
              .from('reconfort')
              .update({ last_sent: sentDate })
              .eq('id', notif.reconfort_id)
              .eq('user_id', notif.user_id)
            if (reconfortError) {
              console.error('Mise à jour last_sent (reconfort_id) :', reconfortError)
            }
          } else {
            const notifTitle = (notif.title || '').trim()
            const notifBody = (notif.body || '').trim()
            const { data: rows, error: listError } = await supabase
              .from('reconfort')
              .select('id, qui, message, last_sent')
              .eq('user_id', notif.user_id)

            if (listError) {
              console.error('Lecture reconfort pour last_sent :', listError)
            } else {
              const match = (rows ?? []).find(
                (row) =>
                  (row.qui || '').trim() === notifTitle &&
                  (row.message || '').trim() === notifBody &&
                  (!row.last_sent || row.last_sent < sentDate),
              )
              if (match?.id) {
                const { error: reconfortError } = await supabase
                  .from('reconfort')
                  .update({ last_sent: sentDate })
                  .eq('id', match.id)
                if (reconfortError) {
                  console.error('Mise à jour last_sent (match) :', reconfortError)
                }
              }
            }
          }
        }
      }
      } // fin if (dueList.length)

      // Filet « rappel promesses » : crée le pending avant l’heure du rappel.
      // Pas à chaque minute idle (settings + todo_items) — le client replanifie aussi
      // à l’ouverture / changement TODO / settings. Toutes les 15 min UTC suffit.
      const PROMESSE_ENSURE_EVERY_UTC_MINUTES = 15
      if (new Date().getUTCMinutes() % PROMESSE_ENSURE_EVERY_UTC_MINUTES === 0) {
        await ensureTodoPromesseReminders()
      }

      // Les rappels quotidiens partent UNIQUEMENT via scheduled_notifications
      // (heure locale appareil matérialisée en UTC). Pas de fallback HH:mm
      // (celui-ci comparait encore à l’UTC et renvoyait aussi le rappel « 08h » à 10h).
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: corsHeaders,
    })
  } catch (e) {
    console.error('Erreur globale :', e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})
