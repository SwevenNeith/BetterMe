import { getLocalTodayISO } from './scheduledReminders.js'
import { getCurrentCycle } from './menstruationSymptomEnrichment.js'
import { TYPE_CYCLE } from './menstruationSymptoms.js'
import {
  COL,
  addDaysToISODate,
  getEffectiveDebutRegles,
  getDureeReglesForCalcul,
  createMenstruationCyclePilule,
} from './menstruationCycles.js'
import {
  COL_NATUREL,
  createMenstruationCycleNaturel,
} from './menstruationCyclesNaturel.js'

const JOURS_COMPRIMES_ACTIFS = 21

function getSourceCycle(sourceMode, sourceCycles, todayISO) {
  const typeCycle = sourceMode === 'pilule' ? TYPE_CYCLE.PILULE : TYPE_CYCLE.NATUREL
  return getCurrentCycle(sourceCycles, todayISO, typeCycle)
}

export function buildNaturelSeedFromPiluleCycle(piluleCycle) {
  const dateDebutRegles =
    getEffectiveDebutRegles(piluleCycle) ?? piluleCycle[COL.dateDebutPlaquette]
  if (!dateDebutRegles) {
    throw new Error('Impossible de déterminer le début des règles à partir du cycle pilule actuel.')
  }

  return {
    numeroCycle: 1,
    dateDebutRegles,
    dateFinReglesReelle: piluleCycle[COL.dateFinReglesReelle] ?? null,
    dureeCycle: piluleCycle[COL.dureeCycle] ?? 28,
    dureeRegles: getDureeReglesForCalcul(piluleCycle),
  }
}

export function buildPiluleSeedFromNaturelCycle(naturelCycle) {
  const dateDebutRegles = naturelCycle[COL_NATUREL.dateDebutRegles]
  if (!dateDebutRegles) {
    throw new Error('Impossible de déterminer le début des règles à partir du cycle naturel actuel.')
  }

  const dateFinRegles = naturelCycle[COL_NATUREL.dateFinReglesReelle] ?? null
  const dureeRegles = naturelCycle[COL_NATUREL.dureeRegles] ?? 5

  return {
    dateDebutPlaquette: addDaysToISODate(dateDebutRegles, -JOURS_COMPRIMES_ACTIFS),
    dateDebutReglesReelle: dateDebutRegles,
    dateFinReglesReelle: dateFinRegles,
    lastPeriodEndUnknown: !dateFinRegles,
    dureeReglesDays: dureeRegles,
    dureeReglesUnknown: false,
  }
}

/**
 * Crée un premier cycle dans le mode cible en reprenant les dates du cycle actif du mode source.
 */
export async function seedCycleForModeSwitch(
  supabase,
  userId,
  { sourceMode, sourceCycles, targetMode, todayISO = getLocalTodayISO() },
) {
  const sourceCycle = getSourceCycle(sourceMode, sourceCycles, todayISO)
  if (!sourceCycle) {
    throw new Error('Aucun cycle actif à reprendre pour ce changement de mode.')
  }

  if (targetMode === 'naturel') {
    if (sourceMode !== 'pilule') {
      throw new Error('Le cycle source doit être en mode pilule.')
    }
    return createMenstruationCycleNaturel(
      supabase,
      userId,
      buildNaturelSeedFromPiluleCycle(sourceCycle),
    )
  }

  if (targetMode === 'pilule') {
    if (sourceMode !== 'naturel') {
      throw new Error('Le cycle source doit être en mode naturel.')
    }
    return createMenstruationCyclePilule(
      supabase,
      userId,
      buildPiluleSeedFromNaturelCycle(sourceCycle),
    )
  }

  throw new Error('Mode de cycle cible invalide.')
}
