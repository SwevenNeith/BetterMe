/**
 * Correcteur orthographe FR + EN via LanguageTool (API publique).
 * Un mot valide dans l’une des deux langues n’est pas signalé comme faute.
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
  return /[\p{L}]/u.test(trimmed)
}

/**
 * @param {string} text
 * @param {string} language
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
 * Pour un mot / courte sélection : OK si accepté en FR ou en EN.
 * Pour une phrase : ne garde que les fautes encore présentes dans les deux langues.
 * @param {string} text
 * @returns {Promise<{ language: string, suggestions: string[], message: string, offset: number, length: number } | null>}
 */
export async function spellcheckSelection(text) {
  const trimmed = String(text ?? '').trim()
  if (!isSpellcheckableSelection(trimmed)) return null

  try {
    const [frMatches, enMatches] = await Promise.all([
      checkWithLanguage(trimmed, 'fr'),
      checkWithLanguage(trimmed, 'en-US'),
    ])

    const isSingleToken = !/\s/.test(trimmed)

    // Mot unique : valide dès qu’une des deux langues l’accepte
    if (isSingleToken) {
      if (!frMatches.length || !enMatches.length) return null
      const top = frMatches[0]
      const suggestions = [...new Set(top.replacements)].slice(0, MAX_SUGGESTIONS)
      if (!suggestions.length) return null
      return {
        language: 'fr',
        suggestions,
        message: top.message || 'Orthographe',
        offset: top.offset,
        length: top.length,
      }
    }

    // Phrase : faute seulement si les deux correcteurs signalent un chevauchement
    if (!frMatches.length || !enMatches.length) return null

    const dual = frMatches.filter((fr) =>
      enMatches.some(
        (en) =>
          fr.offset < en.offset + en.length && en.offset < fr.offset + fr.length,
      ),
    )
    if (!dual.length) return null

    const ranked = [...dual].sort((a, b) => {
      const aFull = a.offset === 0 && a.length === trimmed.length ? 0 : 1
      const bFull = b.offset === 0 && b.length === trimmed.length ? 0 : 1
      return aFull - bFull || a.offset - b.offset
    })
    const top = ranked[0]
    const suggestions = [...new Set(top.replacements)].slice(0, MAX_SUGGESTIONS)
    if (!suggestions.length) return null

    return {
      language: 'fr+en',
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
