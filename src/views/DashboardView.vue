<!-- eslint-disable no-useless-assignment -->
<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '../lib/supabase.js'
import { useRouter } from 'vue-router'

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
    <div class="dashboard-content">
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
        <!-- Currently empty as requested -->
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

/* ─── Dashboard Columns ─── */
.dashboard-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  width: 100%;
  max-width: 1000px;
  position: relative;
  z-index: 1;
  flex: 1;
}

@media (max-width: 768px) {
  .dashboard-content {
    grid-template-columns: 1fr;
  }
}

.dashboard-column {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.column-title {
  font-size: 1.4rem;
  font-weight: 800;
  color: #2c3e50;
  display: flex;
  align-items: center;
  justify-content: space-between;
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
</style>
