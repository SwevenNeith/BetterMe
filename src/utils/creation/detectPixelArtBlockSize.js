/**
 * Détection automatique de la taille de bloc pixel art
 * via périodicité des transitions de couleur (H et V séparés).
 */

/**
 * @param {HTMLImageElement|HTMLCanvasElement|ImageBitmap} source
 * @returns {ImageData}
 */
function sourceToImageData(source) {
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

function colorDistance(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

/**
 * Valeur la plus fréquente dans une liste de nombres positifs.
 * @param {number[]} values
 * @returns {number | null}
 */
function modeOfInts(values) {
  if (!values.length) return null
  /** @type {Map<number, number>} */
  const counts = new Map()
  let best = values[0]
  let bestCount = 0
  for (const v of values) {
    if (v < 1) continue
    const next = (counts.get(v) || 0) + 1
    counts.set(v, next)
    if (next > bestCount) {
      bestCount = next
      best = v
    }
  }
  return bestCount > 0 ? best : null
}

/**
 * Positions de transitions significatives le long d’une ligne horizontale.
 * @param {ImageData} imageData
 * @param {number} y
 * @param {number} threshold
 * @returns {number[]}
 */
function horizontalTransitions(imageData, y, threshold) {
  const { data, width } = imageData
  const positions = []
  let prevO = (y * width) * 4
  let pr = data[prevO]
  let pg = data[prevO + 1]
  let pb = data[prevO + 2]
  let pa = data[prevO + 3]

  for (let x = 1; x < width; x++) {
    const o = (y * width + x) * 4
    const a = data[o + 3]
    // Transition opacité / couleur
    const alphaJump = Math.abs(a - pa) > 40
    const colorJump =
      a >= 16 &&
      pa >= 16 &&
      colorDistance(pr, pg, pb, data[o], data[o + 1], data[o + 2]) > threshold
    if (alphaJump || colorJump) {
      positions.push(x)
      pr = data[o]
      pg = data[o + 1]
      pb = data[o + 2]
      pa = a
    }
  }
  return positions
}

/**
 * Positions de transitions significatives le long d’une colonne verticale.
 * @param {ImageData} imageData
 * @param {number} x
 * @param {number} threshold
 * @returns {number[]}
 */
function verticalTransitions(imageData, x, threshold) {
  const { data, width, height } = imageData
  const positions = []
  let prevO = x * 4
  let pr = data[prevO]
  let pg = data[prevO + 1]
  let pb = data[prevO + 2]
  let pa = data[prevO + 3]

  for (let y = 1; y < height; y++) {
    const o = (y * width + x) * 4
    const a = data[o + 3]
    const alphaJump = Math.abs(a - pa) > 40
    const colorJump =
      a >= 16 &&
      pa >= 16 &&
      colorDistance(pr, pg, pb, data[o], data[o + 1], data[o + 2]) > threshold
    if (alphaJump || colorJump) {
      positions.push(y)
      pr = data[o]
      pg = data[o + 1]
      pb = data[o + 2]
      pa = a
    }
  }
  return positions
}

/**
 * Distances entre transitions successives.
 * @param {number[]} positions
 * @returns {number[]}
 */
function successiveGaps(positions) {
  const gaps = []
  for (let i = 1; i < positions.length; i++) {
    gaps.push(positions[i] - positions[i - 1])
  }
  return gaps
}

/**
 * Estime la taille de bloc et un offset d’origine.
 *
 * @param {HTMLImageElement|HTMLCanvasElement|ImageBitmap} source
 * @param {{
 *   threshold?: number,
 *   maxSide?: number,
 *   sampleStep?: number,
 * }} [options]
 * @returns {{
 *   blockSizeX: number,
 *   blockSizeY: number,
 *   offsetX: number,
 *   offsetY: number,
 *   cols: number,
 *   rows: number,
 * }}
 */
export function detectPixelArtBlockSize(source, options = {}) {
  const imageData = sourceToImageData(source)
  const { width, height } = imageData
  const threshold = options.threshold ?? 28
  const maxSide = options.maxSide ?? 200
  const sampleStep = Math.max(1, options.sampleStep ?? Math.max(1, Math.floor(Math.min(width, height) / 48)))

  /** @type {number[]} */
  const hGaps = []
  /** @type {number[]} */
  const firstH = []
  for (let y = 0; y < height; y += sampleStep) {
    const t = horizontalTransitions(imageData, y, threshold)
    if (t.length) firstH.push(t[0])
    hGaps.push(...successiveGaps(t))
  }

  /** @type {number[]} */
  const vGaps = []
  /** @type {number[]} */
  const firstV = []
  for (let x = 0; x < width; x += sampleStep) {
    const t = verticalTransitions(imageData, x, threshold)
    if (t.length) firstV.push(t[0])
    vGaps.push(...successiveGaps(t))
  }

  // Filtre les gaps aberrants (trop petits = bruit, trop grands = bords)
  const filterGaps = (gaps, dim) =>
    gaps.filter((g) => g >= 2 && g <= Math.max(4, Math.floor(dim / 2)))

  let blockSizeX = modeOfInts(filterGaps(hGaps, width))
  let blockSizeY = modeOfInts(filterGaps(vGaps, height))

  // Fallback : image 1 px / case ou estimation grossière
  if (!blockSizeX) blockSizeX = Math.max(1, Math.round(width / Math.min(maxSide, width)))
  if (!blockSizeY) blockSizeY = Math.max(1, Math.round(height / Math.min(maxSide, height)))

  const offsetX = modeOfInts(firstH.filter((v) => v >= 0 && v < blockSizeX * 2)) ?? 0
  const offsetY = modeOfInts(firstV.filter((v) => v >= 0 && v < blockSizeY * 2)) ?? 0

  // Si le premier gap depuis 0 ≈ blockSize, l’offset est 0
  const usableW = Math.max(1, width - offsetX)
  const usableH = Math.max(1, height - offsetY)
  let cols = Math.max(1, Math.round(usableW / blockSizeX))
  let rows = Math.max(1, Math.round(usableH / blockSizeY))

  cols = Math.min(maxSide, Math.max(1, cols))
  rows = Math.min(maxSide, Math.max(1, rows))

  return {
    blockSizeX,
    blockSizeY,
    offsetX: Math.max(0, Math.min(width - 1, offsetX)),
    offsetY: Math.max(0, Math.min(height - 1, offsetY)),
    cols,
    rows,
  }
}
