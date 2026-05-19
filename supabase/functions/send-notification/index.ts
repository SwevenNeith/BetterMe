import webpush from 'npm:web-push'
import { createClient } from 'npm:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TIMEZONE = 'Europe/Paris'

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

async function getSubscriptionsForUser(userId: string | undefined) {
  let query = supabase.from('push_subscriptions').select('subscription')
  if (userId) {
    query = query.eq('user_id', userId)
  }
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

async function sendPushToUser(
  userId: string | undefined,
  title: string,
  body: string,
) {
  const rows = await getSubscriptionsForUser(userId)
  const payload = JSON.stringify({ title, body })
  let sent = 0
  const errors: string[] = []

  for (const row of rows) {
    try {
      const subscription = parseSubscription(row.subscription)
      await webpush.sendNotification(subscription, payload)
      sent++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(msg)
      console.error('webpush error:', msg)
    }
  }

  return { sent, errors, deviceCount: rows.length }
}

async function runCronJob() {
  const maintenant = new Date().toISOString()
  const heureParis = getParisTimeHHMM()
  const dateParis = getParisDateISO()
  let scheduledSent = 0
  let dailySent = 0

  const { data: notificationsAEnvoyer, error: schedErr } = await supabase
    .from('scheduled_notifications')
    .select('*')
    .lte('scheduled_at', maintenant)
    .eq('sent', false)

  if (schedErr) throw schedErr

  for (const notif of notificationsAEnvoyer ?? []) {
    const { sent } = await sendPushToUser(notif.user_id, notif.title, notif.body)
    if (sent > 0) scheduledSent++
    await supabase.from('scheduled_notifications').update({ sent: true }).eq('id', notif.id)
  }

  const { data: allRappels, error: rappelErr } = await supabase
    .from('daily_reminders')
    .select('*')

  if (rappelErr) throw rappelErr

  const rappelsDue = (allRappels ?? []).filter((r) => {
    const sameTime = normalizeTime(r.reminder_time) === heureParis
    const notSentToday = r.last_sent_on !== dateParis
    return sameTime && notSentToday
  })

  for (const rappel of rappelsDue) {
    const { sent } = await sendPushToUser(rappel.user_id, rappel.title, rappel.body)
    if (sent > 0) {
      dailySent++
      await supabase
        .from('daily_reminders')
        .update({ last_sent_on: dateParis })
        .eq('id', rappel.id)
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const { type, userId, title, body, scheduledAt, heureRappel } = await req.json()

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

    if (type === 'activite' || type === 'timer') {
      await supabase.from('scheduled_notifications').insert({
        user_id: userId,
        title,
        body,
        scheduled_at: scheduledAt,
      })
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
