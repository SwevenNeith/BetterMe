/**
 * Estimation du fil DMC (écheveaux) pour un motif points de croix.
 *
 * Formule classique :
 *   mètres = nb_croix × longueur_moyenne_par_croix
 *   écheveaux = mètres / longueur_écheveau
 *
 * Longueur moyenne par croix = 2 diagonales d’une case × nb de brins
 * (une croix pleine = 2 jambes en diagonale).
 * Case Aida C pts/pouce → côté = 1/C pouce → diagonale = √2/C.
 */

/** Longueur d’un écheveau DMC 6 brins (mètres). */
export const DMC_SKEIN_LENGTH_M = 8

/** Comptages Aida courants (pts / pouce). */
export const AIDA_COUNTS = [11, 14, 16, 18]

/**
 * Longueur moyenne de fil consommée par une croix pleine (mètres),
 * pour un nombre de brins donné sur une toile Aida.
 *
 * @param {number} aidaCount pts/pouce (11|14|16|18…)
 * @param {number} strands nombre de brins (1–6)
 * @returns {number} mètres par croix
 */
export function metersPerCross(aidaCount, strands) {
  const count = Math.max(1, Number(aidaCount) || 14)
  const brins = Math.max(1, Number(strands) || 2)
  // 2 diagonales × conversion pouce → mètre × brins
  return ((2 * Math.SQRT2) / count) * 0.0254 * brins
}

/**
 * Estime le fil pour une couleur.
 *
 * @param {number} stitchCount nombre de croix
 * @param {{ aidaCount?: number, strands?: number, skeinLengthM?: number }} [options]
 * @returns {{
 *   meters: number,
 *   skeinsExact: number,
 *   skeins: number,
 *   metersPerCross: number,
 * }}
 */
export function estimateFlossForStitches(stitchCount, options = {}) {
  const aidaCount = options.aidaCount ?? 14
  const strands = options.strands ?? 2
  const skeinLengthM = options.skeinLengthM ?? DMC_SKEIN_LENGTH_M
  const perCross = metersPerCross(aidaCount, strands)
  const n = Math.max(0, Number(stitchCount) || 0)
  const meters = n * perCross
  const skeinsExact = skeinLengthM > 0 ? meters / skeinLengthM : 0
  const skeins = n > 0 ? Math.max(1, Math.ceil(skeinsExact)) : 0
  return {
    meters,
    skeinsExact,
    skeins,
    metersPerCross: perCross,
  }
}

/**
 * Enrichit une légende DMC avec l’estimation d’écheveaux.
 *
 * @param {Array<{ count: number, [key: string]: unknown }>} legend
 * @param {{ aidaCount?: number, strands?: number }} options
 * @returns {Array<object>}
 */
export function enrichLegendWithFloss(legend, options = {}) {
  if (!Array.isArray(legend)) return []
  return legend.map((item) => {
    const est = estimateFlossForStitches(item.count, options)
    return {
      ...item,
      meters: est.meters,
      skeinsExact: est.skeinsExact,
      skeins: est.skeins,
    }
  })
}

/**
 * Totaux sur une légende enrichie.
 * @param {Array<{ count?: number, meters?: number, skeins?: number }>} rows
 */
export function summarizeFlossLegend(rows) {
  let stitches = 0
  let meters = 0
  let skeins = 0
  for (const row of rows || []) {
    stitches += row.count || 0
    meters += row.meters || 0
    skeins += row.skeins || 0
  }
  return { stitches, meters, skeins, colors: rows?.length || 0 }
}
