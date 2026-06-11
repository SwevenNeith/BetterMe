import {
  HABIT_ALL_WEEKDAY_IDS,
  HABIT_FREQUENCY,
  HABIT_VALUE_TYPE,
  normalizeHabitValueType,
} from '../constants/habitOptions.js'

const TABLE = 'habits'

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
 */
export async function listHabits(supabase, userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select(
      'id, user_id, nom, description, icone, couleur, type_valeur, unite, frequence, jours_actifs, date_debut, created_at, updated_at',
    )
    .eq('user_id', userId)
    .order('nom', { ascending: true })

  if (error) throw error
  return (data ?? []).sort((a, b) =>
    (a.nom ?? '').localeCompare(b.nom ?? '', 'fr', { sensitivity: 'base' }),
  )
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

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      ...row,
    })
    .select(
      'id, user_id, nom, description, icone, couleur, type_valeur, unite, frequence, jours_actifs, date_debut, created_at, updated_at',
    )
    .single()

  if (error) throw error
  if (!data?.id) {
    throw new Error('INSERT habits : aucune ligne créée (vérifie la policy RLS INSERT).')
  }

  return data
}
