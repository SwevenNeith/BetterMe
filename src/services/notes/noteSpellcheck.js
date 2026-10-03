/**
 * Correcteur orthographe FR/EN via LanguageTool (API publique).
 * Utilisé pour les suggestions du menu contextuel Notes.
 */

const LT_ENDPOINT = 'https://api.languagetool.org/v2/check'
const MAX_TEXT_CHARS = 400
const MAX_SUGGESTIONS = 5

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isSpellcheckableSelection(text) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return false
  if (trimmed.length > MAX_TEXT_CHARS) return false
  // Au moins une lettre (évite les seules ponctuations / nombres)
  return /[\p{L}]/u.test(trimmed)
}

/**
 * Heuristique simple : texte plutôt anglais vs français.
 * @param {string} text
 */
function guessLanguage(text) {
  const sample = String(text ?? '')
  if (/[àâäéèêëïîôùûüçœæ]/i.test(sample)) return 'fr'
  if (
    /\b(the|and|with|this|that|have|from|your|what|when|which|would|could|should)\b/i.test(
      sample,
    )
  ) {
    return 'en-US'
  }
  return 'fr'
}

/**
 * @param {string} text
 * @param {string} language
 * @returns {Promise<Array<{ message: string, replacements: string[], offset: number, length: number, ruleId: string }>>}
 */
async function checkWithLanguage(text, language) {
  const body = new URLSearchParams()
  body.set('text', text)
  body.set('language', language)
  body.set('enabledOnly', 'false')

  const response = await fetch(LT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) {
    throw new Error(`Correcteur indisponible (${response.status})`)
  }

  const data = await response.json()
  const matches = Array.isArray(data?.matches) ? data.matches : []
  return matches
    .map((match) => ({
      message: String(match?.message ?? 'Suggestion').trim(),
      replacements: (Array.isArray(match?.replacements) ? match.replacements : [])
        .map((item) => String(item?.value ?? '').trim())
        .filter(Boolean)
        .slice(0, MAX_SUGGESTIONS),
      offset: Number(match?.offset) || 0,
      length: Number(match?.length) || 0,
      ruleId: String(match?.rule?.id ?? ''),
    }))
    .filter((match) => match.length > 0 && match.replacements.length > 0)
}

/**
 * Vérifie une sélection courte en FR puis EN si besoin.
 * @param {string} text
 * @returns {Promise<{ language: string, suggestions: string[], message: string } | null>}
 */
export async function spellcheckSelection(text) {
  const trimmed = String(text ?? '').trim()
  if (!isSpellcheckableSelection(trimmed)) return null

  const primary = guessLanguage(trimmed)
  const secondary = primary === 'fr' ? 'en-US' : 'fr'

  try {
    let matches = await checkWithLanguage(trimmed, primary)
    let language = primary

    // Mot unique sans faute dans la langue primaire → tenter l’autre
    if (!matches.length && !/\s/.test(trimmed)) {
      matches = await checkWithLanguage(trimmed, secondary)
      language = secondary
    }

    if (!matches.length) return null

    // Priorité aux fautes qui couvrent tout le mot / le début
    const ranked = [...matches].sort((a, b) => {
      const aFull = a.offset === 0 && a.length === trimmed.length ? 0 : 1
      const bFull = b.offset === 0 && b.length === trimmed.length ? 0 : 1
      return aFull - bFull || a.offset - b.offset
    })

    const top = ranked[0]
    const suggestions = [...new Set(top.replacements)].slice(0, MAX_SUGGESTIONS)
    if (!suggestions.length) return null

    return {
      language,
      suggestions,
      message: top.message || 'Orthographe',
      offset: top.offset,
      length: top.length,
    }
  } catch (err) {
    console.warn('spellcheckSelection:', err)
    return null
  }
}
