<script setup>
import { computed } from 'vue'
import { HABIT_FREQUENCY_LABELS } from '../constants/habitOptions.js'

const props = defineProps({
  habits: {
    type: Array,
    default: () => [],
  },
  /** 'active' | 'archived' */
  mode: {
    type: String,
    default: 'active',
  },
  selectedIds: {
    type: Array,
    default: () => [],
  },
  isBusy: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([
  'update:selectedIds',
  'edit',
  'delete',
  'archive',
  'unarchive',
  'close',
])

const selectedSet = computed(() => new Set(props.selectedIds))

const allSelected = computed(
  () => props.habits.length > 0 && props.habits.every((h) => selectedSet.value.has(h.id)),
)

function toggleOne(habitId, checked) {
  const next = new Set(props.selectedIds)
  if (checked) next.add(habitId)
  else next.delete(habitId)
  emit('update:selectedIds', [...next])
}

function selectAll() {
  emit(
    'update:selectedIds',
    props.habits.map((h) => h.id),
  )
}

function deselectAll() {
  emit('update:selectedIds', [])
}

function frequencyLabel(habit) {
  return HABIT_FREQUENCY_LABELS[habit.frequence] ?? habit.frequence
}
</script>

<template>
  <section class="habit-manage" :aria-labelledby="mode === 'archived' ? 'habit-archived-title' : 'habit-manage-title'">
    <header class="habit-manage__head">
      <div class="habit-manage__head-text">
        <h2 :id="mode === 'archived' ? 'habit-archived-title' : 'habit-manage-title'" class="habit-manage__title">
          {{ mode === 'archived' ? 'Habitudes archivées' : 'Modifier mes habitudes' }}
        </h2>
        <p class="habit-manage__hint">
          <template v-if="mode === 'archived'">
            Désarchive une habitude pour la remettre en suivi avec toutes ses données.
          </template>
          <template v-else>
            Archive pour mettre en pause sans perdre l’historique, ou supprime définitivement.
          </template>
        </p>
      </div>
      <button type="button" class="habit-manage__close" :disabled="isBusy" @click="emit('close')">
        Fermer
      </button>
    </header>

    <div v-if="habits.length" class="habit-manage__bulk">
      <button type="button" class="habit-manage__bulk-btn" :disabled="isBusy || allSelected" @click="selectAll">
        Sélectionner tout
      </button>
      <button
        type="button"
        class="habit-manage__bulk-btn"
        :disabled="isBusy || selectedIds.length === 0"
        @click="deselectAll"
      >
        Désélectionner tout
      </button>
      <span v-if="selectedIds.length" class="habit-manage__bulk-count">
        {{ selectedIds.length }} sélectionnée{{ selectedIds.length > 1 ? 's' : '' }}
      </span>
    </div>

    <p v-if="!habits.length" class="habit-manage__empty">
      {{ mode === 'archived' ? 'Aucune habitude archivée.' : 'Aucune habitude active.' }}
    </p>

    <ul v-else class="habit-manage__list" role="list">
      <li v-for="habit in habits" :key="habit.id" class="habit-manage__item">
        <label class="habit-manage__check">
          <input
            type="checkbox"
            :checked="selectedSet.has(habit.id)"
            :disabled="isBusy"
            @change="toggleOne(habit.id, $event.target.checked)"
          />
          <span class="sr-only">Sélectionner {{ habit.nom }}</span>
        </label>

        <span
          class="habit-manage__swatch"
          :class="{ 'habit-manage__swatch--no-icon': !habit.icone }"
          :style="{ '--habit-color': habit.couleur }"
          aria-hidden="true"
        >
          {{ habit.icone || '' }}
        </span>

        <div class="habit-manage__info">
          <span class="habit-manage__name">{{ habit.nom }}</span>
          <span class="habit-manage__meta">{{ frequencyLabel(habit) }}</span>
        </div>

        <div class="habit-manage__actions">
          <button
            type="button"
            class="habit-manage__icon-btn habit-manage__icon-btn--edit"
            title="Modifier"
            aria-label="Modifier"
            :disabled="isBusy"
            @click="emit('edit', habit)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 20h9"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
              <path
                d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>

          <button
            v-if="mode === 'active'"
            type="button"
            class="habit-manage__icon-btn habit-manage__icon-btn--archive"
            title="Archiver"
            aria-label="Archiver"
            :disabled="isBusy"
            @click="emit('archive', habit)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 14h10l1-14"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path d="M10 11h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>

          <button
            v-else
            type="button"
            class="habit-manage__icon-btn habit-manage__icon-btn--unarchive"
            title="Désarchiver"
            aria-label="Désarchiver"
            :disabled="isBusy"
            @click="emit('unarchive', habit)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 14h10l1-14"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M12 11v6M9 14l3 3 3-3"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>

          <button
            type="button"
            class="habit-manage__icon-btn habit-manage__icon-btn--delete"
            title="Supprimer définitivement"
            aria-label="Supprimer définitivement"
            :disabled="isBusy"
            @click="emit('delete', habit)"
          >
            ✕
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.habit-manage {
  width: 100%;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 16px;
  padding: 1.25rem 1.15rem 1.35rem;
  box-sizing: border-box;
}

.habit-manage__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.habit-manage__title {
  margin: 0 0 0.35rem;
  font-size: 1.2rem;
  font-weight: 800;
  color: #2c3e50;
}

.habit-manage__hint {
  margin: 0;
  font-size: 0.85rem;
  color: #6c757d;
  line-height: 1.45;
}

.habit-manage__close {
  flex-shrink: 0;
  border: none;
  border-radius: 10px;
  padding: 0.45rem 0.85rem;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  background: rgba(213, 181, 234, 0.2);
  color: #ad81be;
}

.habit-manage__close:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.habit-manage__bulk {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  margin-bottom: 0.85rem;
}

.habit-manage__bulk-btn {
  border: 1px solid rgba(213, 181, 234, 0.4);
  border-radius: 10px;
  padding: 0.4rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.7);
  color: #ad81be;
}

.habit-manage__bulk-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.habit-manage__bulk-count {
  font-size: 0.78rem;
  font-weight: 700;
  color: #8c98a4;
}

.habit-manage__empty {
  margin: 0;
  text-align: center;
  color: #6c757d;
  font-size: 0.92rem;
}

.habit-manage__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.habit-manage__item {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.65rem 0.75rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.28);
  background: rgba(255, 255, 255, 0.55);
}

.habit-manage__check {
  flex-shrink: 0;
  display: flex;
  cursor: pointer;
}

.habit-manage__check input {
  width: 1.05rem;
  height: 1.05rem;
  accent-color: #ad81be;
  cursor: pointer;
}

.habit-manage__swatch {
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  background: color-mix(in srgb, var(--habit-color, #ad81be) 22%, white);
  border: 2px solid var(--habit-color, #ad81be);
}

.habit-manage__swatch--no-icon {
  font-size: 0;
}

.habit-manage__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.habit-manage__name {
  font-size: 0.95rem;
  font-weight: 800;
  color: #2c3e50;
  overflow-wrap: anywhere;
}

.habit-manage__meta {
  font-size: 0.75rem;
  font-weight: 600;
  color: #8c98a4;
}

.habit-manage__actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.habit-manage__icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: none;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 800;
  cursor: pointer;
  transition: background 0.15s ease;
}

.habit-manage__icon-btn svg {
  width: 1rem;
  height: 1rem;
}

.habit-manage__icon-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.habit-manage__icon-btn--edit {
  background: rgba(213, 181, 234, 0.18);
  color: #ad81be;
}

.habit-manage__icon-btn--archive,
.habit-manage__icon-btn--unarchive {
  background: rgba(212, 160, 106, 0.2);
  color: #b8792e;
}

.habit-manage__icon-btn--delete {
  background: rgba(192, 57, 43, 0.12);
  color: #c0392b;
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

@media (prefers-color-scheme: dark) {
  .habit-manage {
    background: rgba(30, 25, 40, 0.65);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .habit-manage__title,
  .habit-manage__name {
    color: #f0e8f8;
  }

  .habit-manage__hint,
  .habit-manage__empty,
  .habit-manage__meta,
  .habit-manage__bulk-count {
    color: #adb5bd;
  }

  .habit-manage__item {
    background: rgba(40, 32, 52, 0.55);
    border-color: rgba(213, 181, 234, 0.18);
  }

  .habit-manage__bulk-btn {
    background: rgba(40, 32, 52, 0.8);
    border-color: rgba(213, 181, 234, 0.25);
    color: #d5b5ea;
  }

  .habit-manage__swatch {
    background: color-mix(in srgb, var(--habit-color, #ad81be) 28%, transparent);
  }
}
</style>
