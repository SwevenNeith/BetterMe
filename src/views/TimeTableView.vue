<!-- eslint-disable no-useless-assignment -->
<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { supabase } from '../lib/supabase.js'

// State
const currentDate = ref(new Date())
const selectedDayIndex = ref(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1) // 0 = Mon, 6 = Sun

// Modal quick add state
const isModalOpen = ref(false)
const newEventTitle = ref('')
const newEventTime = ref('10:00 - 11:30')
const newEventCategory = ref('Travail')
const newEventDay = ref(selectedDayIndex.value)

// User-created events list, loaded from Supabase
const userEvents = ref([])
const userCategories = ref([])
const isLoading = ref(true)

// Helper: Get ISO Week Number
const getWeekNumber = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
}

// Helper: Format Date to Local YYYY-MM-DD
const formatDateToLocalISO = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Computed properties for date calculations
const weekNumber = computed(() => getWeekNumber(currentDate.value))

const weekDays = computed(() => {
  const date = currentDate.value
  const currentDay = date.getDay() // 0 = Sun, 1-6 = Mon-Sat
  const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay

  const monday = new Date(date)
  monday.setDate(date.getDate() + distanceToMonday)

  const days = []
  const dayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    days.push({
      name: dayNames[i],
      shortName: dayNames[i].substring(0, 3),
      date: d,
      dayOfMonth: d.getDate(),
      formatted: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
      isToday: d.toDateString() === new Date().toDateString(),
    })
  }
  return days
})

// Month & Year string
const currentMonthYearString = computed(() => {
  const firstDay = weekDays.value[0].date
  const lastDay = weekDays.value[6].date

  const firstMonth = firstDay.toLocaleDateString('fr-FR', { month: 'long' })
  const lastMonth = lastDay.toLocaleDateString('fr-FR', { month: 'long' })
  const firstYear = firstDay.getFullYear()
  const lastYear = lastDay.getFullYear()

  if (firstYear !== lastYear) {
    return `${firstMonth} ${firstYear} - ${lastMonth} ${lastYear}`
  }
  if (firstMonth !== lastMonth) {
    return `${firstMonth} - ${lastMonth} ${firstYear}`
  }
  return `${firstMonth} ${firstYear}`
})

// Category Icons Mapper
const getCategoryIcon = (categoryIdOrName) => {
  if (!categoryIdOrName) return '📅'
  const cat = userCategories.value.find(
    (c) => c.id === categoryIdOrName || c.name.toLowerCase() === categoryIdOrName.toLowerCase(),
  )
  return cat ? cat.icon : '📅'
}

// Category Names Mapper
const getCategoryName = (categoryIdOrName) => {
  if (!categoryIdOrName) return ''
  const cat = userCategories.value.find(
    (c) => c.id === categoryIdOrName || c.name.toLowerCase() === categoryIdOrName.toLowerCase(),
  )
  return cat ? cat.name : ''
}

// Dynamic Category Style generator for event cards
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
    bg = `${color}38` // ~22% transparency
    bgEnd = `${color}14` // ~8% transparency
  }

  return {
    background: `linear-gradient(135deg, ${bg}, ${bgEnd})`,
    color: color,
    borderLeft: `4px solid ${color}`,
    '--event-color-solid': color,
  }
}

// Generate premium interactive pill styles for category selection
const getPillStyle = (cat) => {
  if (!cat) return {}
  const color = cat.color
  const isActive = newEventCategory.value.toLowerCase() === cat.name.toLowerCase()

  let bg = ''
  if (color.startsWith('hsl')) {
    bg = color.replace('hsl', 'hsla').replace(')', isActive ? ', 0.35)' : ', 0.15)')
  } else {
    bg = isActive ? `${color}59` : `${color}26` // 35% vs 15% transparency
  }

  return {
    backgroundColor: bg,
    color: color,
    border: `2px solid ${isActive ? color : 'transparent'}`,
    boxShadow: isActive ? `0 0 10px ${color}40` : 'none',
  }
}

// Fetch Events & Categories from Supabase
const fetchEvents = async () => {
  try {
    isLoading.value = true
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      userEvents.value = []
      userCategories.value = []
      isLoading.value = false
      return
    }

    // Fetch categories first
    const { data: catData, error: catError } = await supabase
      .from('timetable_categories')
      .select('*')
      .eq('user_id', user.id)

    if (catError) throw catError
    userCategories.value = catData || []

    // Fetch events
    const mondayStr = formatDateToLocalISO(weekDays.value[0].date)
    const sundayStr = formatDateToLocalISO(weekDays.value[6].date)

    const { data, error } = await supabase
      .from('timetable_events')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', mondayStr)
      .lte('date', sundayStr)

    if (error) throw error
    userEvents.value = data || []
  } catch (err) {
    console.error('Error fetching events:', err)
  } finally {
    isLoading.value = false
  }
}

// Watch currentDate changes to fetch events dynamically for the new week
watch(
  currentDate,
  () => {
    fetchEvents()
  },
  { immediate: true },
)

// Navigation handlers
const nextWeek = () => {
  const next = new Date(currentDate.value)
  next.setDate(currentDate.value.getDate() + 7)
  currentDate.value = next
}

const prevWeek = () => {
  const prev = new Date(currentDate.value)
  prev.setDate(currentDate.value.getDate() - 7)
  currentDate.value = prev
}

const resetToToday = () => {
  currentDate.value = new Date()
  selectedDayIndex.value = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1
}

// Filtered events matching selected date
const getEventsForDay = (dayIdx) => {
  const dayDateStr = formatDateToLocalISO(weekDays.value[dayIdx].date)
  return userEvents.value.filter((event) => event.date === dayDateStr)
}

// Add event handler to Supabase (with auto-creating missing categories)
const handleAddEvent = async () => {
  if (!newEventTitle.value.trim()) return

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      alert('Veuillez vous connecter pour ajouter une activité.')
      return
    }

    const categoryName = newEventCategory.value.trim()
    if (!categoryName) return

    // Find if category already exists for the user (case insensitive)
    let existingCat = userCategories.value.find(
      (c) => c.name.toLowerCase() === categoryName.toLowerCase(),
    )

    if (!existingCat) {
      // Generate a dynamic, premium pastel HSL color that perfectly fits the theme
      const beautifulHues = [280, 140, 170, 200, 340, 25, 300, 220]
      const randomHue = beautifulHues[Math.floor(Math.random() * beautifulHues.length)]
      const variation = Math.floor(Math.random() * 24) - 12 // +/- 12 degrees variation
      const hue = (randomHue + variation + 360) % 360
      const randomColor = `hsl(${hue}, 65%, 72%)`

      // Pick a random default emoji
      const defaultEmojis = [
        '📌',
        '🎨',
        '📚',
        '🏃‍♂️',
        '🎯',
        '💻',
        '💡',
        '🎵',
        '🌿',
        '⚡',
        '🌟',
        '🧘‍♀️',
        '📝',
        '🥗',
        '☕',
      ]
      const randomEmoji = defaultEmojis[Math.floor(Math.random() * defaultEmojis.length)]

      const { data: catData, error: catError } = await supabase
        .from('timetable_categories')
        .insert({
          user_id: user.id,
          name: categoryName,
          color: randomColor,
          icon: randomEmoji,
        })
        .select()

      if (catError) throw catError
      if (catData && catData.length > 0) {
        existingCat = catData[0]
        userCategories.value.push(existingCat)
      }
    }

    const selectedDayDate = weekDays.value[newEventDay.value].date
    const dateStr = formatDateToLocalISO(selectedDayDate)

    const { data, error } = await supabase
      .from('timetable_events')
      .insert({
        user_id: user.id,
        title: newEventTitle.value,
        date: dateStr,
        time: newEventTime.value,
        category: existingCat ? existingCat.id : null,
      })
      .select()

    if (error) throw error

    // Insert locally to update UI immediately
    if (data && data.length > 0) {
      userEvents.value.push(data[0])
    }

    // Reset form & Close modal
    newEventTitle.value = ''
    newEventTime.value = '10:00 - 11:30'
    newEventCategory.value = 'Travail'
    isModalOpen.value = false
  } catch (err) {
    console.error('Error adding event:', err)
    alert("Erreur lors de l'ajout de l'activité.")
  }
}

// Remove event handler from Supabase
const deleteEvent = async (eventId) => {
  try {
    const { error } = await supabase.from('timetable_events').delete().eq('id', eventId)

    if (error) throw error

    // Remove locally
    userEvents.value = userEvents.value.filter((ev) => ev.id !== eventId)
  } catch (err) {
    console.error('Error deleting event:', err)
    alert("Erreur lors de la suppression de l'activité.")
  }
}

// ─── Real Google-Calendar style Hourly Grid Layout Algorithm ───

const gridViewport = ref(null)
const mobileGridViewport = ref(null)
const hourHeight = 65 // Height of 1 hour in pixels

// Format single hour value to string HH:00
const formatHour = (hour) => {
  return `${String(hour).padStart(2, '0')}:00`
}

// Scrolls viewport to Daytime hours by default
const scrollToStartingHour = () => {
  if (gridViewport.value) {
    gridViewport.value.scrollTop = 7.5 * hourHeight
  }
  if (mobileGridViewport.value) {
    mobileGridViewport.value.scrollTop = 7.5 * hourHeight
  }
}

watch(selectedDayIndex, () => {
  setTimeout(() => {
    scrollToStartingHour()
  }, 50)
})

onMounted(() => {
  // Let DOM render and scroll
  setTimeout(() => {
    scrollToStartingHour()
  }, 100)
})

// Parse HH:MM to decimal hours (e.g. "10:30" -> 10.5)
const parseTimeToDecimal = (timeStr) => {
  if (!timeStr) return 0
  const parts = timeStr.replace(/h/gi, ':').split(':')
  if (parts.length < 2) return 0
  const hours = parseInt(parts[0], 10) || 0
  const minutes = parseInt(parts[1], 10) || 0
  return hours + minutes / 60
}

// Parses a range like "10:00 - 11:30" or "10h00 - 11h30" into { start: 10, end: 11.5 }
const parseEventHours = (timeRangeStr) => {
  const defaultHours = { start: 9, end: 10.5 }
  if (!timeRangeStr) return defaultHours

  // Normalize string
  const cleanStr = timeRangeStr.replace(/h/gi, ':').replace(/\s+/g, '')
  const parts = cleanStr.split(/[-–—]/)
  if (parts.length < 2) {
    const start = parseTimeToDecimal(parts[0])
    return { start, end: Math.min(start + 1.5, 23.99) }
  }

  const start = parseTimeToDecimal(parts[0])
  let end = parseTimeToDecimal(parts[1])

  if (end <= start) {
    end = Math.min(start + 1.5, 23.99)
  }

  return { start, end }
}

// Compute overlapping groups and absolute layout variables for a day column
const getPositionedEventsForDay = (dayIdx) => {
  const events = getEventsForDay(dayIdx)
  if (events.length === 0) return []

  // 1. Map each event with its start/end decimal hours
  const mappedEvents = events.map((ev) => {
    const { start, end } = parseEventHours(ev.time)
    return {
      ...ev,
      start,
      end,
      duration: end - start,
    }
  })

  // 2. Sort events by start time, then by duration (longer first)
  mappedEvents.sort((a, b) => a.start - b.start || b.duration - a.duration)

  // 3. Find overlapping groups
  const groups = []
  for (const ev of mappedEvents) {
    let added = false
    for (const group of groups) {
      const overlaps = group.some((member) => ev.start < member.end && ev.end > member.start)
      if (overlaps) {
        group.push(ev)
        added = true
        break
      }
    }
    if (!added) {
      groups.push([ev])
    }
  }

  // 4. For each group, calculate left position and width to sit perfectly side-by-side
  const result = []
  for (const group of groups) {
    const columns = []

    for (const ev of group) {
      let placed = false
      for (let i = 0; i < columns.length; i++) {
        const col = columns[i]
        const overlaps = col.some((member) => ev.start < member.end && ev.end > member.start)
        if (!overlaps) {
          col.push(ev)
          ev.colIndex = i
          placed = true
          break
        }
      }
      if (!placed) {
        columns.push([ev])
        ev.colIndex = columns.length - 1
      }
    }

    const totalCols = columns.length
    for (const ev of group) {
      const widthPercent = 96 / totalCols
      const leftPercent = ev.colIndex * (100 / totalCols)

      const top = ev.start * hourHeight
      const height = ev.duration * hourHeight

      ev.positionStyle = {
        position: 'absolute',
        top: `${top}px`,
        height: `${height}px`,
        left: `${leftPercent}%`,
        width: `${widthPercent}%`,
      }
      result.push(ev)
    }
  }

  return result
}
</script>

<template>
  <div class="timetable-wrapper">
    <div class="bg-blob"></div>

    <div class="page-header">
      <h1 class="page-title">Mon Emploi du Temps</h1>
      <p class="page-subtitle">
        Visualise, planifie et structure tes journées de manière intuitive.
      </p>
    </div>

    <!-- Navigation Bar -->
    <div class="calendar-controls">
      <div class="navigation-group">
        <button class="nav-arrow" @click="prevWeek" aria-label="Semaine précédente">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <div class="week-title-wrapper">
          <span class="week-badge-title">Semaine {{ weekNumber }}</span>
          <span class="week-date-span">{{ currentMonthYearString }}</span>
        </div>
        <button class="nav-arrow" @click="nextWeek" aria-label="Semaine suivante">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </div>
      <div class="action-group">
        <button class="today-btn" @click="resetToToday">Aujourd'hui</button>
        <button class="add-event-btn" @click="isModalOpen = true">
          <span class="plus-icon">+</span> Ajouter
        </button>
      </div>
    </div>

    <!-- Timetable Main Card -->
    <div class="timetable-card">
      <!-- Day Tabs Navigation (Mobile and Tablet focus, but nice reference) -->
      <div class="day-tabs">
        <button
          v-for="(day, idx) in weekDays"
          :key="idx"
          class="day-tab"
          :class="{
            'day-tab--active': selectedDayIndex === idx,
            'day-tab--today': day.isToday,
          }"
          @click="selectedDayIndex = idx"
        >
          <span class="day-tab-name">{{ day.shortName }}</span>
          <span class="day-tab-number">{{ day.dayOfMonth }}</span>
        </button>
      </div>

      <!-- Weekly View Grid (Desktop Grid / Desktop View) -->
      <div class="weekly-grid-desktop">
        <!-- Day Headers Row -->
        <div class="grid-header-row">
          <div class="time-header-spacer"></div>
          <div class="day-headers-container">
            <div
              v-for="(day, idx) in weekDays"
              :key="idx"
              class="grid-day-header"
              :class="{ 'grid-day-header--today': day.isToday }"
            >
              <span class="desktop-day-name">{{ day.name }}</span>
              <span class="desktop-day-number">{{ day.dayOfMonth }}</span>
            </div>
          </div>
        </div>

        <!-- Scrollable Grid Body -->
        <div class="grid-scroll-viewport" ref="gridViewport">
          <div class="weekly-timetable-grid">
            <!-- Time Axis Column -->
            <div class="time-axis">
              <div class="time-hour-slot" v-for="hour in 24" :key="hour">
                <span class="time-label">{{ formatHour(hour - 1) }}</span>
              </div>
            </div>

            <!-- 7 Columns Grid -->
            <div class="grid-columns-container">
              <div
                v-for="(day, idx) in weekDays"
                :key="idx"
                class="grid-day-column"
                :class="{ 'grid-day-column--today': day.isToday }"
              >
                <!-- Background grid lines -->
                <div class="grid-hour-lines">
                  <div class="grid-hour-line" v-for="hour in 24" :key="hour"></div>
                </div>

                <!-- Absolutely Positioned Events -->
                <div class="grid-events-layer">
                  <div
                    v-for="event in getPositionedEventsForDay(idx)"
                    :key="event.id"
                    class="event-block"
                    :style="[getCategoryStyle(event.category), event.positionStyle]"
                  >
                    <button
                      class="event-delete-btn"
                      @click="deleteEvent(event.id)"
                      title="Supprimer"
                    >
                      ✕
                    </button>
                    <div class="event-content">
                      <div class="event-header">
                        <span class="event-icon">{{ getCategoryIcon(event.category) }}</span>
                        <span class="event-time">{{ event.time }}</span>
                      </div>
                      <h4 class="event-title">{{ event.title }}</h4>
                      <span class="event-category-tag" v-if="event.category">
                        {{ getCategoryName(event.category) }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Active Day View (Mobile View) -->
      <div class="mobile-day-content">
        <h3 class="mobile-day-title">
          {{ weekDays[selectedDayIndex].name }}
          <span class="mobile-day-number-highlight">{{
            weekDays[selectedDayIndex].dayOfMonth
          }}</span>
        </h3>

        <!-- Scrollable Hourly Grid Body (Mobile Layout) -->
        <div
          v-if="getEventsForDay(selectedDayIndex).length > 0"
          class="grid-scroll-viewport grid-scroll-viewport--mobile"
          ref="mobileGridViewport"
        >
          <div class="weekly-timetable-grid">
            <!-- Time Axis Column -->
            <div class="time-axis">
              <div class="time-hour-slot" v-for="hour in 24" :key="hour">
                <span class="time-label">{{ formatHour(hour - 1) }}</span>
              </div>
            </div>

            <!-- Single Column Grid for Mobile -->
            <div class="grid-columns-container">
              <div
                class="grid-day-column"
                :class="{ 'grid-day-column--today': weekDays[selectedDayIndex].isToday }"
              >
                <!-- Background grid lines -->
                <div class="grid-hour-lines">
                  <div class="grid-hour-line" v-for="hour in 24" :key="hour"></div>
                </div>

                <!-- Absolutely Positioned Events -->
                <div class="grid-events-layer">
                  <div
                    v-for="event in getPositionedEventsForDay(selectedDayIndex)"
                    :key="event.id"
                    class="event-block event-block--mobile"
                    :style="[getCategoryStyle(event.category), event.positionStyle]"
                  >
                    <button
                      class="event-delete-btn"
                      @click="deleteEvent(event.id)"
                      title="Supprimer"
                    >
                      ✕
                    </button>
                    <div class="event-content">
                      <div class="event-header">
                        <span class="event-icon">{{ getCategoryIcon(event.category) }}</span>
                        <span class="event-time">{{ event.time }}</span>
                      </div>
                      <h4 class="event-title">{{ event.title }}</h4>
                      <span class="event-category-tag" v-if="event.category">
                        {{ getCategoryName(event.category) }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="getEventsForDay(selectedDayIndex).length === 0" class="mobile-empty-state">
          <div class="mobile-empty-illustration">🌿</div>
          <p class="mobile-empty-text">Aucun événement planifié pour cette journée.</p>
          <button
            class="mobile-empty-add-btn"
            @click="
              newEventDay = selectedDayIndex;
              isModalOpen = true;
            "
          >
            Ajouter un bloc
          </button>
        </div>
      </div>
    </div>

    <!-- Quick Add Event Modal -->
    <div class="modal-overlay" v-if="isModalOpen" @click.self="isModalOpen = false">
      <div class="modal-card">
        <div class="modal-header">
          <h3>Nouvelle activité</h3>
          <button class="modal-close" @click="isModalOpen = false">✕</button>
        </div>

        <form class="modal-form" @submit.prevent="handleAddEvent">
          <div class="form-group">
            <label for="event-title">Titre de l'activité</label>
            <input
              v-model="newEventTitle"
              type="text"
              id="event-title"
              placeholder="Ex: Projet BetterMe, Cardio, etc."
              required
              autofocus
            />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="event-day">Jour</label>
              <select v-model="newEventDay" id="event-day">
                <option v-for="(day, idx) in weekDays" :key="idx" :value="idx">
                  {{ day.name }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label for="event-time">Créneau horaire</label>
              <input
                v-model="newEventTime"
                type="text"
                id="event-time"
                placeholder="Ex: 14:00 - 15:30"
                required
              />
            </div>
          </div>

          <div class="form-group">
            <label for="event-category">Catégorie</label>

            <!-- Dynamic interactive pills for existing categories -->
            <div class="category-selectors" v-if="userCategories.length > 0">
              <button
                v-for="cat in userCategories"
                :key="cat.id"
                type="button"
                class="category-pill-btn"
                :style="getPillStyle(cat)"
                @click="newEventCategory = cat.name"
              >
                <span class="category-pill-icon">{{ cat.icon }}</span>
                {{ cat.name }}
              </button>
            </div>

            <input
              v-model="newEventCategory"
              type="text"
              id="event-category"
              placeholder="Ou saissisez une autre catégorie..."
              required
            />
            <span class="category-tip">
              💡 Astuce : Choisis une catégorie ci-dessus ou saisis-en une nouvelle pour la créer
              automatiquement !
            </span>
          </div>

          <button type="submit" class="modal-submit-btn">Ajouter à mon planning</button>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timetable-wrapper {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 2rem;
  background-color: #f9f6fd;
  min-height: 100vh;
  overflow: hidden;
}

@media (prefers-color-scheme: dark) {
  .timetable-wrapper {
    background-color: #1a1724;
  }
}

/* ─── Decorative Blob ─── */
.bg-blob {
  position: absolute;
  bottom: -150px;
  right: -150px;
  width: 500px;
  height: 500px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(149, 209, 170, 0.22) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}

/* ─── Page Header ─── */
.page-header {
  margin-bottom: 2rem;
  position: relative;
  z-index: 1;
}

.page-badge {
  display: inline-block;
  background: linear-gradient(135deg, rgba(213, 181, 234, 0.25), rgba(114, 160, 152, 0.25));
  color: #ad81be;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  padding: 0.35rem 1rem;
  border-radius: 20px;
  margin-bottom: 0.75rem;
  border: 1px solid rgba(213, 181, 234, 0.4);
}

.page-title {
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
  margin-bottom: 0.4rem;
  letter-spacing: -0.5px;
}

@media (prefers-color-scheme: dark) {
  .page-title {
    color: #f0e8f8;
  }
}

.page-subtitle {
  font-size: 1rem;
  color: #6c757d;
  max-width: 500px;
  line-height: 1.5;
}

@media (prefers-color-scheme: dark) {
  .page-subtitle {
    color: #adb5bd;
  }
}

/* ─── Navigation Controls ─── */
.calendar-controls {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.navigation-group {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  padding: 0.5rem 1rem;
  border-radius: 16px;
  border: 1px solid rgba(213, 181, 234, 0.3);
  box-shadow: 0 4px 12px rgba(173, 129, 190, 0.05);
  flex: 1; /* Stretch on desktop */
  justify-content: space-between;
}

@media (prefers-color-scheme: dark) {
  .navigation-group {
    background: rgba(30, 26, 40, 0.75);
    border: 1px solid rgba(213, 181, 234, 0.15);
  }
}

.nav-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: #ad81be;
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-arrow svg {
  width: 18px;
  height: 18px;
}

.nav-arrow:hover {
  background: rgba(213, 181, 234, 0.15);
  color: #d5b5ea;
}

.week-title-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 160px;
  flex: 1;
  text-align: center;
}

.week-badge-title {
  font-size: 1.1rem;
  font-weight: 800;
  color: #ad81be;
}

.week-date-span {
  font-size: 0.8rem;
  color: #72a098;
  font-weight: 600;
  text-transform: capitalize;
}

.action-group {
  display: flex;
  gap: 0.75rem;
}

.today-btn {
  padding: 0.6rem 1.2rem;
  border: 1px solid rgba(149, 209, 170, 0.5);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.8);
  color: #72a098;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

@media (prefers-color-scheme: dark) {
  .today-btn {
    background: rgba(30, 26, 40, 0.8);
    border: 1px solid rgba(149, 209, 170, 0.25);
  }
}

.today-btn:hover {
  background: rgba(149, 209, 170, 0.15);
  transform: translateY(-1px);
}

.add-event-btn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.6rem 1.4rem;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 15px rgba(213, 181, 234, 0.35);
}

.add-event-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(213, 181, 234, 0.5);
}

.plus-icon {
  font-size: 1.1rem;
  font-weight: 800;
}

/* ─── Timetable Main Card ─── */
.timetable-card {
  position: relative;
  z-index: 1;
  flex: 1;
  width: 100%;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 24px;
  border: 1px solid rgba(213, 181, 234, 0.3);
  box-shadow: 0 10px 30px rgba(173, 129, 190, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 1.5rem;
}

@media (prefers-color-scheme: dark) {
  .timetable-card {
    background: rgba(25, 20, 35, 0.85);
    border: 1px solid rgba(213, 181, 234, 0.15);
  }
}

/* ─── Day Tabs ─── */
.day-tabs {
  display: none;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  background: rgba(213, 181, 234, 0.08);
  padding: 0.4rem;
  border-radius: 18px;
  border: 1px solid rgba(213, 181, 234, 0.15);
}

.day-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.65rem 0.5rem;
  border-radius: 14px;
  border: none;
  background: transparent;
  color: #6c757d;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

@media (prefers-color-scheme: dark) {
  .day-tab {
    color: #adb5bd;
  }
}

.day-tab-name {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.day-tab-number {
  font-size: 1.1rem;
  font-weight: 800;
}

.day-tab:hover {
  background: rgba(213, 181, 234, 0.15);
  color: #ad81be;
}

.day-tab--active {
  background: linear-gradient(135deg, #d5b5ea, #ad81be) !important;
  color: white !important;
  box-shadow: 0 4px 15px rgba(213, 181, 234, 0.35);
  transform: translateY(-2px);
}

.day-tab--today:not(.day-tab--active) {
  border: 1.5px solid rgba(149, 209, 170, 0.6);
  color: #95d1aa;
}

/* ─── Desktop Weekly Grid (Hourly Layout) ─── */
.weekly-grid-desktop {
  display: flex;
  flex-direction: column;
  flex: 1;
  background: rgba(255, 255, 255, 0.45);
  border-radius: 20px;
  border: 1px solid rgba(213, 181, 234, 0.2);
  overflow: hidden;
}

@media (prefers-color-scheme: dark) {
  .weekly-grid-desktop {
    background: rgba(25, 20, 35, 0.4);
    border-color: rgba(213, 181, 234, 0.1);
  }
}

.grid-header-row {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.8);
  border-bottom: 1px solid rgba(213, 181, 234, 0.2);
  padding: 0.75rem 0;
  z-index: 10;
}

@media (prefers-color-scheme: dark) {
  .grid-header-row {
    background: rgba(30, 26, 40, 0.9);
    border-bottom-color: rgba(213, 181, 234, 0.1);
  }
}

.time-header-spacer {
  width: 60px;
  flex-shrink: 0;
}

.day-headers-container {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.75rem;
  padding-right: 8px; /* account for scrollbar width alignment */
}

.grid-day-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.1rem;
}

.desktop-day-name {
  font-size: 0.72rem;
  font-weight: 700;
  color: #72a098;
  text-transform: uppercase;
}

.desktop-day-number {
  font-size: 1.25rem;
  font-weight: 800;
  color: #ad81be;
}

.grid-day-header--today .desktop-day-number {
  color: #95d1aa;
}

/* Scrollable Viewport */
.grid-scroll-viewport {
  max-height: 520px;
  overflow-y: auto;
  position: relative;
  scroll-behavior: smooth;
}

/* Premium Rounded Scrollbar styling */
.grid-scroll-viewport::-webkit-scrollbar {
  width: 8px;
}

.grid-scroll-viewport::-webkit-scrollbar-track {
  background: transparent;
}

.grid-scroll-viewport::-webkit-scrollbar-thumb {
  background: rgba(213, 181, 234, 0.3);
  border-radius: 4px;
}

.grid-scroll-viewport::-webkit-scrollbar-thumb:hover {
  background: rgba(213, 181, 234, 0.5);
}

.weekly-timetable-grid {
  display: flex;
  position: relative;
  width: 100%;
  height: 1560px; /* 24 hours * 65px */
}

.time-axis {
  width: 60px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(213, 181, 234, 0.15);
  background: transparent;
}

.time-hour-slot {
  height: 65px;
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding-right: 0.6rem;
  box-sizing: border-box;
}

.time-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: #72a098;
  transform: translateY(-7px);
}

.grid-columns-container {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.75rem;
  position: relative;
  height: 100%;
}

.grid-day-column {
  position: relative;
  height: 100%;
  border-right: 1px solid rgba(213, 181, 234, 0.08);
}

.grid-day-column:last-child {
  border-right: none;
}

.grid-day-column--today {
  background: rgba(149, 209, 170, 0.03);
}

.grid-hour-lines {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.grid-hour-line {
  height: 65px;
  border-bottom: 1px dashed rgba(213, 181, 234, 0.08);
  box-sizing: border-box;
}

.grid-events-layer {
  position: absolute;
  inset: 0;
  height: 100%;
}

/* ─── Event Blocks ─── */
.event-block {
  position: absolute;
  box-sizing: border-box;
  border-radius: 12px;
  padding: 0.45rem 0.55rem;
  transition:
    transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.25s ease,
    z-index 0.1s ease;
  cursor: default;
  z-index: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.event-block:hover {
  width: max-content !important;
  min-width: 100% !important;
  max-width: 280px;
  padding-right: 1.6rem !important;
  z-index: 50;
  overflow: visible;
  transform: translateY(-2px) scale(1.05);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.16);
  background: #ffffff !important;
  border: 1px solid var(--event-color-solid) !important;
  border-left: 4px solid var(--event-color-solid) !important;
}

@media (prefers-color-scheme: dark) {
  .event-block:hover {
    background: #1c1825 !important;
  }
}

.grid-day-column:nth-child(n + 6) .event-block:hover {
  transform: translate(-110px, -2px) scale(1.05);
}

.event-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

.event-delete-btn {
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
  background: transparent;
  border: none;
  color: inherit;
  font-size: 0.7rem;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.event-block:hover .event-delete-btn {
  opacity: 0.65;
}

.event-block:hover .event-delete-btn:hover {
  opacity: 1;
}

.event-header {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.25rem;
}

.event-icon {
  font-size: 0.9rem;
}

.event-time {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: -0.1px;
  white-space: nowrap;
}

.event-title {
  font-size: 0.76rem;
  font-weight: 700;
  line-height: 1.25;
  margin-top: 0.15rem;
  word-break: break-word;
}

.event-category-tag {
  font-size: 0.62rem;
  font-weight: 700;
  opacity: 0.75;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-top: 0.25rem;
  display: block;
}

.event-category-tag-mobile {
  font-size: 0.68rem;
  font-weight: 700;
  opacity: 0.75;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-top: 0.2rem;
  display: block;
}

.empty-col-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(173, 129, 190, 0.25);
  font-weight: 800;
}

/* ─── Mobile View Layout ─── */
.mobile-day-content {
  display: none;
  flex-direction: column;
  gap: 1rem;
}

.mobile-day-title {
  font-size: 1.2rem;
  font-weight: 800;
  color: #2c3e50;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1.5px solid rgba(213, 181, 234, 0.2);
}

@media (prefers-color-scheme: dark) {
  .mobile-day-title {
    color: #f0e8f8;
  }
}

.mobile-day-number-highlight {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(213, 181, 234, 0.25);
  color: #ad81be;
  padding: 0.15rem 0.6rem;
  border-radius: 8px;
  font-size: 0.95rem;
}

/* Mobile Scrollable Viewport overrides */
.grid-scroll-viewport--mobile {
  max-height: 480px;
  overflow-y: auto;
  position: relative;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.45);
  border: 1px solid rgba(213, 181, 234, 0.2);
  margin-top: 0.5rem;
}

@media (prefers-color-scheme: dark) {
  .grid-scroll-viewport--mobile {
    background: rgba(25, 20, 35, 0.4);
    border-color: rgba(213, 181, 234, 0.1);
  }
}

.grid-scroll-viewport--mobile .grid-columns-container {
  grid-template-columns: 1fr !important;
}

.event-block--mobile:hover {
  transform: translateY(-2px) scale(1.02) !important;
  max-width: 90% !important;
  min-width: 100% !important;
  width: max-content !important;
}

.mobile-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  text-align: center;
  background: rgba(213, 181, 234, 0.05);
  border-radius: 20px;
  border: 1.5px dashed rgba(213, 181, 234, 0.25);
}

.mobile-empty-illustration {
  font-size: 2.5rem;
  margin-bottom: 0.75rem;
}

.mobile-empty-text {
  font-size: 0.9rem;
  color: #6c757d;
  margin-bottom: 1.25rem;
  max-width: 250px;
}

@media (prefers-color-scheme: dark) {
  .mobile-empty-text {
    color: #adb5bd;
  }
}

.mobile-empty-add-btn {
  padding: 0.5rem 1.25rem;
  border: 1px solid #d5b5ea;
  background: transparent;
  color: #ad81be;
  font-weight: 700;
  font-size: 0.85rem;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mobile-empty-add-btn:hover {
  background: #d5b5ea;
  color: white;
}

/* ─── Modal styling ─── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  animation: fadeIn 0.25s ease;
}

.modal-card {
  width: 100%;
  max-width: 460px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(16px);
  border-radius: 24px;
  border: 1px solid rgba(213, 181, 234, 0.4);
  box-shadow: 0 20px 50px rgba(173, 129, 190, 0.25);
  padding: 2rem;
  animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@media (prefers-color-scheme: dark) {
  .modal-card {
    background: rgba(25, 20, 35, 0.95);
    border-color: rgba(213, 181, 234, 0.2);
  }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
}

.modal-header h3 {
  font-size: 1.25rem;
  font-weight: 800;
  color: #2c3e50;
}

@media (prefers-color-scheme: dark) {
  .modal-header h3 {
    color: #f0e8f8;
  }
}

.modal-close {
  background: transparent;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: #6c757d;
  transition: color 0.2s ease;
}

.modal-close:hover {
  color: #ad81be;
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.form-row {
  display: flex;
  gap: 1rem;
}

.form-row .form-group {
  flex: 1;
}

.form-group label {
  font-size: 0.85rem;
  font-weight: 700;
  color: #72a098;
}

.form-group input,
.form-group select {
  padding: 0.75rem 1rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.4);
  background: white;
  font-size: 0.95rem;
  color: #2c3e50;
  transition: all 0.2s ease;
}

@media (prefers-color-scheme: dark) {
  .form-group input,
  .form-group select {
    background: rgba(0, 0, 0, 0.3);
    border-color: rgba(213, 181, 234, 0.2);
    color: #f0e8f8;
  }
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #d5b5ea;
  box-shadow: 0 0 0 3px rgba(213, 181, 234, 0.3);
}

.category-selectors {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  margin-bottom: 0.4rem;
}

.category-pill-btn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.95rem;
  border-radius: 12px;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.category-pill-btn:hover {
  transform: translateY(-2px);
  filter: brightness(1.08);
}

.category-pill-btn:active {
  transform: translateY(0);
}

.category-pill-icon {
  font-size: 0.95rem;
}

.modal-submit-btn {
  margin-top: 0.5rem;
  padding: 0.9rem;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.modal-submit-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 15px rgba(213, 181, 234, 0.35);
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/* ─── Responsive adaptations ─── */
@media (max-width: 1024px) {
  .weekly-grid-desktop {
    display: none !important;
  }

  .mobile-day-content {
    display: flex !important;
  }

  .day-tabs {
    display: flex !important;
  }
}

@media (max-width: 768px) {
  .timetable-wrapper {
    padding: 1rem;
  }

  /* Full-width stacked controls for mobile screens */
  .calendar-controls {
    flex-direction: column;
    align-items: stretch;
    gap: 0.85rem;
    width: 100%;
  }

  .navigation-group {
    width: 100%;
    flex: none;
    display: flex;
    justify-content: space-between;
    box-sizing: border-box;
    padding: 0.6rem 1rem;
  }

  .action-group {
    width: 100%;
    display: flex;
    gap: 0.75rem;
  }

  .today-btn,
  .add-event-btn {
    flex: 1;
    text-align: center;
    justify-content: center;
    font-size: 0.9rem;
    padding: 0.75rem 1rem;
  }

  /* Compact day tabs to fit perfectly on small screens */
  .day-tab {
    padding: 0.5rem 0.3rem;
  }

  .day-tab-name {
    font-size: 0.6rem;
  }

  .day-tab-number {
    font-size: 0.9rem;
  }

  /* Ensure text wraps correctly and never clips */
  .page-subtitle {
    font-size: 0.9rem;
    white-space: normal;
    word-break: break-word;
  }

  .event-card-mobile-title {
    white-space: normal;
    word-break: break-word;
    font-size: 0.9rem;
    line-height: 1.3;
  }
}

.category-tip {
  display: block;
  font-size: 0.78rem;
  color: #72a098;
  margin-top: 0.45rem;
  font-style: italic;
  font-weight: 500;
  letter-spacing: 0.01em;
}
</style>
