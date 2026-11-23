/** Constantes page Courses. */

export const COURSES_STATUTS = {
  A_ACHETER: 'a_acheter',
  DANS_PANIER: 'dans_panier',
  ACHETE: 'achete',
  REPORTE: 'reporte',
}

export const COURSES_STATUT_LABELS = {
  a_acheter: 'À acheter',
  dans_panier: 'Dans le panier',
  achete: 'Acheté',
  reporte: 'Reporté',
}

export const COURSES_MAGASIN_TYPES = [
  { id: 'physique', label: 'Physique' },
  { id: 'en_ligne', label: 'En ligne' },
  { id: 'autre', label: 'Autre' },
]

export const COURSES_DUREE_UNITES = [
  { id: 'jours', label: 'jours', singular: 'jour' },
  { id: 'semaines', label: 'semaines', singular: 'semaine' },
  { id: 'mois', label: 'mois', singular: 'mois' },
  { id: 'ans', label: 'ans', singular: 'an' },
]

export const COURSES_PRIORITES = [
  { id: 1, label: 'Haute', marker: '!!!' },
  { id: 2, label: 'Moyenne', marker: '!!' },
  { id: 3, label: 'Basse', marker: '!' },
]

export const COURSES_DEFAULT_ICONE = '🛒'
export const COURSES_DEFAULT_MAGASIN_COULEUR = '#AD81BE'
export const COURSES_DEFAULT_CATEGORIE_COULEUR = '#8FA2D4'
export const COURSES_DEFAULT_RENEW_THRESHOLD_DAYS = 30

export const COURSES_GROUP_BY = {
  MAGASIN: 'magasin',
  CATEGORIE: 'categorie',
}

export const COURSES_LISTE_STATUTS = {
  OUVERTE: 'ouverte',
  FERMEE: 'fermee',
}

export const COURSES_LISTE_STATUT_LABELS = {
  ouverte: 'Ouverte',
  fermee: 'Fermée',
}

export const COURSES_CACHE_KEY_PREFIX = 'betterme-courses-cache-'

export const COURSES_SANS_MAGASIN_ID = '__n_importe_ou__'
export const COURSES_SANS_CATEGORIE_ID = '__sans_rayon__'

export const COURSES_MAGASIN_COLORS = [
  '#AD81BE',
  '#8FA2D4',
  '#72A098',
  '#E8A87C',
  '#C38D9E',
  '#41B3A3',
  '#E27D60',
  '#85CDCA',
]
