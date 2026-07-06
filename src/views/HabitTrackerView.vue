<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../lib/supabase.js'
import { getLocalTodayISO } from '../services/scheduledReminders.js'
import { createHabit, updateHabit, deleteHabits, archiveHabits, unarchiveHabits, listHabits, listArchivedHabits, countArchivedHabits } from '../services/habits.js'
import EmojiPickerField from '../components/EmojiPickerField.vue'
import ColorPickerField from '../components/ColorPickerField.vue'
import HabitTrackerGrid from '../components/HabitTrackerGrid.vue'
import HabitDayEntryPanel from '../components/HabitDayEntryPanel.vue'
import HabitManageList from '../components/HabitManageList.vue'
import { useHorizontalCarousel } from '../composables/useHorizontalCarousel.js'
import {
  HABIT_ALL_WEEKDAY_IDS,
  HABIT_FREQUENCY,
  HABIT_FREQUENCY_OPTIONS,
  HABIT_MONTH_DAYS,
  HABIT_VALUE_TYPE,
  HABIT_VALUE_TYPE_OPTIONS,
  HABIT_WEEKDAYS,
} from '../constants/habitOptions.js'
import { APP_PAGE_IDS } from '../constants/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'

const { pageTitle } = usePageDisplayLabel(APP_PAGE_IDS.HABIT, undefined, { setDocumentTitle: true })

const router = useRouter()

const userId = ref(null)
const habits = ref([])
const archivedHabits = ref([])
const archivedCount = ref(0)
const activeHabitId = ref(null)
const showForm = ref(false)
const editingHabitId = ref(null)
/** @type {import('vue').Ref<null|'active'|'archived'>} */
const manageView = ref(null)
const selectedManageIds = ref([])
const isManageBusy = ref(false)
const confirmDialog = ref(null)
const isLoading = ref(false)
const isSaving = ref(false)
const loadError = ref('')
const formError = ref('')
const saveMessage = ref('')
const trackerRefreshKey = ref(0)
const gridFocusDate = ref(null)

function onTrackerLogSaved(date) {
  trackerRefreshKey.value += 1
  gridFocusDate.value = date ?? null
}

const MOBILE_MEDIA = '(max-width: 768px)'
let mobileMediaQuery = null

const {
  activePage,
  carouselViewport,
  carouselTrack,
  isMobileCarousel,
  lastSlideIndex,
  slideCount,
  goToSlide,
  onCarouselScroll,
  setupCarouselObserver,
  updateCarouselLayout,
} = useHorizontalCarousel({ columnSelector: '.habits-column' })

async function setupHabitsCarousel() {
  await nextTick()
  setupCarouselObserver()
  requestAnimationFrame(() => {
    updateCarouselLayout()
    if (carouselViewport.value) {
      carouselViewport.value.scrollLeft = 0
      activePage.value = 0
    }
    requestAnimationFrame(() => {
      updateCarouselLayout()
      if (carouselViewport.value) {
        carouselViewport.value.scrollLeft = 0
        activePage.value = 0
      }
    })
  })
}

function createEmptyForm() {
  return {
    nom: '',
    description: '',
    icone: null,
    couleur: '#ad81be',
    type_valeur: HABIT_VALUE_TYPE.FLOAT,
    unite: '',
    frequence: HABIT_FREQUENCY.DAILY,
    jours_actifs: [...HABIT_ALL_WEEKDAY_IDS],
    date_debut: getLocalTodayISO(),
  }
}

const habitForm = ref(createEmptyForm())

const showUnitField = computed(() => habitForm.value.type_valeur !== HABIT_VALUE_TYPE.BOOLEAN)

const isWeekly = computed(() => habitForm.value.frequence === HABIT_FREQUENCY.WEEKLY)
const isMonthly = computed(() => habitForm.value.frequence === HABIT_FREQUENCY.MONTHLY)
const isDaily = computed(() => habitForm.value.frequence === HABIT_FREQUENCY.DAILY)

const activeHabit = computed(
  () => habits.value.find((h) => h.id === activeHabitId.value) ?? null,
)

const formTitle = computed(() =>
  editingHabitId.value ? 'Modifier l’habitude' : 'Nouvelle habitude',
)

const confirmDialogTitle = computed(() => {
  if (!confirmDialog.value) return ''
  if (confirmDialog.value.type === 'delete') {
    return confirmDialog.value.count > 1
      ? `Supprimer ${confirmDialog.value.count} habitudes ?`
      : 'Supprimer cette habitude ?'
  }
  if (confirmDialog.value.type === 'archive') {
    return confirmDialog.value.count > 1
      ? `Archiver ${confirmDialog.value.count} habitudes ?`
      : 'Archiver cette habitude ?'
  }
  return confirmDialog.value.count > 1
    ? `Désarchiver ${confirmDialog.value.count} habitudes ?`
    : 'Désarchiver cette habitude ?'
})

const confirmDialogMessage = computed(() => {
  if (!confirmDialog.value) return ''
  const name = confirmDialog.value.habitName
  if (confirmDialog.value.type === 'delete') {
    if (name) {
      return `« ${name} » sera supprimée définitivement, ainsi que tout son historique. Cette action est irréversible.`
    }
    return 'Ces habitudes seront supprimées définitivement, avec tout leur historique. Cette action est irréversible.'
  }
  if (confirmDialog.value.type === 'archive') {
    if (name) {
      return `« ${name} » sera mise en pause : elle disparaît du suivi mais conserve toutes ses données. Tu pourras la désarchiver plus tard.`
    }
    return 'Ces habitudes seront mises en pause : elles disparaissent du suivi mais conservent toutes leurs données.'
  }
  if (name) {
    return `« ${name} » redeviendra active dans le suivi, avec toutes les données enregistrées avant l’archivage.`
  }
  return 'Ces habitudes redeviendront actives dans le suivi, avec toutes leurs données conservées.'
})

watch(
  habits,
  (list) => {
    if (list.length === 0) {
      activeHabitId.value = null
      return
    }
    if (!list.some((h) => h.id === activeHabitId.value)) {
      activeHabitId.value = list[0].id
    }
  },
  { immediate: true },
)

watch(activeHabitId, () => {
  void setupHabitsCarousel()
})

watch(
  () => [habits.value.length, showForm.value],
  ([count, formOpen]) => {
    if (count > 0 && !formOpen) void setupHabitsCarousel()
  },
)

watch(
  () => habitForm.value.frequence,
  (frequence) => {
    if (frequence === HABIT_FREQUENCY.DAILY) {
      habitForm.value.jours_actifs = [...HABIT_ALL_WEEKDAY_IDS]
    } else {
      habitForm.value.jours_actifs = []
    }
  },
)

function toggleWeekday(dayId) {
  const current = new Set(habitForm.value.jours_actifs)
  if (current.has(dayId)) current.delete(dayId)
  else current.add(dayId)
  habitForm.value.jours_actifs = [...current].sort((a, b) => a - b)
}

function toggleMonthDay(day) {
  const current = new Set(habitForm.value.jours_actifs)
  if (current.has(day)) current.delete(day)
  else current.add(day)
  habitForm.value.jours_actifs = [...current].sort((a, b) => a - b)
}

function isDayActive(dayId) {
  return habitForm.value.jours_actifs.includes(dayId)
}

function habitToForm(habit) {
  return {
    nom: habit.nom ?? '',
    description: habit.description ?? '',
    icone: habit.icone ?? null,
    couleur: habit.couleur ?? '#ad81be',
    type_valeur: habit.type_valeur,
    unite: habit.unite ?? '',
    frequence: habit.frequence,
    jours_actifs: Array.isArray(habit.jours_actifs) ? [...habit.jours_actifs] : [],
    date_debut: habit.date_debut,
  }
}

function openForm() {
  editingHabitId.value = null
  habitForm.value = createEmptyForm()
  formError.value = ''
  saveMessage.value = ''
  manageView.value = null
  showForm.value = true
}

function openEditForm(habit) {
  editingHabitId.value = habit.id
  habitForm.value = habitToForm(habit)
  formError.value = ''
  saveMessage.value = ''
  manageView.value = null
  showForm.value = true
}

function closeForm() {
  showForm.value = false
  editingHabitId.value = null
  formError.value = ''
  habitForm.value = createEmptyForm()
}

function openManagePanel() {
  manageView.value = 'active'
  selectedManageIds.value = []
  showForm.value = false
}

async function openArchivedPanel() {
  manageView.value = 'archived'
  selectedManageIds.value = []
  showForm.value = false
  await loadArchivedHabitsList()
}

function closeManagePanel() {
  manageView.value = null
  selectedManageIds.value = []
}

function openConfirmDialog(type, items) {
  const list = Array.isArray(items) ? items : [items]
  const habitIds = list.map((h) => h.id).filter(Boolean)
  if (!habitIds.length) return
  confirmDialog.value = {
    type,
    habitIds,
    habitName: list.length === 1 ? list[0].nom : null,
    count: habitIds.length,
  }
}

function closeConfirmDialog() {
  if (isManageBusy.value) return
  confirmDialog.value = null
}

async function loadArchivedCount() {
  if (!userId.value) return
  try {
    archivedCount.value = await countArchivedHabits(supabase, userId.value)
  } catch (err) {
    console.error(err)
    archivedCount.value = 0
  }
}

async function loadArchivedHabitsList() {
  if (!userId.value) return
  isManageBusy.value = true
  try {
    archivedHabits.value = await listArchivedHabits(supabase, userId.value)
    archivedCount.value = archivedHabits.value.length
  } catch (err) {
    console.error(err)
    archivedHabits.value = []
  } finally {
    isManageBusy.value = false
  }
}

async function loadHabits() {
  if (!userId.value) return
  isLoading.value = true
  loadError.value = ''
  try {
    habits.value = await listHabits(supabase, userId.value)
    await loadArchivedCount()
  } catch (err) {
    console.error(err)
    const msg = err.message || ''
    loadError.value = msg.includes('habits')
      ? 'Table habits introuvable. Exécute scripts/create-habits-table.sql dans Supabase.'
      : msg || 'Impossible de charger les habitudes.'
  } finally {
    isLoading.value = false
  }
}

async function onConfirmDialogAction() {
  const dialog = confirmDialog.value
  if (!dialog || !userId.value) return

  isManageBusy.value = true
  try {
    if (dialog.type === 'delete') {
      await deleteHabits(supabase, userId.value, dialog.habitIds)
      saveMessage.value =
        dialog.count > 1 ? 'Habitudes supprimées.' : 'Habitude supprimée.'
    } else if (dialog.type === 'archive') {
      await archiveHabits(supabase, userId.value, dialog.habitIds)
      saveMessage.value =
        dialog.count > 1 ? 'Habitudes archivées.' : 'Habitude archivée.'
    } else if (dialog.type === 'unarchive') {
      await unarchiveHabits(supabase, userId.value, dialog.habitIds)
      saveMessage.value =
        dialog.count > 1 ? 'Habitudes désarchivées.' : 'Habitude désarchivée.'
    }

    confirmDialog.value = null
    selectedManageIds.value = []
    await loadHabits()

    if (manageView.value === 'archived') {
      await loadArchivedHabitsList()
      if (!archivedHabits.value.length) manageView.value = null
    }

    setTimeout(() => {
      saveMessage.value = ''
    }, 2500)
  } catch (err) {
    console.error(err)
    formError.value = err.message || 'Impossible d’appliquer cette action.'
  } finally {
    isManageBusy.value = false
  }
}

async function onSaveHabit() {
  if (!userId.value) return
  isSaving.value = true
  formError.value = ''
  saveMessage.value = ''
  try {
    if (editingHabitId.value) {
      await updateHabit(supabase, userId.value, editingHabitId.value, habitForm.value)
      saveMessage.value = 'Habitude mise à jour.'
    } else {
      const created = await createHabit(supabase, userId.value, habitForm.value)
      activeHabitId.value = created.id
      saveMessage.value = 'Habitude enregistrée.'
    }
    await loadHabits()
    if (editingHabitId.value) {
      activeHabitId.value = editingHabitId.value
    }
    showForm.value = false
    editingHabitId.value = null
    habitForm.value = createEmptyForm()
    setTimeout(() => {
      saveMessage.value = ''
    }, 2500)
  } catch (err) {
    console.error(err)
    formError.value = err.message || 'Impossible d’enregistrer l’habitude.'
  } finally {
    isSaving.value = false
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
  userId.value = user.id
  await loadHabits()
  mobileMediaQuery = window.matchMedia(MOBILE_MEDIA)
  mobileMediaQuery.addEventListener('change', updateCarouselLayout)
  window.addEventListener('resize', updateCarouselLayout)
  await setupHabitsCarousel()
})

onUnmounted(() => {
  mobileMediaQuery?.removeEventListener('change', updateCarouselLayout)
  window.removeEventListener('resize', updateCarouselLayout)
})
</script>

<template>
  <div class="habits-page">
    <header class="habits-page__header">
      <h1 class="habits-page__title">{{ pageTitle }}</h1>
      <p class="habits-page__subtitle">Suis tes habitudes au quotidien.</p>

      <template v-if="!showForm && !manageView">
        <div class="habits-page__toolbar">
          <button type="button" class="btn btn--primary" @click="openForm">
            Ajouter une habitude
          </button>
          <button
            type="button"
            class="btn btn--secondary"
            :disabled="isLoading || isManageBusy"
            @click="openManagePanel"
          >
            Modifier mes habitudes
          </button>
        </div>

        <button
          v-if="archivedCount > 0"
          type="button"
          class="habits-archived-link"
          :disabled="isManageBusy"
          @click="openArchivedPanel"
        >
          Voir les habitudes archivées ({{ archivedCount }})
        </button>

        <p v-if="saveMessage" class="habits-feedback habits-feedback--ok">{{ saveMessage }}</p>

        <nav
          v-if="!isLoading && !loadError && habits.length > 0"
          class="habits-tabs"
          role="tablist"
          aria-label="Habitudes"
        >
          <button
            v-for="habit in habits"
            :key="habit.id"
            type="button"
            role="tab"
            class="habits-tab"
            :class="{ 'habits-tab--active': activeHabitId === habit.id }"
            :aria-selected="activeHabitId === habit.id"
            :aria-label="habit.nom"
            :style="{ '--habit-color': habit.couleur }"
            @click="activeHabitId = habit.id"
          >
            <span
              class="habits-tab__swatch"
              :class="{ 'habits-tab__swatch--no-icon': !habit.icone }"
              aria-hidden="true"
            >
              {{ habit.icone || '' }}
            </span>
            <span class="habits-tab__name">{{ habit.nom }}</span>
          </button>
        </nav>
      </template>
    </header>

    <section v-if="showForm" class="habits-card habits-form">
      <h2 class="habits-form__title">{{ formTitle }}</h2>

      <form class="habits-form__body" @submit.prevent="onSaveHabit">
        <fieldset class="habits-fieldset">
          <legend class="habits-fieldset__legend">Informations de base</legend>

          <label class="field field--full">
            <span>Nom</span>
            <input
              v-model="habitForm.nom"
              type="text"
              maxlength="80"
              required
              placeholder='Ex. Eau, Lecture, Sport'
            />
          </label>

          <label class="field field--full">
            <span>Description <em class="field__optional">(optionnel)</em></span>
            <input
              v-model="habitForm.description"
              type="text"
              maxlength="200"
              placeholder="Ex. Nombre de verres bus dans la journée"
            />
          </label>

          <div class="field field--full">
            <span>Icône <em class="field__optional">(optionnel)</em></span>
            <EmojiPickerField
              v-model="habitForm.icone"
              label="Choisir un emoji (optionnel)"
            />
          </div>

          <div class="field field--full">
            <span>Couleur</span>
            <ColorPickerField v-model="habitForm.couleur" />
          </div>
        </fieldset>

        <fieldset class="habits-fieldset">
          <legend class="habits-fieldset__legend">Mesure</legend>

          <label class="field field--full">
            <span>Type de valeur</span>
            <select v-model="habitForm.type_valeur" required class="habits-select">
              <option v-for="opt in HABIT_VALUE_TYPE_OPTIONS" :key="opt.id" :value="opt.id">
                {{ opt.label }}
              </option>
            </select>
          </label>

          <label v-if="showUnitField" class="field field--full">
            <span>Unité <em class="field__optional">(optionnel)</em></span>
            <input
              v-model="habitForm.unite"
              type="text"
              maxlength="40"
              placeholder="Ex. verres, pages, minutes, km, fois…"
            />
          </label>
        </fieldset>

        <fieldset class="habits-fieldset">
          <legend class="habits-fieldset__legend">Fréquence</legend>

          <label class="field field--full">
            <span>Fréquence</span>
            <select v-model="habitForm.frequence" required class="habits-select">
              <option v-for="opt in HABIT_FREQUENCY_OPTIONS" :key="opt.id" :value="opt.id">
                {{ opt.label }}
              </option>
            </select>
          </label>

          <p v-if="isDaily" class="habits-fieldset__hint">
            Tous les jours de la semaine sont sélectionnés automatiquement.
          </p>

          <div v-else-if="isWeekly" class="field field--full">
            <span>Jours actifs</span>
            <div class="habits-picker habits-picker--weekdays" role="group" aria-label="Jours de la semaine">
              <button
                v-for="day in HABIT_WEEKDAYS"
                :key="day.id"
                type="button"
                class="habits-picker__btn habits-picker__btn--day"
                :class="{ 'habits-picker__btn--on': isDayActive(day.id) }"
                :aria-pressed="isDayActive(day.id)"
                @click="toggleWeekday(day.id)"
              >
                {{ day.label }}
              </button>
            </div>
          </div>

          <div v-else-if="isMonthly" class="field field--full">
            <span>Jours du mois</span>
            <div class="habits-picker habits-picker--month" role="group" aria-label="Jours du mois">
              <button
                v-for="day in HABIT_MONTH_DAYS"
                :key="day"
                type="button"
                class="habits-picker__btn habits-picker__btn--month-day"
                :class="{ 'habits-picker__btn--on': isDayActive(day) }"
                :aria-pressed="isDayActive(day)"
                @click="toggleMonthDay(day)"
              >
                {{ day }}
              </button>
            </div>
          </div>
        </fieldset>

        <fieldset class="habits-fieldset">
          <legend class="habits-fieldset__legend">Période</legend>

          <label class="field field--full">
            <span>Date de début</span>
            <input v-model="habitForm.date_debut" type="date" required />
          </label>
        </fieldset>

        <p v-if="formError" class="habits-feedback habits-feedback--error">{{ formError }}</p>

        <div class="habits-actions habits-actions--form">
          <button type="button" class="btn btn--ghost" :disabled="isSaving" @click="closeForm">
            Annuler
          </button>
          <button type="submit" class="btn btn--primary" :disabled="isSaving">
            {{ isSaving ? 'Enregistrement…' : 'Enregistrer' }}
          </button>
        </div>
      </form>
    </section>

    <HabitManageList
      v-else-if="manageView === 'active'"
      :habits="habits"
      mode="active"
      :selected-ids="selectedManageIds"
      :is-busy="isManageBusy"
      @update:selected-ids="selectedManageIds = $event"
      @edit="openEditForm"
      @delete="openConfirmDialog('delete', $event)"
      @archive="openConfirmDialog('archive', $event)"
      @close="closeManagePanel"
    />

    <HabitManageList
      v-else-if="manageView === 'archived'"
      :habits="archivedHabits"
      mode="archived"
      :selected-ids="selectedManageIds"
      :is-busy="isManageBusy"
      @update:selected-ids="selectedManageIds = $event"
      @edit="openEditForm"
      @delete="openConfirmDialog('delete', $event)"
      @unarchive="openConfirmDialog('unarchive', $event)"
      @close="closeManagePanel"
    />

    <template v-else>
      <div v-if="isLoading" class="habits-loading">Chargement…</div>

      <p v-else-if="loadError" class="habits-feedback habits-feedback--error">{{ loadError }}</p>

      <section v-else-if="habits.length === 0" class="habits-card habits-card--empty">
        <p class="habits-empty">
          Aucune habitude pour l'instant. Ajoute ta première habitude avec le bouton ci-dessus.
        </p>
      </section>

      <div v-else-if="activeHabit" class="habits-carousel-wrapper">
        <button
          v-if="isMobileCarousel && activePage > 0"
          type="button"
          class="habits-carousel-arrow habits-carousel-arrow--prev"
          aria-label="Colonne précédente"
          @click="goToSlide(activePage - 1)"
        >
          ‹
        </button>
        <button
          v-if="isMobileCarousel && activePage < lastSlideIndex"
          type="button"
          class="habits-carousel-arrow habits-carousel-arrow--next"
          aria-label="Colonne suivante"
          @click="goToSlide(activePage + 1)"
        >
          ›
        </button>

        <div
          ref="carouselViewport"
          class="habits-carousel-content"
          @scroll.passive="onCarouselScroll"
        >
          <div ref="carouselTrack" class="habits-carousel-track">
            <div class="habits-column habits-column--tracker">
              <h2 class="habits-column__title">
                <span>Suivi</span>
              </h2>
              <div class="habits-column__card">
                <HabitTrackerGrid
                  :key="activeHabit.id"
                  :habit="activeHabit"
                  :user-id="userId"
                  :refresh-key="trackerRefreshKey"
                  :focus-date="gridFocusDate"
                />
              </div>
            </div>

            <div class="habits-column habits-column--entry">
              <h2 class="habits-column__title">
                <span>Aujourd'hui</span>
              </h2>
              <div class="habits-column__card">
                <HabitDayEntryPanel
                  :key="activeHabit.id"
                  :habit="activeHabit"
                  :user-id="userId"
                  :refresh-key="trackerRefreshKey"
                  @saved="onTrackerLogSaved"
                />
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="isMobileCarousel && slideCount > 1"
          class="habits-carousel-indicators"
          role="tablist"
          aria-label="Navigation entre les colonnes"
        >
          <button
            v-for="index in slideCount"
            :key="index"
            type="button"
            role="tab"
            class="habits-carousel-dot"
            :class="{ 'habits-carousel-dot--active': activePage === index - 1 }"
            :aria-label="`Colonne ${index}`"
            :aria-selected="activePage === index - 1"
            @click="goToSlide(index - 1)"
          />
        </div>
      </div>
    </template>

    <div
      v-if="confirmDialog"
      class="habits-confirm-overlay"
      role="presentation"
      @click.self="closeConfirmDialog"
    >
      <div
        class="habits-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="'habits-confirm-title'"
        :aria-describedby="'habits-confirm-message'"
      >
        <h2 id="habits-confirm-title" class="habits-confirm-title">{{ confirmDialogTitle }}</h2>
        <p id="habits-confirm-message" class="habits-confirm-message">{{ confirmDialogMessage }}</p>
        <div class="habits-confirm-actions">
          <button
            type="button"
            class="btn btn--ghost"
            :disabled="isManageBusy"
            @click="closeConfirmDialog"
          >
            Annuler
          </button>
          <button
            type="button"
            class="habits-confirm-action-btn"
            :class="{
              'habits-confirm-action-btn--delete': confirmDialog.type === 'delete',
              'habits-confirm-action-btn--archive':
                confirmDialog.type === 'archive' || confirmDialog.type === 'unarchive',
            }"
            :disabled="isManageBusy"
            @click="onConfirmDialogAction"
          >
            {{
              isManageBusy
                ? 'En cours…'
                : confirmDialog.type === 'delete'
                  ? 'Supprimer'
                  : confirmDialog.type === 'archive'
                    ? 'Archiver'
                    : 'Désarchiver'
            }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.habits-page {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  max-width: none;
  min-width: 0;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
  min-height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  gap: 1.25rem;
}

.habits-page__header {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.75rem;
  text-align: center;
}

.habits-page__toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.65rem;
  width: 100%;
}

.habits-archived-link {
  align-self: center;
  border: none;
  background: none;
  padding: 0;
  font-size: 0.88rem;
  font-weight: 700;
  color: #b8792e;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.habits-archived-link:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.habits-page__title {
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
  margin: 0;
}

.habits-page__subtitle {
  margin: 0.5rem 0 0;
  color: #6c757d;
  font-size: 1rem;
}

.habits-card {
  width: 100%;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 16px;
  padding: 1.5rem 1.25rem;
}

.habits-card--empty {
  text-align: center;
}

.habits-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.habits-actions--form {
  margin-top: 0.5rem;
  margin-bottom: 0;
}

.btn {
  border: none;
  border-radius: 12px;
  padding: 0.65rem 1.15rem;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn--primary {
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: white;
  box-shadow: 0 4px 12px rgba(173, 129, 190, 0.35);
}

.btn--primary:hover:not(:disabled) {
  transform: translateY(-1px);
}

.btn--primary:disabled,
.btn--ghost:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn--ghost {
  background: rgba(213, 181, 234, 0.2);
  color: #ad81be;
}

.btn--secondary {
  background: rgba(255, 255, 255, 0.75);
  color: #ad81be;
  border: 1px solid rgba(213, 181, 234, 0.45);
  box-shadow: none;
}

.btn--secondary:hover:not(:disabled) {
  background: rgba(213, 181, 234, 0.18);
  transform: translateY(-1px);
}

.habits-confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  background: rgba(20, 16, 28, 0.45);
  backdrop-filter: blur(4px);
}

.habits-confirm-dialog {
  width: min(100%, 26rem);
  padding: 1.35rem 1.25rem;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(213, 181, 234, 0.35);
  box-shadow: 0 16px 40px rgba(44, 62, 80, 0.18);
}

.habits-confirm-title {
  margin: 0 0 0.65rem;
  font-size: 1.1rem;
  font-weight: 800;
  color: #2c3e50;
}

.habits-confirm-message {
  margin: 0 0 1.1rem;
  font-size: 0.9rem;
  line-height: 1.5;
  color: #6c757d;
}

.habits-confirm-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.55rem;
}

.habits-confirm-action-btn {
  border: none;
  border-radius: 12px;
  padding: 0.65rem 1.1rem;
  font-size: 0.88rem;
  font-weight: 800;
  color: #fff;
  cursor: pointer;
}

.habits-confirm-action-btn--delete {
  background: linear-gradient(135deg, #e57373, #c0392b);
}

.habits-confirm-action-btn--archive {
  background: linear-gradient(135deg, #e8b878, #b8792e);
}

.habits-confirm-action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.habits-loading,
.habits-empty {
  margin: 0;
  text-align: center;
  color: #6c757d;
  font-size: 0.95rem;
  line-height: 1.5;
}

.habits-feedback {
  margin: 0 0 1rem;
  font-size: 0.9rem;
  font-weight: 600;
}

.habits-feedback--error {
  color: #c0392b;
}

.habits-feedback--ok {
  color: #27ae60;
}

.habits-tabs {
  display: flex;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  gap: 0.5rem;
  margin: 0;
  padding: 0.35rem;
  border-radius: 14px;
  background: rgba(213, 181, 234, 0.12);
  border: 1px solid rgba(213, 181, 234, 0.25);
  box-sizing: border-box;
}

.habits-tab {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border: 2px solid transparent;
  border-radius: 10px;
  padding: 0.65rem 1rem;
  font-size: 0.95rem;
  font-weight: 700;
  color: #6c757d;
  background: transparent;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.habits-tab:hover {
  color: var(--habit-color, #ad81be);
  background: rgba(255, 255, 255, 0.45);
}

.habits-tab--active {
  color: var(--habit-color, #ad81be);
  background: rgba(255, 255, 255, 0.85);
  border-color: var(--habit-color, #ad81be);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--habit-color, #ad81be) 25%, transparent);
}

.habits-tab__swatch {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 8px;
  font-size: 1rem;
  line-height: 1;
  background-color: var(--habit-color, #ad81be);
}

.habits-tab__swatch--no-icon {
  font-size: 0;
}

.habits-tab__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.habits-carousel-wrapper {
  position: relative;
  width: 100%;
  max-width: 100%;
  z-index: 1;
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
}

.habits-carousel-content {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.habits-carousel-track {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  width: 100%;
  align-items: stretch;
}

.habits-column {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}

.habits-column__title {
  margin: 0;
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

.habits-column__card {
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.25);
  border-radius: 20px;
  padding: 1.5rem;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  overflow: hidden;
}

@media (min-width: 769px) {
  .habits-column--tracker .habits-column__card {
    overflow: visible;
  }
}

.habits-details__desc {
  margin: 0 0 0.85rem;
  font-size: 0.95rem;
  color: #2c3e50;
  line-height: 1.45;
}

.habits-details__list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.habits-details__row {
  display: grid;
  grid-template-columns: 6.5rem 1fr;
  gap: 0.5rem;
  align-items: start;
}

.habits-details__row dt {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--habit-color, #ad81be);
}

.habits-details__row dd {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: #2c3e50;
  line-height: 1.4;
}

.habits-details__hint {
  margin: 1rem 0 0;
  padding-top: 0.85rem;
  border-top: 1px solid rgba(213, 181, 234, 0.2);
  font-size: 0.82rem;
  color: #8c98a4;
  line-height: 1.45;
}

.habits-carousel-arrow {
  display: none;
}

.habits-carousel-indicators {
  display: none;
}

@media (max-width: 768px) {
  .habits-page {
    overflow-x: clip;
    padding: 1rem 0.75rem 2rem;
    gap: 1rem;
  }

  .habits-page__header {
    overflow: hidden;
  }

  .habits-page__title {
    font-size: 1.45rem;
  }

  .habits-page__subtitle {
    font-size: 0.9rem;
    margin-bottom: 0;
  }

  .habits-page__toolbar {
    width: 100%;
    max-width: 100%;
  }

  .habits-page__toolbar .btn {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }

  .habits-tabs {
    flex-wrap: nowrap;
    width: 100%;
    gap: 0.35rem;
    overflow: hidden;
  }

  .habits-tab {
    flex: 1 1 0;
    min-width: 0;
    width: auto;
    max-width: none;
    height: 2.75rem;
    padding: 0.35rem;
    gap: 0;
  }

  .habits-tab__name {
    display: none;
  }

  .habits-tab__swatch {
    width: 100%;
    height: 100%;
    max-width: 2.25rem;
    max-height: 2.25rem;
    margin: 0 auto;
    border-radius: 7px;
    font-size: clamp(0.85rem, 4.5vw, 1.1rem);
  }

  .habits-carousel-wrapper {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 100%;
    flex: 0 0 auto;
    min-width: 0;
    overflow: hidden;
  }

  .habits-carousel-content {
    container-type: inline-size;
    container-name: habits-carousel;
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

  .habits-carousel-content::-webkit-scrollbar {
    display: none;
  }

  .habits-carousel-track {
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

  .habits-column {
    scroll-snap-align: start;
    scroll-snap-stop: always;
    align-self: flex-start;
    height: auto;
    min-height: 0;
    min-width: 0;
    padding: 0;
    box-sizing: border-box;
    flex: 0 0 100%;
    width: 100%;
    max-width: 100%;
  }

  @supports (width: 1cqi) {
    .habits-carousel-content .habits-carousel-track .habits-column {
      flex: 0 0 100cqi;
      width: 100cqi;
      min-width: 0;
      max-width: 100cqi;
    }
  }

  .habits-column__title {
    min-width: 0;
    width: 100%;
    max-width: 100%;
    font-size: 1.15rem;
  }

  .habits-column__card {
    width: 100%;
    max-width: 100%;
    padding: 1rem 0.85rem;
    overflow: hidden;
  }

  .habits-column--tracker .habits-column__card {
    overflow: hidden;
  }

  .habits-column__card > * {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }

  .habits-carousel-indicators {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding-top: 1rem;
    margin-top: 0;
  }

  .habits-carousel-dot {
    width: 8px;
    height: 8px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: rgba(213, 181, 234, 0.3);
    cursor: pointer;
    transition: all 0.3s ease;
  }

  .habits-carousel-dot--active {
    background: #ad81be;
    width: 20px;
    border-radius: 4px;
  }

  .habits-carousel-arrow {
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
    pointer-events: all;
  }

  .habits-carousel-arrow--prev {
    left: 4px;
  }

  .habits-carousel-arrow--next {
    right: 4px;
  }
}

@media (max-width: 768px) and (prefers-color-scheme: dark) {
  .habits-carousel-arrow {
    background: rgba(25, 20, 35, 0.75);
    border-color: rgba(213, 181, 234, 0.2);
  }
}

.habits-form__title {
  margin: 0 0 1.25rem;
  font-size: 1.25rem;
  font-weight: 800;
  color: #ad81be;
}

.habits-form__body {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.habits-fieldset {
  margin: 0;
  padding: 0;
  border: none;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.habits-fieldset__legend {
  font-size: 0.95rem;
  font-weight: 800;
  color: #ad81be;
  margin-bottom: 0.15rem;
}

.habits-fieldset__hint {
  margin: 0;
  font-size: 0.85rem;
  color: #6c757d;
  line-height: 1.45;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.field--full {
  width: 100%;
}

.field span {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #ad81be;
}

.field__optional {
  font-style: normal;
  font-weight: 600;
  text-transform: none;
  letter-spacing: 0;
  color: #8c98a4;
}

.field input,
.habits-select {
  padding: 0.55rem 0.75rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  font-size: 0.95rem;
  background: rgba(255, 255, 255, 0.9);
  color: #2c3e50;
}

.habits-select {
  cursor: pointer;
}

.habits-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.habits-picker__btn {
  border: 2px solid transparent;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.habits-picker__btn--day,
.habits-picker__btn--month-day {
  min-width: 2.5rem;
  padding: 0.45rem 0.55rem;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.85);
  border-color: rgba(213, 181, 234, 0.35);
  color: #5a4a66;
  font-size: 0.82rem;
  font-weight: 700;
}

.habits-picker__btn--month-day {
  min-width: 2.15rem;
  padding: 0.4rem;
}

.habits-picker__btn:hover {
  transform: translateY(-1px);
}

.habits-picker__btn--on {
  border-color: #ad81be;
  box-shadow: 0 0 0 2px rgba(173, 129, 190, 0.35);
}

.habits-picker__btn--on.habits-picker__btn--day,
.habits-picker__btn--on.habits-picker__btn--month-day {
  background: rgba(213, 181, 234, 0.25);
  color: #ad81be;
}

@media (prefers-color-scheme: dark) {
  .habits-page__title {
    color: #f0e8f8;
  }

  .habits-page__subtitle,
  .habits-loading,
  .habits-empty,
  .habits-fieldset__hint {
    color: #adb5bd;
  }

  .habits-card {
    background: rgba(30, 25, 40, 0.65);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .habits-tabs {
    background: rgba(35, 30, 48, 0.6);
    border-color: rgba(213, 181, 234, 0.15);
  }

  .habits-tab {
    color: #adb5bd;
  }

  .habits-tab:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .habits-tab--active {
    background: rgba(45, 38, 58, 0.95);
  }

  .habits-column__title {
    color: #f0e8f8;
    border-bottom-color: rgba(213, 181, 234, 0.1);
  }

  .habits-column__card {
    background: rgba(40, 32, 52, 0.6);
    border-color: rgba(213, 181, 234, 0.15);
  }

  .habits-column__title {
    color: #f0e8f8;
    border-bottom-color: rgba(213, 181, 234, 0.1);
  }

  .habits-column__card {
    background: rgba(25, 20, 35, 0.65);
    border-color: rgba(213, 181, 234, 0.15);
  }

  .habits-details__desc,
  .habits-details__row dd {
    color: #f0e8f8;
  }

  .habits-details__hint {
    color: #adb5bd;
    border-top-color: rgba(213, 181, 234, 0.12);
  }

  .field input,
  .habits-select {
    background: rgba(30, 25, 40, 0.9);
    color: #f0e8f8;
    border-color: rgba(213, 181, 234, 0.2);
  }

  .habits-picker__btn--day,
  .habits-picker__btn--month-day {
    background: rgba(40, 32, 52, 0.9);
    border-color: rgba(213, 181, 234, 0.25);
    color: #e8dff0;
  }

  .btn--secondary {
    background: rgba(40, 32, 52, 0.8);
    border-color: rgba(213, 181, 234, 0.25);
    color: #d5b5ea;
  }

  .habits-archived-link {
    color: #e8b878;
  }

  .habits-confirm-dialog {
    background: rgba(35, 30, 48, 0.96);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .habits-confirm-title {
    color: #f0e8f8;
  }

  .habits-confirm-message {
    color: #adb5bd;
  }
}
</style>
