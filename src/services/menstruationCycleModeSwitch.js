import { getLocalTodayISO } from './scheduledReminders.js'
import { getCurrentCycle } from './menstruationSymptomEnrichment.js'
import { TYPE_CYCLE } from './menstruationSymptoms.js'
import {
  COL,
  addDaysToISODate,
  daysBetweenISO,
  getDureeReglesForCalcul,
  applyDureeReglesFields,
  applySpmDatesEstimees,
  computeDelaiRegles,
  computeDureeSpmReelle,
  buildMenstruationCyclePiluleRecord,
  listCyclesPilule,
  syncForecastCyclesPilule,
} from './menstruationCycles.js'
import {
  COL_NATUREL,
  buildMenstruationCycleNaturelRecord,
  getEffectiveDebutReglesNaturel,
  getEffectiveFinReglesNaturel,
  listCyclesNaturel,
  syncForecastCyclesNaturel,
} from './menstruationCyclesNaturel.js'

const TABLE_PILULE = 'menstruation_cycles_pilule'
const TABLE_NATUREL = 'menstruation_cycles_naturel'
const SYMPTOMS_TABLE = 'menstruation_symptomes'
const JOURS_COMPRIMES_ACTIFS = 21

function getNumeroCol(mode) {
  return mode === 'pilule' ? COL.numeroCycle : COL_NATUREL.numeroCycle
}

async function listCyclesForMode(supabase, userId, mode) {
  return mode === 'pilule'
    ? listCyclesPilule(supabase, userId)
    : listCyclesNaturel(supabase, userId)
}

export function buildNaturelSeedFromPiluleCycle(piluleCycle) {
  const dateDebutRegles =
    piluleCycle[COL.dateDebutReglesReelle] ?? piluleCycle[COL.dateDebutReglesEstimee] ?? null
  if (!dateDebutRegles) {
    throw new Error('Impossible de déterminer le début des règles à partir du cycle pilule actuel.')
  }

  const dateFinReglesReelle = piluleCycle[COL.dateFinReglesReelle] ?? null
  let dureeRegles = piluleCycle[COL.dureeReglesReelle] ?? getDureeReglesForCalcul(piluleCycle)
  if (dateFinReglesReelle) {
    const diff = daysBetweenISO(dateDebutRegles, dateFinReglesReelle)
    if (diff != null && diff >= 0) {
      dureeRegles = diff + 1
    }
  }

  return {
    numeroCycle: piluleCycle[COL.numeroCycle] ?? 1,
    dateDebutReglesEstimee: piluleCycle[COL.dateDebutReglesEstimee] ?? dateDebutRegles,
    dateDebutReglesReelle: piluleCycle[COL.dateDebutReglesReelle] ?? null,
    dateFinReglesReelle,
    dureeCycle: piluleCycle[COL.dureeCycle] ?? 28,
    dureeRegles,
  }
}

export function buildPiluleSeedFromNaturelCycle(naturelCycle, prevNaturelCycle = null) {
  const dateDebutRegles = getEffectiveDebutReglesNaturel(naturelCycle)
  if (!dateDebutRegles) {
    throw new Error('Impossible de déterminer le début des règles à partir du cycle naturel actuel.')
  }

  const dateFinRegles = getEffectiveFinReglesNaturel(naturelCycle)
  const dureeRegles = naturelCycle[COL_NATUREL.dureeRegles] ?? 5

  let dateDebutPlaquette
  if (prevNaturelCycle) {
    const prevStart = getEffectiveDebutReglesNaturel(prevNaturelCycle)
    const prevLen = prevNaturelCycle[COL_NATUREL.dureeCycle] ?? 28
    dateDebutPlaquette =
      prevNaturelCycle[COL_NATUREL.dateProchainesReglesEstimee] ??
      (prevStart ? addDaysToISODate(prevStart, prevLen) : null)
  }
  if (!dateDebutPlaquette) {
    dateDebutPlaquette = addDaysToISODate(dateDebutRegles, -JOURS_COMPRIMES_ACTIFS)
  }

  return {
    numeroCycle: naturelCycle[COL_NATUREL.numeroCycle] ?? 1,
    dateDebutPlaquette,
    dateDebutReglesReelle: naturelCycle[COL_NATUREL.dateDebutReglesReelle] ?? dateDebutRegles,
    dateFinReglesReelle: dateFinRegles,
    lastPeriodEndUnknown: !dateFinRegles,
    dureeReglesDays: dureeRegles,
    dureeReglesUnknown: false,
  }
}

async function deleteFutureCycles(supabase, userId, mode, maxNumero) {
  const cycles = await listCyclesForMode(supabase, userId, mode)
  const col = getNumeroCol(mode)
  const toDelete = cycles.filter((c) => (c[col] ?? 0) > maxNumero)
  if (!toDelete.length) return

  const ids = toDelete.map((c) => c.id).filter(Boolean)
  const typeCycle = mode === 'pilule' ? TYPE_CYCLE.PILULE : TYPE_CYCLE.NATUREL

  const { error: symErr } = await supabase
    .from(SYMPTOMS_TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('type_cycle', typeCycle)
    .in('cycle_id', ids)
  if (symErr) throw symErr

  const table = mode === 'pilule' ? TABLE_PILULE : TABLE_NATUREL
  const { error } = await supabase.from(table).delete().eq('user_id', userId).gt(col, maxNumero)
  if (error) throw error
}

async function insertNaturelCycle(supabase, userId, payload) {
  const record = buildMenstruationCycleNaturelRecord(userId, payload)
  const { data, error } = await supabase.from(TABLE_NATUREL).insert(record).select('*').single()
  if (error) throw error
  return data
}

async function updateNaturelCycle(supabase, userId, cycleId, payload) {
  const record = buildMenstruationCycleNaturelRecord(userId, payload)
  const { user_id: _userId, [COL_NATUREL.numeroCycle]: _num, ...patch } = record
  const { error } = await supabase
    .from(TABLE_NATUREL)
    .update(patch)
    .eq('id', cycleId)
    .eq('user_id', userId)
  if (error) throw error
}

async function insertPiluleCycle(supabase, userId, numeroCycle, payload) {
  const record = buildMenstruationCyclePiluleRecord(userId, numeroCycle, payload)
  const { data, error } = await supabase.from(TABLE_PILULE).insert(record).select().single()
  if (error) throw error
  return data
}

async function updatePiluleCycle(supabase, userId, numeroCycle, payload, cycleId) {
  const record = buildMenstruationCyclePiluleRecord(userId, numeroCycle, payload)
  const { user_id: _userId, [COL.numeroCycle]: _num, ...patch } = record
  const { error } = await supabase
    .from(TABLE_PILULE)
    .update(patch)
    .eq('id', cycleId)
    .eq('user_id', userId)
  if (error) throw error
}

async function syncTargetFromSource(
  supabase,
  userId,
  { sourceMode, sourceCycles, targetMode, currentNumero },
) {
  const targetCycles = await listCyclesForMode(supabase, userId, targetMode)
  const targetCol = getNumeroCol(targetMode)
  const sourceCol = getNumeroCol(sourceMode)
  const targetByNum = new Map(targetCycles.map((c) => [c[targetCol], c]))
  const sourceByNum = new Map(sourceCycles.map((c) => [c[sourceCol], c]))

  for (let n = 1; n <= currentNumero; n++) {
    const sourceCycle = sourceByNum.get(n)
    if (!sourceCycle) continue

    const existing = targetByNum.get(n)
    const isCurrent = n === currentNumero

    if (targetMode === 'naturel') {
      const payload = buildNaturelSeedFromPiluleCycle(sourceCycle)
      if (existing) {
        if (isCurrent) {
          await updateNaturelCycle(supabase, userId, existing.id, payload)
        }
      } else {
        await insertNaturelCycle(supabase, userId, payload)
      }
      continue
    }

    const prevSource = n > 1 ? sourceByNum.get(n - 1) : null
    const payload = buildPiluleSeedFromNaturelCycle(sourceCycle, prevSource)
    if (existing) {
      if (isCurrent) {
        await updatePiluleCycle(supabase, userId, n, payload, existing.id)
      }
    } else {
      await insertPiluleCycle(supabase, userId, n, payload)
    }
  }
}

async function patchPiluleCycleRealRules(
  supabase,
  userId,
  piluleCycle,
  { dateDebutRegles, dateFinReglesReelle },
) {
  if (!piluleCycle?.id || !dateDebutRegles) return

  const next = { ...piluleCycle }
  next[COL.dateDebutReglesReelle] = dateDebutRegles
  next[COL.dateFinReglesReelle] = dateFinReglesReelle

  applyDureeReglesFields(next)
  next[COL.delaiRegles] = computeDelaiRegles(next)
  applySpmDatesEstimees(next)
  next[COL.dureeSpmReelle] = computeDureeSpmReelle(next)

  const { error } = await supabase
    .from(TABLE_PILULE)
    .update({
      [COL.dateDebutReglesReelle]: next[COL.dateDebutReglesReelle],
      [COL.dateFinReglesReelle]: next[COL.dateFinReglesReelle],
      [COL.dateDebutReglesEstimee]: next[COL.dateDebutReglesEstimee],
      [COL.dateFinReglesEstimee]: next[COL.dateFinReglesEstimee],
      [COL.dureeReglesReelle]: next[COL.dureeReglesReelle],
      [COL.dureeReglesEstimee]: next[COL.dureeReglesEstimee],
      [COL.delaiRegles]: next[COL.delaiRegles],
      [COL.dateDebutSpmEstimee]: next[COL.dateDebutSpmEstimee],
      [COL.dateFinSpmEstimee]: next[COL.dateFinSpmEstimee],
      [COL.dureeSpmReelle]: next[COL.dureeSpmReelle],
    })
    .eq('id', piluleCycle.id)
    .eq('user_id', userId)

  if (error) throw error
}

async function patchNaturelCycleRealRules(
  supabase,
  userId,
  naturelCycle,
  { dateDebutRegles, dateFinReglesReelle },
) {
  if (!naturelCycle?.id || !dateDebutRegles) return

  const { error } = await supabase
    .from(TABLE_NATUREL)
    .update({
      [COL_NATUREL.dateDebutReglesReelle]: dateDebutRegles,
      [COL_NATUREL.dateFinReglesReelle]: dateFinReglesReelle,
    })
    .eq('id', naturelCycle.id)
    .eq('user_id', userId)

  if (error) throw error
}

/**
 * Aligne les dates réelles de règles entre pilule et naturel pour un même numéro de cycle,
 * puis recalcule les prévisions des deux modes.
 */
export async function syncRealRulesDatesBetweenModes(
  supabase,
  userId,
  { numeroCycle, dateDebutRegles, dateFinReglesReelle },
) {
  if (!userId || !numeroCycle || !dateDebutRegles) return

  const [piluleCycles, naturelCycles] = await Promise.all([
    listCyclesPilule(supabase, userId),
    listCyclesNaturel(supabase, userId),
  ])

  const pilule = piluleCycles.find((c) => c[COL.numeroCycle] === numeroCycle)
  const naturel = naturelCycles.find((c) => c[COL_NATUREL.numeroCycle] === numeroCycle)

  await Promise.all([
    patchPiluleCycleRealRules(supabase, userId, pilule, {
      dateDebutRegles,
      dateFinReglesReelle,
    }),
    patchNaturelCycleRealRules(supabase, userId, naturel, {
      dateDebutRegles,
      dateFinReglesReelle,
    }),
  ])

  await Promise.all([
    syncForecastCyclesPilule(supabase, userId),
    syncForecastCyclesNaturel(supabase, userId),
  ])
}

/**
 * Bascule de mode : supprime les cycles futurs du mode quitté, aligne le mode cible
 * sur le cycle actuel (même numéro) puis régénère les prévisions.
 */
export async function switchMenstruationCycleMode(
  supabase,
  userId,
  { sourceMode, sourceCycles, targetMode, todayISO = getLocalTodayISO() },
) {
  const sourceType = sourceMode === 'pilule' ? TYPE_CYCLE.PILULE : TYPE_CYCLE.NATUREL
  const currentCycle = getCurrentCycle(sourceCycles, todayISO, sourceType)
  if (!currentCycle) {
    throw new Error('Aucun cycle actif à reprendre pour ce changement de mode.')
  }

  const numeroCol = getNumeroCol(sourceMode)
  const currentNumero = currentCycle[numeroCol]
  if (currentNumero == null) {
    throw new Error('Numéro de cycle introuvable.')
  }

  await deleteFutureCycles(supabase, userId, sourceMode, currentNumero)

  const trimmedSource = await listCyclesForMode(supabase, userId, sourceMode)
  const sourceUpToCurrent = trimmedSource.filter((c) => (c[numeroCol] ?? 0) <= currentNumero)

  await deleteFutureCycles(supabase, userId, targetMode, currentNumero)

  await syncTargetFromSource(supabase, userId, {
    sourceMode,
    sourceCycles: sourceUpToCurrent,
    targetMode,
    currentNumero,
  })

  if (targetMode === 'pilule') {
    await syncForecastCyclesPilule(supabase, userId)
  } else {
    await syncForecastCyclesNaturel(supabase, userId)
  }
}

/** @deprecated Utiliser switchMenstruationCycleMode */
export async function seedCycleForModeSwitch(supabase, userId, options) {
  return switchMenstruationCycleMode(supabase, userId, options)
}
