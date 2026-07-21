const TABLE = 'journal_prompts'
const PROMPT_SELECT = 'id, user_id, prompt_text, created_at'

function normalizePrompt(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    prompt_text: row.prompt_text ?? '',
    created_at: row.created_at ?? null,
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listJournalPrompts(supabase, userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select(PROMPT_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []).map(normalizePrompt)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listJournalPromptsWithUsage(supabase, userId) {
  const [prompts, entriesResult] = await Promise.all([
    listJournalPrompts(supabase, userId),
    supabase
      .from('journal_entries')
      .select('prompt_id')
      .eq('user_id', userId)
      .not('prompt_id', 'is', null),
  ])

  if (entriesResult.error) throw entriesResult.error

  const usedPromptIds = new Set((entriesResult.data ?? []).map((row) => row.prompt_id).filter(Boolean))

  return prompts.map((prompt) => ({
    ...prompt,
    isDone: usedPromptIds.has(prompt.id),
  }))
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} promptText
 */
export async function createJournalPrompt(supabase, userId, promptText) {
  const text = String(promptText ?? '').trim()
  if (!text) throw new Error('Le texte de la prompt est obligatoire.')

  const { data, error } = await supabase
    .from(TABLE)
    .insert({ user_id: userId, prompt_text: text })
    .select(PROMPT_SELECT)
    .single()

  if (error) throw error
  return normalizePrompt(data)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function getRandomPendingJournalPrompt(supabase, userId) {
  const prompts = await listJournalPromptsWithUsage(supabase, userId)
  if (!prompts.length) return null

  const pending = prompts.filter((prompt) => !prompt.isDone)
  const pool = pending.length ? pending : prompts
  const index = Math.floor(Math.random() * pool.length)
  return pool[index] ?? null
}
