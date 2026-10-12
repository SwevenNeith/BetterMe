/**
 * Planification push multi-appareils pour les fins de cooldown LoL.
 * Fonctionne même si la page Partie n’est pas ouverte sur l’appareil destinataire
 * (abonnement push + catégorie « lol_match » + cron / envoi immédiat).
 */

import { supabase, supabaseAnonKey, supabaseUrl } from '../../lib/supabase.js'
import { LOL_MATCH_COOLDOWN_KIND_PREFIX } from '../../constants/jeux/lolMatchTrackerConfig.js'
import { resolveSessionUser } from '../../utils/auth/sessionUser.js'

const EDGE_FUNCTION_URL = `${supabaseUrl}/functions/v1/send-notification`

function kindForTag(tag) {
  return `${LOL_MATCH_COOLDOWN_KIND_PREFIX}${String(tag || '').trim()}`
}

export async function resolveLolMatchUserId() {
  const user = await resolveSessionUser()
  return user?.id ?? null
}

async function getEdgeHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token ?? supabaseAnonKey
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    apikey: supabaseAnonKey,
  }
}

/**
 * Réglage compte (settings.lol_match_notifications_enabled).
 * true par défaut si colonne absente / null.
 */
export async function isLolMatchNotificationsEnabled(userId = null) {
  const uid = userId ?? (await resolveLolMatchUserId())
  if (!uid) return false
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('lol_match_notifications_enabled')
      .eq('user_id', uid)
      .maybeSingle()

    if (error) {
      // Colonne absente → on laisse passer (compat avant migration)
      if (String(error.message || '').includes('lol_match_notifications_enabled')) {
        return true
      }
      console.warn('lol match settings', error)
      return true
    }
    if (data == null || data.lol_match_notifications_enabled == null) return true
    return data.lol_match_notifications_enabled !== false
  } catch (err) {
    console.warn('lol match settings', err)
    return true
  }
}

/**
 * Remplace la notification pending pour ce tag (adjust / restart).
 * Le cron send-notification l’enverra à l’heure prévue sur tous les appareils
 * ayant la catégorie « League of Legends (partie) ».
 * @param {{ tag: string, title: string, body: string, endsAtMs: number, userId?: string | null }} opts
 */
export async function scheduleLolMatchCooldownNotification(opts) {
  const tag = String(opts?.tag || '').trim()
  if (!tag || !Number.isFinite(opts?.endsAtMs)) return false

  const userId = opts.userId ?? (await resolveLolMatchUserId())
  if (!userId) return false

  if (!(await isLolMatchNotificationsEnabled(userId))) return false

  const kind = kindForTag(tag)
  const scheduledAt = new Date(Math.max(Date.now(), Number(opts.endsAtMs))).toISOString()
  const title = String(opts.title || 'Partie LoL').trim() || 'Partie LoL'
  const body = String(opts.body || '').trim() || 'Cooldown disponible'

  await supabase
    .from('scheduled_notifications')
    .delete()
    .eq('user_id', userId)
    .eq('sent', false)
    .eq('kind', kind)

  const { error } = await supabase.from('scheduled_notifications').insert({
    user_id: userId,
    event_id: null,
    title,
    body,
    scheduled_at: scheduledAt,
    kind,
    sent: false,
  })

  if (error) {
    console.warn('lol match cooldown schedule', error)
    return false
  }
  return true
}

/**
 * Envoi push immédiat (Edge) filtré par catégorie lol_match.
 * Utile quand la page de suivi est encore ouverte au moment du CD.
 */
export async function pushLolMatchCooldownNow(opts = {}) {
  const userId = opts.userId ?? (await resolveLolMatchUserId())
  if (!userId) return false
  if (!(await isLolMatchNotificationsEnabled(userId))) return false

  try {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: await getEdgeHeaders(),
      body: JSON.stringify({
        type: 'manuel',
        userId,
        title: String(opts.title || 'Partie LoL').trim() || 'Partie LoL',
        body: String(opts.body || '').trim() || 'Cooldown disponible',
        kind: 'lol_match_cooldown',
        tag: opts.tag ? `lol-match-${opts.tag}` : 'lol-match',
      }),
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      console.warn('lol match push now', response.status, text)
      return false
    }
    return true
  } catch (err) {
    console.warn('lol match push now', err)
    return false
  }
}

/** @param {string} tag */
export async function cancelLolMatchCooldownNotification(tag, userId = null) {
  const clean = String(tag || '').trim()
  if (!clean) return
  const uid = userId ?? (await resolveLolMatchUserId())
  if (!uid) return

  const { error } = await supabase
    .from('scheduled_notifications')
    .delete()
    .eq('user_id', uid)
    .eq('sent', false)
    .eq('kind', kindForTag(clean))

  if (error) console.warn('lol match cooldown cancel', error)
}

/** Annule toutes les notifs de cooldown pending de l’utilisateur. */
export async function cancelAllLolMatchCooldownNotifications(userId = null) {
  const uid = userId ?? (await resolveLolMatchUserId())
  if (!uid) return

  const { error } = await supabase
    .from('scheduled_notifications')
    .delete()
    .eq('user_id', uid)
    .eq('sent', false)
    .like('kind', `${LOL_MATCH_COOLDOWN_KIND_PREFIX}%`)

  if (error) console.warn('lol match cooldown cancel all', error)
}
