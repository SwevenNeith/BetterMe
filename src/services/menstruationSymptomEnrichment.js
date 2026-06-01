import { daysBetweenISO, getEffectiveDebutRegles, COL } from './menstruationCycles.js'
import { COL_NATUREL } from './menstruationCyclesNaturel.js'
import { SYMPTOM_UI_TO_DB, TYPE_CYCLE } from './menstruationSymptoms.js'
import { ANALYZED_SYMPTOM_KEYS, meetsThreshold } from './menstruationPatternThresholds.js'

const SYMPTOMS_TABLE = 'menstruation_symptomes'

/** Date de début du cycle pour le jour relatif : début des règles (réel ou estimé). */
export function getCycleStartDate(cycle, typeCycle) {
  if (!cycle) return null
  if (typeCycle === TYPE_CYCLE.NATUREL) return cycle[COL_NATUREL.dateDebutRegles]
  return getEffectiveDebutRegles(cycle) ?? cycle[COL.dateDebutPlaquette]
}

/** jour_dans_cycle = date_jour − date_début_règles (en jours calendaires, 0 le 1er jour). */
export function computeJourDansCycle(dateJour, cycle, typeCycle) {
  const start = getCycleStartDate(cycle, typeCycle)
  if (!start || !dateJour) return null
  const diff = daysBetweenISO(start, dateJour)
  if (diff == null || diff < 0) return null
  return diff
}

export function getCycleEndDate(cycle, typeCycle) {
  if (!cycle) return null
  if (typeCycle === TYPE_CYCLE.NATUREL) {
    return cycle[COL_NATUREL.dateProchainesReglesEstimee]
  }
  return cycle[COL.dateProchainePlaquette]
}

export function getCycleLength(cycle, typeCycle) {
  if (!cycle) return 28
  if (typeCycle === TYPE_CYCLE.NATUREL) {
    return cycle[COL_NATUREL.dureeCycle] ?? 28
  }
  return cycle[COL.dureeCycle] ?? 28
}

export function computeJourRelatif(dateJour, cycle, typeCycle) {
  const jourDansCycle = computeJourDansCycle(dateJour, cycle, typeCycle)
  const len = getCycleLength(cycle, typeCycle)
  if (jourDansCycle == null || !len) return null
  return Math.max(0, Math.min(100, Math.round((jourDansCycle / len) * 100)))
}

export function getSymptomRawValue(row, symptomKey) {
  const col = SYMPTOM_UI_TO_DB[symptomKey]
  if (!col || !row) return null
  return row[col]
}

/**
 * Fusionne plusieurs saisies du même jour : seuil = vrai si une saisie dépasse le seuil ;
 * valeur numérique = max des saisies (pour moyennes).
 */
export function mergeDaySymptomState(entries) {
  const state = {}
  for (const key of ANALYZED_SYMPTOM_KEYS) {
    state[key] = { values: [], above: false }
  }
  for (const entry of entries) {
    for (const key of ANALYZED_SYMPTOM_KEYS) {
      const raw = getSymptomRawValue(entry, key)
      if (raw == null || raw === '') continue
      state[key].values.push(typeof raw === 'boolean' ? raw : Number(raw))
      if (meetsThreshold(key, raw)) state[key].above = true
    }
  }
  for (const key of ANALYZED_SYMPTOM_KEYS) {
    const nums = state[key].values.filter((v) => typeof v === 'number' && !Number.isNaN(v))
    state[key].numeric =
      nums.length > 0 ? nums.reduce((a, b) => Math.max(a, b), nums[0]) : null
  }
  return state
}

/**
 * @returns {Promise<Array<{ cycleId, dateJour, jourRelatif, symptoms, cycle }>>}
 */
export async function buildDailySymptomTimeline(supabase, userId, typeCycle, cycles) {
  const { data: rows, error } = await supabase
    .from(SYMPTOMS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('type_cycle', typeCycle)

  if (error) throw error

  const cycleById = new Map(cycles.map((c) => [c.id, c]))
  const groups = new Map()

  for (const row of rows ?? []) {
    const cycle = cycleById.get(row.cycle_id)
    if (!cycle) continue
    const key = `${row.cycle_id}|${row.date_jour}`
    if (!groups.has(key)) {
      groups.set(key, {
        cycleId: row.cycle_id,
        dateJour: row.date_jour,
        cycle,
        entries: [],
      })
    }
    groups.get(key).entries.push(row)
  }

  const timeline = []
  for (const g of groups.values()) {
    const jourRelatif = computeJourRelatif(g.dateJour, g.cycle, typeCycle)
    timeline.push({
      cycleId: g.cycleId,
      dateJour: g.dateJour,
      jourRelatif,
      cycle: g.cycle,
      symptoms: mergeDaySymptomState(g.entries),
    })
  }

  return timeline.sort((a, b) => a.dateJour.localeCompare(b.dateJour))
}

export async function backfillJourRelatif(supabase, userId, typeCycle, cycles) {
  const { data: rows, error } = await supabase
    .from(SYMPTOMS_TABLE)
    .select('id, cycle_id, date_jour, jour_relatif')
    .eq('user_id', userId)
    .eq('type_cycle', typeCycle)

  if (error) throw error

  const cycleById = new Map(cycles.map((c) => [c.id, c]))
  const updates = []

  for (const row of rows ?? []) {
    const cycle = cycleById.get(row.cycle_id)
    if (!cycle) continue
    const jr = computeJourRelatif(row.date_jour, cycle, typeCycle)
    if (jr == null || row.jour_relatif === jr) continue
    updates.push({ id: row.id, jour_relatif: jr })
  }

  for (const u of updates) {
    const { error: upErr } = await supabase
      .from(SYMPTOMS_TABLE)
      .update({ jour_relatif: u.jour_relatif })
      .eq('id', u.id)
      .eq('user_id', userId)
    if (upErr) throw upErr
  }

  return updates.length
}

export function getCurrentCycle(cycles, todayISO, typeCycle) {
  const sorted = [...cycles].sort(
    (a, b) =>
      (b[typeCycle === TYPE_CYCLE.NATUREL ? COL_NATUREL.numeroCycle : COL.numeroCycle] ?? 0) -
      (a[typeCycle === TYPE_CYCLE.NATUREL ? COL_NATUREL.numeroCycle : COL.numeroCycle] ?? 0),
  )
  for (const c of sorted) {
    const start = getCycleStartDate(c, typeCycle)
    const end = getCycleEndDate(c, typeCycle)
    if (start && start <= todayISO && (!end || todayISO < end)) return c
  }
  return sorted[0] ?? null
}

export function isCycleEnded(cycle, todayISO, typeCycle) {
  const end = getCycleEndDate(cycle, typeCycle)
  return Boolean(end && todayISO >= end)
}

export function shouldRecalculatePatterns(cycles, todayISO, typeCycle) {
  if (!cycles.length) return false
  return cycles.some((c) => isCycleEnded(c, todayISO, typeCycle))
}
