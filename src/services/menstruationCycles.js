const TABLE = 'menstruation_cycles_pilule'

/** Noms de colonnes Supabase (avec accents, comme en base) */
const COL = {
  numeroCycle: 'numéro_cycle',
  dateDebutPlaquette: 'date_début_plaquette',
  dateFinComprimesActifs: 'date_fin_comprimés_actifs',
  dateProchainePlaquette: 'date_prochaine_plaquette',
  dateDebutReglesReelle: 'date_début_règles_réelle',
  dateFinReglesReelle: 'date_fin_règles_réelle',
  dureeCycle: 'durée_cycle',
  dureeRegles: 'durée_règles',
}

const JOURS_COMPRIMES_ACTIFS = 21
const JOURS_PROCHAINE_PLAQUETTE = 28

/** YYYY-MM-DD + n jours (calendrier local) */
export function addDaysToISODate(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  const yy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export function computeDateFinComprimesActifs(dateDebutPlaquette) {
  if (!dateDebutPlaquette) return null
  return addDaysToISODate(dateDebutPlaquette, JOURS_COMPRIMES_ACTIFS)
}

export function computeDateProchainePlaquette(dateDebutPlaquette) {
  if (!dateDebutPlaquette) return null
  return addDaysToISODate(dateDebutPlaquette, JOURS_PROCHAINE_PLAQUETTE)
}

export function createEmptyOnboardingForm(localToday) {
  return {
    hormonalContraception: null,

    dateDebutPlaquette: localToday,

    lastPeriodStartUnknown: false,
    lastPeriodStartDate: localToday,

    lastPeriodEndUnknown: false,
    lastPeriodEndDate: localToday,

    cycleLengthUnknown: false,
    cycleLengthDays: 28,

    rulesDurationDays: null,
  }
}

export async function countMenstruationCyclesPilule(supabase, userId) {
  const { count, error } = await supabase
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (error) throw error
  return count ?? 0
}

async function getNextNumeroCycle(supabase, userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select(COL.numeroCycle)
    .eq('user_id', userId)
    .order(COL.numeroCycle, { ascending: false })
    .limit(1)

  if (error) throw error

  const last = data?.[0]?.[COL.numeroCycle]
  const next = typeof last === 'number' ? last + 1 : 1
  return next
}

export async function createMenstruationCyclePilule(supabase, userId, payload) {
  const nextNumero = await getNextNumeroCycle(supabase, userId)
  const dateDebutPlaquette = payload.dateDebutPlaquette || null
  const dateFinComprimesActifs = computeDateFinComprimesActifs(dateDebutPlaquette)
  const dateProchainePlaquette = computeDateProchainePlaquette(dateDebutPlaquette)

  const record = {
    user_id: userId,
    [COL.numeroCycle]: nextNumero,
    [COL.dateDebutPlaquette]: dateDebutPlaquette,
    [COL.dateFinComprimesActifs]: dateFinComprimesActifs,
    [COL.dateProchainePlaquette]: dateProchainePlaquette,
    [COL.dateDebutReglesReelle]: payload.dateDebutReglesReelle || null,
    [COL.dateFinReglesReelle]: payload.dateFinReglesReelle || null,
    [COL.dureeCycle]: payload.dureeCycleDays ?? null,
    [COL.dureeRegles]: payload.dureeReglesDays ?? null,
  }

  const { data, error } = await supabase.from(TABLE).insert(record).select().single()
  if (error) throw error
  return data
}
