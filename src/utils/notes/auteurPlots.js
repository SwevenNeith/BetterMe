/**
 * Suivi des intrigues (Auteur).
 */

/**
 * @param {import('../../constants/notes/auteurWorld.js').AuteurPlot[]} plots
 * @param {import('../../constants/notes/auteurWorld.js').AuteurScene[]} scenes
 */
export function plotStatusSummary(plots) {
  const summary = {
    open: 0,
    active: 0,
    resolved: 0,
    'intentionally-open': 0,
  }
  for (const p of plots || []) {
    if (summary[p.status] != null) summary[p.status] += 1
    else summary.open += 1
  }
  return summary
}

/**
 * Grille fil × scènes.
 * @param {import('../../constants/notes/auteurWorld.js').AuteurPlot[]} plots
 * @param {import('../../constants/notes/auteurWorld.js').AuteurScene[]} scenes
 */
export function buildPlotSceneGrid(plots, scenes) {
  const ordered = [...(scenes || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const rows = (plots || []).map((plot) => {
    const cells = ordered.map((scene) => {
      const beat = (plot.beats || []).find((b) => b.sceneId === scene.id)
      return beat ? beat.role : null
    })
    return { plot, cells }
  })
  return { scenes: ordered, rows }
}

/**
 * @param {import('../../constants/notes/auteurWorld.js').AuteurPlot[]} plots
 * @param {import('../../constants/notes/auteurWorld.js').AuteurScene[]} scenes
 * @param {number} [dormantGap]
 */
export function detectPlotIssues(plots, scenes, dormantGap = 8) {
  const ordered = [...(scenes || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const sceneIndex = new Map(ordered.map((s, i) => [s.id, i]))
  /** @type {{ id: string, severity: 'error'|'warn'|'info', message: string, plotId: string }[]} */
  const issues = []

  for (const plot of plots || []) {
    if (plot.status === 'intentionally-open') continue
    const beats = [...(plot.beats || [])]
    const openBeat = beats.find((b) => b.role === 'open')
    const resolveBeat = beats.find((b) => b.role === 'resolve')
    const advances = beats.filter((b) => b.role === 'advance')

    if (plot.status !== 'resolved' && !resolveBeat) {
      issues.push({
        id: `unresolved-${plot.id}`,
        severity: 'warn',
        message: `Fil « ${plot.title} » sans résolution.`,
        plotId: plot.id,
      })
    }

    if (openBeat && resolveBeat) {
      const oi = sceneIndex.get(openBeat.sceneId)
      const ri = sceneIndex.get(resolveBeat.sceneId)
      if (oi != null && ri != null && ri < oi) {
        issues.push({
          id: `resolve-before-open-${plot.id}`,
          severity: 'error',
          message: `« ${plot.title} » : résolution avant l’ouverture.`,
          plotId: plot.id,
        })
      }
    }

    if (resolveBeat && !openBeat && advances.length === 0) {
      issues.push({
        id: `unprepared-${plot.id}`,
        severity: 'warn',
        message: `« ${plot.title} » se résout sans ouverture / avance préparée.`,
        plotId: plot.id,
      })
    }

    if (plot.kind === 'chekhov' && openBeat && !resolveBeat) {
      issues.push({
        id: `chekhov-${plot.id}`,
        severity: 'warn',
        message: `Élément introduit (« ${plot.title} ») jamais utilisé.`,
        plotId: plot.id,
      })
    }

    // Dormant : gap entre dernières mentions
    const indices = beats
      .map((b) => sceneIndex.get(b.sceneId))
      .filter((i) => i != null)
      .sort((a, b) => a - b)
    if (indices.length && ordered.length) {
      const last = indices[indices.length - 1]
      const gap = ordered.length - 1 - last
      if (gap >= dormantGap && plot.status !== 'resolved') {
        issues.push({
          id: `dormant-${plot.id}`,
          severity: 'info',
          message: `« ${plot.title} » dormant depuis ${gap} scène(s).`,
          plotId: plot.id,
        })
      }
      for (let i = 1; i < indices.length; i += 1) {
        if (indices[i] - indices[i - 1] >= dormantGap) {
          issues.push({
            id: `gap-${plot.id}-${i}`,
            severity: 'info',
            message: `« ${plot.title} » : trou de ${indices[i] - indices[i - 1]} scènes entre deux jalons.`,
            plotId: plot.id,
          })
        }
      }
    }
  }

  return issues
}
