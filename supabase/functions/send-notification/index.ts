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

function getParisNow() {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
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
    dateISO: `${parts.year}-${parts.month}-${parts.day}`,
    timeHHmm: normalizeTimeHHmm(`${parts.hour}:${parts.minute}`),
  }
}

function parisDateTimeToUtcISO(dateISO: string, timeHHmm: string): string {
  const [targetYear, targetMonth, targetDay] = dateISO.split('-').map(Number)
  const [targetHour, targetMinute] = normalizeTimeHHmm(timeHHmm).split(':').map(Number)

  let utcMs = Date.UTC(targetYear, targetMonth - 1, targetDay, targetHour, targetMinute)

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
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
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + delta)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
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

async function ensureTodoPromesseReminders(parisNow: { dateISO: string; timeHHmm: string }) {
  const { data: settingsRows, error: settingsError } = await supabase
    .from('settings')
    .select('user_id, todo_promesse_reminder_enabled, todo_promesse_reminder_time, page_visibility')
    .eq('todo_promesse_reminder_enabled', true)

  if (settingsError) {
    console.error('Erreur récupération réglages promesses TODO :', settingsError)
    return
  }

  const tomorrowISO = addDaysISO(parisNow.dateISO, 1)
  const dayStartISO = parisDateTimeToUtcISO(parisNow.dateISO, '00:00')
  const dayEndISO = parisDateTimeToUtcISO(parisNow.dateISO, '23:59')
  const nowMs = Date.now()

  for (const row of settingsRows ?? []) {
    const userId = row.user_id
    if (!userId) continue

    const reminderTime = normalizeTimeHHmm(row.todo_promesse_reminder_time)
    const scheduledAtISO = parisDateTimeToUtcISO(parisNow.dateISO, reminderTime)
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

    const whenISO =
      scheduledMs > nowMs ? scheduledAtISO : new Date().toISOString()
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
      console.log('Rappel promesses TODO planifié pour', userId, whenISO)
    }
  }
}

function subscriptionsForUser(
  subscriptions: Array<{ user_id?: string | null; subscription: unknown }>,
  userId: string | null | undefined,
) {
  if (!userId) return subscriptions
  return subscriptions.filter((row) => row.user_id === userId)
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
      .select('user_id, subscription')

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

      const parisNow = getParisNow()
      console.log('Heure Paris :', parisNow.timeHHmm)
      await ensureTodoPromesseReminders(parisNow)

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
        const targets = subscriptionsForUser(subscriptions ?? [], notif.user_id)
        if (!targets.length) {
          console.log('Aucune subscription pour', notif.user_id ?? 'tous')
        }

        for (const row of targets) {
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
