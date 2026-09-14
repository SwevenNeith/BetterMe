import {
  HABIT_ALL_WEEKDAY_IDS,
  HABIT_FREQUENCY,
  HABIT_STATUS,
  HABIT_VALUE_TYPE,
  normalizeHabitValueType,
} from '../constants/habitOptions.js'

const TABLE = 'habits'

const HABIT_COLUMNS =
  'id, user_id, nom, description, icone, couleur, type_valeur, unite, frequence, jours_actifs, date_debut, status, created_at, updated_at'

function isMissingStatusColumn(error) {
  const msg = String(error?.message ?? '')
  return error?.code === 'PGRST204' && msg.includes('status')
}

function sortHabits(rows) {
  return (rows ?? []).sort((a, b) =>
    (a.nom ?? '').localeCompare(b.nom ?? '', 'fr', { sensitivity: 'base' }),
  )
}

function withDefaultStatus(row) {
  return { ...row, status: row?.status ?? HABIT_STATUS.ACTIF }
}

function normalizeJoursActifs(frequence, joursActifs) {
  const raw = Array.isArray(joursActifs)
    ? [...new Set(joursActifs.map((n) => Number(n)).filter((n) => Number.isInteger(n)))]
    : []

  if (frequence === HABIT_FREQUENCY.DAILY) {
    return [...HABIT_ALL_WEEKDAY_IDS]
  }

  if (frequence === HABIT_FREQUENCY.WEEKLY) {
    const days = raw.filter((n) => n >= 1 && n <= 7)
    if (!days.length) {
      throw new Error('Sélectionne au moins un jour de la semaine.')
    }
    return days.sort((a, b) => a - b)
  }

  if (frequence === HABIT_FREQUENCY.MONTHLY) {
    const days = raw.filter((n) => n >= 1 && n <= 31)
    if (!days.length) {
      throw new Error('Sélectionne au moins un jour du mois.')
    }
    return days.sort((a, b) => a - b)
  }

  return raw
}

function normalizeHabitPayload(payload) {
  const nom = (payload.nom || '').trim()
  const description = (payload.description || '').trim() || null
  const iconeRaw = (payload.icone ?? '').trim()
  const icone = iconeRaw || null
  const couleur = (payload.couleur || '').trim() || '#ad81be'
  const type_valeur = normalizeHabitValueType(payload.type_valeur)
  const unite =
    type_valeur === HABIT_VALUE_TYPE.BOOLEAN ? null : (payload.unite || '').trim() || null
  const frequence = payload.frequence
  const date_debut = (payload.date_debut || '').trim()

  if (!nom) {
    throw new Error('Indique un nom pour l’habitude.')
  }
  if (!Object.values(HABIT_VALUE_TYPE).includes(type_valeur)) {
    throw new Error('Choisis un type de mesure.')
  }
  if (!Object.values(HABIT_FREQUENCY).includes(frequence)) {
    throw new Error('Choisis une fréquence.')
  }
  if (!date_debut) {
    throw new Error('Indique une date de début.')
  }

  const jours_actifs = normalizeJoursActifs(frequence, payload.jours_actifs)

  return {
    nom,
    description,
    icone,
    couleur,
    type_valeur,
    unite,
    frequence,
    jours_actifs,
    date_debut,
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ status?: string|null, includeAll?: boolean }} [options]
 */
export async function listHabits(supabase, userId, options = {}) {
  const { status = HABIT_STATUS.ACTIF, includeAll = false } = options

  let query = supabase.from(TABLE).select(HABIT_COLUMNS).eq('user_id', userId)

  if (!includeAll && status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query.order('nom', { ascending: true })

  if (error) {
    if (isMissingStatusColumn(error)) {
      const fallback = await supabase
        .from(TABLE)
        .select(
          'id, user_id, nom, description, icone, couleur, type_valeur, unite, frequence, jours_actifs, date_debut, created_at, updated_at',
        )
        .eq('user_id', userId)
        .order('nom', { ascending: true })
      if (fallback.error) throw fallback.error
      return sortHabits((fallback.data ?? []).map(withDefaultStatus))
    }
    throw error
  }

  return sortHabits((data ?? []).map(withDefaultStatus))
}

export async function listArchivedHabits(supabase, userId) {
  return listHabits(supabase, userId, { status: HABIT_STATUS.ARCHIVE })
}

export async function countArchivedHabits(supabase, userId) {
  const { count, error } = await supabase
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', HABIT_STATUS.ARCHIVE)

  if (error) {
    if (isMissingStatusColumn(error)) return 0
    throw error
  }

  return count ?? 0
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function createHabit(supabase, userId, payload) {
  if (!userId) {
    throw new Error('Utilisateur non connecté.')
  }

  const row = normalizeHabitPayload(payload)

  const insertRow = {
    user_id: userId,
    status: HABIT_STATUS.ACTIF,
    ...row,
  }

  let result = await supabase.from(TABLE).insert(insertRow).select(HABIT_COLUMNS).single()

  if (result.error && isMissingStatusColumn(result.error)) {
    const { status: _status, ...withoutStatus } = insertRow
    result = await supabase
      .from(TABLE)
      .insert(withoutStatus)
      .select(
        'id, user_id, nom, description, icone, couleur, type_valeur, unite, frequence, jours_actifs, date_debut, created_at, updated_at',
      )
      .single()
  }

  if (result.error) throw result.error
  if (!result.data?.id) {
    throw new Error('INSERT habits : aucune ligne créée (vérifie la policy RLS INSERT).')
  }

  return withDefaultStatus(result.data)
}

export async function updateHabit(supabase, userId, habitId, payload) {
  if (!userId || !habitId) {
    throw new Error('Habitude introuvable.')
  }

  const row = normalizeHabitPayload(payload)

  const { data, error } = await supabase
    .from(TABLE)
    .update(row)
    .eq('id', habitId)
    .eq('user_id', userId)
    .select(HABIT_COLUMNS)
    .single()

  if (error) throw error
  return withDefaultStatus(data)
}

export async function deleteHabit(supabase, userId, habitId) {
  if (!userId || !habitId) return

  const { error } = await supabase.from(TABLE).delete().eq('id', habitId).eq('user_id', userId)

  if (error) throw error
}

export async function deleteHabits(supabase, userId, habitIds) {
  const ids = [...new Set((habitIds ?? []).filter(Boolean))]
  if (!userId || !ids.length) return

  const { error } = await supabase.from(TABLE).delete().eq('user_id', userId).in('id', ids)

  if (error) throw error
}

export async function setHabitsStatus(supabase, userId, habitIds, status) {
  const ids = [...new Set((habitIds ?? []).filter(Boolean))]
  if (!userId || !ids.length) return
  if (!Object.values(HABIT_STATUS).includes(status)) {
    throw new Error('Statut d’habitude invalide.')
  }

  const { error } = await supabase
    .from(TABLE)
    .update({ status })
    .eq('user_id', userId)
    .in('id', ids)

  if (error) {
    if (isMissingStatusColumn(error)) {
      throw new Error(
        'Colonne status absente. Exécute scripts/migrate-habits-status.sql dans Supabase.',
      )
    }
    throw error
  }
}

export async function archiveHabits(supabase, userId, habitIds) {
  await setHabitsStatus(supabase, userId, habitIds, HABIT_STATUS.ARCHIVE)
}

export async function unarchiveHabits(supabase, userId, habitIds) {
  await setHabitsStatus(supabase, userId, habitIds, HABIT_STATUS.ACTIF)
}
