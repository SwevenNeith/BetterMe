import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { supabase } from '../lib/supabase.js'
import { APP_MAIN_PAGES } from '../constants/appPages.js'
import {
  loadPageVisibility,
  getPageDisplayLabel,
  PAGE_VISIBILITY_UPDATED_EVENT,
  mergePageVisibility,
} from '../services/pageVisibility.js'

/**
 * Libellé affiché d'une page (personnalisable dans Réglages → Visibilité).
 * @param {string} pageId
 * @param {string} [defaultLabel] — si omis, lu depuis APP_MAIN_PAGES
 * @param {{ setDocumentTitle?: boolean }} [options]
 */
export function usePageDisplayLabel(pageId, defaultLabel, options = {}) {
  const resolvedDefault =
    defaultLabel ?? APP_MAIN_PAGES.find((p) => p.id === pageId)?.defaultLabel ?? ''

  const pageVisibility = ref(mergePageVisibility(null))

  async function reload() {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      pageVisibility.value = mergePageVisibility(null)
      return
    }
    try {
      pageVisibility.value = await loadPageVisibility(supabase, user.id)
    } catch (err) {
      console.error('page visibility:', err)
      pageVisibility.value = mergePageVisibility(null)
    }
  }

  const pageTitle = computed(() =>
    getPageDisplayLabel(pageId, pageVisibility.value, resolvedDefault),
  )

  onMounted(() => {
    reload()
    window.addEventListener(PAGE_VISIBILITY_UPDATED_EVENT, reload)
  })

  onUnmounted(() => {
    window.removeEventListener(PAGE_VISIBILITY_UPDATED_EVENT, reload)
  })

  if (options.setDocumentTitle) {
    watch(
      pageTitle,
      (title) => {
        document.title = title ? `${title} · BetterMe` : 'BetterMe'
      },
      { immediate: true },
    )
  }

  return { pageTitle, pageVisibility, reload }
}
