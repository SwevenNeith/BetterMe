/**
 * Génération de la grille points de croix :
 * tableau 2D de cellules { dmcCode, rgb, symbol }
 * avec un symbole unique par fil DMC utilisé (lisible N&B).
 */

import { matchRgbToClosestDmc } from './matchDmc.js'
import { renderCrossStitchCanvas } from './renderCrossStitchCanvas.js'

export { renderCrossStitchCanvas, pickCellSize } from './renderCrossStitchCanvas.js'

/**
 * Alphabet de symboles distincts, optimisé pour impression N&B
 * (évite I/l/1, O/0, etc.).
 */
export const CROSS_STITCH_SYMBOLS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M',
  'N', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'k', 'm', 'n',
  'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
  '2', '3', '4', '5', '6', '7', '8', '9',
  '+', '×', '*', '#', '@', '&', '%', '=',
  '▲', '▼', '◆', '●', '○', '■', '□', '★', '☆', '♦', '♣', '♠',
  '◇', '△', '▽', '▣', '▤', '▥', '▦', '▧', '▨', '▩',
  '←', '↑', '→', '↓', '↔', '↕',
  'α', 'β', 'γ', 'δ', 'ε', 'θ', 'λ', 'μ', 'π', 'σ', 'φ', 'ω',
]

/**
 * @param {number} index
 * @returns {string}
 */
export function symbolForIndex(index) {
  if (index < CROSS_STITCH_SYMBOLS.length) {
    return CROSS_STITCH_SYMBOLS[index]
  }
  // Dépassement rare : combinaison lettre + chiffre
  const base = CROSS_STITCH_SYMBOLS[index % CROSS_STITCH_SYMBOLS.length]
  const n = Math.floor(index / CROSS_STITCH_SYMBOLS.length)
  return `${base}${n}`
}

/**
 * Construit la grille 2D + légende + ImageData remappée DMC.
 *
 * @param {ImageData} imageData image quantifiée (ou quelconque)
 * @returns {{
 *   grid: Array<Array<{ dmcCode: string, rgb: { r: number, g: number, b: number }, symbol: string } | null>>,
 *   legend: Array<{ dmcCode: string, dmcName: string, rgb: { r: number, g: number, b: number }, hex: string, symbol: string, count: number }>,
 *   width: number,
 *   height: number,
 *   imageData: ImageData,
 * }}
 */
export function buildCrossStitchGrid(imageData) {
  const { data, width, height } = imageData
  /** @type {Map<string, { dmcCode: string, dmcName: string, rgb: { r: number, g: number, b: number }, hex: string, count: number }>} */
  const used = new Map()
  /** cache RGB pixel → entrée DMC */
  const pixelCache = new Map()

  const rows = []
  const out = new ImageData(width, height)

  for (let y = 0; y < height; y++) {
    const row = []
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const o = i * 4
      const a = data[o + 3]

      if (a < 16) {
        row.push(null)
        out.data[o + 3] = 0
        continue
      }

      const key = (data[o] << 16) | (data[o + 1] << 8) | data[o + 2]
      let entry = pixelCache.get(key)
      if (!entry) {
        const { dmc } = matchRgbToClosestDmc({
          r: data[o],
          g: data[o + 1],
          b: data[o + 2],
        })
        entry = {
          dmcCode: dmc.code,
          dmcName: dmc.name,
          rgb: { r: dmc.r, g: dmc.g, b: dmc.b },
          hex: dmc.hex,
        }
        pixelCache.set(key, entry)
      }

      const prev = used.get(entry.dmcCode)
      if (prev) {
        prev.count += 1
      } else {
        used.set(entry.dmcCode, {
          dmcCode: entry.dmcCode,
          dmcName: entry.dmcName,
          rgb: entry.rgb,
          hex: entry.hex,
          count: 1,
        })
      }

      // symbole provisoire — réécrit après légende triée
      row.push({
        dmcCode: entry.dmcCode,
        rgb: entry.rgb,
        symbol: '',
      })

      out.data[o] = entry.rgb.r
      out.data[o + 1] = entry.rgb.g
      out.data[o + 2] = entry.rgb.b
      out.data[o + 3] = 255
    }
    rows.push(row)
  }

  // Légende : plus utilisés d’abord, symbole unique stable
  const legend = [...used.values()]
    .sort((a, b) => b.count - a.count || String(a.dmcCode).localeCompare(String(b.dmcCode), 'en'))
    .map((item, index) => ({
      ...item,
      symbol: symbolForIndex(index),
    }))

  const symbolByCode = new Map(legend.map((item) => [item.dmcCode, item.symbol]))

  for (const row of rows) {
    for (const cell of row) {
      if (!cell) continue
      cell.symbol = symbolByCode.get(cell.dmcCode) || '?'
    }
  }

  return {
    grid: rows,
    legend,
    width,
    height,
    imageData: out,
  }
}

/**
 * Aperçu symboles (délègue au renderer Aida).
 * @param {HTMLCanvasElement} canvas
 * @param {Array<Array<{ symbol: string, rgb?: { r: number, g: number, b: number } } | null>>} grid
 * @param {{ cellSize?: number }} [options]
 */
export function drawSymbolGridPreview(canvas, grid, options = {}) {
  renderCrossStitchCanvas(canvas, grid, { ...options, mode: 'symbols' })
}
