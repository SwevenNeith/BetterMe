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

/**
 * Supprime plusieurs transactions (ex. toutes les occurrences d’une dépense fixe).
 * Par lots pour éviter les limites de taille de requête (sinon les mois les plus
 * anciens, en fin de liste, peuvent ne pas être supprimés).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string[]} ids
 */
export async function deleteFinanceTransactions(supabase, userId, ids) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  const uniqueIds = [...new Set((ids ?? []).map((id) => String(id || '').trim()).filter(Boolean))]
  if (!uniqueIds.length) return

  const CHUNK = 80
  for (let i = 0; i < uniqueIds.length; i += CHUNK) {
    const chunk = uniqueIds.slice(i, i + CHUNK)
    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq('user_id', userId)
      .in('id', chunk)
    if (error) throw error
  }
}

/**
 * Supprime une dépense fixe à partir d’un mois (ce mois + suivants).
 * Les mois strictement antérieurs sont conservés.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ tx_type?: string, category?: string, detail?: string, account_id?: string|null }} templateTx
 * @param {number} fromYear
 * @param {number} fromMonth 1-12
 */
export async function deleteFixedExpenseSeriesFromMonth(
  supabase,
  userId,
  templateTx,
  fromYear,
  fromMonth,
) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  if (!templateTx || templateTx.tx_type !== TX_TYPES.FIXED) {
    throw new Error('Dépense fixe invalide.')
  }
  const y = Number(fromYear)
  const m = Number(fromMonth)
  if (!y || m < 1 || m > 12) throw new Error('Mois de départ invalide.')

  const category = String(templateTx.category || '').trim()
  const detail = String(templateTx.detail || '').trim()
  if (!category) throw new Error('Catégorie manquante pour la série.')

  const fromIso = `${y}-${String(m).padStart(2, '0')}-01`

  let query = supabase
    .from(TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('tx_type', TX_TYPES.FIXED)
    .eq('category', category)
    .eq('detail', detail)
    .gte('occurred_on', fromIso)

  if (templateTx.account_id) {
    query = query.eq('account_id', templateTx.account_id)
  } else {
    query = query.is('account_id', null)
  }

  const { error } = await query
  if (error) throw error
}
