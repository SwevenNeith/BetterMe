import { labDistanceSq, labToRgb, rgbToLab } from './colorLab.js'

/**
 * K-means dans l’espace LAB sur les pixels d’une ImageData.
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
  // Premier centroïde aléatoire
  let idx = Math.floor(Math.random() * samples.length)
  centroids.push({ ...samples[idx] })
  used.add(idx)

  // K-means++ : prochain centroïde proportionnel à la distance²
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
      // fallback : premier non utilisé
      chosen = samples.findIndex((_, i) => !used.has(i))
    }
    used.add(chosen)
    centroids.push({ ...samples[chosen] })
  }
  return centroids
}

function assignClusters(samples, centroids) {
  const assignments = new Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    let best = 0
    let bestD = Infinity
    for (let c = 0; c < centroids.length; c++) {
      const d = labDistanceSq(samples[i], centroids[c])
      if (d < bestD) {
        bestD = d
        best = c
      }
    }
    assignments[i] = best
  }
  return assignments
}

function updateCentroids(samples, assignments, k) {
  const sums = Array.from({ length: k }, () => ({ L: 0, a: 0, b: 0, n: 0 }))
  for (let i = 0; i < samples.length; i++) {
    const c = assignments[i]
    const p = samples[i]
    sums[c].L += p.L
    sums[c].a += p.a
    sums[c].b += p.b
    sums[c].n += 1
  }

  const centroids = []
  for (let c = 0; c < k; c++) {
    if (sums[c].n === 0) {
      // centroïde mort : rééchantillonner
      centroids.push({ ...samples[Math.floor(Math.random() * samples.length)] })
    } else {
      centroids.push({
        L: sums[c].L / sums[c].n,
        a: sums[c].a / sums[c].n,
        b: sums[c].b / sums[c].n,
      })
    }
  }
  return centroids
}

function centroidsConverged(a, b, epsilonSq = 0.25) {
  for (let i = 0; i < a.length; i++) {
    if (labDistanceSq(a[i], b[i]) > epsilonSq) return false
  }
  return true
}

/**
 * @param {ImageData} imageData
 * @param {number} k nombre de couleurs (8–40)
 * @param {{ maxIter?: number, maxSamples?: number }} [options]
 * @returns {{
 *   palette: Array<{ r: number, g: number, b: number, hex: string, count: number }>,
 *   imageData: ImageData,
 *   width: number,
 *   height: number,
 * }}
 */
export function quantizeImageLabKMeans(imageData, k, options = {}) {
  const clusterCount = Math.max(2, Math.min(64, Math.round(k)))
  const maxIter = options.maxIter ?? 24
  const maxSamples = options.maxSamples ?? 12000

  const samples = samplePixels(imageData, maxSamples)
  let centroids = initCentroids(samples, Math.min(clusterCount, samples.length))

  for (let iter = 0; iter < maxIter; iter++) {
    const assignments = assignClusters(samples, centroids)
    const next = updateCentroids(samples, assignments, centroids.length)
    if (centroidsConverged(centroids, next)) {
      centroids = next
      break
    }
    centroids = next
  }

  const { data, width, height } = imageData
  const out = new ImageData(width, height)
  const counts = new Array(centroids.length).fill(0)

  for (let i = 0; i < width * height; i++) {
    const o = i * 4
    const alpha = data[o + 3]
    if (alpha < 16) {
      out.data[o + 3] = 0
      continue
    }
    const lab = rgbToLab(data[o], data[o + 1], data[o + 2])
    let best = 0
    let bestD = Infinity
    for (let c = 0; c < centroids.length; c++) {
      const d = labDistanceSq(lab, centroids[c])
      if (d < bestD) {
        bestD = d
        best = c
      }
    }
    counts[best] += 1
    const rgb = labToRgb(centroids[best].L, centroids[best].a, centroids[best].b)
    out.data[o] = rgb.r
    out.data[o + 1] = rgb.g
    out.data[o + 2] = rgb.b
    out.data[o + 3] = 255
  }

  const palette = centroids
    .map((c, i) => {
      const rgb = labToRgb(c.L, c.a, c.b)
      return {
        ...rgb,
        hex:
          '#' +
          [rgb.r, rgb.g, rgb.b]
            .map((v) => v.toString(16).padStart(2, '0'))
            .join(''),
        count: counts[i],
      }
    })
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count)

  return { palette, imageData: out, width, height }
}
