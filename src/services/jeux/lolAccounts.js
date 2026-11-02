/**
 * Persistance des comptes League of Legends (Supabase + miroir local).
 */

const TABLE = 'lol_accounts'
const LOCAL_MIRROR_PREFIX = 'betterme_lol_accounts_mirror:'

/**
 * @param {string} userId
 */
function mirrorKey(userId) {
  return `${LOCAL_MIRROR_PREFIX}${userId}`
}

/**
 * @param {string} userId
 * @returns {object[]}
 */
export function readLolAccountsMirror(userId) {
  if (!userId || typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(mirrorKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * @param {string} userId
 * @param {object[]} accounts
 */
export function writeLolAccountsMirror(userId, accounts) {
  if (!userId || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(mirrorKey(userId), JSON.stringify(accounts ?? []))
  } catch {
    /* ignore quota */
  }
}

/**
 * @param {import('@supabase/supabase-js').PostgrestError | null | undefined} error
 */
function isMissingTableError(error) {
  if (!error) return false
  const msg = String(error.message || '')
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    (msg.includes(TABLE) && (msg.includes('schema cache') || msg.includes('does not exist')))
  )
}

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
    if (isMissingTableError(error)) {
      console.warn(
        'Table lol_accounts absente. Exécute scripts/create-lol-accounts.sql dans Supabase.',
      )
      return readLolAccountsMirror(userId)
    }
    throw error
  }

  const rows = data ?? []
  if (rows.length) {
    writeLolAccountsMirror(userId, rows)
    return rows
  }

  // Serveur vide mais miroir local → tentative de restauration
  const mirror = readLolAccountsMirror(userId)
  if (mirror.length) {
    console.warn('lol_accounts vide côté Supabase — restauration depuis le miroir local.')
    const restored = []
    for (const row of mirror) {
      try {
        const saved = await upsertLolAccount(supabase, userId, {
          label: row.label,
          gameName: row.game_name,
          tagLine: row.tag_line,
          puuid: row.puuid,
          platform: row.platform,
          routing: row.routing,
          summonerId: row.summoner_id,
          summonerLevel: row.summoner_level,
          profileIconId: row.profile_icon_id,
          metadata: row.metadata,
        })
        restored.push(saved)
      } catch (err) {
        console.warn('Restauration compte LoL:', err)
        restored.push(row)
      }
    }
    if (restored.length) writeLolAccountsMirror(userId, restored)
    return restored
  }

  return []
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
    if (isMissingTableError(error)) {
      throw new Error(
        'Table lol_accounts absente. Exécute scripts/create-lol-accounts.sql dans Supabase.',
      )
    }
    throw error
  }

  // Met à jour le miroir local (évite de « perdre » le compte si un list échoue plus tard)
  const mirror = readLolAccountsMirror(userId).filter((a) => a.puuid !== data.puuid)
  mirror.unshift(data)
  writeLolAccountsMirror(userId, mirror)

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

  const mirror = readLolAccountsMirror(userId).filter((a) => a.id !== accountId)
  writeLolAccountsMirror(userId, mirror)
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
