/**
 * Persistance Supabase pour l’assistant Poro (conversations, messages, mémoires).
 */

const CONV_TABLE = 'lol_poro_conversations'
const MSG_TABLE = 'lol_poro_messages'
const MEM_TABLE = 'lol_poro_memories'

const CONV_COLUMNS = 'id, user_id, title, created_at, updated_at'
const MSG_COLUMNS = 'id, user_id, conversation_id, role, content, meta, created_at'
const MEM_COLUMNS = 'id, user_id, kind, label, value, source_message_id, created_at, updated_at'

/**
 * @param {import('@supabase/supabase-js').PostgrestError | null | undefined} error
 */
function isMissingTableError(error) {
  if (!error) return false
  const msg = String(error.message || '')
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    msg.includes('lol_poro_') ||
    msg.includes('schema cache')
  )
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ title?: string }} [opts]
 */
export async function createPoroConversation(supabase, userId, opts = {}) {
  const title = String(opts.title ?? 'Discussion avec Poro').trim().slice(0, 120) || 'Discussion avec Poro'
  const { data, error } = await supabase
    .from(CONV_TABLE)
    .insert({ user_id: userId, title })
    .select(CONV_COLUMNS)
    .single()

  if (error) {
    if (isMissingTableError(error)) {
      throw new Error(
        'Tables Poro introuvables. Exécute scripts/create-lol-poro.sql dans Supabase.',
      )
    }
    throw error
  }
  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listPoroConversations(supabase, userId) {
  const { data, error } = await supabase
    .from(CONV_TABLE)
    .select(CONV_COLUMNS)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(30)

  if (error) {
    if (isMissingTableError(error)) return []
    throw error
  }
  return data ?? []
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} conversationId
 */
export async function listPoroMessages(supabase, userId, conversationId) {
  const { data, error } = await supabase
    .from(MSG_TABLE)
    .select(MSG_COLUMNS)
    .eq('user_id', userId)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) {
    if (isMissingTableError(error)) return []
    throw error
  }
  return data ?? []
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} conversationId
 * @param {{ role: 'user'|'assistant'|'system', content: string, meta?: object }} payload
 */
export async function appendPoroMessage(supabase, userId, conversationId, payload) {
  const content = String(payload.content ?? '').trim()
  if (!content) throw new Error('Message vide.')

  const { data, error } = await supabase
    .from(MSG_TABLE)
    .insert({
      user_id: userId,
      conversation_id: conversationId,
      role: payload.role,
      content: content.slice(0, 8000),
      meta: payload.meta && typeof payload.meta === 'object' ? payload.meta : {},
    })
    .select(MSG_COLUMNS)
    .single()

  if (error) {
    if (isMissingTableError(error)) {
      throw new Error(
        'Tables Poro introuvables. Exécute scripts/create-lol-poro.sql dans Supabase.',
      )
    }
    throw error
  }

  await supabase
    .from(CONV_TABLE)
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('user_id', userId)

  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listPoroMemories(supabase, userId) {
  const { data, error } = await supabase
    .from(MEM_TABLE)
    .select(MEM_COLUMNS)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50)

  if (error) {
    if (isMissingTableError(error)) return []
    throw error
  }
  return data ?? []
}

/**
 * Upsert par (user_id, label).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ kind: string, label: string, value: string, source_message_id?: string | null }} memory
 */
export async function upsertPoroMemory(supabase, userId, memory) {
  const label = String(memory.label ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 80)
  const value = String(memory.value ?? '').trim().slice(0, 500)
  if (!label || !value) throw new Error('Mémoire invalide.')

  const { data, error } = await supabase
    .from(MEM_TABLE)
    .upsert(
      {
        user_id: userId,
        kind: memory.kind || 'note',
        label,
        value,
        source_message_id: memory.source_message_id || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,label' },
    )
    .select(MEM_COLUMNS)
    .single()

  if (error) {
    if (isMissingTableError(error)) {
      throw new Error(
        'Tables Poro introuvables. Exécute scripts/create-lol-poro.sql dans Supabase.',
      )
    }
    throw error
  }
  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} conversationId
 * @param {string} title
 */
export async function updatePoroConversationTitle(supabase, userId, conversationId, title) {
  const clean = String(title ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 120)
  if (!clean) return null
  const { data, error } = await supabase
    .from(CONV_TABLE)
    .update({ title: clean, updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('user_id', userId)
    .select(CONV_COLUMNS)
    .single()
  if (error) throw error
  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} conversationId
 */
export async function deletePoroConversation(supabase, userId, conversationId) {
  const { error } = await supabase
    .from(CONV_TABLE)
    .delete()
    .eq('id', conversationId)
    .eq('user_id', userId)
  if (error) throw error
}
