import { addDaysToISODate, daysBetweenISO, pickDate } from './menstruationCycles.js'
import { getLocalTodayISO } from './scheduledReminders.js'

const TABLE = 'menstruation_cycles_naturel'

/** Noms de colonnes Supabase (avec accents, comme en base) */
export const COL_NATUREL = {
  id: 'id',
  userId: 'user_id',
  numeroCycle: 'numéro_cycle',

  dateDebutReglesEstimee: 'date_début_règles_estimée',
  dateDebutReglesReelle: 'date_début_règles_réelle',
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
const FORECAST_CYCLES_AHEAD = 5

// Hypothèses (constantes)
export const DUREE_PHASE_LUTEALE = 14
export const JOURS_AVANT_OVULATION = 5
export const JOURS_APRES_OVULATION = 1
export const DUREE_OVULATION = 1

function clampInt(n, min, max, fallback) {
  const parsed = parseInt(String(n), 10)
  if (Number.isNaN(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

export function getRealDebutReglesNaturel(row) {
  return row?.[COL_NATUREL.dateDebutReglesReelle] ?? null
}

export function getEffectiveDebutReglesNaturel(row) {
  return pickDate(row?.[COL_NATUREL.dateDebutReglesReelle], row?.[COL_NATUREL.dateDebutReglesEstimee])
}

/** Cycle projeté sans début réel : affichage prévision uniquement, pas de période active. */
export function isForecastOnlyNaturalCycle(row, cycles) {
  if (!row || row[COL_NATUREL.dateDebutReglesReelle]) return false
  const numero = row[COL_NATUREL.numeroCycle] ?? 0
  if (numero <= 1) return false
  const prev = cycles.find((c) => c[COL_NATUREL.numeroCycle] === numero - 1)
  return Boolean(prev?.[COL_NATUREL.dateDebutReglesReelle])
}

export function getEffectiveFinReglesNaturel(row) {
  return pickDate(row?.[COL_NATUREL.dateFinReglesReelle], row?.[COL_NATUREL.dateFinReglesEstimee])
}

/** Règles en cours : début réel saisi, fin réelle pas encore renseignée. */
export function isOngoingRealReglesPeriodNaturel(row, todayISO = getLocalTodayISO()) {
  const debut = row?.[COL_NATUREL.dateDebutReglesReelle]
  const fin = row?.[COL_NATUREL.dateFinReglesReelle]
  return Boolean(debut && !fin && debut <= todayISO)
}

/**
 * Fin de la période de règles pour affichage / phases :
 * - fin réelle si connue
 * - sinon aujourd'hui tant que les règles réelles sont en cours
 * - sinon fin estimée
 */
export function getReglesPeriodEndNaturel(row, todayISO = getLocalTodayISO()) {
  const realFin = row?.[COL_NATUREL.dateFinReglesReelle]
  if (realFin) return realFin
  if (isOngoingRealReglesPeriodNaturel(row, todayISO)) return todayISO
  return row?.[COL_NATUREL.dateFinReglesEstimee] ?? null
}

export function isInMenstruellePhaseNaturel(cycle, nowISO = getLocalTodayISO()) {
  if (!cycle || !nowISO) return false
  const debut = getEffectiveDebutReglesNaturel(cycle)
  if (!debut || nowISO < debut) return false
  if (isOngoingRealReglesPeriodNaturel(cycle, nowISO)) return true
  const fin = getReglesPeriodEndNaturel(cycle, nowISO)
  return Boolean(fin && nowISO <= fin)
}

export function getEffectiveCycleLengthNaturel(row) {
  return row?.[COL_NATUREL.dureeCycleReelle] ?? row?.[COL_NATUREL.dureeCycle] ?? DEFAULT_CYCLE_LEN
}

/** Ovulation et fertilité ancrées sur le début effectif (réel si connu). */
export function getEffectiveOvulationDateNaturel(row, todayISO = getLocalTodayISO()) {
  if (isOngoingRealReglesPeriodNaturel(row, todayISO)) return null
  const start = getEffectiveDebutReglesNaturel(row)
  if (!start) return row?.[COL_NATUREL.dateOvulationEstimee] ?? null
  const cycleLen = clampInt(getEffectiveCycleLengthNaturel(row), 15, 60, DEFAULT_CYCLE_LEN)
  return addDaysToISODate(start, cycleLen - DUREE_PHASE_LUTEALE)
}

export function getEffectiveFenetreFertileNaturel(row, todayISO = getLocalTodayISO()) {
  const ovul = getEffectiveOvulationDateNaturel(row, todayISO)
  if (!ovul) {
    return {
      debut: row?.[COL_NATUREL.fenetreFertileDebut] ?? null,
      fin: row?.[COL_NATUREL.fenetreFertileFin] ?? null,
    }
  }
  return {
    debut: addDaysToISODate(ovul, -JOURS_AVANT_OVULATION),
    fin: addDaysToISODate(ovul, JOURS_APRES_OVULATION),
  }
}

/** Fin de cycle courante = début effectif + durée (réelle si connue). */
export function getEffectiveProchainesReglesNaturel(row) {
  const start = getEffectiveDebutReglesNaturel(row)
  if (!start) return row?.[COL_NATUREL.dateProchainesReglesEstimee] ?? null
  const cycleLen = clampInt(getEffectiveCycleLengthNaturel(row), 15, 60, DEFAULT_CYCLE_LEN)
  return addDaysToISODate(start, cycleLen)
}

export function computeNaturalCycleDerivedFields({ dateDebutReglesEstimee, dureeCycle, dureeRegles }) {
  if (!dateDebutReglesEstimee) {
    return {
      [COL_NATUREL.dureeCycle]: clampInt(dureeCycle, 15, 60, DEFAULT_CYCLE_LEN),
      [COL_NATUREL.dureeRegles]: clampInt(dureeRegles, 1, 20, DEFAULT_RULES_LEN),
      [COL_NATUREL.dateFinReglesEstimee]: null,
      [COL_NATUREL.dateOvulationEstimee]: null,
      [COL_NATUREL.fenetreFertileDebut]: null,
      [COL_NATUREL.fenetreFertileFin]: null,
      [COL_NATUREL.dateProchainesReglesEstimee]: null,
    }
  }

  const cycleLen = clampInt(dureeCycle, 15, 60, DEFAULT_CYCLE_LEN)
  const rulesLen = clampInt(dureeRegles, 1, 20, DEFAULT_RULES_LEN)

  const dateFinReglesEstimee = addDaysToISODate(dateDebutReglesEstimee, rulesLen - 1)
  const dateOvulationEstimee = addDaysToISODate(
    dateDebutReglesEstimee,
    cycleLen - DUREE_PHASE_LUTEALE,
  )
  const fenetreFertileDebut = addDaysToISODate(dateOvulationEstimee, -JOURS_AVANT_OVULATION)
  const fenetreFertileFin = addDaysToISODate(dateOvulationEstimee, JOURS_APRES_OVULATION)
  const dateProchainesReglesEstimee = addDaysToISODate(dateDebutReglesEstimee, cycleLen)

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

/** Nombre de jours calendaires inclus entre début et fin (ex. 18→19 = 2, 18→21 = 4). */
export function computeDureeReglesFromDates(debutISO, finISO) {
  if (!debutISO || !finISO) return null
  const diff = daysBetweenISO(debutISO, finISO)
  if (diff == null || diff < 0) return null
  const inclusive = diff + 1
  return inclusive >= 1 && inclusive <= 20 ? inclusive : null
}

export function getRealOrOngoingDureeReglesNaturel(row, todayISO = getLocalTodayISO()) {
  const debutReel = row?.[COL_NATUREL.dateDebutReglesReelle]
  const finReel = row?.[COL_NATUREL.dateFinReglesReelle]
  if (debutReel && finReel) {
    return computeDureeReglesFromDates(debutReel, finReel)
  }
  if (isOngoingRealReglesPeriodNaturel(row, todayISO)) {
    return computeDureeReglesFromDates(debutReel, todayISO)
  }
  return null
}

function averageRounded(values) {
  const nums = values.filter((v) => typeof v === 'number' && !Number.isNaN(v))
  if (!nums.length) return null
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)
}

function getDureeReglesForForecast(numeroCycle, prev, previousCycles) {
  if (numeroCycle === 2) {
    return prev[COL_NATUREL.dureeRegles] ?? DEFAULT_RULES_LEN
  }
  const lens = previousCycles.map(
    (c) => getRealOrOngoingDureeReglesNaturel(c) ?? c[COL_NATUREL.dureeRegles],
  )
  return averageRounded(lens) ?? DEFAULT_RULES_LEN
}

function getDureeCycleForForecast(numeroCycle, prev, previousCycles) {
  if (numeroCycle === 2) {
    return prev[COL_NATUREL.dureeCycle] ?? DEFAULT_CYCLE_LEN
  }
  const realLens = previousCycles
    .map((c) => c[COL_NATUREL.dureeCycleReelle])
    .filter((v) => v != null)
  if (realLens.length) {
    return averageRounded(realLens) ?? DEFAULT_CYCLE_LEN
  }
  return averageRounded(previousCycles.map((c) => c[COL_NATUREL.dureeCycle])) ?? DEFAULT_CYCLE_LEN
}

function copyKnownRealFieldsNaturel(fromRow, toRow) {
  if (!fromRow || !toRow) return
  if (fromRow[COL_NATUREL.dateDebutReglesReelle]) {
    toRow[COL_NATUREL.dateDebutReglesReelle] = fromRow[COL_NATUREL.dateDebutReglesReelle]
  }
  if (fromRow[COL_NATUREL.dateFinReglesReelle]) {
    toRow[COL_NATUREL.dateFinReglesReelle] = fromRow[COL_NATUREL.dateFinReglesReelle]
  }
}

function buildForecastCycleRecordNaturel(userId, numeroCycle, prev, previousCycles) {
  const dateDebutReglesEstimee = prev[COL_NATUREL.dateProchainesReglesEstimee]
  if (!dateDebutReglesEstimee) return null

  const dureeRegles = getDureeReglesForForecast(numeroCycle, prev, previousCycles)
  const dureeCycle = getDureeCycleForForecast(numeroCycle, prev, previousCycles)

  const derived = computeNaturalCycleDerivedFields({
    dateDebutReglesEstimee,
    dureeCycle,
    dureeRegles,
  })

  return {
    user_id: userId,
    [COL_NATUREL.numeroCycle]: numeroCycle,
    [COL_NATUREL.dateDebutReglesEstimee]: dateDebutReglesEstimee,
    [COL_NATUREL.dateDebutReglesReelle]: null,
    [COL_NATUREL.dateFinReglesReelle]: null,
    ...derived,
    [COL_NATUREL.dureeCycleReelle]: null,
  }
}

/**
 * Maintient toujours les cycles projetés jusqu'à n+5 (ex. cycle 1 → lignes 2…6).
 */
export async function syncForecastCyclesNaturel(supabase, userId) {
  let cycles = await listCyclesNaturel(supabase, userId)
  if (!cycles.length) return []

  await refreshAllCyclesNaturelEstimees(supabase, userId)
  cycles = await listCyclesNaturel(supabase, userId)

  const maxN = Math.max(...cycles.map((c) => c[COL_NATUREL.numeroCycle]))
  const targetMax = maxN + FORECAST_CYCLES_AHEAD

  await supabase.from(TABLE).delete().eq('user_id', userId).gt(COL_NATUREL.numeroCycle, targetMax)

  cycles = await listCyclesNaturel(supabase, userId)
  const byNum = new Map(cycles.map((c) => [c[COL_NATUREL.numeroCycle], c]))

  for (let n = 2; n <= targetMax; n++) {
    const prev = byNum.get(n - 1)
    if (!prev) break

    const previousAll = cycles.filter((c) => c[COL_NATUREL.numeroCycle] < n)
    const record = buildForecastCycleRecordNaturel(userId, n, prev, previousAll)
    if (!record) continue

    const existing = byNum.get(n)
    if (existing?.id) {
      copyKnownRealFieldsNaturel(existing, record)
      const realRulesLen = getRealOrOngoingDureeReglesNaturel(record)
      if (realRulesLen != null) {
        record[COL_NATUREL.dureeRegles] = realRulesLen
      }
      const derived = computeNaturalCycleDerivedFields({
        dateDebutReglesEstimee: record[COL_NATUREL.dateDebutReglesEstimee],
        dureeCycle: record[COL_NATUREL.dureeCycle],
        dureeRegles: record[COL_NATUREL.dureeRegles],
      })
      Object.assign(record, derived)

      const { data, error } = await supabase
        .from(TABLE)
        .update(record)
        .eq('id', existing.id)
        .select()
        .single()
      if (error) throw error
      byNum.set(n, data)
      const idx = cycles.findIndex((c) => c.id === existing.id)
      if (idx >= 0) cycles[idx] = data
    } else {
      const { data, error } = await supabase.from(TABLE).insert(record).select().single()
      if (error) throw error
      byNum.set(n, data)
      cycles.push(data)
    }
  }

  return await refreshAllCyclesNaturelEstimees(supabase, userId)
}

/**
 * Recalcule les champs estimés de tous les cycles existants en se basant sur :
 * - durées réelles entre débuts effectifs (réel si dispo, sinon estimé) consécutifs
 * - sinon moyenne des cycles réels précédents
 * - durée règles = moyenne (ou fallback)
 *
 * Ne modifie pas les dates réelles saisies par l'utilisateur.
 */
export async function refreshAllCyclesNaturelEstimees(supabase, userId) {
  const cycles = await listCyclesNaturel(supabase, userId)
  if (!cycles.length) return []

  const cycleRealLens = []
  for (let i = 1; i < cycles.length; i++) {
    const prev = cycles[i - 1]
    const cur = cycles[i]
    const prevStart = getRealDebutReglesNaturel(prev)
    const curStart = getRealDebutReglesNaturel(cur)
    const diff = prevStart && curStart ? daysBetweenISO(prevStart, curStart) : null
    if (diff != null && diff >= 15 && diff <= 60) cycleRealLens.push(diff)
  }

  const rulesLens = cycles
    .map((c) => getRealOrOngoingDureeReglesNaturel(c) ?? c[COL_NATUREL.dureeRegles])
    .filter((v) => typeof v === 'number' && !Number.isNaN(v) && v >= 1 && v <= 20)

  const avgCycleLen = averageRounded(cycleRealLens) ?? DEFAULT_CYCLE_LEN
  const avgRulesLen = averageRounded(rulesLens) ?? DEFAULT_RULES_LEN

  const updates = cycles.map((c, idx) => {
    const dateDebutReglesEstimee = c[COL_NATUREL.dateDebutReglesEstimee]
    const realRulesLen = getRealOrOngoingDureeReglesNaturel(c)
    const effectiveCycleLen =
      idx >= 1
        ? (() => {
            const prevStart = getRealDebutReglesNaturel(cycles[idx - 1])
            const curStart = getRealDebutReglesNaturel(c)
            const diff = prevStart && curStart ? daysBetweenISO(prevStart, curStart) : null
            return diff != null && diff >= 15 && diff <= 60 ? diff : avgCycleLen
          })()
        : (c[COL_NATUREL.dureeCycle] ?? avgCycleLen)

    const derived = computeNaturalCycleDerivedFields({
      dateDebutReglesEstimee,
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
              const prevStart = getRealDebutReglesNaturel(cycles[idx - 1])
              const curStart = getRealDebutReglesNaturel(c)
              const diff = prevStart && curStart ? daysBetweenISO(prevStart, curStart) : null
              return diff != null && diff >= 15 && diff <= 60 ? diff : null
            })()
          : null,
    }

    return { id: c.id, patch }
  })

  for (const u of updates) {
    const { error } = await supabase
      .from(TABLE)
      .update(u.patch)
      .eq('id', u.id)
      .eq('user_id', userId)
    if (error) throw error
  }

  return await listCyclesNaturel(supabase, userId)
}

export function buildMenstruationCycleNaturelRecord(userId, payload) {
  const numeroCycle = payload.numeroCycle ?? 1
  const dateDebutReglesEstimee =
    payload.dateDebutReglesEstimee ?? payload.dateDebutRegles ?? null
  const dateDebutReglesReelle = payload.dateDebutReglesReelle ?? null
  const derived = computeNaturalCycleDerivedFields({
    dateDebutReglesEstimee,
    dureeCycle: payload.dureeCycle ?? DEFAULT_CYCLE_LEN,
    dureeRegles: payload.dureeRegles ?? DEFAULT_RULES_LEN,
  })

  return {
    user_id: userId,
    [COL_NATUREL.numeroCycle]: numeroCycle,
    [COL_NATUREL.dateDebutReglesEstimee]: dateDebutReglesEstimee,
    [COL_NATUREL.dateDebutReglesReelle]: dateDebutReglesReelle,
    [COL_NATUREL.dateFinReglesReelle]: payload.dateFinReglesReelle ?? null,
    ...derived,
  }
}

export async function createMenstruationCycleNaturel(supabase, userId, payload, options = {}) {
  const record = buildMenstruationCycleNaturelRecord(userId, payload)

  const { data, error } = await supabase.from(TABLE).insert(record).select('*').single()
  if (error) throw error

  if (options.sync !== false) {
    await syncForecastCyclesNaturel(supabase, userId)
  }

  return data
}

export function resolveTargetCycleForRealDatesNaturel(cycles, cycleId, payload) {
  const current = cycles.find((c) => c.id === cycleId)
  if (!current) return null

  const dateDebutReglesReelle = payload?.dateDebutReglesReelle || null
  if (!dateDebutReglesReelle) return current

  const currentRealStart = current[COL_NATUREL.dateDebutReglesReelle]
  if (!currentRealStart || dateDebutReglesReelle === currentRealStart) {
    return current
  }

  const rulesEnd = getReglesPeriodEndNaturel(current)
  const nextNum = (current[COL_NATUREL.numeroCycle] ?? 0) + 1
  const nextCycle = cycles.find((c) => c[COL_NATUREL.numeroCycle] === nextNum)

  if (nextCycle && !nextCycle[COL_NATUREL.dateDebutReglesReelle]) {
    if (rulesEnd && dateDebutReglesReelle > rulesEnd) return nextCycle
    const nextEst = current[COL_NATUREL.dateProchainesReglesEstimee]
    if (nextEst && dateDebutReglesReelle >= nextEst) return nextCycle
  }

  return current
}

export async function saveMenstruationRulesDatesNaturel(supabase, userId, payload) {
  const cycleId = payload?.cycleId
  if (!cycleId) throw new Error('cycleId manquant')

  const dateDebutReglesReelle = payload.dateDebutReglesReelle || null
  const dateFinReglesReelle = payload.dateFinReglesReelle || null

  if (!dateDebutReglesReelle) {
    throw new Error('Indique une date de début des règles.')
  }
  if (dateFinReglesReelle && dateFinReglesReelle < dateDebutReglesReelle) {
    throw new Error('La date de fin ne peut pas être avant la date de début.')
  }

  const cycles = await listCyclesNaturel(supabase, userId)
  const target = resolveTargetCycleForRealDatesNaturel(cycles, cycleId, payload)
  if (!target?.id) throw new Error('Cycle introuvable.')

  const patch = {
    [COL_NATUREL.dateDebutReglesReelle]: dateDebutReglesReelle,
    [COL_NATUREL.dateFinReglesReelle]: dateFinReglesReelle,
    [COL_NATUREL.dateDebutReglesEstimee]: dateDebutReglesReelle,
  }

  const { error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', target.id)
    .eq('user_id', userId)
  if (error) throw error

  const { syncRealRulesDatesBetweenModes } = await import('./menstruationCycleModeSwitch.js')
  await syncRealRulesDatesBetweenModes(supabase, userId, {
    numeroCycle: target[COL_NATUREL.numeroCycle],
    dateDebutRegles: dateDebutReglesReelle,
    dateFinReglesReelle,
  })

  await syncForecastCyclesNaturel(supabase, userId)
  return await listCyclesNaturel(supabase, userId)
}

export function determinePhaseNaturel(cycle, nowISO) {
  if (!cycle || !nowISO) return null

  const dateDebutRegles = getEffectiveDebutReglesNaturel(cycle)
  if (!dateDebutRegles) return null

  const dayInCycle = daysBetweenISO(dateDebutRegles, nowISO)
  if (dayInCycle == null || dayInCycle < 0) return null

  if (isInMenstruellePhaseNaturel(cycle, nowISO)) return 'menstruelle'

  const starts = computeNaturalPhaseStartDates(cycle, nowISO)
  if (!starts.folliculaire || !starts.ovulatoire || !starts.luteale) {
    const cycleLen = clampInt(cycle[COL_NATUREL.dureeCycle], 15, 60, DEFAULT_CYCLE_LEN)
    const rulesLen = clampInt(cycle[COL_NATUREL.dureeRegles], 1, 20, DEFAULT_RULES_LEN)
    const follicularEnd = cycleLen - DUREE_PHASE_LUTEALE
    if (dayInCycle < rulesLen) return 'menstruelle'
    if (dayInCycle <= follicularEnd) return 'folliculaire'
    if (dayInCycle <= follicularEnd + DUREE_OVULATION) return 'ovulatoire'
    return 'lutéale'
  }

  if (nowISO < starts.folliculaire) return 'menstruelle'
  if (nowISO < starts.ovulatoire) return 'folliculaire'
  if (nowISO < starts.luteale) return 'ovulatoire'
  return 'lutéale'
}

export function computeNaturalPhaseStartDates(row, todayISO = getLocalTodayISO()) {
  if (!row) return { folliculaire: null, ovulatoire: null, luteale: null }

  if (isOngoingRealReglesPeriodNaturel(row, todayISO)) {
    return { folliculaire: null, ovulatoire: null, luteale: null }
  }

  const dateDebutRegles = getEffectiveDebutReglesNaturel(row)
  const realFin = row[COL_NATUREL.dateFinReglesReelle]
  const cycleLen = clampInt(row[COL_NATUREL.dureeCycle], 15, 60, DEFAULT_CYCLE_LEN)
  const rulesLen = clampInt(row[COL_NATUREL.dureeRegles], 1, 20, DEFAULT_RULES_LEN)
  if (!dateDebutRegles) return { folliculaire: null, ovulatoire: null, luteale: null }

  const follicularEnd = cycleLen - DUREE_PHASE_LUTEALE
  const folliculaire = realFin
    ? addDaysToISODate(realFin, 1)
    : addDaysToISODate(dateDebutRegles, rulesLen)

  return {
    folliculaire,
    ovulatoire: addDaysToISODate(dateDebutRegles, follicularEnd + 1),
    luteale: addDaysToISODate(dateDebutRegles, follicularEnd + DUREE_OVULATION + 1),
  }
}
