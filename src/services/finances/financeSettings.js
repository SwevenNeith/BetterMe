/**
 * Paramètres finances (solde compte courant).
 */

const TABLE = 'finance_settings'

const SELECT = 'user_id, opening_balance, balance_initialized, updated_at'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function getOrCreateFinanceSettings(supabase, userId) {
  if (!userId) return null

  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (data) {
    return {
      ...data,
      opening_balance: Number(data.opening_balance) || 0,
    }
  }

  const { data: created, error: insertError } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      opening_balance: 0,
      balance_initialized: false,
    })
    .select(SELECT)
    .single()

  if (insertError) {
    // Course : deux chargements créent la ligne en même temps
    const isDuplicate =
      String(insertError.code || '') === '23505' ||
      String(insertError.message || '').toLowerCase().includes('duplicate')
    if (isDuplicate) {
      const { data: existing, error: againError } = await supabase
        .from(TABLE)
        .select(SELECT)
        .eq('user_id', userId)
        .maybeSingle()
      if (againError) throw againError
      if (existing) {
        return {
          ...existing,
          opening_balance: Number(existing.opening_balance) || 0,
        }
      }
    }
    throw insertError
  }

  return {
    ...created,
    opening_balance: Number(created.opening_balance) || 0,
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {number} openingBalance
 */
export async function setOpeningBalance(supabase, userId, openingBalance) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  const amount = Number(openingBalance)
  if (!Number.isFinite(amount)) throw new Error('Solde invalide.')

  const payload = {
    user_id: userId,
    opening_balance: Math.round(amount * 100) / 100,
    balance_initialized: true,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(payload, { onConflict: 'user_id' })
    .select(SELECT)
    .single()

  if (error) throw error
  return {
    ...data,
    opening_balance: Number(data.opening_balance) || 0,
  }
}
