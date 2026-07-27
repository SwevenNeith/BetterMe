<script setup>
import { computed, watch } from 'vue'
import { addMinutesToTimeString, getDurationMinutes } from '../services/durationUtils.js'
import { notificationsActives } from '../services/notifications.js'

const props = defineProps({
  modelValue: {
    type: Object,
    required: true,
  },
  categories: {
    type: Array,
    default: () => [],
  },
  dateStart: {
    type: String,
    default: '',
  },
  loadingCategories: {
    type: Boolean,
    default: false,
  },
  requireStartTime: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue'])

const categoriesForPills = computed(() => props.categories.filter((cat) => cat?.name))

function patch(fields) {
  emit('update:modelValue', { ...props.modelValue, ...fields })
}

function getPillStyle(cat) {
  if (!cat) return {}
  const color = cat.color || '#d5b5ea'
  const isActive =
    String(props.modelValue.category ?? '').toLowerCase() === String(cat.name).toLowerCase()

  let bg = ''
  if (color.startsWith('hsl')) {
    bg = color.replace('hsl', 'hsla').replace(')', isActive ? ', 0.35)' : ', 0.15)')
  } else {
    bg = isActive ? `${color}59` : `${color}26`
  }

  return {
    backgroundColor: bg,
    color,
    border: `2px solid ${isActive ? color : 'transparent'}`,
  }
}

function syncEndTimeFromTimer() {
  if (!props.modelValue.timerEnabled || props.modelValue.allDay) return
  const duration = getDurationMinutes(
    props.modelValue.timerHours,
    props.modelValue.timerMinutes,
  )
  if (duration <= 0 || !props.modelValue.startTime) return
  const endTime = addMinutesToTimeString(props.modelValue.startTime, duration)
  if (endTime) {
    patch({ endTime })
  }
}

watch(
  () => [
    props.modelValue.timerEnabled,
    props.modelValue.timerHours,
    props.modelValue.timerMinutes,
    props.modelValue.startTime,
    props.modelValue.allDay,
  ],
  () => {
    syncEndTimeFromTimer()
  },
)

watch(
  () => props.modelValue.allDay,
  (allDay) => {
    if (allDay) {
      patch({
        reminderEnabled: false,
        timerEnabled: false,
      })
    }
  },
)
</script>

<template>
  <section class="planning-subform" aria-label="Options du planning">
    <h3 class="planning-subform__title">Planning</h3>
    <p class="planning-subform__hint">
      Complète les informations pour ajouter cette tâche à ton emploi du temps.
    </p>

    <p v-if="dateStart" class="planning-subform__date">
      Date : <strong>{{ dateStart.split('-').reverse().join('/') }}</strong>
    </p>

    <label class="planning-subform__toggle">
      <input
        type="checkbox"
        :checked="modelValue.allDay"
        @change="patch({ allDay: $event.target.checked })"
      />
      <span>Toute la journée</span>
    </label>

    <div v-if="!modelValue.allDay" class="planning-subform__field">
      <span class="planning-subform__label">Créneau horaire</span>
      <div class="planning-subform__time-row">
        <input
          :value="modelValue.startTime"
          type="time"
          class="planning-subform__input"
          :required="requireStartTime"
          @input="patch({ startTime: $event.target.value })"
        />
        <span class="planning-subform__time-sep">à</span>
        <input
          :value="modelValue.endTime"
          type="time"
          class="planning-subform__input"
          :disabled="modelValue.timerEnabled"
          :required="!modelValue.timerEnabled"
          :title="modelValue.timerEnabled ? 'Calculée automatiquement par le timer' : ''"
          @input="patch({ endTime: $event.target.value })"
        />
      </div>
      <p v-if="requireStartTime && !modelValue.startTime" class="planning-subform__warn">
        Indique un créneau horaire pour le planning.
      </p>
    </div>

    <div v-if="!modelValue.allDay" class="planning-subform__section">
      <label class="planning-subform__toggle">
        <input
          type="checkbox"
          :checked="modelValue.reminderEnabled"
          @change="patch({ reminderEnabled: $event.target.checked })"
        />
        <span>Rappel 🔔</span>
      </label>

      <div v-if="modelValue.reminderEnabled" class="planning-subform__offset">
        <span class="planning-subform__offset-label">Me rappeler avant l'événement</span>
        <div class="planning-subform__duration" role="group" aria-label="Délai du rappel">
          <div class="planning-subform__duration-unit">
            <input
              :value="modelValue.reminderHours"
              type="number"
              min="0"
              max="23"
              class="planning-subform__duration-input"
              aria-label="Heures"
              @input="patch({ reminderHours: Number($event.target.value) || 0 })"
            />
            <span>h</span>
          </div>
          <span class="planning-subform__duration-sep">:</span>
          <div class="planning-subform__duration-unit">
            <input
              :value="modelValue.reminderMinutes"
              type="number"
              min="0"
              max="59"
              class="planning-subform__duration-input"
              aria-label="Minutes"
              @input="patch({ reminderMinutes: Number($event.target.value) || 0 })"
            />
            <span>min</span>
          </div>
        </div>
        <p v-if="!notificationsActives()" class="planning-subform__warn planning-subform__warn--soft">
          Active les notifications dans Réglages pour recevoir ce rappel.
        </p>
      </div>
    </div>

    <div v-if="!modelValue.allDay" class="planning-subform__section">
      <label class="planning-subform__toggle">
        <input
          type="checkbox"
          :checked="modelValue.timerEnabled"
          @change="patch({ timerEnabled: $event.target.checked })"
        />
        <span>Timer ⏱️</span>
      </label>

      <div v-if="modelValue.timerEnabled" class="planning-subform__offset">
        <span class="planning-subform__offset-label">Durée de l'activité</span>
        <div class="planning-subform__duration" role="group" aria-label="Durée du timer">
          <div class="planning-subform__duration-unit">
            <input
              :value="modelValue.timerHours"
              type="number"
              min="0"
              max="23"
              class="planning-subform__duration-input"
              aria-label="Heures"
              @input="patch({ timerHours: Number($event.target.value) || 0 })"
            />
            <span>h</span>
          </div>
          <span class="planning-subform__duration-sep">:</span>
          <div class="planning-subform__duration-unit">
            <input
              :value="modelValue.timerMinutes"
              type="number"
              min="0"
              max="59"
              class="planning-subform__duration-input"
              aria-label="Minutes"
              @input="patch({ timerMinutes: Number($event.target.value) || 0 })"
            />
            <span>min</span>
          </div>
        </div>
        <p v-if="!notificationsActives()" class="planning-subform__warn planning-subform__warn--soft">
          Active les notifications dans Réglages pour être prévenu à la fin du timer.
        </p>
      </div>
    </div>

    <label class="planning-subform__field">
      <span class="planning-subform__label">Date de fin (optionnelle)</span>
      <input
        :value="modelValue.dateEnd"
        type="date"
        class="planning-subform__input"
        :min="dateStart"
        @input="patch({ dateEnd: $event.target.value })"
      />
    </label>

    <div class="planning-subform__field">
      <span class="planning-subform__label">Catégorie</span>
      <div v-if="loadingCategories" class="planning-subform__loading">Chargement des catégories…</div>
      <div v-else-if="categoriesForPills.length" class="planning-subform__pills">
        <button
          v-for="cat in categoriesForPills"
          :key="cat.id"
          type="button"
          class="planning-subform__pill"
          :style="getPillStyle(cat)"
          @click="patch({ category: cat.name })"
        >
          <span aria-hidden="true">{{ cat.icon || '📌' }}</span>
          {{ cat.name }}
        </button>
      </div>
      <input
        :value="modelValue.category"
        type="text"
        class="planning-subform__input"
        placeholder="Ou saisis une catégorie…"
        required
        @input="patch({ category: $event.target.value })"
      />
    </div>
  </section>
</template>

<style scoped>
.planning-subform {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  margin-top: 0.35rem;
  padding: 0.85rem 0.95rem;
  border-radius: 12px;
  border: 1px dashed rgba(173, 129, 190, 0.45);
  background: rgba(213, 181, 234, 0.08);
}

.planning-subform__title {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 800;
  color: #ad81be;
}

.planning-subform__hint,
.planning-subform__date,
.planning-subform__warn,
.planning-subform__loading {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.4;
  color: #6c757d;
}

.planning-subform__warn {
  color: #c0392b;
  font-weight: 600;
}

.planning-subform__warn--soft {
  color: #ad81be;
  font-weight: 600;
}

.planning-subform__field,
.planning-subform__toggle,
.planning-subform__section {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.planning-subform__toggle {
  flex-direction: row;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.9rem;
  font-weight: 700;
  color: #2c3e50;
  cursor: pointer;
}

.planning-subform__label,
.planning-subform__offset-label {
  font-size: 0.78rem;
  font-weight: 800;
  color: #95a5a6;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.planning-subform__offset-label {
  text-transform: none;
  letter-spacing: 0;
  color: #6c757d;
}

.planning-subform__input {
  width: 100%;
  padding: 0.6rem 0.75rem;
  border: 1px solid rgba(213, 181, 234, 0.45);
  border-radius: 10px;
  font-size: 0.92rem;
  font-weight: 500;
  color: #2c3e50;
  background: rgba(255, 255, 255, 0.9);
  box-sizing: border-box;
}

.planning-subform__time-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.planning-subform__time-sep {
  font-weight: 700;
  color: #ad81be;
}

.planning-subform__offset {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding-left: 0.15rem;
}

.planning-subform__duration {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.planning-subform__duration-unit {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: #6c757d;
}

.planning-subform__duration-input {
  width: 3rem;
  padding: 0.35rem 0.45rem;
  border: 1px solid rgba(213, 181, 234, 0.45);
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  text-align: center;
  color: #2c3e50;
  background: rgba(255, 255, 255, 0.9);
}

.planning-subform__duration-sep {
  font-weight: 800;
  color: #ad81be;
}

.planning-subform__pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.planning-subform__pill {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  border: none;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}

@media (prefers-color-scheme: dark) {
  .planning-subform {
    background: rgba(213, 181, 234, 0.08);
    border-color: rgba(213, 181, 234, 0.25);
  }

  .planning-subform__hint,
  .planning-subform__date,
  .planning-subform__loading,
  .planning-subform__offset-label {
    color: #adb5bd;
  }

  .planning-subform__toggle {
    color: #f0e8f8;
  }

  .planning-subform__input,
  .planning-subform__duration-input {
    color: #f0e8f8;
    background: rgba(25, 20, 35, 0.6);
    border-color: rgba(213, 181, 234, 0.25);
  }

  .planning-subform__duration-unit {
    color: #adb5bd;
  }
}
</style>
