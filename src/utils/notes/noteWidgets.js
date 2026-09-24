/** Placeholders + iframes sandboxed pour widgets HTML/JS dans les notes. */

export const NOTE_WIDGET_PLACEHOLDER_CLASS = 'notes-html-widget'
export const NOTE_WIDGET_INDEX_ATTR = 'data-widget-index'
export const NOTE_WIDGET_FULL_PAGE_ATTR = 'data-full-page'
export const NOTE_WIDGET_MESSAGE_TYPE = 'bm-notes-widget-resize'

/** Langages de fence exécutés (pas affichés comme code). */
const WIDGET_LANGS = new Set(['widget', 'interactive', 'html-run', 'html'])

const WIDGET_FENCE_RE = /^```([a-zA-Z0-9_-]*)[ \t]*\r?\n([\s\S]*?)```/gm

const MAX_WIDGET_CHARS = 200_000

/** Marge anti-coupure (descenders, badges absolus, subpixels). */
const HEIGHT_BUFFER_PX = 20

const WIDGET_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: https: http: blob:; font-src data: https: http:; media-src data: https: http: blob:; connect-src 'none'; base-uri 'none'; form-action 'none';"

/**
 * @param {string} lang
 */
export function isNoteWidgetLang(lang) {
  return WIDGET_LANGS.has(
    String(lang ?? '')
      .trim()
      .toLowerCase(),
  )
}

/**
 * Document HTML autonome (DOCTYPE / <html>…), à rendre en iframe pleine page.
 * @param {string} source
 */
export function isCompleteHtmlDocument(source) {
  const text = String(source ?? '').trim()
  if (!text) return false
  return /^<!DOCTYPE\s+html\b/i.test(text) || /^<html[\s>]/i.test(text)
}

/**
 * Liste les fences widget dans l’ordre d’apparition (même index que le rendu).
 * @param {string} markdown
 * @returns {{ start: number, end: number, lang: string, body: string, fence: string }[]}
 */
export function listNoteWidgetFences(markdown) {
  const source = String(markdown ?? '')
  /** @type {{ start: number, end: number, lang: string, body: string, fence: string }[]} */
  const fences = []
  const re = new RegExp(WIDGET_FENCE_RE.source, 'gm')
  let match
  while ((match = re.exec(source))) {
    const lang = String(match[1] ?? '')
      .trim()
      .toLowerCase()
    if (!WIDGET_LANGS.has(lang)) continue
    let body = String(match[2] ?? '')
    if (body.endsWith('\n')) body = body.slice(0, -1)
    fences.push({
      start: match.index,
      end: match.index + match[0].length,
      lang,
      body,
      fence: match[0],
    })
  }
  return fences
}

/**
 * Retrouve une fence widget par index de rendu et/ou contenu interne.
 * @param {string} markdown
 * @param {{ index?: number | null, inner?: string | null, fenceText?: string | null }} [opts]
 */
export function findNoteWidgetFence(markdown, opts = {}) {
  const fences = listNoteWidgetFences(markdown)
  const index = opts.index
  if (Number.isFinite(index) && index >= 0 && index < fences.length) {
    return fences[index]
  }

  let needle = String(opts.inner ?? '')
  const fenceText = String(opts.fenceText ?? '').trim()
  if (fenceText) {
    const m = fenceText.match(
      /^```(?:widget|interactive|html-run|html)[ \t]*\r?\n([\s\S]*?)```$/i,
    )
    if (m) {
      needle = m[1]
      if (needle.endsWith('\n')) needle = needle.slice(0, -1)
    }
  }
  if (needle.endsWith('\n')) needle = needle.slice(0, -1)
  const trimmed = needle.trim()
  if (!trimmed && !needle) return null

  return (
    fences.find((entry) => entry.body === needle || entry.body.trim() === trimmed) ||
    null
  )
}

/**
 * Remplace les fences ```widget / ```html / … par des placeholders HTML.
 * @param {string} markdown
 * @returns {{ text: string, widgets: string[] }}
 */
export function extractNoteWidgets(markdown) {
  /** @type {string[]} */
  const widgets = []
  const text = String(markdown ?? '').replace(WIDGET_FENCE_RE, (full, lang, body) => {
    const key = String(lang ?? '')
      .trim()
      .toLowerCase()
    if (!WIDGET_LANGS.has(key)) return full

    let source = String(body ?? '')
    if (source.endsWith('\n')) source = source.slice(0, -1)
    if (source.length > MAX_WIDGET_CHARS) {
      source = `${source.slice(0, MAX_WIDGET_CHARS)}\n<!-- tronqué -->`
    }

    const index = widgets.length
    widgets.push(source)
    return `\n\n<div class="${NOTE_WIDGET_PLACEHOLDER_CLASS}" ${NOTE_WIDGET_INDEX_ATTR}="${index}"></div>\n\n`
  })

  return { text, widgets }
}

/**
 * Script de report de hauteur (pages complètes : scrollHeight du document).
 * @param {string} widgetId
 * @param {boolean} fullPage
 */
function buildResizeReporterScript(widgetId, fullPage) {
  return `<script>
(function () {
  var id = ${JSON.stringify(widgetId)};
  var fullPage = ${fullPage ? 'true' : 'false'};
  var scheduled = false;
  var BUFFER = ${HEIGHT_BUFFER_PX};
  var lastScale = 1;

  function reportHeight(height) {
    var h = Math.ceil(Math.max(height, 40));
    try {
      parent.postMessage({
        type: ${JSON.stringify(NOTE_WIDGET_MESSAGE_TYPE)},
        id: id,
        height: h,
        fullPage: fullPage
      }, '*');
    } catch (e) {}
  }

  function fitFullPage() {
    var doc = document.documentElement;
    var body = document.body;
    var h = Math.max(
      doc ? doc.scrollHeight : 0,
      doc ? doc.offsetHeight : 0,
      body ? body.scrollHeight : 0,
      body ? body.offsetHeight : 0,
      40
    );
    reportHeight(h + BUFFER);
  }

  function fitEmbedded() {
    var root = document.getElementById('bm-widget-root');
    var slot = document.getElementById('bm-widget-slot');
    var stage = document.getElementById('bm-widget-stage');
    if (!root || !slot || !stage) return;

    var avail = Math.max(root.clientWidth || document.documentElement.clientWidth || 0, 1);
    stage.style.transform = 'none';
    slot.style.width = '100%';
    slot.style.height = 'auto';

    stage.style.width = avail + 'px';
    void stage.offsetWidth;

    if (stage.scrollWidth <= avail + 2) {
      lastScale = 1;
      var hFluid = Math.max(stage.scrollHeight, stage.offsetHeight);
      slot.style.height = Math.ceil(hFluid + BUFFER) + 'px';
      reportHeight(hFluid + BUFFER);
      return;
    }

    stage.style.width = 'max-content';
    void stage.offsetWidth;
    var naturalWidth = Math.max(stage.scrollWidth, stage.offsetWidth, 1);
    var naturalHeight = Math.max(stage.scrollHeight, stage.offsetHeight, 1);
    var scale = Math.min(1, avail / naturalWidth);

    if (Math.abs(scale - lastScale) < 0.004) scale = lastScale;
    else lastScale = scale;

    if (scale < 0.9995) {
      stage.style.transform = 'scale(' + scale + ')';
      slot.style.height = Math.ceil(naturalHeight * scale + BUFFER) + 'px';
      reportHeight(naturalHeight * scale + BUFFER);
    } else {
      stage.style.transform = 'none';
      slot.style.height = Math.ceil(naturalHeight + BUFFER) + 'px';
      reportHeight(naturalHeight + BUFFER);
    }
  }

  function fit() {
    if (fullPage) fitFullPage();
    else fitEmbedded();
  }

  function scheduleFit() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      fit();
      requestAnimationFrame(fit);
    });
  }

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(scheduleFit).observe(document.documentElement);
    if (document.body) new ResizeObserver(scheduleFit).observe(document.body);
    var root = document.getElementById('bm-widget-root');
    var stage = document.getElementById('bm-widget-stage');
    if (root) new ResizeObserver(scheduleFit).observe(root);
    if (stage) new ResizeObserver(scheduleFit).observe(stage);
  }
  window.addEventListener('load', scheduleFit);
  window.addEventListener('resize', scheduleFit);
  window.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'bm-notes-widget-refit') scheduleFit();
  });
  document.addEventListener('click', function () { setTimeout(scheduleFit, 30); });
  setTimeout(scheduleFit, 0);
  setTimeout(scheduleFit, 100);
  setTimeout(scheduleFit, 300);
  setTimeout(scheduleFit, 700);
})();
<\/script>`
}

/**
 * Injecte CSP + reporter de hauteur dans un document HTML complet.
 * @param {string} source
 * @param {{ widgetId?: string }} [options]
 */
function buildFullPageSrcdoc(source, options = {}) {
  const widgetId = String(options.widgetId ?? '')
  let html = String(source ?? '')
  if (html.length > MAX_WIDGET_CHARS) {
    html = `${html.slice(0, MAX_WIDGET_CHARS)}\n<!-- tronqué -->`
  }

  const cspTag = `<meta http-equiv="Content-Security-Policy" content="${WIDGET_CSP}">`
  const reporter = buildResizeReporterScript(widgetId, true)

  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>\n${cspTag}\n`)
  } else if (/<html[^>]*>/i.test(html)) {
    html = html.replace(/<html([^>]*)>/i, `<html$1><head>${cspTag}</head>`)
  } else {
    html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">${cspTag}</head><body>${html}</body></html>`
  }

  if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `${reporter}\n</body>`)
  } else {
    html = `${html}\n${reporter}`
  }

  return html
}

/**
 * Document iframe isolé (scripts OK, pas d’accès à l’app parent).
 * 1) Remplit la largeur disponible (layouts fluides lisibles)
 * 2) Scale uniquement si le contenu fixe déborde encore
 * Documents HTML complets : rendus tels quels (CSS/layout natifs).
 * @param {string} source
 * @param {{ widgetId?: string }} [options]
 */
export function buildWidgetSrcdoc(source, options = {}) {
  const widgetId = String(options.widgetId ?? '')
  const body = String(source ?? '')

  if (isCompleteHtmlDocument(body)) {
    return buildFullPageSrcdoc(body, options)
  }

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${WIDGET_CSP}">
<style>
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    background: transparent;
    color: #2f243a;
    font: 14px/1.45 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    overflow: hidden;
  }
  body { box-sizing: border-box; }
  *, *::before, *::after { box-sizing: border-box; }
  #bm-widget-root {
    width: 100%;
    overflow: hidden;
  }
  #bm-widget-slot {
    width: 100%;
    position: relative;
    overflow: hidden;
  }
  #bm-widget-stage {
    display: block;
    width: 100%;
    min-width: 0;
    padding: 10px 10px 12px;
    transform-origin: top left;
  }
  #bm-widget-stage img,
  #bm-widget-stage video,
  #bm-widget-stage canvas,
  #bm-widget-stage svg,
  #bm-widget-stage table {
    max-width: 100%;
    height: auto;
  }
</style>
</head>
<body>
<div id="bm-widget-root">
  <div id="bm-widget-slot">
    <div id="bm-widget-stage">
${body}
    </div>
  </div>
</div>
${buildResizeReporterScript(widgetId, false)}
</body>
</html>`
}

/**
 * Monte les iframes sandboxed dans les placeholders du preview.
 * @param {ParentNode | null | undefined} container
 * @param {string[]} widgets
 * @returns {() => void} cleanup
 */
export function mountNoteWidgets(container, widgets = []) {
  if (!container || typeof document === 'undefined') return () => {}

  /** @type {ResizeObserver | null} */
  let hostObserver = null
  if (typeof ResizeObserver !== 'undefined') {
    hostObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const host = entry.target
        if (!(host instanceof HTMLElement)) continue
        const frame = host.querySelector('iframe.notes-html-widget__frame')
        if (!(frame instanceof HTMLIFrameElement)) continue
        try {
          frame.contentWindow?.postMessage({ type: 'bm-notes-widget-refit' }, '*')
        } catch {
          /* ignore */
        }
      }
    })
  }

  const hosts = container.querySelectorAll(`.${NOTE_WIDGET_PLACEHOLDER_CLASS}`)
  hosts.forEach((host) => {
    if (!(host instanceof HTMLElement)) return

    const index = Number(host.getAttribute(NOTE_WIDGET_INDEX_ATTR))
    if (!Number.isFinite(index) || index < 0 || index >= widgets.length) {
      host.textContent = 'Widget introuvable.'
      return
    }

    const source = widgets[index]
    const fullPage =
      host.getAttribute(NOTE_WIDGET_FULL_PAGE_ATTR) === '1' || isCompleteHtmlDocument(source)
    const srcdoc = buildWidgetSrcdoc(source, { widgetId: String(index) })
    const existing = host.querySelector('iframe.notes-html-widget__frame')

    if (fullPage) {
      host.classList.add('notes-html-widget--full-page')
      host.setAttribute(NOTE_WIDGET_FULL_PAGE_ATTR, '1')
    }

    // Même placeholder HTML (v-html inchangé) mais source widget modifiée :
    // il faut rafraîchir srcdoc, sinon la vue Dashboard reste figée.
    if (existing instanceof HTMLIFrameElement) {
      if (existing.dataset.bmWidgetSource !== source) {
        existing.dataset.bmWidgetSource = source
        existing.srcdoc = srcdoc
      }
      hostObserver?.observe(host)
      return
    }

    const iframe = document.createElement('iframe')
    iframe.className = 'notes-html-widget__frame'
    iframe.setAttribute('sandbox', 'allow-scripts')
    iframe.setAttribute('referrerpolicy', 'no-referrer')
    iframe.setAttribute('loading', 'lazy')
    iframe.title = fullPage ? 'Page HTML' : 'Widget interactif'
    iframe.style.width = '100%'
    iframe.style.maxWidth = '100%'
    iframe.style.border = '0'
    iframe.style.display = 'block'
    iframe.style.minHeight = fullPage ? '240px' : '80px'
    iframe.style.height = fullPage ? '60vh' : '120px'
    iframe.dataset.bmWidgetSource = source
    iframe.srcdoc = srcdoc
    host.replaceChildren(iframe)
    hostObserver?.observe(host)
  })

  /** @param {MessageEvent} event */
  function onMessage(event) {
    const data = event.data
    if (!data || data.type !== NOTE_WIDGET_MESSAGE_TYPE) return

    const frames = container.querySelectorAll('iframe.notes-html-widget__frame')
    for (const frame of frames) {
      if (!(frame instanceof HTMLIFrameElement)) continue
      if (frame.contentWindow !== event.source) continue
      const maxH = data.fullPage ? 24000 : 8000
      const height = Math.min(Math.max(Number(data.height) || 80, 40) + 2, maxH)
      frame.style.height = `${height}px`
      break
    }
  }

  function onWindowResize() {
    const frames = container.querySelectorAll('iframe.notes-html-widget__frame')
    frames.forEach((frame) => {
      if (!(frame instanceof HTMLIFrameElement)) return
      try {
        frame.contentWindow?.postMessage({ type: 'bm-notes-widget-refit' }, '*')
      } catch {
        /* ignore */
      }
    })
  }

  window.addEventListener('message', onMessage)
  window.addEventListener('resize', onWindowResize)
  return () => {
    window.removeEventListener('message', onMessage)
    window.removeEventListener('resize', onWindowResize)
    hostObserver?.disconnect()
  }
}
