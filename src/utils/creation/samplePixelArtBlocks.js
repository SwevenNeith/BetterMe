/**
 * Échantillonnage pixel art : grille alignée,
 * couleur = mode (plus fréquente) dans chaque bloc — pas de moyenne.
 */

import { detectPixelArtBlockSize } from './detectPixelArtBlockSize.js'

/**
 * @typedef {object} PixelArtAlignment
 * @property {number} cols
 * @property {number} rows
 * @property {number} offsetX
 * @property {number} offsetY
 */

/**
 * @param {HTMLImageElement|HTMLCanvasElement|ImageBitmap} source
 * @returns {ImageData}
 */
export function sourceToImageData(source) {
  const w = source.naturalWidth || source.width
  const h = source.naturalHeight || source.height
  if (!w || !h) throw new Error('Image source invalide.')

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D indisponible.')
  ctx.drawImage(source, 0, 0)
  return ctx.getImageData(0, 0, w, h)
}

/**
 * Couleur la plus fréquente (mode) — repli si le centre est transparent.
 * @param {ImageData} imageData
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1 exclusive
 * @param {number} y1 exclusive
 * @returns {{ r: number, g: number, b: number, a: number } | null}
 */
function modeColorInBlock(imageData, x0, y0, x1, y1) {
  const { data, width, height } = imageData
  const xa = Math.max(0, Math.min(width, Math.floor(x0)))
  const xb = Math.max(xa + 1, Math.min(width, Math.ceil(x1)))
  const ya = Math.max(0, Math.min(height, Math.floor(y0)))
  const yb = Math.max(ya + 1, Math.min(height, Math.ceil(y1)))

  /** @type {Map<number, number>} */
  const counts = new Map()
  let bestKey = -1
  let bestCount = 0
  let opaque = 0

  for (let y = ya; y < yb; y++) {
    for (let x = xa; x < xb; x++) {
      const o = (y * width + x) * 4
      const a = data[o + 3]
      if (a < 16) continue
      opaque += 1
      const key = (data[o] << 16) | (data[o + 1] << 8) | data[o + 2]
      const next = (counts.get(key) || 0) + 1
      counts.set(key, next)
      if (next > bestCount) {
        bestCount = next
        bestKey = key
      }
    }
  }

  if (!opaque || bestKey < 0) return null

  return {
    r: (bestKey >> 16) & 255,
    g: (bestKey >> 8) & 255,
    b: bestKey & 255,
    a: 255,
  }
}

/**
 * Couleur d’une case : pixel du centre (fidèle au pixel art),
 * sans moyenne ni clustering — on sélectionne la teinte déjà présente.
 * @param {ImageData} imageData
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1 exclusive
 * @param {number} y1 exclusive
 * @returns {{ r: number, g: number, b: number, a: number } | null}
 */
function pickColorInBlock(imageData, x0, y0, x1, y1) {
  const { data, width, height } = imageData
  const xa = Math.max(0, Math.min(width - 1, Math.floor(x0)))
  const xb = Math.max(xa + 1, Math.min(width, Math.ceil(x1)))
  const ya = Math.max(0, Math.min(height - 1, Math.floor(y0)))
  const yb = Math.max(ya + 1, Math.min(height, Math.ceil(y1)))

  const cx = Math.min(width - 1, Math.max(0, Math.floor((xa + xb - 1) / 2)))
  const cy = Math.min(height - 1, Math.max(0, Math.floor((ya + yb - 1) / 2)))
  const o = (cy * width + cx) * 4
  if (data[o + 3] < 16) {
    return modeColorInBlock(imageData, x0, y0, x1, y1)
  }
  return {
    r: data[o],
    g: data[o + 1],
    b: data[o + 2],
    a: 255,
  }
}

/**
 * Calcule les bornes pixel d’une case à partir de l’alignement.
 * @param {number} srcW
 * @param {number} srcH
 * @param {PixelArtAlignment} alignment
 */
export function computeAlignedCellMetrics(srcW, srcH, alignment) {
  const cols = Math.max(1, Math.round(alignment.cols))
  const rows = Math.max(1, Math.round(alignment.rows))
  const offsetX = Math.max(0, Math.round(alignment.offsetX) || 0)
  const offsetY = Math.max(0, Math.round(alignment.offsetY) || 0)
  const usableW = Math.max(1, srcW - offsetX)
  const usableH = Math.max(1, srcH - offsetY)
  const cellW = usableW / cols
  const cellH = usableH / rows
  return { cols, rows, offsetX, offsetY, cellW, cellH, usableW, usableH }
}

/**
 * Découpe selon une grille alignée et sélectionne la couleur déjà présente
 * au centre de chaque case (pas de K-means / pas de moyenne de zone).
 *
 * @param {HTMLImageElement|HTMLCanvasElement|ImageBitmap} source
 * @param {PixelArtAlignment} alignment
 * @returns {{ imageData: ImageData, width: number, height: number, alignment: PixelArtAlignment }}
 */
export function samplePixelArtByAlignedGrid(source, alignment) {
  const src = sourceToImageData(source)
  const { cols, rows, offsetX, offsetY, cellW, cellH } = computeAlignedCellMetrics(
    src.width,
    src.height,
    alignment,
  )
  const out = new ImageData(cols, rows)

  for (let gy = 0; gy < rows; gy++) {
    const y0 = offsetY + gy * cellH
    const y1 = offsetY + (gy + 1) * cellH
    for (let gx = 0; gx < cols; gx++) {
      const x0 = offsetX + gx * cellW
      const x1 = offsetX + (gx + 1) * cellW
      const picked = pickColorInBlock(src, x0, y0, x1, y1)
      const o = (gy * cols + gx) * 4
      if (!picked) {
        out.data[o + 3] = 0
        continue
      }
      out.data[o] = picked.r
      out.data[o + 1] = picked.g
      out.data[o + 2] = picked.b
      out.data[o + 3] = 255
    }
  }

  return {
    imageData: out,
    width: cols,
    height: rows,
    alignment: { cols, rows, offsetX, offsetY },
  }
}

/**
 * @deprecated préférer samplePixelArtByAlignedGrid avec offset 0
 * @param {HTMLImageElement|HTMLCanvasElement|ImageBitmap} source
 * @param {number} gridWidth
 * @param {number} gridHeight
 */
export function samplePixelArtByBlockMode(source, gridWidth, gridHeight) {
  return samplePixelArtByAlignedGrid(source, {
    cols: gridWidth,
    rows: gridHeight,
    offsetX: 0,
    offsetY: 0,
  })
}

/**
 * Estimation initiale via détection de périodicité.
 * @param {HTMLImageElement|HTMLCanvasElement|ImageBitmap} source
 * @param {number} [maxSide=200]
 * @returns {PixelArtAlignment & { blockSizeX: number, blockSizeY: number }}
 */
export function suggestPixelArtAlignment(source, maxSide = 200) {
  const detected = detectPixelArtBlockSize(source, { maxSide })
  return {
    cols: detected.cols,
    rows: detected.rows,
    offsetX: detected.offsetX,
    offsetY: detected.offsetY,
    blockSizeX: detected.blockSizeX,
    blockSizeY: detected.blockSizeY,
  }
}

/**
 * @deprecated utiliser suggestPixelArtAlignment
 */
export function suggestPixelArtGridSize(srcW, srcH, maxSide = 200) {
  const w = Math.max(1, Math.round(srcW) || 1)
  const h = Math.max(1, Math.round(srcH) || 1)
  const longest = Math.max(w, h)
  if (longest <= maxSide) {
    return { width: w, height: h }
  }
  const scale = maxSide / longest
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  }
}
