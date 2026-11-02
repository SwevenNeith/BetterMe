/**
 * Formatage / lecture d’une timeline Riot compacte (côté client).
 */

import { markStat } from './poroMarkup.js'

/**
 * @param {number} tSec
 */
function fmtClock(tSec) {
  const s = Math.max(0, Number(tSec) || 0)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

/**
 * @param {number|string} teamId
 * @param {number|null} [myTeamId]
 */
function teamLabel(teamId, myTeamId = null) {
  const id = Number(teamId)
  if (myTeamId != null && id === Number(myTeamId)) return 'ton équipe'
  if (myTeamId != null && id && id !== Number(myTeamId)) return 'ennemis'
  if (id === 100) return 'bleu'
  if (id === 200) return 'rouge'
  return `équipe ${id || '?'}`
}

/**
 * @param {string} laneType
 */
function laneFr(laneType) {
  const l = String(laneType || '').toUpperCase()
  if (l.includes('TOP')) return 'Top'
  if (l.includes('MID')) return 'Mid'
  if (l.includes('BOT')) return 'Bot'
  return ''
}

/**
 * @param {string} towerType
 */
function towerTierFr(towerType) {
  const t = String(towerType || '').toUpperCase()
  if (t.includes('OUTER')) return 'T1'
  if (t.includes('INNER')) return 'T2'
  if (t.includes('BASE')) return 'T3'
  if (t.includes('NEXUS')) return 'Nexus'
  return ''
}

/**
 * Traduit les labels bruts Riot → FR lisible.
 * @param {string} raw
 * @param {number|null} [myTeamId]
 */
export function humanizeTimelineLabel(raw, myTeamId = null) {
  let text = String(raw || '')

  text = text.replace(/équipe\s+(\d+)/gi, (_, id) => teamLabel(id, myTeamId))

  // Tours détaillées : TOWER_BUILDING/OUTER_TURRET/TOP_LANE
  text = text.replace(
    /TOWER_BUILDING(?:\/([A-Z_]+))?(?:\/([A-Z_]+))?/gi,
    (_, towerType, laneType) => {
      const tier = towerTierFr(towerType)
      const lane = laneFr(laneType) || laneFr(towerType)
      const bits = ['Tour', tier, lane].filter(Boolean)
      return bits.join(' ')
    },
  )

  text = text.replace(
    /INHIBITOR_BUILDING(?:\/([A-Z_]+))?/gi,
    (_, laneType) => {
      const lane = laneFr(laneType)
      return lane ? `Inhibiteur ${lane}` : 'Inhibiteur'
    },
  )

  const map = [
    [/DRAGON\/AIR_DRAGON/gi, 'Dragon Nuage'],
    [/DRAGON\/FIRE_DRAGON/gi, 'Dragon Infernal'],
    [/DRAGON\/EARTH_DRAGON/gi, 'Dragon des montagnes'],
    [/DRAGON\/WATER_DRAGON/gi, 'Dragon Océan'],
    [/DRAGON\/HEXTECH_DRAGON/gi, 'Dragon Hextech'],
    [/DRAGON\/CHEMTECH_DRAGON/gi, 'Dragon Chemtank'],
    [/DRAGON\/ELDER_DRAGON/gi, 'Dragon ancestral'],
    [/DRAGON\/[^.\s·]+/gi, 'Dragon'],
    [/\bDRAGON\b/gi, 'Dragon'],
    [/\bBARON_NASHOR\b/gi, 'Baron Nashor'],
    [/\bBARON\b/gi, 'Baron'],
    [/\bRIFTHERALD\b/gi, 'Héraut de la Faille'],
    [/\bHORDE\b/gi, 'Larves du Néant'],
    [/\bATAKHAN\b/gi, 'Atakhan'],
    [/perdue par/gi, 'perdue par'],
    [/perdu par/gi, 'perdu par'],
  ]
  for (const [re, rep] of map) text = text.replace(re, rep)

  return text.replace(/\s+/g, ' ').trim()
}

/**
 * @param {object | null | undefined} timeline fetchMatchTimeline payload
 * @param {{ championName?: string, championId?: number, teamId?: number }} [me]
 */
export function formatTimelineSection(timeline, me = {}) {
  if (!timeline || timeline.error) {
    return (
      `### Timeline\n` +
      `_Timeline indisponible (déploie la function riot, puis réessaie)._`
    )
  }

  const myTeamId = me.teamId != null ? Number(me.teamId) : null
  const goldAt = timeline.goldAt || {}
  const teamGoldAt = timeline.teamGoldAt || {}
  const lines = ['### Timeline']

  for (const min of ['10', '15', '20']) {
    const g = goldAt[min]
    const team = teamGoldAt[min]
    if (g == null && !team) continue
    const my = g != null ? `${Math.round(g)}g` : '—'
    let teamBit = ''
    if (team) {
      const diff = Math.round((team.ally || 0) - (team.enemy || 0))
      const sign = diff > 0 ? '+' : ''
      // Écart d’équipe (alliés − ennemis), pas ton gold perso
      teamBit =
        diff === 0
          ? ' · équipes à égalité'
          : diff > 0
            ? ` · ton équipe ${sign}${diff}g`
            : ` · ennemis +${Math.abs(diff)}g`
    }
    lines.push(markStat(`Ton gold @${min}`, `${my}${teamBit}`))
  }

  const moments = Array.isArray(timeline.keyMoments) ? timeline.keyMoments : []
  const deaths = moments.filter((m) => m.kind === 'death')
  const objs = moments.filter((m) => m.kind === 'objective' || m.kind === 'tower')

  if (deaths.length) {
    lines.push('')
    lines.push('### Tes morts')
    for (const d of deaths.slice(0, 5)) {
      const near = objs.find((o) => Math.abs(o.tSec - d.tSec) <= 45)
      const clock = fmtClock(d.tSec)
      const nearTxt = near
        ? ` · près de ${humanizeTimelineLabel(near.label, myTeamId)}`
        : ''
      lines.push(`• ${clock}${nearTxt}`)
    }
  }

  if (objs.length) {
    lines.push('')
    lines.push('### Objectifs')
    for (const o of objs.slice(0, 8)) {
      lines.push(`• ${humanizeTimelineLabel(o.label, myTeamId)}`)
    }
  }

  if (!deaths.length && !objs.length && Object.values(goldAt).every((v) => v == null)) {
    lines.push('_Pas assez de frames pour ce match (partie très courte ?)._')
  }

  return lines.join('\n')
}

/**
 * @param {object | null} timeline
 * @param {{ kpRelevant?: boolean }} [style]
 * @returns {string[]}
 */
export function timelineTips(timeline, style = {}) {
  /** @type {string[]} */
  const tips = []
  if (!timeline?.goldAt) return tips

  const g10 = timeline.goldAt['10']
  const g15 = timeline.goldAt['15']
  const team10 = timeline.teamGoldAt?.['10']
  const team15 = timeline.teamGoldAt?.['15']

  if (team10 && team10.ally - team10.enemy <= -1500) {
    tips.push('À 10 min l’équipe est déjà derrière en gold → joue safe / catch-up, pas le force 5v5.')
  }
  if (team15 && team15.ally - team15.enemy <= -2500) {
    tips.push('À 15 min gros déficit gold équipe → priorise sides/farm ou défends plutôt que re-engage.')
  }
  if (typeof g10 === 'number' && typeof g15 === 'number' && g15 - g10 < 1200) {
    tips.push('Faible gain gold 10→15 : wave management / resets à revoir.')
  }

  const deaths = (timeline.keyMoments || []).filter((m) => m.kind === 'death')
  const objs = (timeline.keyMoments || []).filter(
    (m) => m.kind === 'objective' || m.kind === 'tower',
  )
  for (const d of deaths) {
    const near = objs.find((o) => Math.abs(o.tSec - d.tSec) <= 40)
    if (near) {
      tips.push(
        `Mort à ${fmtClock(d.tSec)} proche d’un objectif — souvent un throw de Drake/Tour.`,
      )
      break
    }
  }

  if (!style.kpRelevant && tips.length === 0 && typeof g15 === 'number') {
    tips.push(
      'Pour un profil side/carry, regarde surtout ces golds intermédiaires plutôt que le KP final.',
    )
  }

  return tips.slice(0, 4)
}
