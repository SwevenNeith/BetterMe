/**
 * Marqueurs typés pour le rendu Poro (couleurs / blocs / icônes).
 *
 * Ordre important :
 * 1) markdown léger (_italique_) AVANT le HTML (évite de casser poro-stat-k)
 * 2) chips (item/item/…) AVANT les rangées {{row}} (les chips contiennent des `]`)
 */

import { LOL_DDRAGON_VERSION } from '../../services/jeux/riot.js'

const DDRAGON = 'https://ddragon.leagueoflegends.com'
const CDRAGON_CHAMP =
  'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons'

/**
 * Escape minimal pour attributs HTML (après escape global du texte).
 * @param {string} value
 */
function attr(value) {
  return String(value ?? '')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * @param {string} name
 * @param {string|null} [src]
 * @param {string} cls
 */
function tagWithIcon(name, src, cls) {
  const label = String(name ?? '').trim() || '—'
  if (src) {
    return (
      `<span class="poro-tag ${cls} poro-tag-ico">` +
      `<img class="poro-ico" src="${attr(src)}" alt="" loading="lazy" />` +
      `<span class="poro-tag-label">${label}</span>` +
      `</span>`
    )
  }
  return `<span class="poro-tag ${cls}">${label}</span>`
}

/** @param {string} name @param {number|string} [championId] */
export function markChamp(name, championId) {
  const n = String(name ?? '').trim()
  const id = Number(championId) || 0
  return id > 0 ? `[[champ|${n}|${id}]]` : `[[champ|${n}]]`
}

/** @param {string} name @param {number|string} [itemId] */
export function markItem(name, itemId) {
  const n = String(name ?? '').trim()
  const id = Number(itemId) || 0
  return id > 0 ? `[[item|${n}|${id}]]` : `[[item|${n}]]`
}

/**
 * Sort d’invocateur (image DDragon) ou label de sort / keystone texte.
 * @param {string} name
 * @param {string} [imageFull] ex. SummonerFlash.png
 */
export function markSpell(name, imageFull) {
  const n = String(name ?? '').trim()
  const img = String(imageFull ?? '').trim()
  return img ? `[[spell|${n}|${img}]]` : `[[spell|${n}]]`
}

/**
 * Rune (chemin relatif perk-images/...).
 * @param {string} name
 * @param {string} [iconPath]
 */
export function markRune(name, iconPath) {
  const n = String(name ?? '').trim()
  const icon = String(iconPath ?? '').replace(/^\/+/, '').trim()
  return icon ? `[[rune|${n}|${icon}]]` : `[[rune|${n}]]`
}

/** @param {string} name */
export function markRole(name) {
  return `[[role|${String(name ?? '').trim()}]]`
}

/**
 * Pastille tier (S–E).
 * @param {string} tier
 * @param {string} [label]
 */
export function markTier(tier, label = '') {
  const t = String(tier || '?').trim().toUpperCase()
  const l = String(label || '').trim()
  return l ? `[[tier|${t}|${l}]]` : `[[tier|${t}]]`
}

/**
 * Ligne stat label / valeur.
 * @param {string} label
 * @param {string|number} value
 */
export function markStat(label, value) {
  return `[[stat|${String(label).trim()}|${String(value).trim()}]]`
}

/**
 * Rangée de pastilles — syntaxe {{row}}…{{/row}} pour ne pas casser sur les `]` des chips.
 * @param {string[]} markedParts déjà passés dans markChamp / markItem / …
 */
export function markChipRow(markedParts) {
  const parts = (markedParts || []).filter(Boolean)
  if (!parts.length) return '—'
  return `{{row}}${parts.join('¦')}{{/row}}`
}

/**
 * Escape HTML + convertit marqueurs / markdown léger.
 * @param {string} text
 * @param {{ version?: string }} [opts]
 */
export function renderPoroContent(text, opts = {}) {
  const version = String(opts.version || LOL_DDRAGON_VERSION || '15.20.1')

  let escaped = String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // 1) Markdown texte brut (avant tout HTML généré)
  // Italique d’abord : autorise **gras** à l’intérieur, lignes indentées OK.
  // Pas de `_` imbriqués (éviter `_… _(x)_ …_`).
  escaped = escaped.replace(/_([^_\n]{1,400}?)_/g, (_, body) => {
    const inner = String(body).replace(
      /\*\*(.+?)\*\*/g,
      '<strong class="poro-strong">$1</strong>',
    )
    return `<em class="poro-tip">${inner}</em>`
  })
  // Gras restant (hors italique)
  escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong class="poro-strong">$1</strong>')

  // 2) Chips / blocs atomiques AVANT les rangées (les chips contiennent `]`)
  escaped = escaped
    .replace(
      /\[\[tier\|([^|\]]+)(?:\|([^\]]+))?\]\]/g,
      (_, tier, label) => {
        const t = String(tier).trim().toUpperCase()
        const cls = `poro-tier poro-tier-${t.toLowerCase()}`
        const extra = label
          ? ` <span class="poro-tier-label">${label}</span>`
          : ''
        return `<span class="${cls}">Tier ${t}${extra}</span>`
      },
    )
    .replace(
      /\[\[stat\|([^|]+)\|([^\]]+)\]\]/g,
      (_, label, value) =>
        `<div class="poro-stat"><span class="poro-stat-k">${label}</span><span class="poro-stat-v">${value}</span></div>`,
    )
    .replace(/\[\[item\|([^|\]]+)(?:\|(\d+))?\]\]/g, (_, name, id) => {
      const src =
        id && Number(id) > 0
          ? `${DDRAGON}/cdn/${version}/img/item/${Number(id)}.png`
          : null
      return tagWithIcon(name, src, 'poro-tag-item')
    })
    .replace(/\[\[spell\|([^|\]]+)(?:\|([^\]]+))?\]\]/g, (_, name, image) => {
      const file = String(image || '').trim()
      const src =
        file && /^[\w.-]+\.png$/i.test(file)
          ? `${DDRAGON}/cdn/${version}/img/spell/${file}`
          : null
      return tagWithIcon(name, src, 'poro-tag-spell')
    })
    .replace(/\[\[rune\|([^|\]]+)(?:\|([^\]]+))?\]\]/g, (_, name, iconPath) => {
      const path = String(iconPath || '')
        .replace(/^\/+/, '')
        .trim()
      const src =
        path && /^perk-images\/[\w./-]+$/i.test(path)
          ? `${DDRAGON}/cdn/img/${path}`
          : null
      return tagWithIcon(name, src, 'poro-tag-rune')
    })
    .replace(/\[\[champ\|([^|\]]+)(?:\|(\d+))?\]\]/g, (_, name, id) => {
      const cid = Number(id) || 0
      let src = null
      if (cid > 0) {
        src = `${CDRAGON_CHAMP}/${cid}.png`
      } else {
        const key = String(name || '').replace(/['.\s]/g, '')
        if (key) src = `${DDRAGON}/cdn/${version}/img/champion/${key}.png`
      }
      return tagWithIcon(name, src, 'poro-tag-champ')
    })
    .replace(/\[\[role\|(.+?)\]\]/g, '<span class="poro-tag poro-tag-role">$1</span>')
    // Rangées après résolution des chips
    .replace(/\{\{row\}\}([\s\S]*?)\{\{\/row\}\}/g, (_, inner) => {
      const chips = String(inner)
        .split('¦')
        .filter(Boolean)
        .join(' ')
      return `<div class="poro-row">${chips}</div>`
    })
    // Ancien format [[row|…]] (rétrocompat)
    .replace(/\[\[row\|([\s\S]*?)\]\]/g, (_, inner) => {
      const chips = String(inner)
        .split('¦')
        .filter(Boolean)
        .join(' ')
      return `<div class="poro-row">${chips}</div>`
    })
    .replace(/^### (.+)$/gm, '<div class="poro-h poro-h-sub">$1</div>')
    .replace(/^## (.+)$/gm, '<div class="poro-h poro-h-main">$1</div>')
    .replace(/^---$/gm, '<hr class="poro-sep" />')
    .replace(/^• (.+)$/gm, '<div class="poro-li">$1</div>')
    .replace(/\n/g, '<br />')

  // Évite les <br> inutiles autour des blocs déjà block-level
  escaped = escaped
    .replace(/(<\/(?:div|hr)>)<br \/>/gi, '$1')
    .replace(/<br \/>(<(?:div|hr)\b)/gi, '$1')
    // Garde un saut de ligne après un titre inline (**…**) avant une liste
    .replace(/(<\/strong>)<div class="poro-li"/gi, '$1<br /><div class="poro-li"')
    .replace(/(?:<br \/>){3,}/g, '<br /><br />')

  return escaped
}
