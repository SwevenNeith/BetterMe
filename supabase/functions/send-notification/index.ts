/// <reference path="./deno-shims.d.ts" />

import webpush from 'npm:web-push'
import { createClient } from 'npm:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TIMEZONE = 'Europe/Paris'
const LEGACY_TIMER_BODY_MARKER = '__betterme_kind:timer__'

/** Corps push : kind=timer ou ancien marqueur dans body */
function pushBodyFromStored(
  stored: string | null | undefined,
  kind?: string | null,
): string {
  const isTimer =
    kind === 'timer' ||
    String(stored ?? '').trim() === LEGACY_TIMER_BODY_MARKER ||
    String(stored ?? '').startsWith(`${LEGACY_TIMER_BODY_MARKER}\n`)

  if (isTimer) {
    const raw = String(stored ?? '').trim()
    let text = raw
    if (raw.startsWith(LEGACY_TIMER_BODY_MARKER)) {
      text = raw.slice(LEGACY_TIMER_BODY_MARKER.length).replace(/^\n/, '').trim()
    }
    return text || 'Le timer est terminé !'
  }

  return String(stored ?? '').trim()
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

webpush.setVapidDetails(
  'mailto:cfour@grouperf.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

/** "15:20:00" ou "15:20" → "15:20" */
function normalizeTime(value: string) {
  if (!value) return ''
  const part = String(value).trim().slice(0, 5)
  const [h, m] = part.split(':')
  return `${String(parseInt(h, 10)).padStart(2, '0')}:${String(parseInt(m, 10)).padStart(2, '0')}`
}

function getParisTimeHHMM() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
}

function getParisDateISO() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function parseSubscription(raw: unknown) {
  if (typeof raw === 'string') {
    return JSON.parse(raw)
  }
  return raw
}

async function getLatestSubscriptionForUser(userId: string | undefined) {
  let query = supabase
    .from('push_subscriptions')
    .select('id, subscription')
    .order('id', { ascending: false })
    .limit(5)

  if (userId) {
    query = query.eq('user_id', userId)
  }

  const { data, error } = await query
  if (error) throw error

  const seenEndpoints = new Set<string>()
  for (const row of data ?? []) {
    try {
      const subscription = parseSubscription(row.subscription)
      const endpoint =
        typeof subscription?.endpoint === 'string' ? subscription.endpoint : ''
      if (!endpoint || seenEndpoints.has(endpoint)) continue
      seenEndpoints.add(endpoint)
      return { subscription, endpoint, rowId: row.id }
    } catch {
      continue
    }
  }

  return null
}

async function sendPushToUser(
  userId: string | undefined,
  title: string,
  body: string,
  notificationTag?: string,
) {
  const latest = await getLatestSubscriptionForUser(userId)
  if (!latest) {
    return { sent: 0, errors: ['no_subscription'], deviceCount: 0 }
  }

  const payload = JSON.stringify({
    title,
    body,
    tag: notificationTag ?? `betterme-${userId ?? 'anon'}`,
  })

  try {
    await webpush.sendNotification(latest.subscription, payload)
    return { sent: 1, errors: [] as string[], deviceCount: 1 }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('webpush error:', msg)
    return { sent: 0, errors: [msg], deviceCount: 1 }
  }
}

async function deletePendingScheduledDuplicates(
  userId: string,
  scheduledAt: string,
  kind: string,
  eventId?: string | null,
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

async function runCronJob() {
  const { data: lockAcquired, error: lockErr } = await supabase.rpc(
    'try_notification_cron_lock',
  )
  if (lockErr) throw lockErr
  if (!lockAcquired) {
    return {
      skipped: true,
      reason: 'cron_already_running',
      heureParis: getParisTimeHHMM(),
      dateParis: getParisDateISO(),
      scheduledSent: 0,
      dailySent: 0,
      rappelsMatched: 0,
    }
  }

  try {
    return await runCronJobLocked()
  } finally {
    await supabase.rpc('release_notification_cron_lock')
  }
}

async function runCronJobLocked() {
  const maintenant = new Date().toISOString()
  const heureParis = getParisTimeHHMM()
  const dateParis = getParisDateISO()
  let scheduledSent = 0
  let dailySent = 0

  const { data: claimedRows, error: schedErr } = await supabase.rpc(
    'claim_due_scheduled_notifications',
    { p_now: maintenant },
  )

  if (schedErr) throw schedErr

  for (const row of claimedRows ?? []) {
    const pushBody = pushBodyFromStored(row.body, row.kind)
    const { sent } = await sendPushToUser(
      row.user_id,
      row.title,
      pushBody,
      `scheduled-${row.id}`,
    )

    if (sent > 0) {
      scheduledSent++
      await supabase.from('scheduled_notifications').delete().eq('id', row.id)
    } else {
      await supabase.from('scheduled_notifications').update({ sent: false }).eq('id', row.id)
    }
  }

  const { data: allRappels, error: rappelErr } = await supabase
    .from('daily_reminders')
    .select('*')

  if (rappelErr) throw rappelErr

  const rappelsDue = (allRappels ?? []).filter((r: any) => {
    const sameTime = normalizeTime(r.reminder_time) === heureParis
    const notSentToday = r.last_sent_on !== dateParis
    return sameTime && notSentToday
  })

  for (const rappel of rappelsDue) {
    // Claim atomique : évite double envoi si le cron est déclenché en parallèle
    const { data: claimedDaily, error: claimDailyErr } = await supabase
      .from('daily_reminders')
      .update({ last_sent_on: dateParis })
      .eq('id', rappel.id)
      .neq('last_sent_on', dateParis)
      .select('id, user_id, title, body')

    if (claimDailyErr) throw claimDailyErr
    if (!claimedDaily?.length) continue

    const claimed = claimedDaily[0]
    const { sent } = await sendPushToUser(
      claimed.user_id,
      claimed.title,
      claimed.body,
      `daily-${claimed.id}-${dateParis}`,
    )
    if (sent > 0) {
      dailySent++
    } else {
      // Aucun device : on ré-autorise l'envoi (sinon le rappel serait "consommé" pour la journée)
      await supabase.from('daily_reminders').update({ last_sent_on: null }).eq('id', claimed.id)
    }
  }

  return {
    heureParis,
    dateParis,
    scheduledSent,
    dailySent,
    rappelsMatched: rappelsDue.length,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const { type, userId, title, body, scheduledAt, heureRappel, eventId, kind } =
      await req.json()

    if (type === 'manuel') {
      const result = await sendPushToUser(userId, title, body)
      if (result.sent === 0) {
        return jsonResponse(
          {
            error: 'Aucune notification envoyée',
            deviceCount: result.deviceCount,
            details: result.errors,
          },
          404,
        )
      }
      return jsonResponse({ success: true, ...result })
    }

    if (type === 'activite' || type === 'timer' || type === 'ponctuel') {
      const rowKind =
        typeof kind === 'string' && kind.trim()
          ? kind.trim()
          : type === 'timer'
            ? 'timer'
            : 'ponctuel'

      if (rowKind === 'timer_start') {
        if (eventId) {
          await supabase
            .from('scheduled_notifications')
            .delete()
            .eq('event_id', eventId)
            .eq('sent', false)
            .eq('kind', 'timer_start')

          await supabase
            .from('scheduled_notifications')
            .delete()
            .eq('event_id', eventId)
            .eq('sent', false)
            .like('body', "C'est parti ! Timer de%")
        } else if (userId) {
          await supabase
            .from('scheduled_notifications')
            .delete()
            .eq('user_id', userId)
            .is('event_id', null)
            .eq('sent', false)
            .eq('kind', 'timer_start')

          await supabase
            .from('scheduled_notifications')
            .delete()
            .eq('user_id', userId)
            .is('event_id', null)
            .eq('sent', false)
            .like('body', "C'est parti ! Timer de%")
        }
      }

      if (rowKind === 'timer') {
        if (eventId) {
          await supabase
            .from('scheduled_notifications')
            .delete()
            .eq('event_id', eventId)
            .eq('sent', false)
            .eq('kind', 'timer')

          await supabase
            .from('scheduled_notifications')
            .delete()
            .eq('event_id', eventId)
            .eq('sent', false)
            .like('body', '%timer est terminé%')
        } else if (userId) {
          await supabase
            .from('scheduled_notifications')
            .delete()
            .eq('user_id', userId)
            .is('event_id', null)
            .eq('sent', false)
            .eq('kind', 'timer')
        }
      }

      await deletePendingScheduledDuplicates(userId, scheduledAt, rowKind, eventId ?? null)

      const row: Record<string, unknown> = {
        user_id: userId,
        title,
        body,
        scheduled_at: scheduledAt,
        kind: rowKind,
      }
      if (eventId) {
        row.event_id = eventId
      }
      await supabase.from('scheduled_notifications').insert(row)
      return jsonResponse({ success: true })
    }

    if (type === 'quotidien') {
      const { data: existing } = await supabase
        .from('daily_reminders')
        .select('id')
        .eq('user_id', userId)
        .eq('reminder_time', heureRappel)
        .maybeSingle()

      if (!existing) {
        await supabase.from('daily_reminders').insert({
          user_id: userId,
          title,
          body,
          reminder_time: heureRappel,
        })
      } else {
        await supabase
          .from('daily_reminders')
          .update({ title, body })
          .eq('id', existing.id)
      }
      return jsonResponse({ success: true })
    }

    if (type === 'cron') {
      const stats = await runCronJob()
      return jsonResponse({ success: true, ...stats })
    }

    return jsonResponse({ error: 'Type inconnu' }, 400)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('send-notification:', message)
    return jsonResponse({ error: message }, 500)
  }
})
