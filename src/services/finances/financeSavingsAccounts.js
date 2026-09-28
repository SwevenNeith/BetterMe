/**
 * Comptes d’épargne (suivi comme le compte courant).
 */

const TABLE = 'finance_savings_accounts'
const SELECT = 'id, user_id, name, opening_balance, sort_order, created_at, updated_at'

export const SUGGESTED_SAVINGS_NAMES = [
  'Livret A',
  'PEL',
  'CEL',
  'LDDS',
  'Livret Jeune',
  'Compte épargne',
]

function mapRow(row) {
  if (!row) return null
  return {
    ...row,
    opening_balance: Number(row.opening_balance) || 0,
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listSavingsAccounts(supabase, userId) {
  if (!userId) return []
  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT)
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []).map(mapRow)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ name: string, openingBalance?: number }} payload
 */
export async function createSavingsAccount(supabase, userId, payload) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  const name = String(payload.name || '').trim()
  if (!name) throw new Error('Le nom du compte est obligatoire.')
  const opening = Number(payload.openingBalance ?? 0)
  if (!Number.isFinite(opening)) throw new Error('Solde initial invalide.')

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      name,
      opening_balance: Math.round(opening * 100) / 100,
      sort_order: 100,
    })
    .select(SELECT)
    .single()

  if (error) {
    if (
      String(error.code || '') === '23505' ||
      String(error.message || '').toLowerCase().includes('duplicate')
    ) {
      throw new Error('Ce compte existe déjà.')
    }
    throw error
  }
  return mapRow(data)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} id
 * @param {Partial<{ name: string, openingBalance: number }>} patch
 */
export async function updateSavingsAccount(supabase, userId, id, patch) {
  if (!userId || !id) throw new Error('Paramètres manquants.')
  const row = { updated_at: new Date().toISOString() }
  if (patch.name != null) {
    const name = String(patch.name).trim()
    if (!name) throw new Error('Le nom du compte est obligatoire.')
    row.name = name
  }
  if (patch.openingBalance != null) {
    const opening = Number(patch.openingBalance)
    if (!Number.isFinite(opening)) throw new Error('Solde initial invalide.')
    row.opening_balance = Math.round(opening * 100) / 100
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .eq('user_id', userId)
    .select(SELECT)
    .single()

  if (error) {
    if (
      String(error.code || '') === '23505' ||
      String(error.message || '').toLowerCase().includes('duplicate')
    ) {
      throw new Error('Ce compte existe déjà.')
    }
    throw error
  }
  return mapRow(data)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} id
 */
export async function deleteSavingsAccount(supabase, userId, id) {
  if (!userId || !id) throw new Error('Paramètres manquants.')
  const { error } = await supabase.from(TABLE).delete().eq('id', id).eq('user_id', userId)
  if (error) throw error
}
