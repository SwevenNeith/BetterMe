import { supabase } from '../../lib/supabase.js'

const USER_CACHE_KEY = 'betterme_cached_user'
const AUTH_STORAGE_KEY = 'sb-idnfbtgevosjcevnrnvu-auth-token'

/**
 * Sauvegarde locale de l’utilisateur (indépendante du verrou auth Supabase).
 * @param {import('@supabase/supabase-js').User | null | undefined} user
 */
export function cacheSessionUser(user) {
  try {
    if (!user?.id) {
      localStorage.removeItem(USER_CACHE_KEY)
      return
    }
    localStorage.setItem(
      USER_CACHE_KEY,
      JSON.stringify({
        id: user.id,
        email: user.email ?? null,
        user_metadata: user.user_metadata ?? {},
      }),
    )
  } catch {
    /* ignore quota / private mode */
  }
}

function readCachedUser() {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.id ? parsed : null
  } catch {
    return null
  }
}

/** Lecture directe du token Supabase dans localStorage — sans verrou réseau. */
function readUserFromSupabaseStorage() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const user = parsed?.user ?? parsed?.currentSession?.user ?? null
    return user?.id ? user : null
  } catch {
    return null
  }
}

/**
 * Utilisateur pour monter une page : storage local d’abord (instantané),
 * jamais bloqué par getSession()/getUser() si le client auth est gelé.
 *
 * @returns {Promise<import('@supabase/supabase-js').User | { id: string } | null>}
 */
export async function resolveSessionUser() {
  const fromCache = readCachedUser()
  if (fromCache) return fromCache

  const fromStorage = readUserFromSupabaseStorage()
  if (fromStorage) {
    cacheSessionUser(fromStorage)
    return fromStorage
  }

  // Dernier recours : getSession, mais borné pour ne jamais bloquer l’UI.
  try {
    const result = await Promise.race([
      supabase.auth.getSession(),
      new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
    ])
    const user = result?.data?.session?.user ?? null
    if (user) {
      cacheSessionUser(user)
      return user
    }
  } catch (err) {
    console.warn('resolveSessionUser/getSession:', err)
  }

  return readCachedUser()
}

/** @returns {Promise<string | null>} */
export async function resolveSessionUserId() {
  const user = await resolveSessionUser()
  return user?.id ?? null
}

/** À brancher sur onAuthStateChange pour garder le cache à jour. */
export function syncSessionUserCache(event, session) {
  if (event === 'SIGNED_OUT') {
    cacheSessionUser(null)
    return
  }
  if (session?.user) {
    cacheSessionUser(session.user)
  }
}
