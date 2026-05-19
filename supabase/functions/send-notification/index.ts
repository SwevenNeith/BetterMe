import webpush from 'npm:web-push'
import { createClient } from 'npm:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

async function getSubscriptionsForUser(userId: string | undefined) {
  let query = supabase.from('push_subscriptions').select('subscription')
  if (userId) {
    query = query.eq('user_id', userId)
  }
  const { data, error } = await query
  if (error) throw error
  return data ?? []
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
      const rows = await getSubscriptionsForUser(userId)
      const payload = JSON.stringify({ title, body })
      for (const row of rows) {
        await webpush.sendNotification(row.subscription, payload)
      }
    } else if (type === 'activite' || type === 'timer') {
      await supabase.from('scheduled_notifications').insert({
        user_id: userId,
        title,
        body,
        scheduled_at: scheduledAt,
      })
    } else if (type === 'quotidien') {
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
    } else if (type === 'cron') {
      const maintenant = new Date().toISOString()

      const { data: notificationsAEnvoyer } = await supabase
        .from('scheduled_notifications')
        .select('*')
        .lte('scheduled_at', maintenant)
        .eq('sent', false)

      for (const notif of notificationsAEnvoyer ?? []) {
        const rows = await getSubscriptionsForUser(notif.user_id)
        for (const row of rows) {
          await webpush.sendNotification(
            row.subscription,
            JSON.stringify({
              title: notif.title,
              body: notif.body,
            }),
          )
        }

        await supabase.from('scheduled_notifications').update({ sent: true }).eq('id', notif.id)
      }

      const heureActuelle = new Date().toTimeString().slice(0, 5)

      const { data: rappels } = await supabase
        .from('daily_reminders')
        .select('*')
        .eq('reminder_time', heureActuelle)

      for (const rappel of rappels ?? []) {
        const rows = await getSubscriptionsForUser(rappel.user_id)
        for (const row of rows) {
          await webpush.sendNotification(
            row.subscription,
            JSON.stringify({
              title: rappel.title,
              body: rappel.body,
            }),
          )
        }
      }
    }

    return jsonResponse({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return jsonResponse({ error: message }, 500)
  }
})
