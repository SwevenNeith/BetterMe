<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../lib/supabase.js'
import { getLocalTodayISO } from '../services/scheduledReminders.js'
import MenstruationCycleCalendar from '../components/MenstruationCycleCalendar.vue'
import {
  countMenstruationCyclesPilule,
  createEmptyOnboardingForm,
  createMenstruationCyclePilule,
  listCyclesPilule,
  refreshAllCyclesSpmDatesEstimees,
  saveMenstruationRulesDates,
} from '../services/menstruationCycles.js'
import {
  createDefaultMenstruationNotifSettings,
  loadMenstruationNotifSettings,
  rescheduleMenstruationEstimatedNotifications,
} from '../services/menstruationNotifications.js'

const router = useRouter()
const localToday = getLocalTodayISO()

const userId = ref(null)
const isLoading = ref(true)
const loadError = ref('')
const hasCycleData = ref(false)
const cycles = ref([])

const form = ref(createEmptyOnboardingForm(localToday))

const cycleLengthDaysModel = computed({
  get: () => form.value.cycleLengthDays,
  set: (val) => {
    const n = parseInt(String(val), 10)
    form.value.cycleLengthDays = Number.isNaN(n) ? 28 : Math.min(60, Math.max(15, n))
  },
})

const isSaving = ref(false)
const saveError = ref('')
const isSavingRulesDates = ref(false)
const rulesDatesError = ref('')
const menstruationNotifSettings = ref(createDefaultMenstruationNotifSettings())

let isPageActive = true
onBeforeUnmount(() => {
  isPageActive = false
})

const loadPage = async () => {
  isLoading.value = true
  loadError.value = ''
  saveError.value = ''
  try {
    const count = await countMenstruationCyclesPilule(supabase, userId.value)
    if (!isPageActive) return

    hasCycleData.value = count > 0
    if (hasCycleData.value) {
      menstruationNotifSettings.value = await loadMenstruationNotifSettings(userId.value)
      await refreshAllCyclesSpmDatesEstimees(supabase, userId.value)
      if (!isPageActive) return
      cycles.value = await listCyclesPilule(supabase, userId.value)
      await rescheduleMenstruationEstimatedNotifications(
        userId.value,
        cycles.value,
        menstruationNotifSettings.value,
      )
    } else {
      cycles.value = []
    }
  } catch (err) {
    if (!isPageActive) return
    console.error(err)
    const msg = err.message || ''
    loadError.value =
      msg && msg.includes('menstruation_cycles_pilule')
        ? 'Table menstruation_cycles_pilule introuvable. Exécute la migration Supabase (supabase/migrations/20250520120000_menstruation_cycles.sql).'
        : msg || 'Impossible de charger tes données.'
  } finally {
    if (isPageActive) isLoading.value = false
  }
}

const onSubmitRulesDates = async (payload) => {
  if (!userId.value) return
  rulesDatesError.value = ''
  isSavingRulesDates.value = true
  try {
    await saveMenstruationRulesDates(supabase, userId.value, payload)
    cycles.value = await listCyclesPilule(supabase, userId.value)
    await rescheduleMenstruationEstimatedNotifications(
      userId.value,
      cycles.value,
      menstruationNotifSettings.value,
    )
  } catch (err) {
    console.error(err)
    rulesDatesError.value = err.message || 'Impossible de valider ces dates.'
  } finally {
    isSavingRulesDates.value = false
  }
}

const resetForm = () => {
  form.value = createEmptyOnboardingForm(localToday)
}

const onCancel = () => {
  resetForm()
  saveError.value = ''
}

const onSubmit = async () => {
  saveError.value = ''

  if (form.value.hormonalContraception === null) {
    saveError.value = 'Indique si tu utilises une contraception hormonale (Oui ou Non).'
    return
  }

  // Non : aucune insertion en base pour l'instant
  if (form.value.hormonalContraception === false) {
    return
  }

  if (!userId.value) return

  isSaving.value = true
  try {
    const rulesDurationUnknown =
      form.value.rulesDurationUnknown ||
      form.value.rulesDurationDays == null ||
      form.value.rulesDurationDays === ''

    await createMenstruationCyclePilule(supabase, userId.value, {
      dateDebutPlaquette: form.value.dateDebutPlaquette,
      dateDebutReglesReelle: form.value.lastPeriodStartUnknown
        ? null
        : form.value.lastPeriodStartDate,
      dateFinReglesReelle: form.value.lastPeriodEndUnknown ? null : form.value.lastPeriodEndDate,
      lastPeriodEndUnknown: form.value.lastPeriodEndUnknown,
      dureeReglesDays: rulesDurationUnknown ? null : form.value.rulesDurationDays,
      dureeReglesUnknown: rulesDurationUnknown,
    })

    hasCycleData.value = true
    cycles.value = await listCyclesPilule(supabase, userId.value)
  } catch (err) {
    console.error(err)
    saveError.value = err.message || 'Impossible d’enregistrer cette configuration.'
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
  await loadPage()
})
</script>

<template>
  <div class="menstruation-wrapper" :class="{ 'menstruation-wrapper--wide': hasCycleData }">
    <header class="menstruation-header">
      <h1 class="menstruation-title">Menstruation</h1>
      <p class="menstruation-subtitle">
        Suis ton cycle, tes règles et tes symptômes au même endroit.
      </p>
    </header>

    <p v-if="loadError" class="menstruation-feedback menstruation-feedback--error">{{ loadError }}</p>

    <div v-if="isLoading" class="menstruation-loading">Chargement…</div>

    <section v-else-if="hasCycleData" class="menstruation-card menstruation-card--calendar">
      <div class="card-head card-head--left">
        <h2>Ton calendrier cycle</h2>
        <p>
          Dates estimées et réelles, comprimés actifs, SPM et règles. Survole une case pour le
          détail.
        </p>
      </div>
      <MenstruationCycleCalendar
        :cycles="cycles"
        :show-rules-form="true"
        :is-submitting-rules="isSavingRulesDates"
        :rules-error="rulesDatesError"
        @submit-rules-dates="onSubmitRulesDates"
      />
    </section>

    <section v-else class="menstruation-card">
      <div class="card-head card-head--left">
        <h2>Première configuration</h2>
        <p>
          Quelques questions pour personnaliser ton suivi. Tu pourras modifier ces réponses plus
          tard.
        </p>
      </div>

      <form class="onboarding-form" @submit.prevent="onSubmit">
        <!-- Contraception hormonale -->
        <fieldset class="form-block">
          <legend class="form-question">Utilise-tu une contraception hormonale ?</legend>
          <div class="choice-row">
            <label class="choice-pill">
              <input v-model="form.hormonalContraception" type="radio" :value="true" name="hormonal" />
              <span>Oui</span>
            </label>
            <label class="choice-pill">
              <input v-model="form.hormonalContraception" type="radio" :value="false" name="hormonal" />
              <span>Non</span>
            </label>
          </div>
        </fieldset>

        <!-- Date début plaquette (uniquement si contraception hormonale) -->
        <fieldset v-if="form.hormonalContraception === true" class="form-block">
          <legend class="form-question">Date du début de ta plaquette</legend>
          <label class="field field--date">
            <span class="sr-only">Date</span>
            <input
              v-model="form.dateDebutPlaquette"
              type="date"
              :max="localToday"
              required
            />
          </label>
        </fieldset>

        <!-- Premier jour des règles -->
        <fieldset class="form-block">
            <legend class="form-question">Quel est le premier jour de tes dernières règles ?</legend>
            <label class="field field--date" :class="{ 'field--disabled': form.lastPeriodStartUnknown }">
              <span class="sr-only">Date</span>
              <input
                v-model="form.lastPeriodStartDate"
                type="date"
                :max="localToday"
                :disabled="form.lastPeriodStartUnknown"
                :required="!form.lastPeriodStartUnknown"
              />
            </label>
            <label class="choice-check">
              <input v-model="form.lastPeriodStartUnknown" type="checkbox" />
              <span>Je ne sais pas</span>
            </label>
          </fieldset>

          <!-- Dernier jour des règles -->
          <fieldset class="form-block">
            <legend class="form-question">Quelle est la date du dernier jour de tes dernières règles ?</legend>
            <label class="field field--date" :class="{ 'field--disabled': form.lastPeriodEndUnknown }">
              <span class="sr-only">Date</span>
              <input
                v-model="form.lastPeriodEndDate"
                type="date"
                :max="localToday"
                :disabled="form.lastPeriodEndUnknown"
                :required="!form.lastPeriodEndUnknown"
              />
            </label>
            <label class="choice-check">
              <input v-model="form.lastPeriodEndUnknown" type="checkbox" />
              <span>Je ne sais pas</span>
            </label>
          </fieldset>

          <!-- Durée des règles -->
          <fieldset class="form-block">
            <legend class="form-question">Quelle est la durée de tes règles (en jours) ?</legend>
            <label class="field field--inline">
              <span class="sr-only">Nombre de jours</span>
              <input
                v-model.number="form.rulesDurationDays"
                type="number"
                min="1"
                max="20"
              />
            </label>
            <span class="cycle-length-suffix">jours</span>
          </fieldset>

          <!-- Durée du cycle (uniquement si contraception = Non) -->
          <fieldset v-if="form.hormonalContraception === false" class="form-block">
            <legend class="form-question">Combien de temps dure ton cycle habituellement ?</legend>
            <div class="cycle-length-row" :class="{ 'cycle-length-row--disabled': form.cycleLengthUnknown }">
              <label class="field field--inline">
                <span class="sr-only">Nombre de jours</span>
                <input
                  v-model.number="cycleLengthDaysModel"
                  type="number"
                  min="15"
                  max="60"
                  :disabled="form.cycleLengthUnknown"
                />
              </label>
              <span class="cycle-length-suffix">jours</span>
            </div>
            <label class="choice-check">
              <input v-model="form.cycleLengthUnknown" type="checkbox" />
              <span>Je ne sais pas</span>
            </label>
          </fieldset>

        <p v-if="saveError" class="menstruation-feedback menstruation-feedback--error">{{ saveError }}</p>

        <div class="form-actions">
          <button type="button" class="btn btn--ghost" @click="onCancel">Annuler</button>
          <button type="submit" class="btn btn--primary" :disabled="isSaving">
            {{ isSaving ? 'Enregistrement…' : 'Envoyer' }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>

<style scoped>
.menstruation-wrapper {
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
}

.menstruation-wrapper--wide {
  max-width: 920px;
}

.menstruation-header {
  margin-bottom: 1.5rem;
  text-align: center;
}

.menstruation-title {
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
  margin: 0;
}

.menstruation-subtitle {
  margin: 0.5rem 0 0;
  color: #6c757d;
  font-size: 1rem;
}

@media (prefers-color-scheme: dark) {
  .menstruation-title {
    color: #f0e8f8;
  }
  .menstruation-subtitle {
    color: #adb5bd;
  }
}

.menstruation-loading {
  text-align: center;
  padding: 2rem;
  color: #8c98a4;
  font-weight: 600;
}

.menstruation-feedback {
  margin: 0 0 1rem;
  padding: 0.85rem 1rem;
  border-radius: 12px;
  font-size: 0.9rem;
  font-weight: 600;
}

.menstruation-feedback--error {
  background: rgba(192, 57, 43, 0.1);
  color: #c0392b;
}

.menstruation-card {
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.25);
  border-radius: 20px;
  padding: 1.5rem;
  box-shadow: 0 8px 32px rgba(173, 129, 190, 0.08);
}

@media (prefers-color-scheme: dark) {
  .menstruation-card {
    background: rgba(25, 20, 35, 0.65);
    border-color: rgba(213, 181, 234, 0.15);
  }
}

.card-head--left {
  text-align: left;
  margin-bottom: 1.25rem;
}

.card-head h2 {
  margin: 0 0 0.35rem;
  font-size: 1.25rem;
  font-weight: 800;
  color: #ad81be;
}

.card-head p {
  margin: 0;
  font-size: 0.9rem;
  color: #6c757d;
  line-height: 1.5;
}

@media (prefers-color-scheme: dark) {
  .card-head p {
    color: #adb5bd;
  }
}

.onboarding-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.form-block {
  margin: 0;
  padding: 0;
  border: none;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.form-question {
  font-size: 0.95rem;
  font-weight: 700;
  color: #2c3e50;
  line-height: 1.4;
  padding: 0;
}

@media (prefers-color-scheme: dark) {
  .form-question {
    color: #f0e8f8;
  }
}

.choice-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.choice-column {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.choice-pill {
  display: inline-flex;
  cursor: pointer;
}

.choice-pill input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.choice-pill span {
  display: block;
  padding: 0.55rem 1.1rem;
  border-radius: 999px;
  border: 1px solid rgba(213, 181, 234, 0.45);
  background: rgba(255, 255, 255, 0.5);
  font-size: 0.9rem;
  font-weight: 600;
  color: #5d6d7e;
  transition: all 0.2s ease;
}

.choice-pill--block {
  display: flex;
}

.choice-pill--block span {
  width: 100%;
  border-radius: 12px;
  text-align: left;
}

.choice-pill input:checked + span {
  background: linear-gradient(135deg, rgba(213, 181, 234, 0.35), rgba(196, 92, 122, 0.2));
  border-color: #ad81be;
  color: #ad81be;
  font-weight: 700;
}

.choice-pill input:focus-visible + span {
  outline: 2px solid #ad81be;
  outline-offset: 2px;
}

@media (prefers-color-scheme: dark) {
  .choice-pill span {
    background: rgba(0, 0, 0, 0.2);
    color: #ced4da;
  }
}

.choice-check {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  color: #5d6d7e;
}

.choice-check input {
  width: 1.1rem;
  height: 1.1rem;
  accent-color: #ad81be;
  flex-shrink: 0;
}

.choice-check--card {
  padding: 0.75rem 1rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.25);
  background: rgba(255, 255, 255, 0.45);
}

@media (prefers-color-scheme: dark) {
  .choice-check {
    color: #ced4da;
  }
  .choice-check--card {
    background: rgba(0, 0, 0, 0.15);
  }
}

.symptoms-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.25rem;
}

.symptoms-toolbar-sep {
  color: #ad81be;
  font-weight: 700;
}

.btn-text {
  border: none;
  background: none;
  padding: 0;
  font-size: 0.85rem;
  font-weight: 700;
  color: #ad81be;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.btn-text:hover {
  color: #c45c7a;
}

.symptoms-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.5rem;
}

.field--date input {
  width: 100%;
  max-width: 220px;
  padding: 0.6rem 0.75rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.4);
  font-size: 0.95rem;
  font-family: inherit;
  color: #2c3e50;
  background: rgba(255, 255, 255, 0.7);
}

.field--disabled input {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (prefers-color-scheme: dark) {
  .field--date input {
    color: #f0e8f8;
    background: rgba(0, 0, 0, 0.25);
    border-color: rgba(213, 181, 234, 0.2);
  }
}

.cycle-length-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cycle-length-row--disabled {
  opacity: 0.45;
}

.field--inline input {
  width: 4.5rem;
  padding: 0.6rem 0.75rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.4);
  font-size: 0.95rem;
  font-family: inherit;
  text-align: center;
  color: #2c3e50;
  background: rgba(255, 255, 255, 0.7);
}

.cycle-length-suffix {
  font-size: 0.9rem;
  font-weight: 600;
  color: #6c757d;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.form-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(213, 181, 234, 0.2);
}

.btn {
  border: none;
  border-radius: 12px;
  padding: 0.65rem 1.25rem;
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

.btn--primary:hover {
  transform: translateY(-1px);
}

.btn--ghost {
  background: rgba(213, 181, 234, 0.2);
  color: #ad81be;
}

.btn--ghost:hover {
  background: rgba(213, 181, 234, 0.35);
}
</style>
