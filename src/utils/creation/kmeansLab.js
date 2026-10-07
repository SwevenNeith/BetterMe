import { labDistanceSq, labToRgb, rgbToHex, rgbToLab } from './colorLab.js'

/**
 * K-means dans l’espace LAB sur les pixels d’une ImageData.
 * Option seedRgbs : couleurs pipette verrouillées (centroïdes fixes).
 * Tolérance + biais N&B pour absorber les gris d’anti-aliasing.
 */

function samplePixels(imageData, maxSamples = 12000) {
  const { data, width, height } = imageData
  const total = width * height
  const step = Math.max(1, Math.floor(total / maxSamples))
  const samples = []

  for (let i = 0; i < total; i += step) {
    const o = i * 4
    const a = data[o + 3]
    if (a < 16) continue
    samples.push(rgbToLab(data[o], data[o + 1], data[o + 2]))
  }

  if (!samples.length) {
    samples.push(rgbToLab(128, 128, 128))
  }
  return samples
}

function initCentroids(samples, k) {
  const centroids = []
  const used = new Set()
  let idx = Math.floor(Math.random() * samples.length)
  centroids.push({ ...samples[idx] })
  used.add(idx)

  while (centroids.length < k) {
    const distances = samples.map((p) => {
      let best = Infinity
      for (const c of centroids) {
        const d = labDistanceSq(p, c)
        if (d < best) best = d
      }
      return best
    })
    const sum = distances.reduce((a, b) => a + b, 0) || 1
    let r = Math.random() * sum
    let chosen = 0
    for (let i = 0; i < distances.length; i++) {
      r -= distances[i]
      if (r <= 0) {
        chosen = i
        break
      }
    }
    if (used.has(chosen) && used.size < samples.length) {
      chosen = samples.findIndex((_, i) => !used.has(i))
    }
    used.add(chosen)
    centroids.push({ ...samples[chosen] })
  }
  return centroids
}

function assignClusters(samples, centroids, assignOpts) {
  const assignments = new Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    assignments[i] = pickCentroidIndex(samples[i], centroids, assignOpts)
  }
  return assignments
}

/**
 * @param {number} lockedCount centroïdes d’indices [0, lockedCount) non déplacés
 */
function updateCentroids(samples, assignments, centroids, lockedCount = 0) {
  const k = centroids.length
  const sums = Array.from({ length: k }, () => ({ L: 0, a: 0, b: 0, n: 0 }))
  for (let i = 0; i < samples.length; i++) {
    const c = assignments[i]
    const p = samples[i]
    sums[c].L += p.L
    sums[c].a += p.a
    sums[c].b += p.b
    sums[c].n += 1
  }

  const next = []
  for (let c = 0; c < k; c++) {
    if (c < lockedCount) {
      next.push({ ...centroids[c] })
      continue
    }
    if (sums[c].n === 0) {
      next.push({ ...samples[Math.floor(Math.random() * samples.length)] })
    } else {
      next.push({
        L: sums[c].L / sums[c].n,
        a: sums[c].a / sums[c].n,
        b: sums[c].b / sums[c].n,
      })
    }
  }
  return next
}

function centroidsConverged(a, b, epsilonSq = 0.25) {
  for (let i = 0; i < a.length; i++) {
    if (labDistanceSq(a[i], b[i]) > epsilonSq) return false
  }
  return true
}

function normalizeSeedLabs(seedRgbs, maxCount) {
  if (!Array.isArray(seedRgbs) || !seedRgbs.length || maxCount < 1) return []
  const out = []
  for (const seed of seedRgbs) {
    if (out.length >= maxCount) break
    const r = Number(seed?.r)
    const g = Number(seed?.g)
    const b = Number(seed?.b)
    if (![r, g, b].every((v) => Number.isFinite(v))) continue
    const lab = rgbToLab(
      Math.min(255, Math.max(0, Math.round(r))),
      Math.min(255, Math.max(0, Math.round(g))),
      Math.min(255, Math.max(0, Math.round(b))),
    )
    const duplicate = out.some((c) => labDistanceSq(c, lab) < 36)
    if (duplicate) continue
    out.push(lab)
  }
  return out
}

function chromaApprox(lab) {
  return Math.hypot(lab.a, lab.b)
}

/**
 * Paire sombre / claire peu saturée (typo N&B, logo monochrome…).
 * @returns {{ dark: number, light: number } | null}
 */
function findBwPair(centroids) {
  if (centroids.length !== 2) return null
  const [a, b] = centroids
  if (chromaApprox(a) > 22 || chromaApprox(b) > 22) return null
  const dark = a.L <= b.L ? 0 : 1
  const light = 1 - dark
  if (centroids[light].L - centroids[dark].L < 20) return null
  return { dark, light }
}

/**
 * @param {{ L: number, a: number, b: number }} lab
 * @param {Array<{ L: number, a: number, b: number }>} centroids
 * @param {{
 *   lockedCount: number,
 *   seedToleranceSq: number,
 *   darkBias: number,
 *   bwPair: { dark: number, light: number } | null,
 * }} opts
 */
function pickCentroidIndex(lab, centroids, opts) {
  const lockedCount = opts.lockedCount || 0
  const seedToleranceSq = opts.seedToleranceSq || 0
  const darkBias = opts.darkBias || 0
  const bwPair = opts.bwPair

  // N&B : seuil de luminance biaisé vers le sombre → les gris anti-alias
  // rejoignent le noir au lieu de disparaître en blanc.
  if (bwPair) {
    const darkL = centroids[bwPair.dark].L
    const lightL = centroids[bwPair.light].L
    const mid = (darkL + lightL) / 2
    const threshold = mid + darkBias
    return lab.L <= threshold ? bwPair.dark : bwPair.light
  }

  // Pipette : attraction prioritaire dans le rayon de tolérance
  if (lockedCount > 0 && seedToleranceSq > 0) {
    let bestSeed = -1
    let bestD = Infinity
    for (let c = 0; c < lockedCount; c++) {
      const d = labDistanceSq(lab, centroids[c])
      if (d < bestD) {
        bestD = d
        bestSeed = c
      }
    }
    if (bestSeed >= 0 && bestD <= seedToleranceSq) return bestSeed
  }

  let best = 0
  let bestD = Infinity
  for (let c = 0; c < centroids.length; c++) {
    const d = labDistanceSq(lab, centroids[c])
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return best
}

/**
 * @param {ImageData} imageData
 * @param {number} k nombre de couleurs (1–64)
 * @param {{
 *   maxIter?: number,
 *   maxSamples?: number,
 *   seedRgbs?: Array<{ r: number, g: number, b: number }>,
 *   seedTolerance?: number,
 *   darkBias?: number,
 * }} [options]
 */
export function quantizeImageLabKMeans(imageData, k, options = {}) {
  const clusterCount = Math.max(1, Math.min(64, Math.round(k)))
  const maxIter = options.maxIter ?? 24
  const maxSamples = options.maxSamples ?? 12000
  const locked = normalizeSeedLabs(options.seedRgbs, clusterCount)
  // ΔE LAB approx. (0–80) → distance²
  const seedTolerance = Math.max(0, Math.min(80, Number(options.seedTolerance) || 0))
  const seedToleranceSq = seedTolerance * seedTolerance
  // Biais luminance (0–40) : plus élevé = plus de gris → sombre
  const darkBias = Math.max(0, Math.min(40, Number(options.darkBias) ?? 18))

  const samples = samplePixels(imageData, maxSamples)
  const freeSlots = Math.max(0, clusterCount - locked.length)
  const freeInit = freeSlots > 0 ? initCentroids(samples, Math.min(freeSlots, samples.length)) : []
  let centroids = [...locked, ...freeInit].slice(0, clusterCount)
  const lockedCount = Math.min(locked.length, centroids.length)

  let bwPair = findBwPair(centroids)
  let assignOpts = { lockedCount, seedToleranceSq, darkBias, bwPair }

  if (lockedCount < centroids.length) {
    for (let iter = 0; iter < maxIter; iter++) {
      // Pendant l’apprentissage, pas de règle N&B (centroïdes libres bougent)
      const trainOpts = {
        lockedCount,
        seedToleranceSq,
        darkBias: 0,
        bwPair: null,
      }
      const assignments = assignClusters(samples, centroids, trainOpts)
      const next = updateCentroids(samples, assignments, centroids, lockedCount)
      if (centroidsConverged(centroids, next)) {
        centroids = next
        break
      }
      centroids = next
    }
    bwPair = findBwPair(centroids)
    assignOpts = { lockedCount, seedToleranceSq, darkBias, bwPair }
  }

  const { data, width, height } = imageData
  const out = new ImageData(width, height)
  const counts = new Array(centroids.length).fill(0)
  /** @type {Array<Map<string, number>>} */
  const nearMaps = Array.from({ length: lockedCount }, () => new Map())

  for (let i = 0; i < width * height; i++) {
    const o = i * 4
    const alpha = data[o + 3]
    if (alpha < 16) {
      out.data[o + 3] = 0
      continue
    }
    const sr = data[o]
    const sg = data[o + 1]
    const sb = data[o + 2]
    const lab = rgbToLab(sr, sg, sb)
    const best = pickCentroidIndex(lab, centroids, assignOpts)
    counts[best] += 1

    if (best < lockedCount) {
      const srcHex = rgbToHex({ r: sr, g: sg, b: sb })
      const map = nearMaps[best]
      map.set(srcHex, (map.get(srcHex) || 0) + 1)
    }

    const rgb = labToRgb(centroids[best].L, centroids[best].a, centroids[best].b)
    out.data[o] = rgb.r
    out.data[o + 1] = rgb.g
    out.data[o + 2] = rgb.b
    out.data[o + 3] = 255
  }

  const seedGroups = nearMaps.map((map, seedIndex) => {
    const seedRgb = labToRgb(centroids[seedIndex].L, centroids[seedIndex].a, centroids[seedIndex].b)
    const nearHexes = [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([hex]) => hex)
      .filter((hex) => hex !== rgbToHex(seedRgb))
    return {
      seedIndex,
      hex: rgbToHex(seedRgb),
      count: counts[seedIndex] || 0,
      nearHexes,
    }
  })

  const palette = centroids
    .map((c, i) => {
      const rgb = labToRgb(c.L, c.a, c.b)
      return {
        ...rgb,
        hex: rgbToHex(rgb),
        count: counts[i],
        locked: i < lockedCount,
      }
    })
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count)

  return {
    palette,
    imageData: out,
    width,
    height,
    seedGroups,
    bwPairApplied: Boolean(bwPair),
  }
}
