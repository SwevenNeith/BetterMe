/**
 * Persistance des comptes League of Legends (Supabase).
 */

const TABLE = 'lol_accounts'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function listLolAccounts(supabase, userId) {
  if (!userId) return []
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) {
    if (error.code === 'PGRST205' || error.message?.includes(TABLE)) {
      console.warn(
        'Table lol_accounts absente. Exécute scripts/create-lol-accounts.sql dans Supabase.',
      )
      return []
    }
    throw error
  }
  return data ?? []
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{
 *   label?: string,
 *   gameName: string,
 *   tagLine: string,
 *   puuid: string,
 *   platform?: string,
 *   routing?: string,
 *   summonerId?: string | null,
 *   summonerLevel?: number | null,
 *   profileIconId?: number | null,
 *   metadata?: Record<string, unknown>,
 * }} input
 */
export async function upsertLolAccount(supabase, userId, input) {
  if (!userId) throw new Error('Utilisateur non connecté.')

  const gameName = String(input.gameName ?? '').trim()
  const tagLine = String(input.tagLine ?? '')
    .trim()
    .replace(/^#/, '')
  const puuid = String(input.puuid ?? '').trim()
  if (!gameName || !tagLine || !puuid) {
    throw new Error('Compte Riot incomplet (nom, tag, puuid).')
  }

  const now = new Date().toISOString()
  const row = {
    user_id: userId,
    label: String(input.label ?? '').trim(),
    game_name: gameName,
    tag_line: tagLine,
    puuid,
    platform: String(input.platform ?? 'euw1').trim().toLowerCase() || 'euw1',
    routing: String(input.routing ?? 'europe').trim().toLowerCase() || 'europe',
    summoner_id: input.summonerId ?? null,
    summoner_level:
      input.summonerLevel == null || Number.isNaN(Number(input.summonerLevel))
        ? null
        : Number(input.summonerLevel),
    profile_icon_id:
      input.profileIconId == null || Number.isNaN(Number(input.profileIconId))
        ? null
        : Number(input.profileIconId),
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    last_synced_at: now,
    updated_at: now,
  }

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(row, { onConflict: 'user_id,puuid' })
    .select('*')
    .single()

  if (error) {
    if (error.code === 'PGRST205' || error.message?.includes(TABLE)) {
      throw new Error(
        'Table lol_accounts absente. Exécute scripts/create-lol-accounts.sql dans Supabase.',
      )
    }
    throw error
  }
  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} accountId
 */
export async function deleteLolAccount(supabase, userId, accountId) {
  if (!userId || !accountId) throw new Error('Compte invalide.')
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', accountId)
    .eq('user_id', userId)
  if (error) throw error
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} accountId
 * @param {Partial<{ summonerLevel: number, profileIconId: number, summonerId: string, metadata: Record<string, unknown> }>} patch
 */
export async function touchLolAccountSync(supabase, userId, accountId, patch = {}) {
  if (!userId || !accountId) return null
  const now = new Date().toISOString()
  const update = {
    last_synced_at: now,
    updated_at: now,
  }
  if (patch.summonerLevel != null) update.summoner_level = Number(patch.summonerLevel)
  if (patch.profileIconId != null) update.profile_icon_id = Number(patch.profileIconId)
  if (patch.summonerId != null) update.summoner_id = String(patch.summonerId)
  if (patch.metadata && typeof patch.metadata === 'object') update.metadata = patch.metadata

  const { data, error } = await supabase
    .from(TABLE)
    .update(update)
    .eq('id', accountId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle()

  if (error) throw error
  return data
}
