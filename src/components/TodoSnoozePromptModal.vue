<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  candidates: {
    type: Array,
    default: () => [],
  },
  saving: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['confirm', 'skip'])

/** @type {import('vue').Ref<Set<string>>} */
const selectedIds = ref(new Set())

watch(
  () => [props.open, props.candidates],
  () => {
    if (!props.open) return
    // Aucune sélection par défaut : « Ignorer » ne reporte rien.
    selectedIds.value = new Set()
  },
  { immediate: true, deep: true },
)

const selectedCount = computed(() => selectedIds.value.size)

const allSelected = computed(
  () => props.candidates.length > 0 && selectedIds.value.size === props.candidates.length,
)

function toggleAll() {
  if (allSelected.value) {
    selectedIds.value = new Set()
    return
  }
  selectedIds.value = new Set(props.candidates.map((item) => item.id))
}

function toggleId(id) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function onConfirm() {
  const selected = props.candidates.filter((item) => selectedIds.value.has(item.id))
  emit('confirm', selected)
}

function onKeydown(event) {
  if (!props.open) return
  if (event.key === 'Escape') emit('skip')
}

watch(
  () => props.open,
  (open) => {
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="todo-snooze-prompt"
      role="dialog"
      aria-modal="true"
      aria-labelledby="todo-snooze-prompt-title"
    >
      <div class="todo-snooze-prompt__overlay" @click="emit('skip')" />
      <div class="todo-snooze-prompt__card">
        <h2 id="todo-snooze-prompt-title" class="todo-snooze-prompt__title">
          Tâches non terminées
        </h2>
        <p class="todo-snooze-prompt__message">
          Tu as des tâches non terminées. Coche celles à reporter sur aujourd’hui /
          cette semaine. « Ignorer » les laisse non faites et ne les reproposera plus.
        </p>

        <div class="todo-snooze-prompt__toolbar">
          <button type="button" class="todo-snooze-prompt__link" @click="toggleAll">
            {{ allSelected ? 'Tout désélectionner' : 'Tout sélectionner' }}
          </button>
          <span class="todo-snooze-prompt__count">{{ selectedCount }} sélectionnée(s)</span>
        </div>

        <ul class="todo-snooze-prompt__list" role="list">
          <li v-for="item in candidates" :key="item.id" class="todo-snooze-prompt__item">
            <label class="todo-snooze-prompt__label">
              <input
                type="checkbox"
                class="todo-snooze-prompt__check"
                :checked="selectedIds.has(item.id)"
                @change="toggleId(item.id)"
              />
              <span class="todo-snooze-prompt__text">
                <span class="todo-snooze-prompt__name">{{ item.nom }}</span>
                <span class="todo-snooze-prompt__hint">{{ item.snoozeHint }}</span>
              </span>
            </label>
          </li>
        </ul>

        <div class="todo-snooze-prompt__actions">
          <button
            type="button"
            class="todo-snooze-prompt__btn"
            :disabled="saving"
            @click="emit('skip')"
          >
            Ignorer
          </button>
          <button
            type="button"
            class="todo-snooze-prompt__btn todo-snooze-prompt__btn--primary"
            :disabled="saving || selectedCount === 0"
            @click="onConfirm"
          >
            {{ saving ? 'Report…' : 'Reporter la sélection' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.todo-snooze-prompt__overlay {
  position: fixed;
  inset: 0;
  background: rgba(40, 25, 55, 0.35);
  z-index: 100;
}

.todo-snooze-prompt__card {
  position: fixed;
  z-index: 101;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(460px, calc(100vw - 2rem));
  max-height: min(80vh, 560px);
  overflow: auto;
  background: #fff;
  border-radius: 14px;
  padding: 1.15rem 1.25rem;
  box-shadow: 0 16px 40px rgba(60, 30, 80, 0.18);
  display: grid;
  gap: 0.75rem;
}

.todo-snooze-prompt__title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 800;
  color: #3b2a4a;
}

.todo-snooze-prompt__message {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.45;
  color: #6d5a7e;
  white-space: pre-line;
}

.todo-snooze-prompt__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.todo-snooze-prompt__link {
  border: none;
  background: transparent;
  color: #ad81be;
  font-weight: 700;
  font-size: 0.82rem;
  cursor: pointer;
  padding: 0;
}

.todo-snooze-prompt__count {
  font-size: 0.78rem;
  color: #8c98a4;
  font-weight: 600;
}

.todo-snooze-prompt__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
  max-height: 14rem;
  overflow: auto;
}

.todo-snooze-prompt__item {
  margin: 0;
}

.todo-snooze-prompt__label {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  padding: 0.45rem 0.5rem;
  border-radius: 10px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(246, 237, 251, 0.45);
  cursor: pointer;
}

.todo-snooze-prompt__check {
  margin-top: 0.15rem;
  accent-color: #ad81be;
}

.todo-snooze-prompt__text {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
}

.todo-snooze-prompt__name {
  font-weight: 700;
  color: #3b2a4a;
  font-size: 0.9rem;
}

.todo-snooze-prompt__hint {
  font-size: 0.75rem;
  color: #8c7a9a;
  font-weight: 600;
}

.todo-snooze-prompt__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.todo-snooze-prompt__btn {
  border: 1px solid rgba(213, 181, 234, 0.55);
  background: #fff;
  color: #6b4f7a;
  border-radius: 999px;
  padding: 0.4rem 0.85rem;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}

.todo-snooze-prompt__btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.todo-snooze-prompt__btn--primary {
  background: #ad81be;
  border-color: #ad81be;
  color: #fff;
}

@media (prefers-color-scheme: dark) {
  .todo-snooze-prompt__card {
    background: #241c30;
  }

  .todo-snooze-prompt__title,
  .todo-snooze-prompt__name {
    color: #f0e8f8;
  }

  .todo-snooze-prompt__message,
  .todo-snooze-prompt__hint {
    color: #b9a8c8;
  }

  .todo-snooze-prompt__label {
    background: rgba(55, 42, 70, 0.55);
    border-color: rgba(213, 181, 234, 0.22);
  }

  .todo-snooze-prompt__btn {
    background: #2a2235;
    color: #e8dcf2;
  }
}
</style>
