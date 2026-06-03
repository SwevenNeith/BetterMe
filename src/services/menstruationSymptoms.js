import { computeJourRelatif } from './menstruationSymptomEnrichment.js'

const TABLE = 'menstruation_symptomes'

export const TYPE_CYCLE = {
  PILULE: 'pilule',
  NATUREL: 'naturel',
}

/** Clé UI (sans accent) → colonne Supabase */
export const SYMPTOM_UI_TO_DB = {
  flux: 'flux',
  couleur_flux: 'couleur_flux',
  caillots: 'caillots',
  douleurs_crampes: 'douleurs_crampes',
  douleurs_dos: 'douleurs_dos',
  maux_de_tete: 'maux_de_tête',
  douleur_ovulation: 'douleur_ovulation',
  douleur_ovulation_cote: 'côté_ovulation',
  humeur: 'humeur',
  irritabilite: 'irritabilité',
  anxiete: 'anxiété',
  tristesse: 'tristesse',
  pleurs: 'pleurs',
  brain_fog: 'brain_fog',
  fatigue: 'fatigue',
  energie: 'énergie',
  nausees: 'nausées',
  ballonnements: 'ballonnements',
  sensibilite_seins: 'sensibilité_seins',
  retention_eau: 'rétention_eau',
  sommeil: 'sommeil',
  libido: 'libido',
  acne: 'acné',
  peau: 'peau',
  fringales: 'fringales',
  pertes_vaginales: 'pertes_vaginales',
}

const PERTES_VAGINALES_UI_TO_DB = {
  cremeuses: 'crémeuses',
}

const PERTES_VAGINALES_DB_TO_UI = {
  crémeuses: 'cremeuses',
}

export function uiValueToDb(key, value) {
  if (value === null || value === undefined) return null
  if (key === 'couleur_flux' && value === 'rose') return 'rosé'
  if (key === 'pertes_vaginales' && PERTES_VAGINALES_UI_TO_DB[value]) {
    return PERTES_VAGINALES_UI_TO_DB[value]
  }
  return value
}

export function dbValueToUi(key, value) {
  if (value === null || value === undefined) return null
  if (key === 'couleur_flux' && value === 'rosé') return 'rose'
  if (key === 'pertes_vaginales' && PERTES_VAGINALES_DB_TO_UI[value]) {
    return PERTES_VAGINALES_DB_TO_UI[value]
  }
  return value
}

export function formatEntryLabel(entry) {
  if (!entry?.created_at) return 'Saisie'
  const d = new Date(entry.created_at)
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function fetchSymptomEntriesForDate(supabase, userId, dateJour, typeCycle) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('date_jour', dateJour)
    .eq('type_cycle', typeCycle)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function fetchSymptomEntryById(supabase, userId, entryId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', entryId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

export function rowToSymptomValues(row, symptomDefs) {
  const values = {}
  for (const def of symptomDefs) {
    values[def.key] = null
    const col = SYMPTOM_UI_TO_DB[def.key]
    if (col && row && row[col] != null && row[col] !== '') {
      values[def.key] = dbValueToUi(def.key, row[col])
    }
    if (def.sideKey) {
      values[def.sideKey] = null
      const sideCol = SYMPTOM_UI_TO_DB[def.sideKey]
      if (sideCol && row && row[sideCol] != null) {
        values[def.sideKey] = row[sideCol]
      }
    }
  }
  return values
}

/**
 * @typedef {Object} SymptomSaveMeta
 * @property {string} dateJour
 * @property {string} phase
 * @property {string} typeCycle
 * @property {string} cycleId
 * @property {object} [cycle]
 * @property {string|null} [entryId]
 */

/**
 * Met à jour la saisie en cours ou en crée une nouvelle si besoin.
 * @returns {Promise<{ row: object|null, entryId: string|null }>}
 */
export async function saveSymptomField(supabase, userId, meta, fieldKey, value) {
  if (!userId || !meta?.dateJour || !meta?.cycleId) {
    throw new Error('Données de cycle manquantes pour enregistrer le symptôme.')
  }
  if (!SYMPTOM_UI_TO_DB[fieldKey]) {
    return { row: null, entryId: meta.entryId ?? null }
  }

  const col = SYMPTOM_UI_TO_DB[fieldKey]
  const dbValue = uiValueToDb(fieldKey, value)
  let entryId = meta.entryId ?? null

  const jourRelatif =
    meta.cycle && meta.dateJour
      ? computeJourRelatif(meta.dateJour, meta.cycle, meta.typeCycle)
      : null

  if (entryId) {
    const patch = {
      [col]: dbValue,
      phase: meta.phase,
      cycle_id: meta.cycleId,
      type_cycle: meta.typeCycle,
      ...(jourRelatif != null ? { jour_relatif: jourRelatif } : {}),
    }
    const { data, error } = await supabase
      .from(TABLE)
      .update(patch)
      .eq('id', entryId)
      .eq('user_id', userId)
      .select()

    if (error) throw error
    const row = data?.[0]
    if (!row?.id) {
      throw new Error(
        'UPDATE menstruation_symptomes : aucune ligne mise à jour (vérifie la policy RLS UPDATE).',
      )
    }
    return { row, entryId: row.id }
  }

  if (dbValue === null) {
    return { row: null, entryId: null }
  }

  const insert = {
    user_id: userId,
    cycle_id: meta.cycleId,
    type_cycle: meta.typeCycle,
    date_jour: meta.dateJour,
    phase: meta.phase,
    ...(jourRelatif != null ? { jour_relatif: jourRelatif } : {}),
    [col]: dbValue,
  }

  const { data, error } = await supabase.from(TABLE).insert(insert).select()
  if (error) throw error
  const row = data?.[0]
  if (!row?.id) {
    throw new Error(
      'INSERT menstruation_symptomes : aucune ligne créée (vérifie la policy RLS INSERT).',
    )
  }
  return { row, entryId: row.id }
}
