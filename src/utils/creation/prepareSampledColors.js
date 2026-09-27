/**
 * Prépare une ImageData échantillonnée (une case = une couleur),
 * commune aux deux chemins photo / pixel art, avant matching DMC.
 */

import { quantizeImageLabKMeans } from './kmeansLab.js'
import { computeTargetSize, resizeImageProgressive } from './progressiveResize.js'
import { samplePixelArtByAlignedGrid } from './samplePixelArtBlocks.js'

/**
 * Photo classique : resize progressif → K-means LAB.
 *
 * @param {HTMLImageElement|HTMLCanvasElement|ImageBitmap} source
 * @param {{ targetWidth: number, colorCount: number }} options
 * @returns {{ imageData: ImageData, width: number, height: number, method: 'photo' }}
 */
export function prepareSampledColorsFromPhoto(source, options) {
  const targetWidth = Math.max(1, Math.round(options.targetWidth))
  const colorCount = Math.max(2, Math.round(options.colorCount))
  const srcW = source.naturalWidth || source.width
  const srcH = source.naturalHeight || source.height
  const { width, height } = computeTargetSize(srcW, srcH, targetWidth)

  const canvas = resizeImageProgressive(source, width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D indisponible.')
  const imageData = ctx.getImageData(0, 0, width, height)
  const quantized = quantizeImageLabKMeans(imageData, colorCount)

  return {
    imageData: quantized.imageData,
    width: quantized.width,
    height: quantized.height,
    method: 'photo',
  }
}

/**
 * Pixel art : échantillonnage par blocs alignés (mode), sans K-means.
 *
 * @param {HTMLImageElement|HTMLCanvasElement|ImageBitmap} source
 * @param {{ cols: number, rows: number, offsetX?: number, offsetY?: number }} alignment
 * @returns {{ imageData: ImageData, width: number, height: number, method: 'pixel-art', alignment: object }}
 */
export function prepareSampledColorsFromPixelArt(source, alignment) {
  const sampled = samplePixelArtByAlignedGrid(source, {
    cols: alignment.cols,
    rows: alignment.rows,
    offsetX: alignment.offsetX ?? 0,
    offsetY: alignment.offsetY ?? 0,
  })
  return {
    imageData: sampled.imageData,
    width: sampled.width,
    height: sampled.height,
    method: 'pixel-art',
    alignment: sampled.alignment,
  }
}

/**
 * Point d’entrée unique : produit les couleurs échantillonnées selon le mode.
 *
 * @param {HTMLImageElement|HTMLCanvasElement|ImageBitmap} source
 * @param {{
 *   isPixelArt: boolean,
 *   targetWidth?: number,
 *   targetHeight?: number,
 *   colorCount?: number,
 *   alignment?: { cols: number, rows: number, offsetX?: number, offsetY?: number } | null,
 * }} options
 */
export function prepareSampledColors(source, options) {
  if (options.isPixelArt) {
    const alignment = options.alignment
    if (!alignment?.cols || !alignment?.rows) {
      throw new Error('Valide d’abord l’alignement de la grille pixel art.')
    }
    return prepareSampledColorsFromPixelArt(source, alignment)
  }
  return prepareSampledColorsFromPhoto(source, {
    targetWidth: options.targetWidth ?? 80,
    colorCount: options.colorCount ?? 16,
  })
}
