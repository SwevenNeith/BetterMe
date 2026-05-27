<!-- eslint-disable no-useless-assignment -->
<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { supabase } from '../lib/supabase.js'
import { useRouter } from 'vue-router'
import MenstruationCycleCalendar from '../components/MenstruationCycleCalendar.vue'
import { listCyclesPilule } from '../services/menstruationCycles.js'
const router = useRouter()
const userName = ref('')

// Helpers
const formatDateToLocalISO = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const todayDate = new Date()
const todayStr = formatDateToLocalISO(todayDate)

const formattedTodayRaw = todayDate.toLocaleDateString('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})
const formattedToday = formattedTodayRaw.charAt(0).toUpperCase() + formattedTodayRaw.slice(1)

const userEvents = ref([])
const userCategories = ref([])
const isLoadingEvents = ref(true)
const menstruationCycles = ref([])

// Carousel mobile (scroll-snap)
const activePage = ref(0)
const carouselViewport = ref(null)
const carouselTrack = ref(null)
const slideWidthPx = ref(0)
const slideCount = ref(2)
const isMobileCarousel = ref(false)
let carouselResizeObserver = null
let scrollSyncRaf = null
let mobileMediaQuery = null

const MOBILE_MEDIA = '(max-width: 768px)'

const lastSlideIndex = computed(() => Math.max(0, slideCount.value - 1))

const updateCarouselLayout = () => {
  isMobileCarousel.value = window.matchMedia(MOBILE_MEDIA).matches

  if (carouselTrack.value) {
    slideCount.value = carouselTrack.value.querySelectorAll('.dashboard-column').length || 2
  }

  if (!isMobileCarousel.value || !carouselViewport.value) {
    slideWidthPx.value = 0
    activePage.value = 0
    return
  }

  const viewport = carouselViewport.value
  const vW = Math.round(viewport.clientWidth || viewport.getBoundingClientRect().width)
  const firstCol = viewport.querySelector('.dashboard-column')
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

const syncActivePageFromScroll = () => {
  if (!isMobileCarousel.value || !carouselViewport.value || slideWidthPx.value <= 0) return
  const index = Math.round(carouselViewport.value.scrollLeft / slideWidthPx.value)
  activePage.value = Math.min(Math.max(index, 0), lastSlideIndex.value)
}

const onCarouselScroll = () => {
  if (scrollSyncRaf) cancelAnimationFrame(scrollSyncRaf)
  scrollSyncRaf = requestAnimationFrame(syncActivePageFromScroll)
}

const goToSlide = (index) => {
  const target = Math.min(Math.max(index, 0), lastSlideIndex.value)
  activePage.value = target

  if (!isMobileCarousel.value || !carouselViewport.value || slideWidthPx.value <= 0) return

  carouselViewport.value.scrollTo({
    left: target * slideWidthPx.value,
    behavior: 'smooth',
  })
}

const setupCarouselObserver = () => {
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

// Fetch Events & Categories from Supabase
const fetchTodayEvents = async (userId) => {
  try {
    isLoadingEvents.value = true

    // Fetch categories
    const { data: catData, error: catError } = await supabase
      .from('timetable_categories')
      .select('*')
      .eq('user_id', userId)

    if (catError) throw catError
    userCategories.value = catData || []

    const defaultCategories = [
      { name: 'Travail', color: 'hsl(280, 65%, 72%)', icon: '💼' },
      { name: 'Hobbies', color: 'hsl(25, 75%, 72%)', icon: '🎨' },
    ]

    for (const defCat of defaultCategories) {
      const exists = userCategories.value.some(
        (c) => c.name.toLowerCase() === defCat.name.toLowerCase(),
      )
      if (!exists) {
        userCategories.value.push({
          id: `temp-${defCat.name.toLowerCase()}`,
          name: defCat.name,
          color: defCat.color,
          icon: defCat.icon,
          is_temp: true,
        })
      }
    }

    // Fetch events (must be active today)
    const { data: evData, error: evError } = await supabase
      .from('timetable_events')
      .select('*')
      .eq('user_id', userId)
      .or(`date_start.eq.${todayStr},and(date_start.lte.${todayStr},date_end.gte.${todayStr})`)

    if (evError) throw evError

    // Sort events
    const parsedEvents = (evData || []).map((ev) => {
      let startDecimal = 0
      if (!ev.all_day && ev.time) {
        const startStr = ev.time.split('-')[0].trim().replace('h', ':')
        const parts = startStr.split(':')
        startDecimal = parseInt(parts[0], 10) + parseInt(parts[1] || 0, 10) / 60
      } else {
        startDecimal = -1 // all day first
      }
      return { ...ev, startDecimal }
    })

    parsedEvents.sort((a, b) => a.startDecimal - b.startDecimal)
    userEvents.value = parsedEvents
  } catch (err) {
    console.error('Error fetching today events:', err)
  } finally {
    isLoadingEvents.value = false
  }
}

onMounted(async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    router.push('/')
    return
  }
  userName.value = user.user_metadata?.nom ?? user.email

  await fetchTodayEvents(user.id)

  try {
    menstruationCycles.value = await listCyclesPilule(supabase, user.id)
  } catch (err) {
    console.error('Erreur chargement cycles menstruation:', err)
    menstruationCycles.value = []
  }

  await nextTick()
  setupCarouselObserver()
  requestAnimationFrame(() => {
    updateCarouselLayout()
    requestAnimationFrame(() => updateCarouselLayout())
  })

  mobileMediaQuery = window.matchMedia(MOBILE_MEDIA)
  mobileMediaQuery.addEventListener('change', updateCarouselLayout)
  window.addEventListener('resize', updateCarouselLayout)
})

onUnmounted(() => {
  carouselResizeObserver?.disconnect()
  mobileMediaQuery?.removeEventListener('change', updateCarouselLayout)
  window.removeEventListener('resize', updateCarouselLayout)
  if (scrollSyncRaf) cancelAnimationFrame(scrollSyncRaf)
})

// Category properties generators
const getCategoryName = (categoryIdOrName) => {
  if (!categoryIdOrName) return ''
  const cat = userCategories.value.find(
    (c) => c.id === categoryIdOrName || c.name.toLowerCase() === categoryIdOrName.toLowerCase(),
  )
  return cat ? cat.name : ''
}

const getCategoryIcon = (categoryIdOrName) => {
  if (!categoryIdOrName) return '📅'
  const cat = userCategories.value.find(
    (c) => c.id === categoryIdOrName || c.name.toLowerCase() === categoryIdOrName.toLowerCase(),
  )
  return cat ? cat.icon : '📅'
}

const getCategoryStyle = (categoryIdOrName) => {
  if (!categoryIdOrName) return {}
  const cat = userCategories.value.find(
    (c) => c.id === categoryIdOrName || c.name.toLowerCase() === categoryIdOrName.toLowerCase(),
  )
  const color = cat ? cat.color : '#d5b5ea'

  let bg = ''
  let bgEnd = ''
  if (color.startsWith('hsl')) {
    bg = color.replace('hsl', 'hsla').replace(')', ', 0.22)')
    bgEnd = color.replace('hsl', 'hsla').replace(')', ', 0.08)')
  } else {
    bg = `${color}38`
    bgEnd = `${color}14`
  }

  return {
    background: `linear-gradient(135deg, ${bg}, ${bgEnd})`,
    color: color,
    borderLeft: `4px solid ${color}`,
  }
}
</script>

<template>
  <div class="dashboard-wrapper">
    <div class="bg-blob"></div>
    <div class="mini-header">
      <h1 class="welcome-title">
        Bonjour, <span class="highlight">{{ userName }}</span> 👋
      </h1>
      <p class="welcome-subtitle">Voici ton aperçu de la journée.</p>
    </div>

    <!-- 2 columns layout -->
    <div class="dashboard-carousel-wrapper">
      <!-- Navigation Arrows for mobile (outside the sliding track) -->
      <button
        class="carousel-arrow prev-arrow"
        v-if="isMobileCarousel && activePage > 0"
        @click="goToSlide(activePage - 1)"
        aria-label="Colonne précédente"
      >
        ‹
      </button>
      <button
        class="carousel-arrow next-arrow"
        v-if="isMobileCarousel && activePage < lastSlideIndex"
        @click="goToSlide(activePage + 1)"
        aria-label="Colonne suivante"
      >
        ›
      </button>

      <div ref="carouselViewport" class="dashboard-content" @scroll.passive="onCarouselScroll">
        <div ref="carouselTrack" class="carousel-track">
          <!-- Left Column -->
          <div class="dashboard-column left-column">
            <h2 class="column-title">
              <span>Aujourd'hui</span>
              <span class="column-date">{{ formattedToday }}</span>
            </h2>
            <div class="today-events-container">
              <div v-if="isLoadingEvents" class="loading-state">
                <span class="spinner"></span> Chargement de ton planning...
              </div>
              <div v-else-if="userEvents.length === 0" class="empty-state">
                <span class="empty-icon">☕</span>
                <p>Aucun événement prévu aujourd'hui. Profite de ton temps libre !</p>
              </div>
              <div v-else class="today-events-list">
                <div
                  v-for="event in userEvents"
                  :key="event.id"
                  class="dashboard-event-card"
                  :style="getCategoryStyle(event.category)"
                >
                  <div class="event-time">
                    <span v-if="event.all_day" class="time-badge">Toute la journée</span>
                    <span v-else class="time-badge">{{ event.time }}</span>
                  </div>
                  <div class="event-details">
                    <div class="event-title-row">
                      <span class="event-icon">{{ getCategoryIcon(event.category) }}</span>
                      <h4 class="event-title">{{ event.title }}</h4>
                    </div>
                    <p v-if="event.detail" class="event-description">{{ event.detail }}</p>
                    <div v-if="event.category" class="event-tags">
                      <span class="event-category-tag">
                        {{ getCategoryName(event.category) }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Column -->
          <div class="dashboard-column right-column">
            <div class="right-column-stack">
              <div class="mini-calendar-wrapper dashboard-menstruation-wrap">
                <MenstruationCycleCalendar
                  :cycles="menstruationCycles"
                  :compact="true"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="isMobileCarousel && slideCount > 1"
        class="carousel-indicators"
        role="tablist"
        aria-label="Navigation entre les colonnes"
      >
        <span
          v-for="index in slideCount"
          :key="index - 1"
          class="indicator-dot"
          role="tab"
          :aria-selected="activePage === index - 1"
          :class="{ active: activePage === index - 1 }"
          @click="goToSlide(index - 1)"
        ></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-wrapper {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 2rem 1.5rem;
  min-height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  gap: 2rem;
}

/* Decorative blob — Lavande */
.bg-blob {
  position: absolute;
  top: -120px;
  right: -120px;
  width: 480px;
  height: 480px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(213, 181, 234, 0.3) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}

.mini-header {
  position: relative;
  z-index: 1;
  width: 100%;
  text-align: center;
  margin-top: 1rem;
}

.welcome-title {
  font-size: 2.2rem;
  font-weight: 800;
  color: #2c3e50;
  margin: 0;
}

@media (prefers-color-scheme: dark) {
  .welcome-title {
    color: #f0e8f8;
  }
}

.highlight {
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.welcome-subtitle {
  font-size: 1.05rem;
  color: #6c757d;
  margin-top: 0.5rem;
  margin-bottom: 1.5rem;
}

@media (prefers-color-scheme: dark) {
  .welcome-subtitle {
    color: #adb5bd;
  }
}

/* ─── Dashboard Columns & Carousel ─── */

/* Wrapper handles arrows on mobile (relative positioning context) */
.dashboard-carousel-wrapper {
  position: relative;
  width: 100%;
  max-width: 1000px;
  z-index: 1;
  flex: 1;
}

/* On desktop: the content is just the grid */
.dashboard-content {
  width: 100%;
  max-width: 1000px;
}

.carousel-track {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  width: 100%;
  align-items: stretch;
}

.dashboard-column {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  min-width: 0;
}

/* Colonne droite : bloc intro + calendrier cycle + légende, même hauteur utile que la gauche (desktop) */
.right-column-stack {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  min-width: 0;
  width: 100%;
}

@media (min-width: 769px) {
  .left-column .today-events-container {
    flex: 1;
    min-height: 0;
  }

  .right-column .right-column-stack {
    flex: 1;
    min-height: 0;
  }

  /* Même largeur utile que la colonne grille (évite le cap à 320px qui déséquilibre) */
  .right-column-stack .mini-calendar-wrapper {
    max-width: 100%;
    margin-left: 0;
    margin-right: 0;
  }

  .dashboard-menstruation-wrap :deep(.cycle-calendar) {
    max-width: 100%;
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
  }

  .dashboard-menstruation-wrap :deep(.cycle-calendar__legend),
  .dashboard-menstruation-wrap :deep(.cycle-calendar__legend-groups),
  .dashboard-menstruation-wrap :deep(.cycle-calendar__meta) {
    max-width: 100%;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }
}

/* Hidden by default on desktop */
.carousel-arrow {
  display: none;
}

.carousel-indicators {
  display: none;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 1rem;
  z-index: 2;
  width: 100%;
}

/* Mobile responsive carousel */
@media (max-width: 768px) {
  .dashboard-wrapper {
    overflow-x: hidden;
    padding: 1rem 0.75rem;
    gap: 1.25rem;
  }

  .dashboard-carousel-wrapper {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 100%;
    /* Ne pas étirer le bloc sur toute la hauteur restante (évite une zone « fantôme » énorme sur mobile) */
    flex: 0 0 auto;
    min-height: 0;
  }

  /* Viewport: horizontal scroll with snap (one column at a time) */
  .dashboard-content {
    container-type: inline-size;
    container-name: dash-carousel;
    display: flex;
    align-items: flex-start;
    height: fit-content;
    min-height: 0;
    overflow-x: auto;
    overflow-y: hidden;
    width: 100%;
    max-width: 100%;
    scroll-snap-type: x mandatory;
    scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    touch-action: pan-x pan-y;
  }

  .dashboard-content::-webkit-scrollbar {
    display: none;
  }

  /* Piste = N × largeur du conteneur (cqi) ; ne pas hériter du width:100% desktop */
  .carousel-track {
    display: flex;
    grid-template-columns: none;
    gap: 0;
    flex: 0 0 auto;
    width: max-content;
    min-width: 100%;
    height: fit-content;
    align-items: flex-start;
    align-content: flex-start;
    box-sizing: border-box;
  }

  .dashboard-column {
    align-self: flex-start;
    height: auto;
    min-height: 0;
    box-sizing: border-box;
    padding: 0;
    scroll-snap-align: start;
    scroll-snap-stop: always;
    /* Repli sans unités conteneur */
    flex: 0 0 100%;
    width: 100%;
    min-width: 100%;
    max-width: 100%;
  }

  @supports (width: 1cqi) {
    .dashboard-content .carousel-track .dashboard-column {
      flex: 0 0 100cqi;
      width: 100cqi;
      min-width: 100cqi;
      max-width: 100cqi;
    }
  }

  .right-column-stack,
  .today-events-container,
  .mini-calendar-wrapper,
  .dashboard-menstruation-wrap,
  .dashboard-legend {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }

  .dashboard-event-card {
    max-width: 100%;
    overflow-wrap: anywhere;
  }

  /* Sans flex:1, l'état vide ne « remplit » pas une carte étirée par erreur */
  .today-events-container > .empty-state,
  .today-events-container > .loading-state {
    flex: 0 0 auto;
    flex-grow: 0;
  }

  .left-column .today-events-container {
    flex: 0 1 auto;
    flex-grow: 0;
  }

  .column-title {
    min-width: 0;
    width: 100%;
  }

  .column-title > span:first-of-type {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .column-date {
    flex-shrink: 0;
    max-width: 100%;
    white-space: normal;
    text-align: right;
    overflow-wrap: anywhere;
  }

  /* Indicators: centered below the carousel viewport */
  .carousel-indicators {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding-top: 1rem;
    margin-top: 0;
  }

  /* Arrows sit outside the overflow:hidden area, floating on the sides */
  .carousel-arrow {
    display: flex;
    position: absolute;
    top: 40%;
    transform: translateY(-50%);
    background: rgba(255, 255, 255, 0.75);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid rgba(213, 181, 234, 0.3);
    color: #ad81be;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    font-weight: bold;
    cursor: pointer;
    z-index: 20;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    transition: all 0.2s ease;
    /* Arrows sit outside the content area, not on top of it */
    pointer-events: all;
  }

  .carousel-arrow:active {
    background: rgba(213, 181, 234, 0.35);
    transform: translateY(-50%) scale(0.95);
  }

  .prev-arrow {
    left: 4px;
  }
  .next-arrow {
    right: 4px;
  }

  .indicator-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(213, 181, 234, 0.3);
    cursor: pointer;
    transition: all 0.3s ease;
  }

  .indicator-dot.active {
    background: #ad81be;
    width: 20px;
    border-radius: 4px;
  }
}

@media (max-width: 768px) and (prefers-color-scheme: dark) {
  .carousel-arrow {
    background: rgba(25, 20, 35, 0.75);
    border-color: rgba(213, 181, 234, 0.2);
  }
}

.column-title {
  font-size: 1.4rem;
  font-weight: 800;
  color: #2c3e50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid rgba(213, 181, 234, 0.2);
}

.column-date {
  font-size: 0.95rem;
  font-weight: 600;
  color: #ad81be;
  background: rgba(213, 181, 234, 0.15);
  padding: 0.2rem 0.6rem;
  border-radius: 8px;
}

@media (prefers-color-scheme: dark) {
  .column-title {
    color: #f0e8f8;
    border-bottom-color: rgba(213, 181, 234, 0.1);
  }
}

.today-events-container {
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.25);
  border-radius: 20px;
  padding: 1.5rem;
  box-shadow: 0 8px 32px rgba(173, 129, 190, 0.08);
  min-height: 250px;
  display: flex;
  flex-direction: column;
}

@media (prefers-color-scheme: dark) {
  .today-events-container {
    background: rgba(25, 20, 35, 0.65);
    border-color: rgba(213, 181, 234, 0.15);
  }
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  text-align: center;
  color: #8c98a4;
  gap: 1rem;
  font-weight: 600;
}

.empty-icon {
  font-size: 3rem;
  opacity: 0.7;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid rgba(213, 181, 234, 0.3);
  border-top-color: #ad81be;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.today-events-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.dashboard-event-card {
  border-radius: 12px;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
  position: relative;
  overflow: hidden;
}

.dashboard-event-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
}

.event-time {
  margin-bottom: 0.15rem;
}

.time-badge {
  background: rgba(255, 255, 255, 0.6);
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 800;
  color: inherit;
  letter-spacing: 0.5px;
}

@media (prefers-color-scheme: dark) {
  .time-badge {
    background: rgba(0, 0, 0, 0.25);
  }
}

.event-title-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.event-title {
  font-size: 1.1rem;
  font-weight: 800;
  margin: 0;
  line-height: 1.3;
}

.event-icon {
  font-size: 1.2rem;
}

.event-description {
  font-size: 0.85rem;
  line-height: 1.45;
  margin: 0.25rem 0 0 0;
  opacity: 0.85;
}

.event-tags {
  margin-top: 0.5rem;
}

.event-category-tag {
  display: inline-block;
  font-size: 0.65rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.75;
}

/* ─── Mini Calendar ─── */
.mini-calendar-wrapper {
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.25);
  border-radius: 20px;
  padding: 1.25rem;
  box-shadow: 0 8px 32px rgba(173, 129, 190, 0.08);
  max-width: 320px;
  width: 100%;
  margin: 0 auto;
}

/* Dashboard : carte cycle = toute la largeur de la colonne (sinon max 320px + légende illisible) */
.right-column .dashboard-menstruation-wrap.mini-calendar-wrapper {
  max-width: 100%;
  width: 100%;
  margin-left: 0;
  margin-right: 0;
  align-self: stretch;
  box-sizing: border-box;
  container-type: inline-size;
  container-name: dash-mensu-card;
}

/* Légende : grille 3 colonnes selon la largeur RÉELLE de la carte (pas le viewport) */
@container dash-mensu-card (min-width: 320px) {
  .right-column .dashboard-menstruation-wrap :deep(.cycle-calendar__legend-groups) {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.65rem 0.85rem;
    width: 100%;
    min-width: 0;
    align-items: start;
  }

  .right-column .dashboard-menstruation-wrap :deep(.cycle-calendar__legend-group) {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
  }

  .right-column .dashboard-menstruation-wrap :deep(.cycle-calendar__legend-list) {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.45rem;
    min-width: 0;
    width: 100%;
  }

  .right-column .dashboard-menstruation-wrap :deep(.cycle-calendar__legend-item) {
    min-width: 0;
  }

  .right-column .dashboard-menstruation-wrap :deep(.cycle-calendar__legend-text),
  .right-column .dashboard-menstruation-wrap :deep(.cycle-calendar__legend-desc) {
    overflow-wrap: break-word;
    word-break: normal;
    min-width: 0;
  }
}

.calendar-placeholder-text {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.55;
  color: #5d6d7e;
  overflow-wrap: anywhere;
  word-break: break-word;
}

@media (prefers-color-scheme: dark) {
  .mini-calendar-wrapper {
    background: rgba(25, 20, 35, 0.65);
    border-color: rgba(213, 181, 234, 0.15);
  }
  .calendar-placeholder-text {
    color: #c5b8d2;
  }
}

.mini-calendar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
}

.calendar-month-title {
  font-size: 1.1rem;
  font-weight: 800;
  color: #2c3e50;
  margin: 0;
  text-transform: capitalize;
}

@media (prefers-color-scheme: dark) {
  .calendar-month-title {
    color: #f0e8f8;
  }
}

.calendar-nav-btn {
  background: rgba(213, 181, 234, 0.2);
  border: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #ad81be;
  font-weight: bold;
  font-size: 1.1rem;
  transition: all 0.2s ease;
}

.calendar-nav-btn:hover {
  background: rgba(213, 181, 234, 0.4);
  transform: scale(1.05);
}

.mini-calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.4rem;
}

.calendar-weekday {
  font-size: 0.75rem;
  font-weight: 700;
  color: #a0aab5;
  text-align: center;
  margin-bottom: 0.5rem;
}

.calendar-day {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  font-weight: 600;
  border-radius: 50%;
  color: #a0aab5;
  cursor: default;
  transition: all 0.2s ease;
}

.calendar-day.is-current-month {
  color: #4f5f6f;
}

@media (prefers-color-scheme: dark) {
  .calendar-day.is-current-month {
    color: #c5b8d2;
  }
}

.calendar-day.is-today {
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white !important;
  font-weight: 800;
  box-shadow: 0 4px 10px rgba(173, 129, 190, 0.3);
  transform: scale(1.05);
}

/* ─── Dashboard Legend ─── */
.dashboard-legend {
  margin-top: 1rem;
  padding: 1.25rem;
  background: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.15);
  border-radius: 20px;
  max-width: 320px;
  width: 100%;
  margin-left: auto;
  margin-right: auto;
}

@media (prefers-color-scheme: dark) {
  .dashboard-legend {
    background: rgba(25, 20, 35, 0.4);
    border-color: rgba(213, 181, 234, 0.1);
  }
}

.legend-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: #5d6d7e;
  margin-bottom: 0.75rem;
  text-align: center;
}

@media (prefers-color-scheme: dark) {
  .legend-title {
    color: #aeb6bf;
  }
}

.legend-items {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.legend-color {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  flex-shrink: 0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.legend-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #4f5f6f;
}

@media (prefers-color-scheme: dark) {
  .legend-label {
    color: #c5b8d2;
  }
}
</style>
