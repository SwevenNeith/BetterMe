/**
 * Paramètres finances (solde compte courant + arrêts de séries fixes).
 */

import { normalizeFixedSeriesStops } from '../../utils/finances/financeMath.js'

const TABLE = 'finance_settings'

const SELECT_WITH_STOPS =
  'user_id, opening_balance, balance_initialized, fixed_series_stops, updated_at'
const SELECT_LEGACY = 'user_id, opening_balance, balance_initialized, updated_at'

function mapSettings(row) {
  if (!row) return null
  return {
    ...row,
    opening_balance: Number(row.opening_balance) || 0,
    fixed_series_stops: normalizeFixedSeriesStops(row.fixed_series_stops),
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function getOrCreateFinanceSettings(supabase, userId) {
  if (!userId) return null

  let { data, error } = await supabase
    .from(TABLE)
    .select(SELECT_WITH_STOPS)
    .eq('user_id', userId)
    .maybeSingle()

  if (error && String(error.message || '').includes('fixed_series_stops')) {
    ;({ data, error } = await supabase
      .from(TABLE)
      .select(SELECT_LEGACY)
      .eq('user_id', userId)
      .maybeSingle())
  }

  if (error) throw error
  if (data) return mapSettings(data)

  const { data: created, error: insertError } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      opening_balance: 0,
      balance_initialized: false,
    })
    .select(SELECT_LEGACY)
    .single()

  if (insertError) {
    // Course : deux chargements créent la ligne en même temps
    const isDuplicate =
      String(insertError.code || '') === '23505' ||
      String(insertError.message || '').toLowerCase().includes('duplicate')
    if (isDuplicate) {
      const again = await getOrCreateFinanceSettings(supabase, userId)
      if (again) return again
    }
    throw insertError
  }

  return mapSettings(created)
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

  let { data, error } = await supabase
    .from(TABLE)
    .upsert(payload, { onConflict: 'user_id' })
    .select(SELECT_WITH_STOPS)
    .single()

  if (error && String(error.message || '').includes('fixed_series_stops')) {
    ;({ data, error } = await supabase
      .from(TABLE)
      .upsert(payload, { onConflict: 'user_id' })
      .select(SELECT_LEGACY)
      .single())
  }

  if (error) throw error
  return mapSettings(data)
}

/**
 * Enregistre les arrêts de séries de dépenses fixes.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ key: string, from: string }[]} stops
 */
export async function saveFixedSeriesStops(supabase, userId, stops) {
  if (!userId) throw new Error('Utilisateur non connecté.')
  const normalized = normalizeFixedSeriesStops(stops)

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(
      {
        user_id: userId,
        fixed_series_stops: normalized,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select(SELECT_WITH_STOPS)
    .single()

  if (error) {
    if (String(error.message || '').includes('fixed_series_stops')) {
      console.warn(
        'Colonne fixed_series_stops absente : exécute scripts/migrate-finance-fixed-series-stops.sql',
      )
      return normalized
    }
    throw error
  }
  return mapSettings(data).fixed_series_stops
}
