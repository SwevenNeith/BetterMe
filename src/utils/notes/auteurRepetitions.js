/**
 * Détecteur de répétitions Auteur.
 */

import { AUTEUR_STOPWORDS_FR } from '../../constants/notes/auteurWorld.js'
import {
  lightFrenchStem,
  normalizeWord,
  splitParagraphs,
  splitSentences,
  stripDialogues,
  stripMarkdownLight,
  tokenizeWords,
} from './auteurText.js'

/**
 * @param {object} opts
 * @param {string} opts.text
 * @param {'sentence'|'paragraph'|'window'} [opts.scope]
 * @param {number} [opts.windowSize]
 * @param {boolean} [opts.ignoreDialogues]
 * @param {boolean} [opts.detectAnaphora]
 * @param {boolean} [opts.detectPhrases]
 * @param {string[]} [opts.characterNames]
 * @param {string[]} [opts.ignoreWords]
 * @param {boolean} [opts.groupVariants]
 */
export function detectRepetitions(opts) {
  const scope = opts.scope || 'paragraph'
  const windowSize = Math.max(5, Number(opts.windowSize) || 50)
  const ignoreDialogues = Boolean(opts.ignoreDialogues)
  const groupVariants = opts.groupVariants !== false
  const ignoreSet = new Set(
    [...(opts.ignoreWords || []), ...AUTEUR_STOPWORDS_FR].map((w) => normalizeWord(w)),
  )
  const properSet = new Set(
    (opts.characterNames || []).map((n) => normalizeWord(n)).filter(Boolean),
  )

  let source = stripMarkdownLight(opts.text || '')
  if (ignoreDialogues) source = stripDialogues(source)

  /** @type {{ word: string, norm: string, stem: string, start: number, end: number, unit: number }[]} */
  const tokens = []

  if (scope === 'sentence') {
    const sentences = splitSentences(source)
    let offset = 0
    sentences.forEach((sentence, unit) => {
      const idx = source.indexOf(sentence, offset)
      const base = idx >= 0 ? idx : offset
      for (const t of tokenizeWords(sentence)) {
        tokens.push({
          ...t,
          start: base + t.start,
          end: base + t.end,
          stem: lightFrenchStem(t.norm),
          unit,
        })
      }
      offset = base + sentence.length
    })
  } else if (scope === 'paragraph') {
    const paras = splitParagraphs(source)
    let offset = 0
    paras.forEach((para, unit) => {
      const idx = source.indexOf(para, offset)
      const base = idx >= 0 ? idx : offset
      for (const t of tokenizeWords(para)) {
        tokens.push({
          ...t,
          start: base + t.start,
          end: base + t.end,
          stem: lightFrenchStem(t.norm),
          unit,
        })
      }
      offset = base + para.length
    })
  } else {
    tokenizeWords(source).forEach((t, i) => {
      tokens.push({
        ...t,
        stem: lightFrenchStem(t.norm),
        unit: Math.floor(i / windowSize),
      })
    })
  }

  const keyOf = (t) => (groupVariants ? t.stem : t.norm)

  /** @type {Map<string, typeof tokens>} */
  const byKey = new Map()
  for (const t of tokens) {
    if (t.norm.length < 3) continue
    if (ignoreSet.has(t.norm)) continue
    if (properSet.has(t.norm)) continue
    // Nom propre heuristique : majuscule hors début
    if (/^[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ]/.test(t.word) && t.start > 0) {
      const prev = source[t.start - 1]
      if (prev && !/[.!?…\n]/.test(prev)) continue
    }
    const k = keyOf(t)
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k).push(t)
  }

  /** @type {object[]} */
  const findings = []

  for (const [key, list] of byKey) {
    if (list.length < 2) continue
    /** @type {{ a: number, b: number, distance: number, severity: 'high'|'medium'|'low' }[]} */
    const pairs = []
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i]
        const b = list[j]
        if (scope !== 'window' && a.unit !== b.unit) continue
        let distance
        if (scope === 'window') {
          distance = Math.abs(
            tokens.findIndex((x) => x.start === b.start) -
              tokens.findIndex((x) => x.start === a.start),
          )
          if (distance > windowSize) continue
        } else {
          distance = Math.abs(
            list.indexOf(b) === j
              ? tokenizeWords(source.slice(a.end, b.start)).length
              : j - i,
          )
          // distance en mots entre les deux occurrences
          distance = tokenizeWords(source.slice(a.end, b.start)).length
        }
        const severity =
          distance <= 5 ? 'high' : distance <= 20 ? 'medium' : 'low'
        pairs.push({ a: a.start, b: b.start, distance, severity })
      }
    }
    if (!pairs.length && scope !== 'window') {
      // Même unité déjà filtrée ; si plusieurs dans l’unité
      if (list.length >= 2) {
        for (let i = 0; i < list.length - 1; i += 1) {
          const a = list[i]
          const b = list[i + 1]
          if (a.unit !== b.unit) continue
          const distance = tokenizeWords(source.slice(a.end, b.start)).length
          pairs.push({
            a: a.start,
            b: b.start,
            distance,
            severity: distance <= 5 ? 'high' : distance <= 20 ? 'medium' : 'low',
          })
        }
      }
    }
    if (!pairs.length) continue
    const minDist = Math.min(...pairs.map((p) => p.distance))
    const severity =
      minDist <= 5 ? 'high' : minDist <= 20 ? 'medium' : 'low'
    findings.push({
      key,
      label: list[0].word,
      count: list.length,
      minDistance: minDist,
      severity,
      occurrences: list.map((t) => ({
        start: t.start,
        end: t.end,
        word: t.word,
      })),
      pairs,
    })
  }

  findings.sort((a, b) => {
    const sev = { high: 0, medium: 1, low: 2 }
    if (sev[a.severity] !== sev[b.severity]) return sev[a.severity] - sev[b.severity]
    return a.minDistance - b.minDistance || b.count - a.count
  })

  /** @type {object[]} */
  const anaphora = []
  if (opts.detectAnaphora !== false) {
    const sentences = splitSentences(source)
    let prevStart = null
    let streak = 1
    let offset = 0
    for (let i = 0; i < sentences.length; i += 1) {
      const s = sentences[i]
      const idx = source.indexOf(s, offset)
      const base = idx >= 0 ? idx : offset
      const first = tokenizeWords(s)[0]
      const startWord = first ? normalizeWord(first.word) : ''
      if (startWord && startWord === prevStart) {
        streak += 1
        if (streak >= 3) {
          anaphora.push({
            word: first.word,
            count: streak,
            start: base + (first?.start || 0),
          })
        }
      } else {
        streak = 1
        prevStart = startWord
      }
      offset = base + s.length
    }
  }

  /** @type {object[]} */
  const phrases = []
  if (opts.detectPhrases !== false) {
    const norms = tokens.map((t) => t.norm)
    /** @type {Map<string, number[]>} */
    const ngrams = new Map()
    for (let n = 2; n <= 3; n += 1) {
      for (let i = 0; i <= norms.length - n; i += 1) {
        const slice = norms.slice(i, i + n)
        if (slice.some((w) => w.length < 3 || ignoreSet.has(w))) continue
        const key = slice.join(' ')
        if (!ngrams.has(key)) ngrams.set(key, [])
        ngrams.get(key).push(tokens[i].start)
      }
    }
    for (const [key, starts] of ngrams) {
      if (starts.length < 2) continue
      phrases.push({ phrase: key, count: starts.length, starts })
    }
    phrases.sort((a, b) => b.count - a.count)
  }

  return {
    source,
    findings,
    anaphora,
    phrases: phrases.slice(0, 40),
    highlights: findings.flatMap((f) =>
      f.occurrences.map((o) => ({
        start: o.start,
        end: o.end,
        severity: f.severity,
        key: f.key,
      })),
    ),
  }
}

/**
 * Trie les findings.
 * @param {ReturnType<typeof detectRepetitions>['findings']} findings
 * @param {'proximity'|'count'} sortBy
 */
export function sortRepetitionFindings(findings, sortBy = 'proximity') {
  const list = [...(findings || [])]
  if (sortBy === 'count') return list.sort((a, b) => b.count - a.count || a.minDistance - b.minDistance)
  return list.sort((a, b) => a.minDistance - b.minDistance || b.count - a.count)
}
