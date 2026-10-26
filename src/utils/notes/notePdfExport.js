/**
 * Export PDF d’une note : même rendu Markdown que l’aperçu via impression navigateur
 * (« Enregistrer au format PDF »).
 *
 * Rendu « document classique » : fond blanc, texte noir.
 * Les couleurs volontaires sont conservées : texte coloré, surlignages,
 * tier lists, graphiques, widgets HTML.
 */
import { nextTick } from 'vue'
import { renderMarkdownToSafeHtml } from '../common/renderMarkdown.js'
import { mountNoteWidgets } from './noteWidgets.js'
import { resolveTierListTheme } from './noteTierLists.js'
import { mountNoteTierLists } from './noteTierListsMount.js'
import { mountNoteCharts } from './noteChartsMount.js'

const PDF_PAGE_BG = '#ffffff'
const PDF_PAGE_FG = '#111111'

/**
 * @param {{
 *   title: string,
 *   markdown: string,
 *   notes?: { id: string, title: string }[],
 *   enableWikiLinks?: boolean,
 *   breaks?: boolean,
 *   enableHtmlWidgets?: boolean,
 *   enableTierLists?: boolean,
 *   enableCharts?: boolean,
 *   vaultStyle?: Record<string, string> | null,
 * }} options
 */
export async function exportNoteAsPdf(options) {
  const title = String(options.title || 'Note').trim() || 'Note'
  const enableHtmlWidgets = Boolean(options.enableHtmlWidgets)
  const enableTierLists = Boolean(options.enableTierLists)
  const enableCharts = Boolean(options.enableCharts)
  const vaultStyle = normalizeVaultStyleMap(options.vaultStyle)

  const rendered = renderMarkdownToSafeHtml(options.markdown || '', {
    notes: options.notes || [],
    enableWikiLinks: options.enableWikiLinks !== false,
    breaks: options.breaks !== false,
    enableHtmlWidgets,
    enableTierLists,
    enableCharts,
  })

  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.className = 'notes-pdf-stage'
  applyStyleMap(host, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '860px',
    padding: '24px',
    background: PDF_PAGE_BG,
    color: PDF_PAGE_FG,
    pointerEvents: 'none',
  })
  host.innerHTML = `
    <div class="markdown-body notes-pdf-body">${rendered.html}</div>
  `
  document.body.appendChild(host)

  let unmountWidgets = () => {}
  let unmountTiers = () => {}
  let unmountCharts = () => {}
  /** @type {HTMLIFrameElement | null} */
  let printFrame = null

  try {
    await nextTick()

    if (enableHtmlWidgets) {
      unmountWidgets = mountNoteWidgets(host, rendered.widgets || [])
    }
    if (enableTierLists) {
      unmountTiers = mountNoteTierLists(host, rendered.tierLists || [], {
        // Thème plateau toujours lisible sur fond blanc PDF
        theme: resolveTierListTheme(vaultStyle),
        readonly: true,
      })
    }
    if (enableCharts) {
      unmountCharts = mountNoteCharts(host, rendered.charts || [], { readonly: true })
    }

    await nextTick()
    await sleep(enableHtmlWidgets ? 280 : 80)
    if (enableHtmlWidgets) {
      await waitForWidgetFrames(host)
    }

    const bodyEl = host.querySelector('.notes-pdf-body')
    if (bodyEl instanceof HTMLElement) {
      bakeIntentionalColors(bodyEl)
    }

    const bodyHtml = serializePdfBody(bodyEl)
    const styles = collectPrintStyles()

    printFrame = createPrintFrame()
    const doc = printFrame.contentDocument
    const win = printFrame.contentWindow
    if (!doc || !win) {
      throw new Error('Impossible de préparer l’export PDF.')
    }

    doc.open()
    doc.write(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    ${styles}
    ${PRINT_BASE_CSS}
  </style>
</head>
<body>
  <h1 class="notes-pdf-title">${escapeHtml(title)}</h1>
  <div class="markdown-body">${bodyHtml}</div>
</body>
</html>`)
    doc.close()

    await waitForPrintDocument(doc, win)
    const printBody = doc.querySelector('.markdown-body')
    if (printBody instanceof HTMLElement) {
      bakeIntentionalColors(printBody)
    }
    await waitForWidgetFrames(doc.body)
    await sleep(60)

    win.focus()
    win.print()
  } finally {
    try {
      unmountWidgets()
      unmountTiers()
      unmountCharts()
    } catch {
      /* ignore */
    }
    host.remove()
    if (printFrame) {
      const frame = printFrame
      window.setTimeout(() => {
        try {
          frame.remove()
        } catch {
          /* ignore */
        }
      }, 1500)
    }
  }
}

const PRINT_BASE_CSS = `
  body {
    margin: 0;
    padding: 1.25rem 1.5rem;
    background: ${PDF_PAGE_BG};
    color: ${PDF_PAGE_FG};
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color-adjust: exact;
  }
  h1.notes-pdf-title {
    font-size: 1.65rem;
    margin: 0 0 1rem;
    font-weight: 800;
    color: ${PDF_PAGE_FG};
  }
  .markdown-body {
    line-height: 1.55;
    color: ${PDF_PAGE_FG};
    background: transparent;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .markdown-body img { max-width: 100%; }
  .markdown-body h1,
  .markdown-body h2,
  .markdown-body h3,
  .markdown-body h4,
  .markdown-body h5,
  .markdown-body h6,
  .markdown-body p,
  .markdown-body li,
  .markdown-body td,
  .markdown-body th,
  .markdown-body blockquote {
    color: ${PDF_PAGE_FG};
  }
  .markdown-body a { color: #0645ad; }
  .markdown-body mark {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .notes-tierlist-widget,
  .notes-chart-widget,
  .notes-html-widget {
    break-inside: avoid;
    page-break-inside: avoid;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .notes-html-widget__frame {
    width: 100% !important;
    max-width: 100% !important;
    border: 0 !important;
  }
  .notes-chart__types,
  .notes-chart__grid-wrap,
  .notes-tierlist__controls,
  .notes-tierlist__add,
  .notes-tierlist__menu,
  .notes-tierlist__item-remove,
  .notes-tierlist__ctrl { display: none !important; }
  @page { margin: 14mm; }
  @media print {
    body { padding: 0; background: ${PDF_PAGE_BG}; color: ${PDF_PAGE_FG}; }
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  }
`

/**
 * Conserve uniquement les couleurs « volontaires » :
 * - texte / fond déjà en inline (span rouge, mark, etc.)
 * - blocs interactifs (tier list, graphique, widget)
 * Le reste reste noir sur blanc via le CSS de base.
 * @param {Element} root
 */
function bakeIntentionalColors(root) {
  const nodes = Array.from(root.querySelectorAll('*'))
  for (const el of nodes) {
    if (!(el instanceof Element)) continue
    const tag = el.tagName
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'BR' || tag === 'HR') continue

    const inRichBlock = Boolean(
      el.closest('.notes-tierlist, .notes-chart, .notes-html-widget, .notes-tierlist-widget, .notes-chart-widget'),
    )
    const inlineStyle = el instanceof HTMLElement ? String(el.getAttribute('style') || '') : ''
    const hasInlineColor = /(?:^|;)\s*color\s*:/i.test(inlineStyle)
    const hasInlineBg = /(?:^|;)\s*background(?:-color)?\s*:/i.test(inlineStyle)
    const isMark = tag === 'MARK'

    if (!inRichBlock && !hasInlineColor && !hasInlineBg && !isMark) {
      // Texte / titres classiques : pas de figement (reste noir via CSS)
      continue
    }

    let computed
    try {
      computed = getComputedStyle(el)
    } catch {
      continue
    }

    if (el instanceof SVGElement) {
      bakeSvgPaint(el, computed)
      continue
    }

    if (!(el instanceof HTMLElement)) continue

    if (inRichBlock || hasInlineColor) {
      const color = computed.color
      if (color && !isFullyTransparent(color)) {
        el.style.color = color
      }
    }

    if (inRichBlock || hasInlineBg || isMark) {
      const bg = computed.backgroundColor
      if (bg && !isFullyTransparent(bg) && !isNearWhite(bg)) {
        el.style.backgroundColor = bg
      }
    }

    if (inRichBlock) {
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
        const widthKey = /** @type {keyof CSSStyleDeclaration} */ (`border${side}Width`)
        const colorKey = /** @type {keyof CSSStyleDeclaration} */ (`border${side}Color`)
        const width = String(computed[widthKey] || '')
        const borderColor = String(computed[colorKey] || '')
        if (parseFloat(width) > 0 && borderColor && !isFullyTransparent(borderColor)) {
          el.style[`border${side}Color`] = borderColor
        }
      }
    }
  }
}

/**
 * @param {string} color
 */
function isNearWhite(color) {
  const rgb = parseCssRgb(color)
  if (!rgb) return false
  return rgb.r >= 248 && rgb.g >= 248 && rgb.b >= 248
}

/**
 * @param {string} color
 * @returns {{ r: number, g: number, b: number, a: number } | null}
 */
function parseCssRgb(color) {
  const value = String(color || '').trim().toLowerCase()
  const m = value.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/,
  )
  if (!m) return null
  return {
    r: Number(m[1]),
    g: Number(m[2]),
    b: Number(m[3]),
    a: m[4] != null ? Number(m[4]) : 1,
  }
}

/**
 * @param {SVGElement} el
 * @param {CSSStyleDeclaration} computed
 */
function bakeSvgPaint(el, computed) {
  const fill = String(computed.fill || '')
  if (fill && fill !== 'none' && !fill.startsWith('url(') && !isFullyTransparent(fill)) {
    el.setAttribute('fill', fill)
  }
  const stroke = String(computed.stroke || '')
  if (stroke && stroke !== 'none' && !stroke.startsWith('url(') && !isFullyTransparent(stroke)) {
    el.setAttribute('stroke', stroke)
  }
  if (el.tagName === 'text' || el.tagName === 'tspan') {
    const color = computed.color
    if (color && !isFullyTransparent(color) && (!fill || fill === 'none')) {
      el.setAttribute('fill', color)
    }
  }
}

/**
 * @param {string} color
 */
function isFullyTransparent(color) {
  const value = String(color || '').trim().toLowerCase()
  if (!value || value === 'transparent') return true
  if (value === 'rgba(0, 0, 0, 0)' || value === 'rgba(0,0,0,0)') return true
  const rgb = parseCssRgb(value)
  if (rgb && rgb.a === 0) return true
  return false
}

/**
 * @param {Record<string, string> | null | undefined} raw
 * @returns {Record<string, string>}
 */
function normalizeVaultStyleMap(raw) {
  /** @type {Record<string, string>} */
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [key, value] of Object.entries(raw)) {
    if (!key.startsWith('--')) continue
    const v = String(value ?? '').trim()
    if (!v) continue
    out[key] = v
  }
  return out
}

/**
 * @param {HTMLElement} el
 * @param {Record<string, string>} map
 */
function applyStyleMap(el, map) {
  for (const [key, value] of Object.entries(map)) {
    if (key.startsWith('--')) {
      el.style.setProperty(key, value)
    } else {
      /** @type {Record<string, string>} */ (el.style)[key] = value
    }
  }
}

/**
 * @param {Element | null} bodyEl
 */
function serializePdfBody(bodyEl) {
  if (!bodyEl) return ''
  bodyEl.querySelectorAll('iframe.notes-html-widget__frame').forEach((frame) => {
    if (!(frame instanceof HTMLIFrameElement)) return
    const srcdoc = frame.srcdoc || frame.getAttribute('srcdoc') || ''
    if (srcdoc) frame.setAttribute('srcdoc', srcdoc)
    const h = frame.style.height || frame.getAttribute('height')
    if (h) frame.style.height = h
    frame.removeAttribute('loading')
  })
  return bodyEl.innerHTML
}

function createPrintFrame() {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.setAttribute('title', 'Export PDF')
  frame.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;'
  document.body.appendChild(frame)
  return frame
}

/**
 * @param {ParentNode | null | undefined} root
 */
async function waitForWidgetFrames(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return
  const frames = Array.from(root.querySelectorAll('iframe.notes-html-widget__frame')).filter(
    (node) => node instanceof HTMLIFrameElement,
  )
  if (!frames.length) return
  await Promise.all(
    frames.map(
      (frame) =>
        new Promise((resolve) => {
          if (frame.contentDocument?.readyState === 'complete') {
            resolve()
            return
          }
          const done = () => resolve()
          frame.addEventListener('load', done, { once: true })
          setTimeout(done, 600)
        }),
    ),
  )
}

/**
 * @param {Document} doc
 * @param {Window} win
 */
function waitForPrintDocument(doc, win) {
  return new Promise((resolve) => {
    const done = () => resolve()
    if (doc.readyState === 'complete') {
      setTimeout(done, 40)
      return
    }
    win.addEventListener('load', () => setTimeout(done, 40), { once: true })
    setTimeout(done, 500)
  })
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function collectPrintStyles() {
  /** @type {string[]} */
  const chunks = []
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const rules = sheet.cssRules
        if (!rules) continue
        for (const rule of Array.from(rules)) {
          appendUsefulCssRule(rule, chunks)
        }
      } catch {
        /* CSS cross-origin ignoré */
      }
    }
  } catch {
    /* ignore */
  }
  return chunks.join('\n')
}

/**
 * @param {CSSRule} rule
 * @param {string[]} chunks
 */
function appendUsefulCssRule(rule, chunks) {
  if (rule instanceof CSSMediaRule) {
    const condition = String(rule.conditionText || rule.media?.mediaText || '')
    if (/prefers-color-scheme\s*:\s*dark/i.test(condition)) return
    for (const nested of Array.from(rule.cssRules || [])) {
      appendUsefulCssRule(nested, chunks)
    }
    return
  }

  const text = String(rule.cssText || '')
  // Pas de styles « vault » (ils recolorent tout le texte) — seulement structure + widgets
  if (
    text.includes('notes-tierlist') ||
    text.includes('notes-chart') ||
    text.includes('notes-html-widget') ||
    text.includes('notes-wiki')
  ) {
    chunks.push(text)
    return
  }
  if (text.includes('.markdown-body') && !text.includes('notes-vault')) {
    chunks.push(text)
  }
}
