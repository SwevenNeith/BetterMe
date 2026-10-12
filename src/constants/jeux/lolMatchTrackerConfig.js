/**
 * Valeurs de haste non structurées dans Data Dragon.
 * À vérifier à chaque patch (wiki LoL / notes de patch / description item).
 *
 * Sources (patch Data Dragon 16.20.1) :
 * - Bottes de lucidité (3158) : description item.json « +10 accélération de sort d'invocateur »
 * - Lucidité pourpre (3171) : description item.json « +20 accélération de sort d'invocateur »
 * - Savoir cosmique (Cosmic Insight, rune 8347) : +18 accélération de sorts d'invocateur
 *   (valeur historique wiki / patch notes — absente de runesReforged.json)
 */

/** @type {Record<string, number>} id item → summoner spell haste */
export const SUMMONER_HASTE_BY_BOOTS_ID = {
  3158: 10,
  3171: 20,
}

/** Id rune Data Dragon « Savoir cosmique ». */
export const COSMIC_INSIGHT_RUNE_ID = 8347

/** Accélération de sorts d'invocateur octroyée par Cosmic Insight. */
export const COSMIC_INSIGHT_SUMMONER_HASTE = 18

/** Clé localStorage du cache Data Dragon (suffixée par la version patch). */
export const DDRAGON_CACHE_PREFIX = 'betterme-lol-ddragon-v2:'

/** Clé localStorage de l’état de partie en cours. */
export const MATCH_TRACKER_STORAGE_KEY = 'betterme-lol-match-tracker-v3'

/** Kind scheduled_notifications (préfixe) pour les fins de cooldown. */
export const LOL_MATCH_COOLDOWN_KIND_PREFIX = 'lol_match_cooldown:'

/** Id Data Dragon du sort Châtiment (SR). */
export const SMITE_SUMMONER_ID = 'SummonerSmite'

export const MATCH_ROLES = [
  { id: 'TOP', label: 'Top' },
  { id: 'JUNGLE', label: 'Jungle' },
  { id: 'MIDDLE', label: 'Mid' },
  { id: 'BOTTOM', label: 'ADC' },
  { id: 'UTILITY', label: 'Support' },
]

export const JUNGLE_ROLE_ID = 'JUNGLE'

/** Niveaux typiques de point d’ultime (maxrank 3). */
export const STANDARD_ULT_LEVELS = [6, 11, 16]
