import { getLocalTodayISO } from './scheduledReminders.js'

const TABLE = 'reconfort'

function normalizeReconfortPayload(payload) {
  const qui = (payload.who || '').trim()
  const message = (payload.message || '').trim()
  const conditions = Array.isArray(payload.conditions)
    ? payload.conditions.filter((id) => typeof id === 'string' && id.length > 0)
    : []

  if (!qui) {
    throw new Error('Indique qui tu es.')
  }
  if (!message) {
    throw new Error('Indique ton message de réconfort.')
  }
  if (conditions.length < 1) {
    throw new Error('Sélectionne au moins une condition.')
  }

  return { qui, message, conditions }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listReconfortMessages(supabase, userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, user_id, qui, message, conditions, last_sent, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ who: string, message: string, conditions: string[] }} payload
 */
export async function createReconfortMessage(supabase, userId, payload) {
  if (!userId) {
    throw new Error('Utilisateur non connecté.')
  }

  const { qui, message, conditions } = normalizeReconfortPayload(payload)

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      qui,
      message,
      conditions,
    })
    .select('id, user_id, qui, message, conditions, last_sent, created_at, updated_at')
    .single()

  if (error) throw error
  if (!data?.id) {
    throw new Error(
      'INSERT reconfort : aucune ligne créée (vérifie la policy RLS INSERT).',
    )
  }

  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} messageId
 * @param {{ who: string, message: string, conditions: string[] }} payload
 */
export async function updateReconfortMessage(supabase, userId, messageId, payload) {
  if (!userId) {
    throw new Error('Utilisateur non connecté.')
  }
  if (!messageId) {
    throw new Error('Message introuvable.')
  }

  const { qui, message, conditions } = normalizeReconfortPayload(payload)

  const { data, error } = await supabase
    .from(TABLE)
    .update({
      qui,
      message,
      conditions,
    })
    .eq('id', messageId)
    .eq('user_id', userId)
    .select('id, user_id, qui, message, conditions, last_sent, created_at, updated_at')
    .single()

  if (error) throw error
  if (!data?.id) {
    throw new Error(
      'UPDATE reconfort : aucune ligne mise à jour (vérifie la policy RLS UPDATE).',
    )
  }

  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} messageId
 */
export async function deleteReconfortMessage(supabase, userId, messageId) {
  if (!userId) {
    throw new Error('Utilisateur non connecté.')
  }
  if (!messageId) {
    throw new Error('Message introuvable.')
  }

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', messageId)
    .eq('user_id', userId)

  if (error) throw error
}

/**
 * Marque un message comme envoyé à la date indiquée (par défaut : aujourd'hui).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ messageId?: string, title?: string, body?: string, sentDateISO?: string }} params
 */
export async function markReconfortMessageSent(supabase, userId, params = {}) {
  if (!userId) return

  const sentDate = (params.sentDateISO || getLocalTodayISO()).slice(0, 10)
  const patch = { last_sent: sentDate }

  if (params.messageId) {
    const { error } = await supabase
      .from(TABLE)
      .update(patch)
      .eq('id', params.messageId)
      .eq('user_id', userId)

    if (error) throw error
    return
  }

  const title = (params.title || '').trim()
  const body = (params.body || '').trim()
  if (!title || !body) return

  const { error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('user_id', userId)
    .eq('qui', title)
    .eq('message', body)

  if (error) throw error
}
