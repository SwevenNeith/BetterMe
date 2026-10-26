import {
  WGER_LANG_EN,
  WGER_LANG_FR,
  categoryLabelFr,
  equipmentLabelFr,
  muscleLabelFr,
} from '../../constants/sport/wger.js'

/**
 * Choisit la traduction FR si dispo, sinon EN, sinon première.
 * @param {object} exerciseInfo
 * @returns {{ translation: object|null, languageId: number|null }}
 */
export function pickPreferredTranslation(exerciseInfo) {
  const list = Array.isArray(exerciseInfo?.translations) ? exerciseInfo.translations : []
  if (!list.length) return { translation: null, languageId: null }
  const fr = list.find((t) => Number(t.language) === WGER_LANG_FR)
  if (fr) return { translation: fr, languageId: WGER_LANG_FR }
  const en = list.find((t) => Number(t.language) === WGER_LANG_EN)
  if (en) return { translation: en, languageId: WGER_LANG_EN }
  return { translation: list[0], languageId: Number(list[0].language) || null }
}

/**
 * @param {object} exerciseInfo résultat exerciseinfo
 */
export function normalizeWgerExercise(exerciseInfo) {
  const { translation, languageId } = pickPreferredTranslation(exerciseInfo)
  const images = Array.isArray(exerciseInfo?.images) ? exerciseInfo.images : []
  const mainImage =
    images.find((img) => img.is_main) || images[0] || null
  const imageUrl = mainImage?.image || mainImage?.image_url || null

  const muscles = Array.isArray(exerciseInfo?.muscles) ? exerciseInfo.muscles : []
  const secondary = Array.isArray(exerciseInfo?.muscles_secondary)
    ? exerciseInfo.muscles_secondary
    : []
  const equipment = Array.isArray(exerciseInfo?.equipment) ? exerciseInfo.equipment : []

  const name = String(translation?.name || '').trim() || `Exercice #${exerciseInfo?.id ?? '?'}`
  const descriptionHtml = String(translation?.description || '').trim()
  const descriptionText = String(translation?.description_source || '')
    .trim()
    .replace(/\s+/g, ' ')

  return {
    id: Number(exerciseInfo.id),
    uuid: exerciseInfo.uuid || null,
    source: 'wger',
    name,
    description: descriptionText || stripHtml(descriptionHtml) || '',
    instructionsHtml: descriptionHtml || '',
    categoryId: Number(exerciseInfo?.category?.id) || null,
    categoryName: categoryLabelFr(exerciseInfo?.category),
    muscles: muscles.map(mapMuscle),
    musclesSecondary: secondary.map(mapMuscle),
    muscleIds: muscles.map((m) => Number(m.id)).filter(Boolean),
    secondaryMuscleIds: secondary.map((m) => Number(m.id)).filter(Boolean),
    equipment: equipment.map((e) => ({
      id: Number(e.id),
      name: equipmentLabelFr(e),
    })),
    equipmentIds: equipment.map((e) => Number(e.id)).filter(Boolean),
    imageUrl,
    languageId,
    languageCode: languageId === WGER_LANG_FR ? 'fr' : languageId === WGER_LANG_EN ? 'en' : null,
    variationGroup: exerciseInfo.variation_group || null,
    licenseAuthor: exerciseInfo.license_author || translation?.license_author || null,
    raw: exerciseInfo,
  }
}

function mapMuscle(m) {
  return {
    id: Number(m.id),
    name: muscleLabelFr(m),
    nameFull: m.name || '',
    nameEn: m.name_en || '',
    isFront: Boolean(m.is_front),
  }
}

export function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Snapshot stocké dans templates / sessions (indépendant de Wger live).
 */
export function toExerciseSnapshot(ex) {
  if (!ex) return {}
  return {
    source: ex.source || 'wger',
    wger_id: ex.wger_id ?? ex.id ?? null,
    name: ex.name || '',
    description: ex.description || '',
    instructions: ex.instructions || ex.instructionsHtml || '',
    category_name: ex.categoryName || ex.category_name || null,
    muscle_ids: ex.muscleIds || ex.muscle_ids || [],
    secondary_muscle_ids: ex.secondaryMuscleIds || ex.secondary_muscle_ids || [],
    equipment_ids: ex.equipmentIds || ex.equipment_ids || [],
    image_url: ex.imageUrl || ex.image_url || null,
    language_code: ex.languageCode || ex.language_code || null,
  }
}

export function snapshotDisplayName(snapshot) {
  return String(snapshot?.name || 'Exercice').trim() || 'Exercice'
}

/**
 * Filtre client : exercice réalisable avec le matériel disponible.
 * bodyweight (7) toujours OK ; si equipment vide → considéré bodyweight.
 */
export function exerciseMatchesEquipment(exercise, allowedEquipmentIds) {
  if (!allowedEquipmentIds || !allowedEquipmentIds.length) return true
  const ids = exercise.equipmentIds || exercise.equipment_ids || []
  if (!ids.length) return true
  const allowed = new Set(allowedEquipmentIds.map(Number))
  // Autorise si TOUT le matériel requis est dans allowed, OU si seul « none »
  return ids.every((id) => allowed.has(Number(id)) || Number(id) === 7)
}

/**
 * Score déterministe pour le générateur de séances.
 */
export function scoreExerciseForGenerator(exercise, opts = {}) {
  const {
    muscleIds = [],
    favoriteWgerIds = [],
    excludeIds = [],
    preferFavorites = true,
  } = opts
  const id = Number(exercise.id || exercise.wger_id)
  if (excludeIds.includes(id)) return -Infinity

  let score = 0
  const primary = new Set(exercise.muscleIds || exercise.muscle_ids || [])
  const secondary = new Set(exercise.secondaryMuscleIds || exercise.secondary_muscle_ids || [])
  for (const m of muscleIds) {
    if (primary.has(Number(m))) score += 10
    else if (secondary.has(Number(m))) score += 4
  }
  if (preferFavorites && favoriteWgerIds.includes(id)) score += 6
  // Légère préférence pour exercices avec image / description
  if (exercise.imageUrl || exercise.image_url) score += 1
  if (exercise.description) score += 1
  // Tie-break déterministe
  score += (id % 7) * 0.01
  return score
}

/**
 * Génère une sélection déterministe d’exercices.
 */
export function generateWorkoutSelection(candidates, opts = {}) {
  const {
    muscleIds = [],
    count = 6,
    favoriteWgerIds = [],
    excludeIds = [],
    preferFavorites = true,
  } = opts

  const scored = candidates
    .map((ex) => ({
      ex,
      score: scoreExerciseForGenerator(ex, {
        muscleIds,
        favoriteWgerIds,
        excludeIds,
        preferFavorites,
      }),
    }))
    .filter((row) => Number.isFinite(row.score) && row.score > -Infinity)
    .sort((a, b) => b.score - a.score || Number(a.ex.id) - Number(b.ex.id))

  const picked = []
  const usedVariation = new Set()
  const coveredMuscles = new Set()

  for (const row of scored) {
    if (picked.length >= count) break
    const ex = row.ex
    const variation = ex.variationGroup || ex.variation_group || null
    if (variation && usedVariation.has(variation)) continue

    // Évite trop de doublons musculaires une fois la couverture atteinte
    const primary = ex.muscleIds || ex.muscle_ids || []
    const allCovered =
      muscleIds.length > 0 &&
      muscleIds.every((m) => coveredMuscles.has(Number(m))) &&
      primary.some((m) => coveredMuscles.has(Number(m))) &&
      picked.length >= Math.min(count, Math.max(3, muscleIds.length))
    if (allCovered && primary.every((m) => coveredMuscles.has(Number(m)))) {
      // Accepte quand même si score très haut (favori)
      if (row.score < 15) continue
    }

    picked.push(ex)
    if (variation) usedVariation.add(variation)
    for (const m of primary) coveredMuscles.add(Number(m))
  }

  // Complète si pas assez
  if (picked.length < count) {
    for (const row of scored) {
      if (picked.length >= count) break
      if (picked.some((p) => Number(p.id) === Number(row.ex.id))) continue
      picked.push(row.ex)
    }
  }

  return {
    exercises: picked.slice(0, count),
    totalCandidates: candidates.length,
    coveredMuscleIds: [...coveredMuscles],
    incomplete:
      muscleIds.length > 0 &&
      !muscleIds.every((m) => coveredMuscles.has(Number(m))),
  }
}

/**
 * Choisit un remplaçant pour un exercice dans une proposition.
 * Déterministe : meilleur score hors exercices déjà présents / exclus.
 * @returns {object|null}
 */
export function pickReplacementExercise(candidates, opts = {}) {
  const {
    replaceExercise = null,
    currentExercises = [],
    excludeIds = [],
    muscleIds = [],
    favoriteWgerIds = [],
    preferFavorites = true,
  } = opts

  const usedIds = new Set(
    [
      ...currentExercises.map((ex) => Number(ex.id || ex.wger_id)),
      ...excludeIds.map(Number),
    ].filter(Boolean),
  )

  const usedVariations = new Set(
    currentExercises
      .map((ex) => ex.variationGroup || ex.variation_group || null)
      .filter(Boolean),
  )

  const focusMuscles =
    muscleIds.length > 0
      ? muscleIds
      : replaceExercise?.muscleIds || replaceExercise?.muscle_ids || []

  const scored = (candidates || [])
    .map((ex) => {
      const id = Number(ex.id || ex.wger_id)
      if (!id || usedIds.has(id)) return null
      const variation = ex.variationGroup || ex.variation_group || null
      if (variation && usedVariations.has(variation)) return null

      let score = scoreExerciseForGenerator(ex, {
        muscleIds: focusMuscles,
        favoriteWgerIds,
        preferFavorites,
      })
      if (!Number.isFinite(score) || score === -Infinity) return null

      // Bonus si on garde au moins un muscle primaire de l’exercice remplacé
      const replacedPrimary = new Set(
        replaceExercise?.muscleIds || replaceExercise?.muscle_ids || [],
      )
      const primary = ex.muscleIds || ex.muscle_ids || []
      if (primary.some((m) => replacedPrimary.has(Number(m)))) score += 5

      return { ex, score }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || Number(a.ex.id) - Number(b.ex.id))

  return scored[0]?.ex || null
}

/**
 * Estimation durée (min) à partir des séries / repos.
 */
export function estimateWorkoutDurationMin(exercises, opts = {}) {
  const setDurationSec = opts.setDurationSec ?? 45
  let total = 0
  for (const ex of exercises) {
    const sets = Number(ex.target_sets ?? ex.targetSets ?? 3) || 3
    const rest = Number(ex.rest_seconds ?? ex.restSeconds ?? 90) || 0
    total += sets * setDurationSec + Math.max(0, sets - 1) * rest
  }
  return Math.max(1, Math.round(total / 60))
}
