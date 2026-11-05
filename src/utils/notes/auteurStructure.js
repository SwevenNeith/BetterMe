/**
 * Plan / structure narrative (Auteur).
 */

import { AUTEUR_STRUCTURE_MODELS } from '../../constants/notes/auteurModules.js'

/**
 * @param {string} modelId
 * @param {object|null} customSteps
 */
export function getStructureModel(modelId, customSteps = null) {
  if (customSteps?.length) {
    return { id: 'custom', name: 'Personnalisé', steps: customSteps }
  }
  return (
    AUTEUR_STRUCTURE_MODELS.find((m) => m.id === modelId) || AUTEUR_STRUCTURE_MODELS[0]
  )
}

/**
 * @param {import('../../constants/notes/auteurWorld.js').AuteurScene[]} scenes
 * @param {object} model
 * @param {Record<string, number>} [wordCountsByNoteId]
 */
export function analyzeStructureProgress(scenes, model, wordCountsByNoteId = {}) {
  const ordered = [...(scenes || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const withWords = ordered.map((s) => ({
    ...s,
    wordCount:
      s.wordCount ??
      (s.noteId && wordCountsByNoteId[s.noteId] != null
        ? wordCountsByNoteId[s.noteId]
        : 0),
  }))
  const totalWords = withWords.reduce((a, s) => a + (Number(s.wordCount) || 0), 0)

  const byStep = (model.steps || []).map((step) => {
    const stepScenes = withWords.filter((s) => s.stepId === step.id)
    const words = stepScenes.reduce((a, s) => a + (Number(s.wordCount) || 0), 0)
    const pctActual = totalWords ? (words / totalWords) * 100 : 0
    return {
      step,
      scenes: stepScenes,
      words,
      pctActual: Math.round(pctActual * 10) / 10,
      pctTarget: step.pct,
      delta: Math.round((pctActual - step.pct) * 10) / 10,
    }
  })

  const byStatus = {
    idea: 0,
    outline: 0,
    draft: 0,
    revised: 0,
    done: 0,
  }
  for (const s of withWords) {
    const st = s.status || 'idea'
    if (byStatus[st] != null) byStatus[st] += 1
  }

  return {
    totalWords,
    sceneCount: withWords.length,
    byStep,
    byStatus,
    scenes: withWords,
  }
}

/**
 * Compte approximatif de mots d’une note markdown.
 * @param {string} md
 */
export function countWordsMarkdown(md) {
  const text = String(md ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[^\p{L}\p{N}'’]+/gu, ' ')
  return text.split(/\s+/).filter(Boolean).length
}
