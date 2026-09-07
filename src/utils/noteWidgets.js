/** Placeholders + iframes sandboxed pour widgets HTML/JS dans les notes. */

export const NOTE_WIDGET_PLACEHOLDER_CLASS = 'notes-html-widget'
export const NOTE_WIDGET_INDEX_ATTR = 'data-widget-index'
export const NOTE_WIDGET_MESSAGE_TYPE = 'bm-notes-widget-resize'

/** Langages de fence exécutés (pas affichés comme code). */
const WIDGET_LANGS = new Set(['widget', 'interactive', 'html-run'])

const WIDGET_FENCE_RE = /^```([a-zA-Z0-9_-]*)[ \t]*\r?\n([\s\S]*?)```/gm

const MAX_WIDGET_CHARS = 80_000

/**
 * Remplace les fences ```widget / ```interactive / ```html-run par des placeholders HTML.
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
 * Document iframe isolé (scripts OK, pas d’accès à l’app parent).
 * @param {string} source
 * @param {{ widgetId?: string }} [options]
 */
export function buildWidgetSrcdoc(source, options = {}) {
  const widgetId = String(options.widgetId ?? '')
  const body = String(source ?? '')

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: https: http: blob:; font-src data: https: http:; media-src data: https: http: blob:; connect-src 'none'; base-uri 'none'; form-action 'none';">
<style>
  html, body {
    margin: 0;
    padding: 0;
    background: transparent;
    color: #2f243a;
    font: 14px/1.45 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  }
  body { padding: 2px; box-sizing: border-box; }
  *, *::before, *::after { box-sizing: border-box; }
</style>
</head>
<body>
${body}
<script>
(function () {
  var id = ${JSON.stringify(widgetId)};
  function send() {
    try {
      var h = Math.max(
        document.documentElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0
      );
      parent.postMessage({ type: ${JSON.stringify(NOTE_WIDGET_MESSAGE_TYPE)}, id: id, height: h }, '*');
    } catch (e) {}
  }
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(send).observe(document.documentElement);
    if (document.body) new ResizeObserver(send).observe(document.body);
  }
  window.addEventListener('load', send);
  window.addEventListener('resize', send);
  setTimeout(send, 0);
  setTimeout(send, 120);
  setTimeout(send, 400);
})();
<\/script>
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

  const hosts = container.querySelectorAll(`.${NOTE_WIDGET_PLACEHOLDER_CLASS}`)
  hosts.forEach((host) => {
    if (!(host instanceof HTMLElement)) return
    if (host.querySelector('iframe.notes-html-widget__frame')) return

    const index = Number(host.getAttribute(NOTE_WIDGET_INDEX_ATTR))
    if (!Number.isFinite(index) || index < 0 || index >= widgets.length) {
      host.textContent = 'Widget introuvable.'
      return
    }

    const iframe = document.createElement('iframe')
    iframe.className = 'notes-html-widget__frame'
    iframe.setAttribute('sandbox', 'allow-scripts')
    iframe.setAttribute('referrerpolicy', 'no-referrer')
    iframe.setAttribute('loading', 'lazy')
    iframe.title = 'Widget interactif'
    iframe.style.width = '100%'
    iframe.style.border = '0'
    iframe.style.display = 'block'
    iframe.style.minHeight = '80px'
    iframe.style.height = '120px'
    iframe.srcdoc = buildWidgetSrcdoc(widgets[index], { widgetId: String(index) })
    host.replaceChildren(iframe)
  })

  /** @param {MessageEvent} event */
  function onMessage(event) {
    const data = event.data
    if (!data || data.type !== NOTE_WIDGET_MESSAGE_TYPE) return

    const frames = container.querySelectorAll('iframe.notes-html-widget__frame')
    for (const frame of frames) {
      if (!(frame instanceof HTMLIFrameElement)) continue
      if (frame.contentWindow !== event.source) continue
      const height = Math.min(Math.max(Number(data.height) || 80, 40), 5000)
      frame.style.height = `${height}px`
      break
    }
  }

  window.addEventListener('message', onMessage)
  return () => {
    window.removeEventListener('message', onMessage)
  }
}
