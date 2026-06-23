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

Deno.serve(async (req) => {
  // Répond aux requêtes preflight OPTIONS du navigateur
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    console.log('Body reçu :', JSON.stringify(body))

    const { type, title, body: msgBody, scheduledAt, heureRappel } = body

    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('subscription')

    if (error) {
      console.error('Erreur récupération subscriptions :', error)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: corsHeaders,
      })
    }

    console.log('Subscriptions trouvées :', subscriptions?.length ?? 0)

    const payload = JSON.stringify({ title, body: msgBody })

    if (type === 'manuel') {
      // Envoie immédiatement à tous les appareils
      for (const row of subscriptions) {
        try {
          await webpush.sendNotification(row.subscription, payload)
          console.log('Notification envoyée avec succès')
        } catch (e) {
          console.error('Erreur envoi notification :', e)
        }
      }
    } else if (type === 'activite' || type === 'timer') {
      // Stocke la notification planifiée, le cron l'enverra au bon moment
      const { error: insertError } = await supabase
        .from('scheduled_notifications')
        .insert({ title, body: msgBody, scheduled_at: scheduledAt })

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

      for (const notif of notificationsAEnvoyer ?? []) {
        for (const row of subscriptions) {
          try {
            await webpush.sendNotification(
              row.subscription,
              JSON.stringify({
                title: notif.title,
                body: notif.body,
              }),
            )
            console.log('Notification planifiée envoyée :', notif.id)
          } catch (e) {
            console.error('Erreur envoi notification planifiée :', e)
          }
        }

        // Marque comme envoyée pour ne pas renvoyer
        await supabase.from('scheduled_notifications').update({ sent: true }).eq('id', notif.id)

        if (notif.kind === 'reconfort' && notif.user_id) {
          const sentDate =
            notif.scheduled_at != null
              ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(
                  new Date(notif.scheduled_at),
                )
              : maintenant.slice(0, 10)

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
            const title = (notif.title || '').trim()
            const body = (notif.body || '').trim()
            const { data: rows, error: listError } = await supabase
              .from('reconfort')
              .select('id, qui, message, last_sent')
              .eq('user_id', notif.user_id)

            if (listError) {
              console.error('Lecture reconfort pour last_sent :', listError)
            } else {
              const match = (rows ?? []).find(
                (row) =>
                  (row.qui || '').trim() === title &&
                  (row.message || '').trim() === body &&
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

      // Vérifie les rappels quotidiens
      const heureActuelle = new Date().toTimeString().slice(0, 5)
      console.log('Heure actuelle pour rappels :', heureActuelle)

      const { data: rappels, error: rappelError } = await supabase
        .from('daily_reminders')
        .select('*')
        .eq('reminder_time', heureActuelle)

      if (rappelError) {
        console.error('Erreur récupération rappels :', rappelError)
      } else {
        console.log('Rappels quotidiens trouvés :', rappels?.length ?? 0)
      }

      for (const rappel of rappels ?? []) {
        for (const row of subscriptions) {
          try {
            await webpush.sendNotification(
              row.subscription,
              JSON.stringify({
                title: rappel.title,
                body: rappel.body,
              }),
            )
            console.log('Rappel quotidien envoyé')
          } catch (e) {
            console.error('Erreur envoi rappel :', e)
          }
        }
      }
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
