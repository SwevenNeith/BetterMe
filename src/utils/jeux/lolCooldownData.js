/**
 * Calculs purs pour le tracker de cooldowns LoL.
 */

import {
  COSMIC_INSIGHT_RUNE_ID,
  COSMIC_INSIGHT_SUMMONER_HASTE,
  STANDARD_ULT_LEVELS,
  SUMMONER_HASTE_BY_BOOTS_ID,
} from '../../constants/jeux/lolMatchTrackerConfig.js'

/**
 * Cooldown réel = base × 100 / (100 + haste).
 * @param {number} baseCooldownSec
 * @param {number} haste
 * @returns {number} secondes (peut être décimal)
 */
export function applyHaste(baseCooldownSec, haste = 0) {
  const base = Number(baseCooldownSec)
  const h = Number(haste) || 0
  if (!Number.isFinite(base) || base < 0) return 0
  if (h <= -100) return base
  return (base * 100) / (100 + h)
}

/**
 * Rang d’ultime selon le niveau et les données Data Dragon.
 * @param {number} level 1–18
 * @param {{ maxrank?: number, cooldown?: number[] } | null | undefined} ultimateSpell
 * @returns {{
 *   rank: number,
 *   available: boolean,
 *   atypical: boolean,
 *   warning: string | null,
 *   maxRank: number,
 * }}
 */
export function ultimateRankFromLevel(level, ultimateSpell) {
  const lv = Math.max(1, Math.min(18, Math.round(Number(level) || 1)))
  const cooldown = Array.isArray(ultimateSpell?.cooldown) ? ultimateSpell.cooldown : []
  const maxRank = Math.max(
    1,
    Number(ultimateSpell?.maxrank) || cooldown.length || 3,
  )

  // Cas standard (R à 6 / 11 / 16, 3 rangs)
  const looksStandard =
    maxRank === 3 &&
    (cooldown.length === 0 || cooldown.length === 3)

  if (looksStandard) {
    let rank = 0
    if (lv >= STANDARD_ULT_LEVELS[2]) rank = 3
    else if (lv >= STANDARD_ULT_LEVELS[1]) rank = 2
    else if (lv >= STANDARD_ULT_LEVELS[0]) rank = 1
    return {
      rank,
      available: rank > 0,
      atypical: false,
      warning: null,
      maxRank,
    }
  }

  // maxrank 1 (ex. transformation Jayce) : disponible dès le début
  if (maxRank === 1) {
    return {
      rank: 1,
      available: true,
      atypical: true,
      warning:
        'Ultime atypique (1 rang). Vérifie le rang manuellement si besoin.',
      maxRank,
    }
  }

  // Autres (Udyr, etc.) : estimation linéaire + avertissement
  const estimated = Math.min(
    maxRank,
    Math.max(1, Math.ceil((lv / 18) * maxRank)),
  )
  return {
    rank: estimated,
    available: true,
    atypical: true,
    warning:
      'Champion atypique pour le R : le rang est estimé. Corrige-le manuellement.',
    maxRank,
  }
}

/**
 * Cooldown de base du R au rang donné (1-indexé).
 * @param {{ cooldown?: number[] } | null | undefined} ultimateSpell
 * @param {number} rank
 * @returns {number | null}
 */
export function ultimateBaseCooldown(ultimateSpell, rank) {
  const list = Array.isArray(ultimateSpell?.cooldown) ? ultimateSpell.cooldown : []
  const idx = Math.round(Number(rank)) - 1
  if (idx < 0 || idx >= list.length) return null
  const v = Number(list[idx])
  return Number.isFinite(v) ? v : null
}

/**
 * Haste des sorts d’invocateur (bottes + Cosmic Insight).
 * @param {{ bootsId?: string | null, secondaryTreeId?: number | null, cosmicInsight?: boolean }} opts
 */
export function summonerSpellHaste(opts = {}) {
  const bootsId = opts.bootsId != null ? String(opts.bootsId) : ''
  let haste = Number(SUMMONER_HASTE_BY_BOOTS_ID[bootsId]) || 0
  if (opts.cosmicInsight === true) {
    haste += COSMIC_INSIGHT_SUMMONER_HASTE
  }
  return haste
}

/**
 * Propose Cosmic Insight seulement si l’arbre secondaire est Inspiration (8300).
 * @param {number | null | undefined} secondaryTreeId
 */
export function canUseCosmicInsight(secondaryTreeId) {
  return Number(secondaryTreeId) === 8300
}

export { COSMIC_INSIGHT_RUNE_ID, COSMIC_INSIGHT_SUMMONER_HASTE }
