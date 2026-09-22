/**
 * Parse les infos de série / tome depuis une fiche work Open Library.
 * Exemple work.series : [{ series: { key: '/series/OL326110L' }, position: '1' }]
 *

 * @param {unknown} rawSeries
 * @returns {{
 *   isSaga: boolean,
 *   sagaVolume: number|null,
 *   seriesKey: string|null,
 *   seriesLabel: string|null,
 * }}
 */
export function parseOpenLibrarySeries(rawSeries) {
  /** @type {{ isSaga: boolean, sagaVolume: number|null, seriesKey: string|null, seriesLabel: string|null }} */
  const empty = {
    isSaga: false,
    sagaVolume: null,
    seriesKey: null,
    seriesLabel: null,
  }

  if (!rawSeries) return empty

  if (typeof rawSeries === 'string') {
    const label = rawSeries.trim()
    if (!label) return empty
    return {
      isSaga: true,
      sagaVolume: parseVolumeHint(label),
      seriesKey: null,
      seriesLabel: label,
    }
  }

  if (Array.isArray(rawSeries)) {
    if (!rawSeries.length) return empty

    // Format édition : ["Harry Potter"]
    if (typeof rawSeries[0] === 'string') {
      const label = String(rawSeries[0] || '').trim()
      if (!label) return empty
      return {
        isSaga: true,
        sagaVolume: null,
        seriesKey: null,
        seriesLabel: label,
      }
    }

    // Format work : [{ series: { key }, position }]
    const entry = rawSeries.find((item) => item && typeof item === 'object') || rawSeries[0]
    if (!entry || typeof entry !== 'object') return empty

    const seriesKey = String(entry?.series?.key || entry?.key || '').trim() || null
    const seriesLabel =
      String(entry?.name || entry?.series?.name || entry?.title || '').trim() || null
    const sagaVolume = parseVolumeHint(entry?.position ?? entry?.volume ?? entry?.number)

    if (!seriesKey && !seriesLabel && sagaVolume == null) return empty

    return {
      isSaga: true,
      sagaVolume,
      seriesKey,
      seriesLabel,
    }
  }

  if (typeof rawSeries === 'object') {
    const seriesKey = String(rawSeries?.key || rawSeries?.series?.key || '').trim() || null
    const seriesLabel = String(rawSeries?.name || rawSeries?.title || '').trim() || null
    const sagaVolume = parseVolumeHint(rawSeries?.position ?? rawSeries?.volume)
    if (!seriesKey && !seriesLabel && sagaVolume == null) return empty
    return {
      isSaga: true,
      sagaVolume,
      seriesKey,
      seriesLabel,
    }
  }

  return empty
}

/**
 * Déduit un numéro de tome depuis un texte libre (position OL, titre, sous-titre…).
 * @param {unknown} raw
 * @returns {number|null}
 */
export function parseVolumeHint(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.round(raw * 10) / 10
  }

  const text = String(raw).trim()
  if (!text) return null

  const direct = Number(text.replace(',', '.'))
  if (Number.isFinite(direct) && direct > 0) {
    return Math.round(direct * 10) / 10
  }

  const patterns = [
    /\btome\s*(\d+(?:[.,]\d+)?)\b/i,
    /\bvol(?:ume)?\.?\s*(\d+(?:[.,]\d+)?)\b/i,
    /\bbook\s*(\d+(?:[.,]\d+)?)\b/i,
    /\bpart\.?\s*(\d+(?:[.,]\d+)?)\b/i,
    /#\s*(\d+(?:[.,]\d+)?)\b/,
    /\b(\d+(?:[.,]\d+)?)\s*(?:\/\s*\d+)?$/,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match?.[1]) continue
    const num = Number(String(match[1]).replace(',', '.'))
    if (Number.isFinite(num) && num > 0) return Math.round(num * 10) / 10
  }

  return null
}

/**
 * Enrichit une méta série avec d’éventuels indices titre / sous-titre.
 * @param {{ isSaga?: boolean, sagaVolume?: number|null, seriesKey?: string|null, seriesLabel?: string|null }} series
 * @param {{ title?: string, subtitle?: string }} [doc]
 */
export function enrichSeriesWithTitleHints(series, doc = {}) {
  const base = series && typeof series === 'object' ? series : {}
  let isSaga = Boolean(base.isSaga)
  let sagaVolume = base.sagaVolume ?? null

  if (sagaVolume == null) {
    const fromTitle =
      parseVolumeHint(doc?.subtitle) ?? parseVolumeHint(doc?.title)
    if (fromTitle != null) {
      sagaVolume = fromTitle
      isSaga = true
    }
  }

  return {
    isSaga,
    sagaVolume: isSaga ? sagaVolume : null,
    seriesKey: base.seriesKey ?? null,
    seriesLabel: base.seriesLabel ?? null,
  }
}

/**
 * Payload prêt pour createReadingBook (isSaga / sagaVolume).
 * @param {{ isSaga?: boolean, sagaVolume?: number|null }} series
 */
export function seriesToReadingBookFields(series) {
  if (!series?.isSaga) {
    return { isSaga: false, sagaVolume: null }
  }
  const volume =
    series.sagaVolume != null && Number.isFinite(Number(series.sagaVolume))
      ? Number(series.sagaVolume)
      : 1
  return {
    isSaga: true,
    sagaVolume: volume,
  }
}
