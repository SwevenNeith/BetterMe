import { addDaysToISODate, daysBetweenISO } from './menstruationCycles.js'

const TABLE = 'menstruation_cycles_naturel'

/** Noms de colonnes Supabase (avec accents, comme en base) */
export const COL_NATUREL = {
  id: 'id',
  userId: 'user_id',
  numeroCycle: 'numéro_cycle',

  dateDebutRegles: 'date_début_règles',
  dateFinReglesEstimee: 'date_fin_règles_estimée',
  dateFinReglesReelle: 'date_fin_règles_réelle',
  dureeRegles: 'durée_règles',

  dureeCycle: 'durée_cycle',
  dureeCycleReelle: 'durée_cycle_réelle',

  dateOvulationEstimee: 'date_ovulation_estimée',
  fenetreFertileDebut: 'fenêtre_fertile_début',
  fenetreFertileFin: 'fenêtre_fertile_fin',

  dateProchainesReglesEstimee: 'date_prochaines_règles_estimée',
}

const DEFAULT_CYCLE_LEN = 28
const DEFAULT_RULES_LEN = 5

// Hypothèses (constantes)
const DUREE_PHASE_LUTEALE = 14
const JOURS_AVANT_OVULATION = 5
const JOURS_APRES_OVULATION = 1
const DUREE_OVULATION = 1

function clampInt(n, min, max, fallback) {
  const parsed = parseInt(String(n), 10)
  if (Number.isNaN(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

export function computeNaturalCycleDerivedFields({ dateDebutRegles, dureeCycle, dureeRegles }) {
  const cycleLen = clampInt(dureeCycle, 15, 60, DEFAULT_CYCLE_LEN)
  const rulesLen = clampInt(dureeRegles, 1, 20, DEFAULT_RULES_LEN)

  const dateFinReglesEstimee = addDaysToISODate(dateDebutRegles, rulesLen)
  const dateOvulationEstimee = addDaysToISODate(dateDebutRegles, cycleLen - DUREE_PHASE_LUTEALE)
  const fenetreFertileDebut = addDaysToISODate(dateOvulationEstimee, -JOURS_AVANT_OVULATION)
  const fenetreFertileFin = addDaysToISODate(dateOvulationEstimee, JOURS_APRES_OVULATION)
  const dateProchainesReglesEstimee = addDaysToISODate(dateDebutRegles, cycleLen)

  return {
    [COL_NATUREL.dureeCycle]: cycleLen,
    [COL_NATUREL.dureeRegles]: rulesLen,
    [COL_NATUREL.dateFinReglesEstimee]: dateFinReglesEstimee,
    [COL_NATUREL.dateOvulationEstimee]: dateOvulationEstimee,
    [COL_NATUREL.fenetreFertileDebut]: fenetreFertileDebut,
    [COL_NATUREL.fenetreFertileFin]: fenetreFertileFin,
    [COL_NATUREL.dateProchainesReglesEstimee]: dateProchainesReglesEstimee,
  }
}

export async function countMenstruationCyclesNaturel(supabase, userId) {
  const { count, error } = await supabase
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (error) throw error
  return count ?? 0
}

export async function listCyclesNaturel(supabase, userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order(COL_NATUREL.numeroCycle, { ascending: true })

  if (error) throw error
  return data ?? []
}

function computeDureeReglesFromDates(debutISO, finISO) {
  if (!debutISO || !finISO) return null
  const diff = daysBetweenISO(debutISO, finISO)
  return diff != null && diff >= 1 && diff <= 20 ? diff : null
}

function averageRounded(values) {
  const nums = values.filter((v) => typeof v === 'number' && !Number.isNaN(v))
  if (!nums.length) return null
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)
}

/**
 * Recalcule les champs estimés de tous les cycles existants en se basant sur :
 * - durées réelles entre début de règles (cycle n) et (n+1) si disponible
 * - sinon moyenne des cycles réels précédents
 * - durée règles = moyenne (ou fallback)
 *
 * Cette fonction est volontairement conservative : elle ne touche pas aux dates réelles.
 */
export async function refreshAllCyclesNaturelEstimees(supabase, userId) {
  const cycles = await listCyclesNaturel(supabase, userId)
  if (!cycles.length) return []

  // Pré-calc des durées réelles de cycle quand on a deux débuts réels consécutifs
  const cycleRealLens = []
  for (let i = 1; i < cycles.length; i++) {
    const prev = cycles[i - 1]
    const cur = cycles[i]
    const prevStart = prev[COL_NATUREL.dateDebutRegles]
    const curStart = cur[COL_NATUREL.dateDebutRegles]
    const diff = prevStart && curStart ? daysBetweenISO(prevStart, curStart) : null
    if (diff != null && diff >= 15 && diff <= 60) cycleRealLens.push(diff)
  }

  const rulesLens = cycles
    .map((c) => {
      // Si on a une fin réelle, elle devient la source de vérité de la durée
      const realLen = computeDureeReglesFromDates(
        c[COL_NATUREL.dateDebutRegles],
        c[COL_NATUREL.dateFinReglesReelle],
      )
      return realLen ?? c[COL_NATUREL.dureeRegles]
    })
    .filter((v) => typeof v === 'number' && !Number.isNaN(v) && v >= 1 && v <= 20)

  const avgCycleLen = averageRounded(cycleRealLens) ?? DEFAULT_CYCLE_LEN
  const avgRulesLen = averageRounded(rulesLens) ?? DEFAULT_RULES_LEN

  // On met à jour chaque cycle avec des champs estimés cohérents.
  const updates = cycles.map((c, idx) => {
    const dateDebutRegles = c[COL_NATUREL.dateDebutRegles]
    const realRulesLen = computeDureeReglesFromDates(
      c[COL_NATUREL.dateDebutRegles],
      c[COL_NATUREL.dateFinReglesReelle],
    )
    const effectiveCycleLen =
      idx >= 1
        ? (() => {
            const prevStart = cycles[idx - 1][COL_NATUREL.dateDebutRegles]
            const diff = prevStart && dateDebutRegles ? daysBetweenISO(prevStart, dateDebutRegles) : null
            return diff != null && diff >= 15 && diff <= 60 ? diff : avgCycleLen
          })()
        : c[COL_NATUREL.dureeCycle] ?? avgCycleLen

    const derived = computeNaturalCycleDerivedFields({
      dateDebutRegles,
      dureeCycle: effectiveCycleLen,
      dureeRegles: realRulesLen ?? c[COL_NATUREL.dureeRegles] ?? avgRulesLen,
    })

    const patch = {
      [COL_NATUREL.dureeCycle]: derived[COL_NATUREL.dureeCycle],
      [COL_NATUREL.dureeRegles]: derived[COL_NATUREL.dureeRegles],
      [COL_NATUREL.dateFinReglesEstimee]: derived[COL_NATUREL.dateFinReglesEstimee],
      [COL_NATUREL.dateOvulationEstimee]: derived[COL_NATUREL.dateOvulationEstimee],
      [COL_NATUREL.fenetreFertileDebut]: derived[COL_NATUREL.fenetreFertileDebut],
      [COL_NATUREL.fenetreFertileFin]: derived[COL_NATUREL.fenetreFertileFin],
      [COL_NATUREL.dateProchainesReglesEstimee]: derived[COL_NATUREL.dateProchainesReglesEstimee],
      [COL_NATUREL.dureeCycleReelle]:
        idx >= 1
          ? (() => {
              const prevStart = cycles[idx - 1][COL_NATUREL.dateDebutRegles]
              const diff = prevStart && dateDebutRegles ? daysBetweenISO(prevStart, dateDebutRegles) : null
              return diff != null && diff >= 15 && diff <= 60 ? diff : null
            })()
          : null,
    }

    return { id: c.id, patch }
  })

  for (const u of updates) {
    const { error } = await supabase.from(TABLE).update(u.patch).eq('id', u.id).eq('user_id', userId)
    if (error) throw error
  }

  return await listCyclesNaturel(supabase, userId)
}

export async function createMenstruationCycleNaturel(supabase, userId, payload) {
  const numeroCycle = payload.numeroCycle ?? 1
  const dateDebutRegles = payload.dateDebutRegles

  const derived = computeNaturalCycleDerivedFields({
    dateDebutRegles,
    dureeCycle: payload.dureeCycle ?? DEFAULT_CYCLE_LEN,
    dureeRegles: payload.dureeRegles ?? DEFAULT_RULES_LEN,
  })

  const record = {
    user_id: userId,
    [COL_NATUREL.numeroCycle]: numeroCycle,
    [COL_NATUREL.dateDebutRegles]: dateDebutRegles,
    [COL_NATUREL.dateFinReglesReelle]: payload.dateFinReglesReelle ?? null,
    ...derived,
  }

  const { data, error } = await supabase.from(TABLE).insert(record).select('*').single()
  if (error) throw error

  // Recalcule les estimations (pour tenir compte des durées moyennes à partir du cycle 2+)
  await refreshAllCyclesNaturelEstimees(supabase, userId)

  return data
}

export async function saveMenstruationRulesDatesNaturel(supabase, userId, payload) {
  const cycleId = payload?.cycleId
  if (!cycleId) throw new Error('cycleId manquant')

  const dateDebutRegles = payload.dateDebutRegles || null
  const dateFinReglesReelle = payload.dateFinReglesReelle || null

  if (!dateDebutRegles) {
    throw new Error('Indique une date de début des règles.')
  }
  if (dateFinReglesReelle && dateFinReglesReelle < dateDebutRegles) {
    throw new Error('La date de fin ne peut pas être avant la date de début.')
  }

  const patch = {
    [COL_NATUREL.dateDebutRegles]: dateDebutRegles,
    [COL_NATUREL.dateFinReglesReelle]: dateFinReglesReelle,
  }

  const { error } = await supabase.from(TABLE).update(patch).eq('id', cycleId).eq('user_id', userId)
  if (error) throw error

  await refreshAllCyclesNaturelEstimees(supabase, userId)
  return await listCyclesNaturel(supabase, userId)
}

export function determinePhaseNaturel({ dateDebutRegles, dureeCycle, dureeRegles }, nowISO) {
  if (!dateDebutRegles || !nowISO) return null
  const dayInCycle = daysBetweenISO(dateDebutRegles, nowISO)
  if (dayInCycle == null || dayInCycle < 0) return null

  const cycleLen = clampInt(dureeCycle, 15, 60, DEFAULT_CYCLE_LEN)
  const rulesLen = clampInt(dureeRegles, 1, 20, DEFAULT_RULES_LEN)
  const follicularEnd = cycleLen - DUREE_PHASE_LUTEALE

  if (dayInCycle <= rulesLen) return 'menstruelle'
  if (dayInCycle > rulesLen && dayInCycle <= follicularEnd) return 'folliculaire'
  if (dayInCycle > follicularEnd && dayInCycle <= follicularEnd + DUREE_OVULATION) return 'ovulatoire'
  return 'lutéale'
}

