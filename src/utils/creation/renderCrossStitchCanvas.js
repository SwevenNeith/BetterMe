/**
 * Rendu canvas de la grille points de croix.
 * Modes : "color" | "symbols" | "both" (couleur + symboles).
 */

/** @typedef {'color' | 'symbols' | 'both'} CrossStitchRenderMode */

/**
 * @typedef {object} CrossStitchCell
 * @property {string} dmcCode
 * @property {{ r: number, g: number, b: number }} rgb
 * @property {string} symbol
 */

/**
 * Taille de case adaptée à la grille (évite un canvas géant).
 * @param {number} width
 * @param {number} height
 * @param {number} [preferred]
 * @returns {number}
 */
export function pickCellSize(width, height, preferred = 12) {
  const maxSide = 900
  const maxDim = Math.max(width, height, 1)
  const fitted = Math.floor(maxSide / maxDim)
  return Math.max(6, Math.min(preferred, fitted || preferred))
}

/**
 * Texte lisible sur une pastille RGB (noir ou blanc).
 * @param {{ r: number, g: number, b: number }} rgb
 */
function contrastingInk(rgb) {
  const y = 0.299 * (rgb.r || 0) + 0.587 * (rgb.g || 0) + 0.114 * (rgb.b || 0)
  return y > 150 ? '#111111' : '#ffffff'
}

/**
 * Dessine la grille Aida : trait fin à chaque case, plus épais toutes les 10.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width cases
 * @param {number} height cases
 * @param {number} cellSize
 * @param {{ fine?: string, bold?: string, every?: number }} [style]
 */
function drawAidaGrid(ctx, width, height, cellSize, style = {}) {
  const fine = style.fine ?? 'rgba(0, 0, 0, 0.22)'
  const bold = style.bold ?? 'rgba(0, 0, 0, 0.72)'
  const every = style.every ?? 10
  const pxW = width * cellSize
  const pxH = height * cellSize

  ctx.save()
  ctx.lineCap = 'butt'

  ctx.strokeStyle = fine
  ctx.lineWidth = 1
  for (let x = 0; x <= width; x++) {
    if (x % every === 0) continue
    const px = x * cellSize + 0.5
    ctx.beginPath()
    ctx.moveTo(px, 0)
    ctx.lineTo(px, pxH)
    ctx.stroke()
  }
  for (let y = 0; y <= height; y++) {
    if (y % every === 0) continue
    const py = y * cellSize + 0.5
    ctx.beginPath()
    ctx.moveTo(0, py)
    ctx.lineTo(pxW, py)
    ctx.stroke()
  }

  ctx.strokeStyle = bold
  ctx.lineWidth = Math.max(2, Math.round(cellSize / 6))
  for (let x = 0; x <= width; x++) {
    if (x % every !== 0 && x !== width) continue
    const px = x * cellSize + (x === width ? -0.5 : 0.5)
    ctx.beginPath()
    ctx.moveTo(px, 0)
    ctx.lineTo(px, pxH)
    ctx.stroke()
  }
  for (let y = 0; y <= height; y++) {
    if (y % every !== 0 && y !== height) continue
    const py = y * cellSize + (y === height ? -0.5 : 0.5)
    ctx.beginPath()
    ctx.moveTo(0, py)
    ctx.lineTo(pxW, py)
    ctx.stroke()
  }

  ctx.restore()
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<Array<CrossStitchCell | null>>} grid
 * @param {number} width
 * @param {number} height
 * @param {number} cellSize
 * @param {'plain' | 'contrast'} inkMode
 */
function drawSymbols(ctx, grid, width, height, cellSize, inkMode) {
  const fontPx = Math.max(5, Math.floor(cellSize * 0.72))
  ctx.font = `bold ${fontPx}px ui-monospace, Menlo, Consolas, monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  for (let y = 0; y < height; y++) {
    const row = grid[y]
    for (let x = 0; x < width; x++) {
      const cell = row[x]
      if (!cell) continue
      ctx.fillStyle = inkMode === 'contrast' ? contrastingInk(cell.rgb) : '#111111'
      ctx.fillText(
        cell.symbol,
        x * cellSize + cellSize / 2,
        y * cellSize + cellSize / 2 + 0.5,
      )
    }
  }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {Array<Array<CrossStitchCell | null>>} grid
 * @param {{
 *   mode?: CrossStitchRenderMode,
 *   cellSize?: number,
 *   aidaEvery?: number,
 * }} [options]
 */
export function renderCrossStitchCanvas(canvas, grid, options = {}) {
  if (!canvas || !grid?.length) return

  const raw = options.mode
  const mode = raw === 'symbols' || raw === 'both' ? raw : 'color'
  const height = grid.length
  const width = grid[0]?.length || 0
  if (!width) return

  const cellSize = options.cellSize ?? pickCellSize(width, height)
  const aidaEvery = options.aidaEvery ?? 10

  canvas.width = width * cellSize
  canvas.height = height * cellSize

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = mode === 'symbols' ? '#ffffff' : '#f4f0f8'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  if (mode === 'color' || mode === 'both') {
    for (let y = 0; y < height; y++) {
      const row = grid[y]
      for (let x = 0; x < width; x++) {
        const cell = row[x]
        if (!cell) continue
        const { r, g, b } = cell.rgb
        ctx.fillStyle = `rgb(${r},${g},${b})`
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize)
      }
    }
  }

  if (mode === 'symbols') {
    drawSymbols(ctx, grid, width, height, cellSize, 'plain')
    drawAidaGrid(ctx, width, height, cellSize, { every: aidaEvery })
    return
  }

  if (mode === 'both') {
    drawSymbols(ctx, grid, width, height, cellSize, 'contrast')
    drawAidaGrid(ctx, width, height, cellSize, {
      fine: 'rgba(0, 0, 0, 0.12)',
      bold: 'rgba(0, 0, 0, 0.4)',
      every: aidaEvery,
    })
    return
  }

  // Mode couleur seul
  drawAidaGrid(ctx, width, height, cellSize, {
    fine: 'rgba(0, 0, 0, 0.08)',
    bold: 'rgba(0, 0, 0, 0.28)',
    every: aidaEvery,
  })
}
