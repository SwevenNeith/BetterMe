/**
 * Analyse de style Auteur (indicateurs, pas de jugement).
 */

import {
  AUTEUR_ADVERB_EXCEPTIONS,
  AUTEUR_DEFAULT_FILLERS,
} from '../../constants/notes/auteurWorld.js'
import {
  normalizeWord,
  splitParagraphs,
  splitSentences,
  stripMarkdownLight,
  tokenizeWords,
} from './auteurText.js'

/**
 * @param {string} text
 * @param {object} [prefs]
 * @param {object} [extras]
 */
export function analyzeStyle(text, prefs = {}, extras = {}) {
  const source = stripMarkdownLight(text || '')
  const sentences = splitSentences(source)
  const paragraphs = splitParagraphs(source)
  const tokens = tokenizeWords(source)
  const words = tokens.map((t) => t.norm)
  const wordCount = words.length
  const readingMinutes = Math.max(1, Math.round(wordCount / 200))

  const lengths = sentences.map((s) => tokenizeWords(s).length)
  const avgLen = lengths.length
    ? lengths.reduce((a, b) => a + b, 0) / lengths.length
    : 0
  const maxLen = lengths.length ? Math.max(...lengths) : 0
  const short = lengths.filter((n) => n > 0 && n <= 10).length
  const medium = lengths.filter((n) => n > 10 && n <= 25).length
  const long = lengths.filter((n) => n > 25).length

  const longLimit = Number(prefs.longSentenceWords) || 40
  const longAlerts = sentences
    .map((s, i) => ({ i, len: lengths[i], text: s }))
    .filter((row) => row.len >= longLimit)

  // Monotonie : variance faible
  let monotone = false
  if (lengths.length >= 5) {
    const mean = avgLen
    const variance =
      lengths.reduce((acc, n) => acc + (n - mean) ** 2, 0) / lengths.length
    monotone = variance < 4 && mean > 8
  }

  /** Phrases de suite quasi identiques */
  const sameLengthStreaks = []
  for (let i = 0; i < lengths.length - 2; i += 1) {
    const a = lengths[i]
    const b = lengths[i + 1]
    const c = lengths[i + 2]
    if (a > 0 && Math.abs(a - b) <= 1 && Math.abs(b - c) <= 1) {
      sameLengthStreaks.push({ index: i, length: a })
    }
  }

  const adverbExceptions = new Set(
    [...AUTEUR_ADVERB_EXCEPTIONS, ...(extras.adverbExceptions || [])].map(normalizeWord),
  )
  /** @type {{ word: string, start: number, end: number }[]} */
  const adverbs = []
  for (const t of tokens) {
    if (!t.norm.endsWith('ment')) continue
    if (adverbExceptions.has(t.norm)) continue
    // « ils aiment » déjà filtré via exception ; éviter *ment verb forms courtes
    if (t.norm.length < 6) continue
    adverbs.push({ word: t.word, start: t.start, end: t.end })
  }

  const fillersList = (extras.fillers?.length ? extras.fillers : AUTEUR_DEFAULT_FILLERS).map(
    normalizeWord,
  )
  /** @type {{ phrase: string, start: number, end: number }[]} */
  const fillers = []
  for (const phrase of fillersList) {
    const parts = phrase.split(/\s+/).filter(Boolean)
    if (!parts.length) continue
    for (let i = 0; i <= tokens.length - parts.length; i += 1) {
      const ok = parts.every((p, j) => tokens[i + j].norm === p)
      if (!ok) continue
      fillers.push({
        phrase,
        start: tokens[i].start,
        end: tokens[i + parts.length - 1].end,
      })
    }
  }

  // Passif possible : être + participe passé
  const etre = new Set([
    'être',
    'été',
    'suis',
    'es',
    'est',
    'sommes',
    'êtes',
    'sont',
    'étais',
    'était',
    'étions',
    'étiez',
    'étaient',
    'serai',
    'sera',
    'serons',
    'serez',
    'seront',
    'fus',
    'fut',
    'fûmes',
    'fûtes',
    'furent',
    'soit',
    'soient',
  ])
  /** @type {{ start: number, end: number, text: string, confidence: 'low'|'high' }[]} */
  const passive = []
  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (!etre.has(tokens[i].norm)) continue
    const next = tokens[i + 1]
    if (!/(é|ée|és|ées|i|ie|is|ies|u|ue|us|ues)$/.test(next.norm)) continue
    if (next.norm.length < 4) continue
    const after = tokens[i + 2]
    const confidence = after && after.norm === 'par' ? 'high' : 'low'
    passive.push({
      start: tokens[i].start,
      end: next.end,
      text: `${tokens[i].word} ${next.word}`,
      confidence,
    })
  }

  const unique = new Set(words)
  const vocabRatio = wordCount ? unique.size / wordCount : 0

  // Part dialogue approximative
  const dialogueChars = (source.match(/[«"].*?[»"]/gs) || []).join('').length
  const dialogueShare = source.length ? dialogueChars / source.length : 0

  /** Top mots (hors stop courts) */
  const freq = new Map()
  for (const w of words) {
    if (w.length < 4) continue
    freq.set(w, (freq.get(w) || 0) + 1)
  }
  const topWords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word, count]) => ({ word, count }))

  // Lisibilité approximative (type Flesch adapté FR très grossier)
  const readability =
    wordCount && sentences.length
      ? Math.max(
          0,
          Math.min(
            100,
            207 - 1.015 * avgLen - 73.6 * (countSyllablesApprox(words) / wordCount),
          ),
        )
      : null

  const adverbDensity = wordCount ? (adverbs.length / wordCount) * 100 : 0
  const fillerDensity = wordCount ? (fillers.length / wordCount) * 100 : 0

  return {
    wordCount,
    sentenceCount: sentences.length,
    paragraphCount: paragraphs.length,
    readingMinutes,
    sentenceLengths: lengths,
    avgSentenceLength: Math.round(avgLen * 10) / 10,
    maxSentenceLength: maxLen,
    distribution: { short, medium, long },
    longAlerts,
    monotone,
    sameLengthStreaks,
    adverbs,
    adverbDensity: Math.round(adverbDensity * 10) / 10,
    fillers,
    fillerDensity: Math.round(fillerDensity * 10) / 10,
    passive,
    vocabRatio: Math.round(vocabRatio * 1000) / 1000,
    dialogueShare: Math.round(dialogueShare * 1000) / 1000,
    topWords,
    readability: readability != null ? Math.round(readability) : null,
    alerts: buildStyleAlerts({
      prefs,
      longAlerts,
      monotone,
      sameLengthStreaks,
      adverbDensity,
      fillerDensity,
      adverbs,
      sentences,
    }),
  }
}

function countSyllablesApprox(words) {
  let n = 0
  for (const w of words) {
    const groups = w.match(/[aeiouyàâäéèêëïîôùûü]+/gi)
    n += groups ? groups.length : 1
  }
  return n
}

function buildStyleAlerts({
  prefs,
  longAlerts,
  monotone,
  sameLengthStreaks,
  adverbDensity,
  fillerDensity,
  adverbs,
  sentences,
}) {
  /** @type {{ id: string, severity: 'info'|'warn', message: string }[]} */
  const alerts = []
  const longLimit = Number(prefs.longSentenceWords) || 40
  if (longAlerts.length) {
    alerts.push({
      id: 'long-sentences',
      severity: 'warn',
      message: `${longAlerts.length} phrase(s) ≥ ${longLimit} mots (seuil réglable).`,
    })
  }
  if (monotone) {
    alerts.push({
      id: 'monotone',
      severity: 'info',
      message: 'Les phrases ont des longueurs très proches : rythme potentiellement monotone.',
    })
  }
  if (sameLengthStreaks.length) {
    alerts.push({
      id: 'same-length',
      severity: 'info',
      message: `${sameLengthStreaks.length} suite(s) de 3 phrases de taille quasi identique.`,
    })
  }
  const advLimit = Number(prefs.adverbDensityPer100) || 3
  if (adverbDensity >= advLimit) {
    alerts.push({
      id: 'adverbs',
      severity: 'warn',
      message: `Densité d’adverbes en -ment : ${adverbDensity.toFixed(1)} / 100 mots (seuil ${advLimit}).`,
    })
  }
  // Plusieurs adverbes dans une même phrase
  let multiAdv = 0
  for (const s of sentences) {
    const local = tokenizeWords(s).filter((t) => {
      const n = t.norm
      return n.endsWith('ment') && n.length >= 6 && !AUTEUR_ADVERB_EXCEPTIONS.includes(n)
    })
    if (local.length >= 2) multiAdv += 1
  }
  if (multiAdv) {
    alerts.push({
      id: 'adv-in-sentence',
      severity: 'info',
      message: `${multiAdv} phrase(s) avec plusieurs adverbes en -ment.`,
    })
  }
  const fillLimit = Number(prefs.fillerDensityPer100) || 4
  if (fillerDensity >= fillLimit) {
    alerts.push({
      id: 'fillers',
      severity: 'warn',
      message: `Mots de remplissage : ${fillerDensity.toFixed(1)} / 100 mots (seuil ${fillLimit}).`,
    })
  }
  void adverbs
  return alerts
}
