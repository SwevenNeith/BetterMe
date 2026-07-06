<script setup>
import { computed, ref, watch } from 'vue'
import { hasQuantiteTracking } from '../constants/projectProgress.js'
import { getCurrentPeriodCount } from '../services/projectProgress.js'
import { buildHistoryEntries, computeAverageStats } from '../utils/projectProgressPeriods.js'

const HISTORY_PAGE_SIZE = 10

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
  logs: {
    type: Array,
    default: () => [],
  },
  compact: {
    type: Boolean,
    default: false,
  },
  projectColor: {
    type: String,
    default: '#ad81be',
  },
})

const emit = defineEmits(['increment', 'decrement', 'toggle'])

const historyOpen = ref(false)
const historyPage = ref(0)

const usesQuantiteTracking = computed(() => hasQuantiteTracking(props.item))

const currentCount = computed(() => getCurrentPeriodCount(props.logs, props.item.reset_periode))

const quantiteLabel = computed(() => `${currentCount.value}/${props.item.quantite_cible}`)

const averageStats = computed(() => computeAverageStats(props.logs, props.item.reset_periode))

const historyEntries = computed(() => buildHistoryEntries(props.logs, props.item.reset_periode))

const totalHistoryPages = computed(() =>
  Math.max(1, Math.ceil(historyEntries.value.length / HISTORY_PAGE_SIZE)),
)

const showHistoryPagination = computed(() => historyEntries.value.length > HISTORY_PAGE_SIZE)

const paginatedHistoryEntries = computed(() => {
  const start = historyPage.value * HISTORY_PAGE_SIZE
  return historyEntries.value.slice(start, start + HISTORY_PAGE_SIZE)
})

const resetLabel = computed(() => {
  if (props.item.reset_periode === 'semaine') return 'semaine'
  if (props.item.reset_periode === 'mois') return 'mois'
  return 'jour'
})

const accentStyle = computed(() => ({
  '--project-color': props.projectColor || '#ad81be',
}))

watch(historyEntries, () => {
  if (historyPage.value > totalHistoryPages.value - 1) {
    historyPage.value = Math.max(0, totalHistoryPages.value - 1)
  }
})

function openHistory() {
  historyPage.value = 0
  historyOpen.value = true
}

function closeHistory() {
  historyOpen.value = false
  historyPage.value = 0
}

function goToHistoryPage(page) {
  historyPage.value = Math.max(0, Math.min(page, totalHistoryPages.value - 1))
}
</script>

<template>
  <div
    v-if="!usesQuantiteTracking"
    class="project-progress project-progress--checkbox"
    :class="{ 'project-progress--compact': compact, 'project-progress--done': item.is_done }"
    :style="accentStyle"
  >
    <label
      class="project-progress__check"
      :class="{ 'project-progress__check--small': compact }"
      :title="item.is_done ? 'Marquer comme à faire' : 'Marquer comme terminée'"
    >
      <input
        type="checkbox"
        class="project-progress__check-input"
        :checked="item.is_done"
        @change.stop="emit('toggle')"
      />
      <span class="project-progress__check-box" aria-hidden="true" />
    </label>
  </div>

  <div
    v-else
    class="project-progress"
    :class="{ 'project-progress--compact': compact, 'project-progress--done': item.is_done }"
    :style="accentStyle"
  >
    <div
      class="project-progress__quantite"
      role="group"
      :aria-label="`Progression : ${quantiteLabel}`"
    >
      <button
        type="button"
        class="project-progress__quantite-btn"
        title="Diminuer"
        aria-label="Diminuer la quantité"
        :disabled="currentCount <= 0"
        @click.stop="emit('decrement')"
      >
        −
      </button>
      <span class="project-progress__quantite-value">{{ quantiteLabel }}</span>
      <button
        type="button"
        class="project-progress__quantite-btn"
        title="Augmenter"
        aria-label="Augmenter la quantité"
        @click.stop="emit('increment')"
      >
        +
      </button>
    </div>

    <div class="project-progress__aside">
      <span class="project-progress__reset">Par {{ resetLabel }}</span>
      <button type="button" class="project-progress__history-btn" @click.stop="openHistory">
        Historique
      </button>
      <p v-if="averageStats" class="project-progress__average">{{ averageStats.label }}</p>
    </div>

    <Teleport to="body">
      <div v-if="historyOpen" class="project-history-modal" role="dialog" aria-modal="true">
        <div class="project-history-modal__overlay" @click="closeHistory" />
        <div class="project-history-modal__panel" :style="accentStyle">
          <header class="project-history-modal__header">
            <div>
              <h3 class="project-history-modal__title">Historique</h3>
              <p v-if="historyEntries.length > 0" class="project-history-modal__subtitle">
                {{ historyEntries.length }} période{{ historyEntries.length > 1 ? 's' : '' }}
              </p>
            </div>
            <button
              type="button"
              class="project-history-modal__close"
              aria-label="Fermer"
              @click="closeHistory"
            >
              ✕
            </button>
          </header>

          <p v-if="historyEntries.length === 0" class="project-history-modal__empty">
            Aucun historique pour le moment.
          </p>

          <template v-else>
            <ul class="project-history-modal__list">
              <li
                v-for="entry in paginatedHistoryEntries"
                :key="`${entry.index}-${entry.dateLabel}`"
                class="project-history-modal__item"
                :class="{ 'project-history-modal__item--current': entry.isCurrent }"
              >
                <div class="project-history-modal__item-head">
                  <span class="project-history-modal__item-title">{{ entry.title }}</span>
                  <span class="project-history-modal__item-count">{{ entry.count }} fois</span>
                </div>
                <span class="project-history-modal__item-date">{{ entry.dateLabel }}</span>
                <span v-if="entry.isCurrent" class="project-history-modal__item-badge"
                  >Période en cours</span
                >
              </li>
            </ul>

            <nav
              v-if="showHistoryPagination"
              class="project-history-modal__pagination"
              aria-label="Pagination de l'historique"
            >
              <button
                type="button"
                class="project-history-modal__page-btn"
                :disabled="historyPage === 0"
                aria-label="Page précédente"
                @click="goToHistoryPage(historyPage - 1)"
              >
                ‹
              </button>
              <span class="project-history-modal__page-label">
                {{ historyPage + 1 }} / {{ totalHistoryPages }}
              </span>
              <button
                type="button"
                class="project-history-modal__page-btn"
                :disabled="historyPage >= totalHistoryPages - 1"
                aria-label="Page suivante"
                @click="goToHistoryPage(historyPage + 1)"
              >
                ›
              </button>
            </nav>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.project-progress {
  display: flex;
  align-items: stretch;
  align-self: stretch;
  flex-shrink: 0;
  gap: 0.5rem;
}

.project-progress--checkbox {
  align-items: center;
  align-self: auto;
}

.project-progress__check {
  position: relative;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.project-progress__check--small .project-progress__check-box {
  width: 1rem;
  height: 1rem;
}

.project-progress__check-input {
  position: absolute;
  opacity: 0;
  width: 1.15rem;
  height: 1.15rem;
  margin: 0;
  cursor: pointer;
}

.project-progress__check-box {
  display: block;
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 4px;
  border: 2px solid color-mix(in srgb, var(--project-color, #ad81be) 65%, transparent);
  background: white;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.project-progress__check-input:checked + .project-progress__check-box {
  background: linear-gradient(135deg, #2ecc71, #27ae60);
  border-color: #27ae60;
  box-shadow: inset 0 0 0 2px white;
}

.project-progress--compact {
  gap: 0.35rem;
}

.project-progress__quantite {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  align-self: stretch;
  gap: 0.35rem;
  padding: 0.55rem 0.4rem;
  margin: -0.75rem 0 -0.75rem -0.75rem;
  border-radius: 12px 0 0 12px;
  background: color-mix(in srgb, var(--project-color, #ad81be) 16%, white);
  border-right: 1px solid color-mix(in srgb, var(--project-color, #ad81be) 22%, transparent);
}

.project-progress--compact .project-progress__quantite {
  padding: 0.4rem 0.3rem;
  margin: -0.35rem 0 -0.35rem -0.25rem;
  border-radius: 8px 0 0 8px;
}

.project-progress__quantite-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.85rem;
  height: 1.85rem;
  flex-shrink: 0;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.7);
  color: var(--project-color, #ad81be);
  font-size: 1rem;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
}

.project-progress--compact .project-progress__quantite-btn {
  width: 1.55rem;
  height: 1.55rem;
  font-size: 0.9rem;
}

.project-progress__quantite-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.project-progress__quantite-btn:not(:disabled):hover {
  background: #fff;
}

.project-progress__quantite-value {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 2.4rem;
  text-align: center;
  font-size: 0.82rem;
  font-weight: 800;
  color: #2c3e50;
  line-height: 1.2;
}

.project-progress--done .project-progress__quantite-value {
  color: #72a098;
}

.project-progress__aside {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.2rem;
  min-width: 0;
  padding: 0.15rem 0;
}

.project-progress--compact .project-progress__aside {
  gap: 0.1rem;
  padding: 0.05rem 0;
}

.project-progress__reset {
  font-size: 0.72rem;
  font-weight: 700;
  color: #8a96a3;
  text-transform: capitalize;
  white-space: nowrap;
}

.project-progress--compact .project-progress__reset {
  font-size: 0.65rem;
}

.project-progress__history-btn {
  border: none;
  background: none;
  padding: 0;
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--project-color, #ad81be);
  cursor: pointer;
  text-decoration: underline;
  text-align: left;
  white-space: nowrap;
}

.project-progress--compact .project-progress__history-btn {
  font-size: 0.65rem;
}

.project-progress__average {
  margin: 0;
  font-size: 0.68rem;
  font-weight: 700;
  color: #6b7a88;
  line-height: 1.3;
  max-width: 9rem;
}

.project-progress--compact .project-progress__average {
  font-size: 0.62rem;
  max-width: 7rem;
}

.project-history-modal {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
}

.project-history-modal__overlay {
  position: absolute;
  inset: 0;
  background: rgba(20, 30, 40, 0.5);
}

.project-history-modal__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(100%, 44rem);
  min-height: min(70vh, 28rem);
  max-height: min(88vh, 40rem);
  background: white;
  border-radius: 16px;
  padding: 1.25rem 1.35rem 1.1rem;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
}

.project-history-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
  flex-shrink: 0;
}

.project-history-modal__title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 800;
  color: #2c3e50;
}

.project-history-modal__subtitle {
  margin: 0.2rem 0 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: #8a96a3;
}

.project-history-modal__close {
  border: none;
  background: none;
  font-size: 1.15rem;
  cursor: pointer;
  color: #8a96a3;
  padding: 0.15rem;
}

.project-history-modal__empty {
  margin: auto 0;
  text-align: center;
  color: #8a96a3;
  font-weight: 600;
}

.project-history-modal__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.project-history-modal__item {
  padding: 0.75rem 0.85rem;
  border-radius: 10px;
  background: #f6f8fa;
  border: 1px solid #e8edf2;
}

.project-history-modal__item--current {
  border-color: color-mix(in srgb, var(--project-color, #ad81be) 40%, transparent);
  background: color-mix(in srgb, var(--project-color, #ad81be) 8%, white);
}

.project-history-modal__item-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.project-history-modal__item-title {
  font-weight: 800;
  font-size: 0.95rem;
  color: #2c3e50;
}

.project-history-modal__item-count {
  font-weight: 800;
  color: var(--project-color, #ad81be);
  white-space: nowrap;
}

.project-history-modal__item-date {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.85rem;
  color: #6b7a88;
}

.project-history-modal__item-badge {
  display: inline-block;
  margin-top: 0.35rem;
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--project-color, #ad81be);
}

.project-history-modal__pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.85rem;
  margin-top: 1rem;
  padding-top: 0.85rem;
  border-top: 1px solid #e8edf2;
  flex-shrink: 0;
}

.project-history-modal__page-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 1px solid color-mix(in srgb, var(--project-color, #ad81be) 35%, transparent);
  border-radius: 10px;
  background: white;
  color: var(--project-color, #ad81be);
  font-size: 1.25rem;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
}

.project-history-modal__page-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.project-history-modal__page-btn:not(:disabled):hover {
  background: color-mix(in srgb, var(--project-color, #ad81be) 10%, white);
}

.project-history-modal__page-label {
  min-width: 4.5rem;
  text-align: center;
  font-size: 0.9rem;
  font-weight: 800;
  color: #2c3e50;
}

@media (max-width: 520px) {
  .project-progress__average,
  .project-progress__reset {
    display: none;
  }

  .project-history-modal__panel {
    width: 100%;
    min-height: min(80vh, 24rem);
  }
}

@media (prefers-color-scheme: dark) {
  .project-progress__quantite {
    background: color-mix(in srgb, var(--project-color, #ad81be) 24%, transparent);
    border-right-color: rgba(213, 181, 234, 0.22);
  }

  .project-progress__quantite-btn {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(213, 181, 234, 0.28);
    color: var(--project-color, #d5b5ea);
  }

  .project-progress__quantite-btn:not(:disabled):hover {
    background: rgba(255, 255, 255, 0.18);
  }

  .project-progress__quantite-value {
    color: #f0e8f8;
  }

  .project-progress--done .project-progress__quantite-value {
    color: #95d1aa;
  }

  .project-history-modal__panel {
    background: #1e2832;
  }

  .project-history-modal__title,
  .project-history-modal__page-label {
    color: #e8edf2;
  }

  .project-history-modal__item {
    background: #2a3540;
    border-color: #3a4654;
  }

  .project-history-modal__item-title {
    color: #e8edf2;
  }

  .project-history-modal__pagination {
    border-top-color: #3a4654;
  }

  .project-history-modal__page-btn {
    background: #2a3540;
    border-color: #3a4654;
  }
}
</style>
