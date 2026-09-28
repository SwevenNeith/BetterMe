/**
 * Transactions finances (montants) — par compte.
 * account_id NULL = compte courant.
 */

const TABLE = 'finance_transactions'

export const TX_TYPES = {
  INCOME: 'income',
  FIXED: 'fixed_expense',
  VARIABLE: 'variable_expense',
}

export const TX_TYPE_LABELS = {
  income: 'Revenu',
  fixed_expense: 'Dépense fixe',
  variable_expense: 'Dépense variable',
}

const SELECT =
  'id, user_id, occurred_on, tx_type, category, detail, amount, applied, account_id, created_at, updated_at'

function mapRow(row) {
  if (!row) return null
  return {
    ...row,
    amount: Number(row.amount) || 0,
    applied: Boolean(row.applied),
    account_id: row.account_id || null,
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listFinanceTransactions(supabase, userId) {
  if (!userId) return []
  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT)
    .eq('user_id', userId)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map(mapRow)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ occurredOn: string, txType: string, category: string, detail?: string, amount: number, applied?: boolean, accountId?: string|null }} payload
 */
export async function createFinanceTransaction(supabase, userId, payload) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  const amount = Number(payload.amount)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Montant invalide.')

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      occurred_on: payload.occurredOn,
      tx_type: payload.txType,
      category: String(payload.category || '').trim(),
      detail: String(payload.detail || '').trim(),
      amount: Math.round(amount * 100) / 100,
      applied: Boolean(payload.applied),
      account_id: payload.accountId || null,
    })
    .select(SELECT)
    .single()

  if (error) throw error
  return mapRow(data)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} id
 * @param {Partial<{ occurredOn: string, txType: string, category: string, detail: string, amount: number, applied: boolean, accountId: string|null }>} patch
 */
export async function updateFinanceTransaction(supabase, userId, id, patch) {
  if (!userId || !id) throw new Error('Paramètres manquants.')
  const row = { updated_at: new Date().toISOString() }
  if (patch.occurredOn != null) row.occurred_on = patch.occurredOn
  if (patch.txType != null) row.tx_type = patch.txType
  if (patch.category != null) row.category = String(patch.category).trim()
  if (patch.detail != null) row.detail = String(patch.detail).trim()
  if (patch.amount != null) {
    const amount = Number(patch.amount)
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Montant invalide.')
    row.amount = Math.round(amount * 100) / 100
  }
  if (patch.applied != null) row.applied = Boolean(patch.applied)
  if (patch.accountId !== undefined) row.account_id = patch.accountId || null

  const { data, error } = await supabase
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .eq('user_id', userId)
    .select(SELECT)
    .single()

  if (error) throw error
  return mapRow(data)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} id
 */
export async function deleteFinanceTransaction(supabase, userId, id) {
  if (!userId || !id) throw new Error('Paramètres manquants.')
  const { error } = await supabase.from(TABLE).delete().eq('id', id).eq('user_id', userId)
  if (error) throw error
}
