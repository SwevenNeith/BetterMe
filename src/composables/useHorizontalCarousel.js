import { ref, computed, onMounted, onUnmounted } from 'vue'

const MOBILE_MEDIA = '(max-width: 768px)'

/**
 * Carrousel horizontal scroll-snap (une colonne à la fois sur mobile).
 * @param {{ columnSelector?: string }} [options]
 */
export function useHorizontalCarousel(options = {}) {
  const columnSelector = options.columnSelector ?? '.carousel-column'

  const activePage = ref(0)
  const carouselViewport = ref(null)
  const carouselTrack = ref(null)
  const slideWidthPx = ref(0)
  const slideCount = ref(2)
  const isMobileCarousel = ref(false)

  let carouselResizeObserver = null
  let scrollSyncRaf = null
  let mobileMediaQuery = null

  const lastSlideIndex = computed(() => Math.max(0, slideCount.value - 1))

  function updateCarouselLayout() {
    isMobileCarousel.value = window.matchMedia(MOBILE_MEDIA).matches

    if (carouselTrack.value) {
      slideCount.value = carouselTrack.value.querySelectorAll(columnSelector).length || 2
    }

    if (!isMobileCarousel.value || !carouselViewport.value) {
      slideWidthPx.value = 0
      activePage.value = 0
      return
    }

    const viewport = carouselViewport.value
    const vW = Math.round(viewport.clientWidth || viewport.getBoundingClientRect().width)
    const firstCol = viewport.querySelector(columnSelector)
    const colW = firstCol ? Math.round(firstCol.getBoundingClientRect().width) : 0
    const width = colW > 0 ? colW : vW
    if (width > 0) {
      slideWidthPx.value = width
    }

    if (activePage.value > lastSlideIndex.value) {
      activePage.value = lastSlideIndex.value
    }

    const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    if (Number.isFinite(maxScroll) && viewport.scrollLeft > maxScroll) {
      viewport.scrollLeft = maxScroll
    }
  }

  function syncActivePageFromScroll() {
    if (!isMobileCarousel.value || !carouselViewport.value || slideWidthPx.value <= 0) return
    const index = Math.round(carouselViewport.value.scrollLeft / slideWidthPx.value)
    activePage.value = Math.min(Math.max(index, 0), lastSlideIndex.value)
  }

  function onCarouselScroll() {
    if (scrollSyncRaf) cancelAnimationFrame(scrollSyncRaf)
    scrollSyncRaf = requestAnimationFrame(syncActivePageFromScroll)
  }

  function goToSlide(index) {
    const target = Math.min(Math.max(index, 0), lastSlideIndex.value)
    activePage.value = target

    if (!isMobileCarousel.value || !carouselViewport.value || slideWidthPx.value <= 0) return

    carouselViewport.value.scrollTo({
      left: target * slideWidthPx.value,
      behavior: 'smooth',
    })
  }

  function setupCarouselObserver() {
    updateCarouselLayout()
    carouselResizeObserver?.disconnect()
    if (carouselViewport.value) {
      carouselResizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          const previousWidth = slideWidthPx.value
          const previousPage = activePage.value
          updateCarouselLayout()
          if (
            isMobileCarousel.value &&
            carouselViewport.value &&
            previousWidth > 0 &&
            slideWidthPx.value > 0
          ) {
            carouselViewport.value.scrollLeft = previousPage * slideWidthPx.value
          }
        })
      })
      carouselResizeObserver.observe(carouselViewport.value)
    }
  }

  function teardownCarouselObserver() {
    carouselResizeObserver?.disconnect()
    carouselResizeObserver = null
    if (scrollSyncRaf) cancelAnimationFrame(scrollSyncRaf)
    scrollSyncRaf = null
  }

  function onMobileMediaChange() {
    requestAnimationFrame(updateCarouselLayout)
  }

  onMounted(() => {
    mobileMediaQuery = window.matchMedia(MOBILE_MEDIA)
    mobileMediaQuery.addEventListener('change', onMobileMediaChange)
    requestAnimationFrame(setupCarouselObserver)
  })

  onUnmounted(() => {
    mobileMediaQuery?.removeEventListener('change', onMobileMediaChange)
    teardownCarouselObserver()
  })

  return {
    activePage,
    carouselViewport,
    carouselTrack,
    slideWidthPx,
    slideCount,
    isMobileCarousel,
    lastSlideIndex,
    goToSlide,
    onCarouselScroll,
    setupCarouselObserver,
    updateCarouselLayout,
  }
}
