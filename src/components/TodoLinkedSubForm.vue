<script setup>
import { computed } from 'vue'
import {
  TODO_FREQUENCY,
  TODO_FREQUENCY_OPTIONS,
  TODO_WEEKDAYS,
  getTodoFrequencyClass,
} from '../constants/todoOptions.js'
import { formatWeekRangeLabelFr } from '../utils/todoCalendar.js'
import '../styles/todo-frequency.css'

const props = defineProps({
  modelValue: {
    type: Object,
    required: true,
  },
  dateStart: {
    type: String,
    default: '',
  },
  promesseLimitHint: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:modelValue'])

const formFrequencyClass = computed(() => getTodoFrequencyClass(props.modelValue.frequence))

const formTargetWeekLabel = computed(() => {
  if (props.modelValue.frequence !== TODO_FREQUENCY.WEEK_GOAL) return ''
  return formatWeekRangeLabelFr(props.dateStart)
})

const showWeekdayPicker = computed(() => props.modelValue.frequence === TODO_FREQUENCY.WEEKLY)

function patch(fields) {
  emit('update:modelValue', { ...props.modelValue, ...fields })
}

function selectWeekday(dayId) {
  patch({ jour_semaine: dayId })
}
</script>

<template>
  <section class="todo-linked-subform" aria-label="Options TODO">
    <h3 class="todo-linked-subform__title">TODO</h3>
    <p class="todo-linked-subform__hint">
      Complète les informations pour créer aussi une tâche TODO.
    </p>

    <div class="todo-linked-subform__field">
      <span class="todo-linked-subform__label">Fréquence</span>
      <div class="todo-linked-subform__freq-row" :class="formFrequencyClass">
        <span class="todo-linked-subform__freq-dot" aria-hidden="true" />
        <select
          :value="modelValue.frequence"
          class="todo-linked-subform__select"
          required
          @change="patch({ frequence: $event.target.value, jour_semaine: null })"
        >
          <option v-for="opt in TODO_FREQUENCY_OPTIONS" :key="opt.id" :value="opt.id">
            {{ opt.label }}
          </option>
        </select>
      </div>
    </div>

    <div v-if="modelValue.frequence === TODO_FREQUENCY.WEEK_GOAL" class="todo-linked-subform__field">
      <span class="todo-linked-subform__label">Semaine</span>
      <p class="todo-linked-subform__week-label">{{ formTargetWeekLabel }}</p>
    </div>

    <fieldset v-if="showWeekdayPicker" class="todo-linked-subform__field todo-linked-subform__weekdays">
      <legend class="todo-linked-subform__label">Jour de la semaine</legend>
      <div class="todo-linked-subform__weekday-row">
        <button
          v-for="day in TODO_WEEKDAYS"
          :key="day.id"
          type="button"
          class="todo-linked-subform__weekday-btn"
          :class="{ 'todo-linked-subform__weekday-btn--active': modelValue.jour_semaine === day.id }"
          :aria-pressed="modelValue.jour_semaine === day.id"
          @click="selectWeekday(day.id)"
        >
          {{ day.label }}
        </button>
      </div>
    </fieldset>

    <label class="todo-linked-subform__field todo-linked-subform__qty-row">
      <span class="todo-linked-subform__label">Objectif quantité (0 = sans)</span>
      <input
        :value="modelValue.quantite_cible"
        type="number"
        class="todo-linked-subform__input todo-linked-subform__input--qty"
        min="0"
        max="9999"
        step="1"
        inputmode="numeric"
        @input="patch({ quantite_cible: Number($event.target.value) || 0 })"
      />
    </label>

    <label
      class="todo-linked-subform__promesse choice-check"
      :class="{ 'todo-freq--promesse': modelValue.is_promesse }"
    >
      <input
        type="checkbox"
        :checked="modelValue.is_promesse"
        @change="patch({ is_promesse: $event.target.checked })"
      />
      <span>Promesse</span>
    </label>
    <p v-if="promesseLimitHint" class="todo-linked-subform__hint todo-linked-subform__hint--small">
      {{ promesseLimitHint }}
    </p>
  </section>
</template>

<style scoped>
.todo-linked-subform {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  margin-top: 0.35rem;
  padding: 0.85rem 0.95rem;
  border-radius: 12px;
  border: 1px dashed rgba(149, 209, 170, 0.45);
  background: rgba(149, 209, 170, 0.08);
}

.todo-linked-subform__title {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 800;
  color: #72a098;
}

.todo-linked-subform__hint {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.4;
  color: #6c757d;
}

.todo-linked-subform__hint--small {
  margin-top: -0.25rem;
}

.todo-linked-subform__field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.todo-linked-subform__weekdays {
  margin: 0;
  padding: 0;
  border: none;
}

.todo-linked-subform__label {
  font-size: 0.78rem;
  font-weight: 800;
  color: #95a5a6;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.todo-linked-subform__select,
.todo-linked-subform__input {
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

.todo-linked-subform__input--qty {
  max-width: 6rem;
}

.todo-linked-subform__freq-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.45rem 0.55rem 0.45rem 0.65rem;
  border-radius: 10px;
  border: 1px solid var(--todo-freq-border, rgba(213, 181, 234, 0.45));
  background: var(--todo-freq-bg, rgba(255, 255, 255, 0.9));
}

.todo-linked-subform__freq-dot {
  flex-shrink: 0;
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 999px;
  background: var(--todo-freq-accent, #ad81be);
}

.todo-linked-subform__select {
  flex: 1;
  border: none;
  background: transparent;
  padding: 0.2rem 0;
}

.todo-linked-subform__week-label {
  margin: 0;
  padding: 0.6rem 0.75rem;
  border: 1px solid rgba(213, 181, 234, 0.45);
  border-radius: 10px;
  font-size: 0.92rem;
  font-weight: 700;
  color: #2c3e50;
  background: rgba(255, 255, 255, 0.9);
}

.todo-linked-subform__weekday-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.todo-linked-subform__weekday-btn {
  min-width: 2.5rem;
  padding: 0.45rem 0.55rem;
  border-radius: 8px;
  border: 1px solid rgba(213, 181, 234, 0.4);
  background: rgba(255, 255, 255, 0.85);
  color: #6c757d;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}

.todo-linked-subform__weekday-btn--active {
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  border-color: transparent;
  color: #fff;
}

.todo-linked-subform__promesse {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.92rem;
  font-weight: 700;
  color: #2c3e50;
  cursor: pointer;
}

.todo-linked-subform__qty-row {
  max-width: 12rem;
}

@media (prefers-color-scheme: dark) {
  .todo-linked-subform {
    background: rgba(149, 209, 170, 0.08);
    border-color: rgba(149, 209, 170, 0.25);
  }

  .todo-linked-subform__hint {
    color: #adb5bd;
  }

  .todo-linked-subform__select,
  .todo-linked-subform__input,
  .todo-linked-subform__week-label,
  .todo-linked-subform__weekday-btn {
    color: #f0e8f8;
    background: rgba(25, 20, 35, 0.6);
    border-color: rgba(213, 181, 234, 0.25);
  }

  .todo-linked-subform__promesse {
    color: #f0e8f8;
  }
}
</style>
