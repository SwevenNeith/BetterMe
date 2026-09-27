/**
 * Matching des couleurs quantifiées vers les fils DMC
 * via CIEDE2000 (`color-diff`).
 *
 * Table : src/assets/creation/dmc-floss.json
 * Source open-source : cheshire137/cross-stitch-color-conversion
 * (dmc-color-codes-names.json) — ~450 couleurs.
 */

import { closest, diff } from 'color-diff'
import dmcCatalog from '../../assets/creation/dmc-floss.json'

/** @typedef {{ code: string, name: string, hex: string, r: number, g: number, b: number }} DmcColor */

/** @type {DmcColor[]} */
export const DMC_FLOSS = Array.isArray(dmcCatalog?.colors) ? dmcCatalog.colors : []

/** Palette RGB au format color-diff {R,G,B} + méta DMC. */
const DMC_PALETTE = DMC_FLOSS.map((c) => ({
  R: c.r,
  G: c.g,
  B: c.b,
  _dmc: c,
}))

/**
 * @param {{ r: number, g: number, b: number }} rgb
 * @returns {{ dmc: DmcColor, deltaE: number }}
 */
export function matchRgbToClosestDmc(rgb) {
  if (!DMC_PALETTE.length) {
    throw new Error('Catalogue DMC introuvable.')
  }
  const color = {
    R: Math.min(255, Math.max(0, Math.round(rgb.r))),
    G: Math.min(255, Math.max(0, Math.round(rgb.g))),
    B: Math.min(255, Math.max(0, Math.round(rgb.b))),
  }
  const match = closest(color, DMC_PALETTE)
  const deltaE = diff(color, match)
  return {
    dmc: match._dmc,
    deltaE: Math.round(deltaE * 100) / 100,
  }
}

/**
 * Associe chaque couleur de palette quantifiée à un fil DMC.
 * @param {Array<{ r: number, g: number, b: number, hex?: string, count?: number }>} palette
 */
export function matchPaletteToDmc(palette) {
  return (palette || []).map((swatch) => {
    const { dmc, deltaE } = matchRgbToClosestDmc(swatch)
    return {
      ...swatch,
      dmcCode: dmc.code,
      dmcName: dmc.name,
      dmcHex: dmc.hex,
      dmcR: dmc.r,
      dmcG: dmc.g,
      dmcB: dmc.b,
      deltaE,
    }
  })
}

/**
 * Remappe chaque pixel opaque d’une ImageData vers le RGB du fil DMC
 * le plus proche (CIEDE2000).
 * @param {ImageData} imageData
 * @returns {ImageData}
 */
export function remapImageDataToDmc(imageData) {
  const { data, width, height } = imageData
  const out = new ImageData(width, height)
  const cache = new Map()

  for (let i = 0; i < width * height; i++) {
    const o = i * 4
    const a = data[o + 3]
    if (a < 16) {
      out.data[o + 3] = 0
      continue
    }
    const key = (data[o] << 16) | (data[o + 1] << 8) | data[o + 2]
    let rgb = cache.get(key)
    if (!rgb) {
      const { dmc } = matchRgbToClosestDmc({
        r: data[o],
        g: data[o + 1],
        b: data[o + 2],
      })
      rgb = { r: dmc.r, g: dmc.g, b: dmc.b }
      cache.set(key, rgb)
    }
    out.data[o] = rgb.r
    out.data[o + 1] = rgb.g
    out.data[o + 2] = rgb.b
    out.data[o + 3] = 255
  }

  return out
}

export const DMC_CATALOG_META = dmcCatalog?._meta ?? null
