/**
 * Extension Notes : fences ```chart (JSON) → graphiques style tableur.
 */

export const NOTE_CHART_PLACEHOLDER_CLASS = 'notes-chart-widget'
export const NOTE_CHART_INDEX_ATTR = 'data-chart-index'
export const NOTE_CHART_LANG = 'chart'

const CHART_FENCE_RE = /^```chart[ \t]*\r?\n([\s\S]*?)```/gim

const DEFAULT_COLORS = [
  '#ad81be',
  '#8fa2d4',
  '#72a098',
  '#e8a87c',
  '#c0392b',
  '#5dade2',
  '#58d68d',
  '#f5b041',
]

/**
 * @returns {{
 *   version: number,
 *   type: 'bar'|'line'|'pie',
 *   title: string,
 *   labels: string[],
 *   series: { name: string, values: number[], color: string }[],
 * }}
 */
export function createDefaultNoteChart() {
  return {
    version: 1,
    type: 'bar',
    title: 'Graphique',
    labels: ['A', 'B', 'C', 'D'],
    series: [
      {
        name: 'Série 1',
        values: [4, 7, 3, 6],
        color: DEFAULT_COLORS[0],
      },
    ],
  }
}

/**
 * @param {unknown} color
 * @param {number} index
 */
export function normalizeChartColor(color, index = 0) {
  const raw = String(color ?? '').trim()
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) {
    if (raw.length === 4) {
      return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase()
    }
    return raw.toLowerCase()
  }
  return DEFAULT_COLORS[Math.max(0, index) % DEFAULT_COLORS.length]
}

/**
 * @param {unknown} raw
 */
export function normalizeNoteChartData(raw) {
  const fallback = createDefaultNoteChart()
  if (!raw || typeof raw !== 'object') return fallback
  const source = /** @type {Record<string, unknown>} */ (raw)

  const typeRaw = String(source.type || 'bar').toLowerCase()
  const type = typeRaw === 'line' || typeRaw === 'pie' ? typeRaw : 'bar'

  const labels = Array.isArray(source.labels)
    ? source.labels.map((l) => String(l ?? '').slice(0, 40))
    : fallback.labels

  const seriesIn = Array.isArray(source.series) ? source.series : []
  const series =
    seriesIn.length > 0
      ? seriesIn.slice(0, 8).map((entry, index) => {
          const row =
            entry && typeof entry === 'object'
              ? /** @type {Record<string, unknown>} */ (entry)
              : {}
          const values = Array.isArray(row.values)
            ? row.values.map((v) => {
                const n = Number(v)
                return Number.isFinite(n) ? n : 0
              })
            : labels.map(() => 0)
          // Aligne la longueur sur les labels
          while (values.length < labels.length) values.push(0)
          return {
            name: String(row.name ?? `Série ${index + 1}`).slice(0, 60) || `Série ${index + 1}`,
            values: values.slice(0, Math.max(labels.length, 1)),
            color: normalizeChartColor(row.color, index),
          }
        })
      : fallback.series

  return {
    version: 1,
    type,
    title: String(source.title ?? fallback.title).slice(0, 80) || fallback.title,
    labels: labels.length ? labels : fallback.labels,
    series,
  }
}

/**
 * @param {string} body
 */
export function parseNoteChartBody(body) {
  const text = String(body ?? '').trim()
  if (!text) return createDefaultNoteChart()
  try {
    return normalizeNoteChartData(JSON.parse(text))
  } catch {
    return createDefaultNoteChart()
  }
}

/**
 * @param {unknown} data
 */
export function serializeNoteChart(data) {
  return `${JSON.stringify(normalizeNoteChartData(data), null, 2)}\n`
}

/**
 * @param {unknown} [data]
 */
export function buildNoteChartFence(data) {
  const body = serializeNoteChart(data ?? createDefaultNoteChart()).trimEnd()
  return `\`\`\`${NOTE_CHART_LANG}\n${body}\n\`\`\``
}

/**
 * @param {string} markdown
 */
export function listNoteChartFences(markdown) {
  const source = String(markdown ?? '')
  /** @type {{ start: number, end: number, body: string, fence: string }[]} */
  const fences = []
  const re = new RegExp(CHART_FENCE_RE.source, 'gim')
  let match
  while ((match = re.exec(source))) {
    let body = String(match[1] ?? '')
    if (body.endsWith('\n')) body = body.slice(0, -1)
    fences.push({
      start: match.index,
      end: match.index + match[0].length,
      body,
      fence: match[0],
    })
  }
  return fences
}

/**
 * @param {string} markdown
 */
export function extractNoteCharts(markdown) {
  /** @type {ReturnType<typeof parseNoteChartBody>[]} */
  const charts = []
  const text = String(markdown ?? '').replace(CHART_FENCE_RE, (_full, body) => {
    let source = String(body ?? '')
    if (source.endsWith('\n')) source = source.slice(0, -1)
    const index = charts.length
    charts.push(parseNoteChartBody(source))
    return `\n\n<div class="${NOTE_CHART_PLACEHOLDER_CLASS}" ${NOTE_CHART_INDEX_ATTR}="${index}"></div>\n\n`
  })
  return { text, charts }
}

/**
 * @param {string} markdown
 * @param {number} index
 * @param {unknown} data
 */
export function replaceNoteChartAt(markdown, index, data) {
  const fences = listNoteChartFences(markdown)
  if (!Number.isFinite(index) || index < 0 || index >= fences.length) {
    return { content: String(markdown ?? ''), changed: false }
  }
  const fence = fences[index]
  const nextBody = serializeNoteChart(data).trimEnd()
  const nextFence = `\`\`\`${NOTE_CHART_LANG}\n${nextBody}\n\`\`\``
  if (fence.fence === nextFence) {
    return { content: String(markdown ?? ''), changed: false }
  }
  const content = `${String(markdown ?? '').slice(0, fence.start)}${nextFence}${String(markdown ?? '').slice(fence.end)}`
  return { content, changed: true }
}

/**
 * Géométrie SVG pour barres groupées.
 */
export function buildBarChartGeometry(data, opts = {}) {
  const chart = normalizeNoteChartData(data)
  const width = opts.width ?? 420
  const height = opts.height ?? 220
  const padL = 36
  const padR = 12
  const padT = 16
  const padB = 36
  const innerW = width - padL - padR
  const innerH = height - padT - padB
  const labels = chart.labels
  const series = chart.series
  const allValues = series.flatMap((s) => s.values)
  const max = Math.max(1, ...allValues, 0)
  const groupCount = Math.max(1, labels.length)
  const groupW = innerW / groupCount
  const barGap = 2
  const barW = Math.max(4, (groupW - 8) / Math.max(1, series.length) - barGap)

  /** @type {{ x: number, y: number, w: number, h: number, color: string, value: number, label: string, seriesName: string }[]} */
  const bars = []
  series.forEach((s, si) => {
    s.values.forEach((value, li) => {
      if (li >= labels.length) return
      const h = (Math.max(0, value) / max) * innerH
      const x = padL + li * groupW + 4 + si * (barW + barGap)
      const y = padT + innerH - h
      bars.push({
        x,
        y,
        w: barW,
        h,
        color: s.color,
        value,
        label: labels[li],
        seriesName: s.name,
      })
    })
  })

  const labelPoints = labels.map((label, i) => ({
    x: padL + i * groupW + groupW / 2,
    y: height - 12,
    text: label,
  }))

  return { width, height, padL, padT, innerH, max, bars, labelPoints, series, title: chart.title }
}

/**
 * Géométrie SVG pour courbes multi-séries.
 */
export function buildLineChartGeometry(data, opts = {}) {
  const chart = normalizeNoteChartData(data)
  const width = opts.width ?? 420
  const height = opts.height ?? 220
  const padL = 36
  const padR = 12
  const padT = 16
  const padB = 36
  const innerW = width - padL - padR
  const innerH = height - padT - padB
  const labels = chart.labels
  const n = Math.max(1, labels.length - 1)
  const allValues = chart.series.flatMap((s) => s.values)
  const max = Math.max(1, ...allValues, 0)
  const min = Math.min(0, ...allValues)

  const seriesPaths = chart.series.map((s) => {
    const points = labels.map((_, i) => {
      const v = Number(s.values[i]) || 0
      const x = padL + (i / n) * innerW
      const y = padT + innerH - ((v - min) / (max - min || 1)) * innerH
      return { x, y, value: v }
    })
    const path = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ')
    return { name: s.name, color: s.color, path, points }
  })

  const labelPoints = labels.map((label, i) => ({
    x: padL + (i / n) * innerW,
    y: height - 12,
    text: label,
  }))

  return { width, height, max, min, seriesPaths, labelPoints, series: chart.series, title: chart.title }
}

/**
 * Géométrie SVG pour camembert (1re série).
 */
export function buildPieChartGeometry(data, opts = {}) {
  const chart = normalizeNoteChartData(data)
  const size = opts.size ?? 200
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.36
  const values = chart.labels.map((_, i) => Math.max(0, Number(chart.series[0]?.values[i]) || 0))
  const total = values.reduce((a, b) => a + b, 0) || 1
  let angle = -Math.PI / 2
  const slices = values.map((value, i) => {
    const sweep = (value / total) * Math.PI * 2
    const start = angle
    angle += sweep
    const large = sweep > Math.PI ? 1 : 0
    const x1 = cx + r * Math.cos(start)
    const y1 = cy + r * Math.sin(start)
    const x2 = cx + r * Math.cos(angle)
    const y2 = cy + r * Math.sin(angle)
    const path =
      value <= 0
        ? ''
        : `M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`
    return {
      path,
      color: normalizeChartColor(null, i),
      label: chart.labels[i],
      value,
      percent: (value / total) * 100,
    }
  })
  return { size, slices, title: chart.title, total }
}
