<script setup>
import { computed, ref, watch } from 'vue'
import { BATTERY_SKIP_REASONS } from '../../constants/battery/battery.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  dayIso: { type: String, default: '' },
  pending: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false },
})

const emit = defineEmits(['submit', 'close'])

/** Choix par entrée : 'done' | raison skip | null */
/** @type {import('vue').Ref<Record<string, string|null>>} */
const choiceById = ref({})

const DONE_CHOICE = 'done'

watch(
  () => [props.open, props.pending],
  () => {
    if (!props.open) return
    /** @type {Record<string, string|null>} */
    const next = {}
    for (const entry of props.pending) {
      next[entry.id] = entry.skip_reason || null
    }
    choiceById.value = next
  },
  { immediate: true, deep: true },
)

const dayLabel = computed(() => {
  try {
    const [y, m, d] = String(props.dayIso).split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
  } catch {
    return props.dayIso
  }
})

function setChoice(entryId, choiceId) {
  const current = choiceById.value[entryId]
  choiceById.value = {
    ...choiceById.value,
    [entryId]: current === choiceId ? null : choiceId,
  }
}

function formatCost(n) {
  const v = Number(n) || 0
  const abs = Math.abs(v)
  const label = Number.isInteger(abs) ? String(abs) : abs.toFixed(1)
  if (v > 0) return `−${label}`
  if (v < 0) return `+${label}`
  return '0'
}

function onSubmit() {
  emit(
    'submit',
    props.pending.map((entry) => {
      const choice = choiceById.value[entry.id] ?? null
      if (choice === DONE_CHOICE) {
        return { entryId: entry.id, done: true, skipReason: null }
      }
      return { entryId: entry.id, done: false, skipReason: choice }
    }),
  )
}

function onKeydown(event) {
  if (!props.open) return
  if (event.key === 'Escape' && !props.saving) emit('close')
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
      class="bpr"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bpr-title"
    >
      <div class="bpr__card">
        <h2 id="bpr-title" class="bpr__title">Bilan du plan</h2>
        <p class="bpr__intro">
          Pour le <strong>{{ dayLabel }}</strong>, certaines activités prévues ne sont pas
          notées comme faites. Tu peux les marquer faites (si tu as oublié) ou indiquer une
          raison (optionnel), puis valider.
        </p>

        <ul class="bpr__list">
          <li v-for="entry in pending" :key="entry.id" class="bpr__item">
            <div class="bpr__item-head">
              <span class="bpr__label">{{ entry.label }}</span>
              <span class="bpr__cost">{{ formatCost(entry.cost) }}</span>
            </div>
            <div class="bpr__reasons" role="group" :aria-label="`Statut pour ${entry.label}`">
              <button
                type="button"
                class="bpr__chip bpr__chip--done"
                :class="{ 'is-active': choiceById[entry.id] === DONE_CHOICE }"
                :disabled="saving"
                @click="setChoice(entry.id, DONE_CHOICE)"
              >
                Fait
              </button>
              <button
                v-for="reason in BATTERY_SKIP_REASONS"
                :key="reason.id"
                type="button"
                class="bpr__chip"
                :class="{ 'is-active': choiceById[entry.id] === reason.id }"
                :disabled="saving"
                @click="setChoice(entry.id, reason.id)"
              >
                {{ reason.label }}
              </button>
            </div>
          </li>
        </ul>

        <div class="bpr__actions">
          <button type="button" class="bpr__btn bpr__btn--ghost" :disabled="saving" @click="emit('close')">
            Plus tard
          </button>
          <button type="button" class="bpr__btn bpr__btn--primary" :disabled="saving" @click="onSubmit">
            {{ saving ? 'Enregistrement…' : 'Valider le bilan' }}
          </button>
        </div>
        <p class="bpr__hint">Ce rappel revient tant que le bilan n’est pas validé.</p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.bpr {
  position: fixed;
  inset: 0;
  z-index: 12000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 1rem;
  background: rgba(30, 22, 40, 0.45);
  box-sizing: border-box;
}

.bpr__card {
  width: min(520px, 100%);
  max-height: min(88vh, 720px);
  overflow: auto;
  background: #fffaf6;
  border: 1px solid #e6ddf2;
  border-radius: 18px 18px 14px 14px;
  padding: 1.15rem 1.2rem 1rem;
  box-shadow: 0 18px 48px rgba(60, 40, 80, 0.22);
}

.bpr__title {
  margin: 0 0 0.35rem;
  font-size: 1.25rem;
  color: #3b2a4a;
}

.bpr__intro {
  margin: 0 0 1rem;
  color: #6d5a7e;
  line-height: 1.45;
  font-size: 0.92rem;
}

.bpr__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.bpr__item {
  padding: 0.75rem 0.8rem;
  border-radius: 12px;
  border: 1px solid #eadff5;
  background: rgba(255, 255, 255, 0.75);
}

.bpr__item-head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.55rem;
}

.bpr__label {
  font-weight: 700;
  color: #3b2a4a;
}

.bpr__cost {
  font-weight: 700;
  color: #8a6a9a;
  white-space: nowrap;
}

.bpr__reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.bpr__chip {
  border: 1px solid #dccfee;
  background: #fff;
  border-radius: 999px;
  padding: 0.28rem 0.65rem;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 650;
  color: #5e4a6c;
  cursor: pointer;
}

.bpr__chip.is-active {
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  border-color: transparent;
  color: #fff;
}

.bpr__chip--done.is-active {
  background: linear-gradient(135deg, #95d1aa, #72a098);
}

.bpr__chip:disabled {
  opacity: 0.6;
  cursor: wait;
}

.bpr__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.1rem;
}

.bpr__btn {
  border-radius: 10px;
  padding: 0.55rem 0.95rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.bpr__btn--ghost {
  border: 1px solid #dccfee;
  background: #fff;
  color: #6d5a7e;
}

.bpr__btn--primary {
  border: none;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  color: #fff;
}

.bpr__btn:disabled {
  opacity: 0.65;
  cursor: wait;
}

.bpr__hint {
  margin: 0.65rem 0 0;
  font-size: 0.78rem;
  color: #8a779c;
  text-align: right;
}

@media (min-width: 720px) {
  .bpr {
    align-items: center;
  }
  .bpr__card {
    border-radius: 18px;
  }
}
</style>
