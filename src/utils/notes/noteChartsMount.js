import { createApp, h, ref } from 'vue'
import NotesChart from '../../components/notes/NotesChart.vue'
import {
  NOTE_CHART_INDEX_ATTR,
  NOTE_CHART_PLACEHOLDER_CLASS,
  normalizeNoteChartData,
} from './noteCharts.js'

/**
 * Monte les graphiques Vue sur les placeholders de l’aperçu.
 * @param {ParentNode | null | undefined} root
 * @param {unknown[]} charts
 * @param {{
 *   readonly?: boolean,
 *   onChange?: (index: number, data: ReturnType<typeof normalizeNoteChartData>) => void,
 * }} [options]
 * @returns {() => void}
 */
export function mountNoteCharts(root, charts, options = {}) {
  if (!root || typeof root.querySelectorAll !== 'function') return () => {}

  const list = Array.isArray(charts) ? charts : []
  const readonly = Boolean(options.readonly)
  /** @type {import('vue').App[]} */
  const apps = []

  root.querySelectorAll(`.${NOTE_CHART_PLACEHOLDER_CLASS}`).forEach((node) => {
    if (!(node instanceof HTMLElement)) return
    const index = Number(node.getAttribute(NOTE_CHART_INDEX_ATTR))
    if (!Number.isFinite(index) || index < 0 || index >= list.length) return

    node.innerHTML = ''
    const host = document.createElement('div')
    host.className = 'notes-chart-host'
    node.appendChild(host)

    const initial = normalizeNoteChartData(list[index])
    const app = createApp({
      setup() {
        const model = ref(initial)
        return () =>
          h(NotesChart, {
            modelValue: model.value,
            readonly,
            'onUpdate:modelValue': (next) => {
              if (readonly) return
              const normalized = normalizeNoteChartData(next)
              model.value = normalized
              options.onChange?.(index, normalized)
            },
          })
      },
    })
    app.mount(host)
    apps.push(app)
  })

  return () => {
    for (const app of apps) {
      try {
        app.unmount()
      } catch {
        /* ignore */
      }
    }
  }
}
