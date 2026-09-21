/**
 * Sujets Open Library → tags Lecture (genre = 1er, reste = mots clés).
 */

function normalizeSubject(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * @param {unknown} subjects
 * @param {{ max?: number }} [options]
 * @returns {string[]}
 */
export function normalizeOpenLibrarySubjects(subjects, options = {}) {
  const max = Math.max(1, Number(options.max) || 16)
  const list = Array.isArray(subjects) ? subjects : []
  const seen = new Set()
  const out = []

  for (const raw of list) {
    const subject = normalizeSubject(raw)
    if (!subject) continue
    const key = subject.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(subject)
    if (out.length >= max) break
  }

  return out
}

/**
 * Fusionne les sujets OL dans les tags existants sans écraser la saisie perso.
 * - tags vides → tous les sujets (1er = genre)
 * - genre seul → complète les mots clés
 * - tags déjà remplis → inchangés (sauf replace=true)
 *
 * @param {string[]|null|undefined} existingTags
 * @param {unknown} subjects
 * @param {{ replace?: boolean, max?: number }} [options]
 * @returns {string[]|null} null si aucun changement
 */
export function mergeOpenLibrarySubjectsIntoTags(existingTags, subjects, options = {}) {
  const subjectsList = normalizeOpenLibrarySubjects(subjects, { max: options.max })
  if (!subjectsList.length) return null

  const current = Array.isArray(existingTags)
    ? existingTags.map((tag) => String(tag ?? '').trim()).filter(Boolean)
    : []

  if (options.replace === true) {
    return subjectsList
  }

  if (!current.length) return subjectsList

  const genre = current[0]
  const extras = current.slice(1)
  if (extras.length) return null

  const extrasFromSubjects = subjectsList.filter(
    (subject) => subject.toLowerCase() !== genre.toLowerCase(),
  )
  if (!extrasFromSubjects.length) return null

  return [genre, ...extrasFromSubjects]
}
