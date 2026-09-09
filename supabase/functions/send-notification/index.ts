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

  const nowMs = Date.now()

  for (const row of settingsRows ?? []) {
    const userId = row.user_id
    if (!userId) continue

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

    const reminderTime = normalizeTimeHHmm(row.todo_promesse_reminder_time)
    const scheduledAtISO = zonedDateTimeToUtcISO(
      userNow.dateISO,
      reminderTime,
      userNow.timeZone,
      userNow.utcOffsetMinutes,
    )
    const scheduledMs = new Date(scheduledAtISO).getTime()

    const { data: items, error: itemsError } = await supabase
      .from('todo_items')
      .select('frequence, jour_semaine, date_echeance, is_promesse')
      .eq('user_id', userId)
      .eq('is_promesse', true)

    if (itemsError) {
      console.error('Erreur lecture promesses TODO :', itemsError)
      continue
    }

    if (countDayScopedPromessesForDate(items ?? [], tomorrowISO) > 0) {
      await supabase
        .from('scheduled_notifications')
        .delete()
        .eq('user_id', userId)
        .eq('kind', TODO_PROMESSE_KIND)
        .eq('sent', false)
      continue
    }

    const { data: sentRows, error: sentError } = await supabase
      .from('scheduled_notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('kind', TODO_PROMESSE_KIND)
      .eq('sent', true)
      .gte('scheduled_at', dayStartISO)
      .lte('scheduled_at', dayEndISO)
      .limit(1)

    if (sentError) {
      console.error('Lecture rappel promesses envoyé :', sentError)
      continue
    }
    if (sentRows?.length) continue

    const { data: pendingRows, error: pendingError } = await supabase
      .from('scheduled_notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('kind', TODO_PROMESSE_KIND)
      .eq('sent', false)
      .gte('scheduled_at', dayStartISO)
      .lte('scheduled_at', dayEndISO)
      .limit(1)

    if (pendingError) {
      console.error('Lecture rappel promesses en attente :', pendingError)
      continue
    }
    if (pendingRows?.length) continue

    // Pas de rattrapage : si l’heure du jour est déjà passée, on attend demain
    // (le cron / l’ouverture de l’app replanifiera pour le prochain créneau).
    if (scheduledMs <= nowMs) continue

    const whenISO = scheduledAtISO
    const pageLabel = getTodoPageLabel(row.page_visibility)

    const { error: insertError } = await supabase.from('scheduled_notifications').insert({
      user_id: userId,
      event_id: null,
      kind: TODO_PROMESSE_KIND,
      title: pageLabel,
      body: TODO_PROMESSE_BODY,
      scheduled_at: whenISO,
      sent: false,
    })

    if (insertError) {
      console.error('Planification rappel promesses TODO :', insertError)
    } else {
      console.log('Rappel promesses TODO planifié pour', userId, whenISO, userNow.timeZone)
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
  rows: Array<{ user_id?: string | null; subscription: unknown }>,
) {
  const seen = new Set<string>()
  const unique: Array<{ user_id?: string | null; subscription: unknown }> = []
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
    console.log('Body reçu :', JSON.stringify(body))

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

    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('user_id, subscription')

    if (error) {
      console.error('Erreur récupération subscriptions :', error)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: corsHeaders,
      })
    }

    console.log('Subscriptions trouvées :', subscriptions?.length ?? 0)

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

      const targets = uniqueSubscriptionsByEndpoint(
        userId
          ? subscriptionsForUser(subscriptions ?? [], userId)
          : type === 'daily_push'
            ? []
            : (subscriptions ?? []),
      )

      // daily_push : 1 seul appareil max si plusieurs endpoints (anti-doublon agressif)
      // → non : multi-appareil voulu, mais endpoints dédupliqués ci-dessus
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
          console.log('Notification envoyée avec succès')
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
        console.log('Notification planifiée à :', scheduledAt)
      }
    } else if (type === 'quotidien') {
      // Stocke l'heure du rappel quotidien
      const { error: insertError } = await supabase
        .from('daily_reminders')
        .insert({ title, body: msgBody, reminder_time: heureRappel })

      if (insertError) {
        console.error('Erreur insertion daily_reminder :', insertError)
      } else {
        console.log('Rappel quotidien planifié à :', heureRappel)
      }
    } else if (type === 'cron') {
      // Appelé automatiquement chaque minute par le cron
      const maintenant = new Date().toISOString()
      console.log('Cron exécuté à :', maintenant)

      // Purge des notifications déjà envoyées (> 30 jours)
      const purgeBefore = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const { error: purgeError, count: purgeCount } = await supabase
        .from('scheduled_notifications')
        .delete({ count: 'exact' })
        .eq('sent', true)
        .lt('scheduled_at', purgeBefore)

      if (purgeError) {
        console.error('Purge scheduled_notifications (>30j) :', purgeError)
      } else if (purgeCount) {
        console.log('Notifications envoyées purgées (>30j) :', purgeCount)
      }

      await ensureTodoPromesseReminders()

      // Vérifie les notifications planifiées à envoyer
      const { data: notificationsAEnvoyer, error: fetchError } = await supabase
        .from('scheduled_notifications')
        .select('*')
        .lte('scheduled_at', maintenant)
        .eq('sent', false)

      if (fetchError) {
        console.error('Erreur récupération notifications planifiées :', fetchError)
      } else {
        console.log('Notifications à envoyer :', notificationsAEnvoyer?.length ?? 0)
      }

      /** Cache fuseau / offset par user_id */
      const timeContextByUser = new Map<
        string,
        { timeZone: string; utcOffsetMinutes: number | null }
      >()

      async function getUserTimeContext(userId: string | null | undefined) {
        if (!userId) {
          return { timeZone: DEFAULT_NOTIFICATION_TIMEZONE, utcOffsetMinutes: null as number | null }
        }
        if (timeContextByUser.has(userId)) return timeContextByUser.get(userId)!

        let data: {
          notification_timezone?: string | null
          notification_utc_offset_minutes?: number | null
        } | null = null
        let error = null
        ;({ data, error } = await supabase
          .from('settings')
          .select('notification_timezone, notification_utc_offset_minutes')
          .eq('user_id', userId)
          .maybeSingle())

        if (
          error &&
          (String(error.message || '').includes('notification_timezone') ||
            String(error.message || '').includes('notification_utc_offset_minutes'))
        ) {
          ;({ data, error } = await supabase
            .from('settings')
            .select('notification_timezone')
            .eq('user_id', userId)
            .maybeSingle())
        }

        if (error) {
          console.error('Lecture timezone utilisateur :', error)
        }

        const offsetRaw = data?.notification_utc_offset_minutes
        const offset = offsetRaw == null ? null : Number(offsetRaw)
        const ctx = {
          timeZone: normalizeTimeZone(data?.notification_timezone),
          utcOffsetMinutes: Number.isFinite(offset as number) ? (offset as number) : null,
        }
        timeContextByUser.set(userId, ctx)
        return ctx
      }

      async function getUserTimezone(userId: string | null | undefined): Promise<string> {
        return (await getUserTimeContext(userId)).timeZone
      }

      for (const notif of notificationsAEnvoyer ?? []) {
        // Verrou optimiste : un seul cron (pg_cron ou client) envoie la notif
        const { data: claimed, error: claimError } = await supabase
          .from('scheduled_notifications')
          .update({ sent: true })
          .eq('id', notif.id)
          .eq('sent', false)
          .select('id')
          .maybeSingle()

        if (claimError) {
          console.error('Erreur claim notification :', claimError)
          continue
        }
        if (!claimed) continue

        const scheduledMs = new Date(notif.scheduled_at).getTime()
        if (
          Number.isFinite(scheduledMs) &&
          Date.now() - scheduledMs > SCHEDULED_SEND_GRACE_MS
        ) {
          console.log(
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
          const ctxEarly = await getUserTimeContext(notif.user_id)
          const userNowEarly = getNowInTimeZone(ctxEarly.timeZone, ctxEarly.utcOffsetMinutes)

          const { data: currentRow } = await supabase
            .from('daily_reminders')
            .select('last_sent_on')
            .eq('id', dailyReminderId)
            .eq('user_id', notif.user_id)
            .maybeSingle()

          const already = String(currentRow?.last_sent_on ?? '').slice(0, 10)
          if (already === userNowEarly.dateISO) {
            console.log('Rappel quotidien déjà envoyé aujourd’hui, skip :', dailyReminderId)
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
            }
          }
        }

        if (!skipDailyPush) {
          const targets = uniqueSubscriptionsByEndpoint(
            subscriptionsForUser(subscriptions ?? [], notif.user_id),
          )
          if (!targets.length) {
            console.log('Aucune subscription pour', notif.user_id ?? 'inconnu')
          }

          const pushPayload = JSON.stringify({
            title: notif.title,
            body: notif.body,
            tag: notificationPushTag(notif),
          })

          for (const row of targets) {
            try {
              await webpush.sendNotification(row.subscription, pushPayload)
              console.log('Notification planifiée envoyée :', notif.id)
            } catch (e) {
              console.error('Erreur envoi notification planifiée :', e)
            }
          }
        }

        if (isDailyReminderKind(notif.kind) && notif.user_id && dailyReminderId) {
          const ctx = await getUserTimeContext(notif.user_id)
          const userNow = getNowInTimeZone(ctx.timeZone, ctx.utcOffsetMinutes)

          // Sans offset fiable, ne pas écraser la prochaine occurrence calculée par le client
          if (ctx.utcOffsetMinutes == null) {
            continue
          }

          const { data: rappelRow } = await supabase
            .from('daily_reminders')
            .select('reminder_time, title, body')
            .eq('id', dailyReminderId)
            .eq('user_id', notif.user_id)
            .maybeSingle()

          const reminderTime = normalizeTimeHHmm(rappelRow?.reminder_time)
          const nextAt = zonedDateTimeToUtcISO(
            addDaysISO(userNow.dateISO, 1),
            reminderTime,
            ctx.timeZone,
            ctx.utcOffsetMinutes,
          )
          const nextKind = dailyReminderScheduledKind(dailyReminderId)

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
          const userTz = await getUserTimezone(notif.user_id)
          const ctx = await getUserTimeContext(notif.user_id)
          const sentDate = ctx.utcOffsetMinutes != null
            ? getNowFromUtcOffsetMinutes(ctx.utcOffsetMinutes)?.dateISO ??
              formatDateInTimeZone(notif.scheduled_at, userTz)
            : formatDateInTimeZone(notif.scheduled_at, userTz)

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
