import { onMounted, onUnmounted, ref } from 'vue'

/**
 * Suit `prefers-color-scheme: dark` (réactif au changement système).
 * @returns {import('vue').Ref<boolean>}
 */
export function usePrefersDark() {
  const prefersDark = ref(
    typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  /** @type {MediaQueryList | null} */
  let mq = null

  /** @param {MediaQueryListEvent | MediaQueryList} event */
  function onChange(event) {
    prefersDark.value = Boolean(event.matches)
  }

  onMounted(() => {
    if (typeof window === 'undefined') return
    mq = window.matchMedia('(prefers-color-scheme: dark)')
    prefersDark.value = mq.matches
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange)
    } else {
      mq.addListener(onChange)
    }
  })

  onUnmounted(() => {
    if (!mq) return
    if (typeof mq.removeEventListener === 'function') {
      mq.removeEventListener('change', onChange)
    } else {
      mq.removeListener(onChange)
    }
    mq = null
  })

  return prefersDark
}
