/** Placeholders + iframes sandboxed pour widgets HTML/JS dans les notes. */

export const NOTE_WIDGET_PLACEHOLDER_CLASS = 'notes-html-widget'
export const NOTE_WIDGET_INDEX_ATTR = 'data-widget-index'
export const NOTE_WIDGET_MESSAGE_TYPE = 'bm-notes-widget-resize'

/** Langages de fence exécutés (pas affichés comme code). */
const WIDGET_LANGS = new Set(['widget', 'interactive', 'html-run'])

const WIDGET_FENCE_RE = /^```([a-zA-Z0-9_-]*)[ \t]*\r?\n([\s\S]*?)```/gm

const MAX_WIDGET_CHARS = 80_000

/** Marge anti-coupure (descenders, badges absolus, subpixels). */
const HEIGHT_BUFFER_PX = 20

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
 * 1) Remplit la largeur disponible (layouts fluides lisibles)
 * 2) Scale uniquement si le contenu fixe déborde encore
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
<script>
(function () {
  var id = ${JSON.stringify(widgetId)};
  var root = document.getElementById('bm-widget-root');
  var slot = document.getElementById('bm-widget-slot');
  var stage = document.getElementById('bm-widget-stage');
  var scheduled = false;
  var BUFFER = ${HEIGHT_BUFFER_PX};
  var lastScale = 1;

  function reportHeight(height) {
    var h = Math.ceil(Math.max(height, 40));
    try {
      parent.postMessage({
        type: ${JSON.stringify(NOTE_WIDGET_MESSAGE_TYPE)},
        id: id,
        height: h
      }, '*');
    } catch (e) {}
  }

  function fit() {
    if (!root || !slot || !stage) return;

    var avail = Math.max(root.clientWidth || document.documentElement.clientWidth || 0, 1);
    stage.style.transform = 'none';
    slot.style.width = '100%';
    slot.style.height = 'auto';

    // 1) Remplir la largeur : les grilles en fr / % deviennent lisibles
    stage.style.width = avail + 'px';
    void stage.offsetWidth;

    if (stage.scrollWidth <= avail + 2) {
      lastScale = 1;
      var hFluid = Math.max(stage.scrollHeight, stage.offsetHeight);
      slot.style.height = Math.ceil(hFluid + BUFFER) + 'px';
      reportHeight(hFluid + BUFFER);
      return;
    }

    // 2) Contenu à largeur fixe : scale pour tout faire tenir (sans scroll)
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
    new ResizeObserver(scheduleFit).observe(root);
    new ResizeObserver(scheduleFit).observe(stage);
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
    if (host.querySelector('iframe.notes-html-widget__frame')) {
      hostObserver?.observe(host)
      return
    }

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
    iframe.style.maxWidth = '100%'
    iframe.style.border = '0'
    iframe.style.display = 'block'
    iframe.style.minHeight = '80px'
    iframe.style.height = '120px'
    iframe.srcdoc = buildWidgetSrcdoc(widgets[index], { widgetId: String(index) })
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
      const height = Math.min(Math.max(Number(data.height) || 80, 40) + 2, 8000)
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
