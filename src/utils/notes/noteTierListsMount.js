import { createApp, h, ref } from 'vue'
import NotesTierList from '../../components/notes/NotesTierList.vue'
import {
  NOTE_TIERLIST_INDEX_ATTR,
  NOTE_TIERLIST_PLACEHOLDER_CLASS,
  normalizeTierListData,
  resolveTierListTheme,
} from './noteTierLists.js'

/**
 * Monte les composants Vue TierList sur les placeholders de l’aperçu.
 * @param {ParentNode | null | undefined} root
 * @param {unknown[]} tierLists
 * @param {{
 *   theme?: ReturnType<typeof resolveTierListTheme>,
 *   readonly?: boolean,
 *   autofocusDraft?: boolean,
 *   onChange?: (index: number, data: ReturnType<typeof normalizeTierListData>) => void,
 * }} [options]
 * @returns {() => void}
 */
export function mountNoteTierLists(root, tierLists, options = {}) {
  if (!root || typeof root.querySelectorAll !== 'function') return () => {}

  const list = Array.isArray(tierLists) ? tierLists : []
  const theme = options.theme || resolveTierListTheme(null)
  const readonly = Boolean(options.readonly)
  const autofocusDraft = Boolean(options.autofocusDraft)
  /** @type {import('vue').App[]} */
  const apps = []
  let focusedOnce = false

  root.querySelectorAll(`.${NOTE_TIERLIST_PLACEHOLDER_CLASS}`).forEach((node) => {
    if (!(node instanceof HTMLElement)) return
    const index = Number(node.getAttribute(NOTE_TIERLIST_INDEX_ATTR))
    if (!Number.isFinite(index) || index < 0 || index >= list.length) return

    node.innerHTML = ''
    const host = document.createElement('div')
    host.className = 'notes-tierlist-host'
    node.appendChild(host)

    const initial = normalizeTierListData(list[index])
    const shouldAutofocus = autofocusDraft && !focusedOnce
    if (shouldAutofocus) focusedOnce = true
    const app = createApp({
      setup() {
        const model = ref(initial)
        return () =>
          h(NotesTierList, {
            modelValue: model.value,
            theme,
            readonly,
            autofocusDraft: shouldAutofocus,
            'onUpdate:modelValue': (next) => {
              if (readonly) return
              const normalized = normalizeTierListData(next)
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
