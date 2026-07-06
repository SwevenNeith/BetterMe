export const PROJECT_RESET_PERIODE = {
  JOUR: 'jour',
  SEMAINE: 'semaine',
  MOIS: 'mois',
}

export const PROJECT_RESET_PERIODE_OPTIONS = [
  { value: PROJECT_RESET_PERIODE.JOUR, label: 'Jour' },
  { value: PROJECT_RESET_PERIODE.SEMAINE, label: 'Semaine' },
  { value: PROJECT_RESET_PERIODE.MOIS, label: 'Mois' },
]

export const DEFAULT_QUANTITE_CIBLE = 0
export const DEFAULT_RESET_PERIODE = PROJECT_RESET_PERIODE.JOUR

export function hasQuantiteTracking(item) {
  return Number(item?.quantite_cible) >= 1
}

export function normalizeResetPeriode(value) {
  const v = String(value ?? '').trim().toLowerCase()
  if (v === PROJECT_RESET_PERIODE.SEMAINE || v === PROJECT_RESET_PERIODE.MOIS) return v
  return PROJECT_RESET_PERIODE.JOUR
}

export function normalizeQuantiteCible(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return DEFAULT_QUANTITE_CIBLE
  return Math.max(0, Math.min(999, Math.round(n)))
}
