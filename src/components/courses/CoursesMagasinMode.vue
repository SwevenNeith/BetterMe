<script setup>
import { computed, ref } from 'vue'
import { COURSES_STATUTS } from '../../constants/courses/courses.js'

const props = defineProps({
  magasins: { type: Array, default: () => [] },
  selectedMagasinId: { type: String, default: null },
  groups: { type: Array, default: () => [] },
  checkedArticles: { type: Array, default: () => [] },
  progress: { type: Object, default: () => ({ done: 0, total: 0, label: '0 sur 0' }) },
  canFinish: { type: Boolean, default: false },
  pendingFinishArticles: { type: Array, default: () => [] },
  bagOpen: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update:selectedMagasinId',
  'update:bagOpen',
  'toggle',
  'finish',
  'clear-bag',
  'open-article',
])

const confirmOpen = ref(false)
const updateDurabilite = ref(true)

const hasDurabilityChecked = computed(() =>
  props.pendingFinishArticles.some((a) => a.suivi_durabilite),
)

const selectedMagasin = computed(() =>
  props.magasins.find((m) => m.id === props.selectedMagasinId) || null,
)

function askFinish() {
  if (!props.canFinish) return
  if (hasDurabilityChecked.value) {
    updateDurabilite.value = true
    confirmOpen.value = true
    return
  }
  emit('finish', { updateDurabilite: false })
}

function confirmFinish() {
  confirmOpen.value = false
  emit('finish', { updateDurabilite: updateDurabilite.value })
}

function qtyLabel(article) {
  const q = article.quantite
  const u = article.unite
  if (u) return `${q} ${u}`
  if (Number(q) !== 1) return String(q)
  return ''
}
</script>

<template>
  <div class="courses-shop">
    <label class="courses-shop__select-label">
      Magasin
      <select
        class="courses-shop__select"
        :value="selectedMagasinId || ''"
        @change="emit('update:selectedMagasinId', $event.target.value || null)"
      >
        <option value="" disabled>Choisir un magasin…</option>
        <option v-for="m in magasins" :key="m.id" :value="m.id">{{ m.nom }}</option>
      </select>
    </label>

    <p v-if="!selectedMagasinId" class="courses-shop__hint">
      Choisis un magasin pour afficher la liste tactile, regroupée par rayon.
    </p>

    <template v-else>
      <div class="courses-shop__progress" role="status">
        <span class="courses-shop__progress-label">{{ progress.label }}</span>
        <span
          class="courses-shop__progress-bar"
          role="progressbar"
          :aria-valuenow="progress.done"
          :aria-valuemin="0"
          :aria-valuemax="progress.total || 1"
          :aria-label="progress.label"
        >
          <span
            class="courses-shop__progress-fill"
            :style="{
              width: progress.total
                ? `${Math.round((progress.done / progress.total) * 100)}%`
                : '0%',
            }"
          />
        </span>
      </div>

      <p v-if="!groups.length && !checkedArticles.length" class="courses-shop__empty">
        Rien à prendre dans {{ selectedMagasin?.nom || 'ce magasin' }} pour le moment.
      </p>

      <section
        v-for="group in groups"
        :key="group.key"
        class="courses-shop__group"
      >
        <h3 class="courses-shop__rayon">{{ group.title }}</h3>
        <ul class="courses-shop__list">
          <li v-for="article in group.articles" :key="article.id">
            <label class="courses-shop__row">
              <input
                type="checkbox"
                class="courses-shop__check"
                :checked="false"
                :disabled="saving"
                @change="emit('toggle', article, COURSES_STATUTS.ACHETE)"
              />
              <button
                type="button"
                class="courses-shop__main"
                @click="emit('open-article', article)"
              >
                <span class="courses-shop__icone" aria-hidden="true">{{ article.icone || '🛒' }}</span>
                <span class="courses-shop__text">
                  <span class="courses-shop__nom">{{ article.nom }}</span>
                  <span v-if="qtyLabel(article)" class="courses-shop__qty">{{ qtyLabel(article) }}</span>
                </span>
              </button>
            </label>
          </li>
        </ul>
      </section>

      <div class="courses-shop__actions">
        <button
          type="button"
          class="courses-shop__finish"
          :disabled="saving || !canFinish"
          @click="askFinish"
        >
          Terminer les courses
        </button>
      </div>

      <section v-if="checkedArticles.length" class="courses-shop__bag">
        <button
          type="button"
          class="courses-shop__bag-toggle"
          :aria-expanded="bagOpen"
          @click="emit('update:bagOpen', !bagOpen)"
        >
          <span>Déjà dans le sac ({{ checkedArticles.length }})</span>
          <span aria-hidden="true">{{ bagOpen ? '▾' : '▸' }}</span>
        </button>
        <div v-show="bagOpen" class="courses-shop__bag-body">
          <ul class="courses-shop__list">
            <li v-for="article in checkedArticles" :key="article.id">
              <label class="courses-shop__row courses-shop__row--done">
                <input
                  type="checkbox"
                  class="courses-shop__check"
                  checked
                  :disabled="saving"
                  @change="emit('toggle', article, COURSES_STATUTS.A_ACHETER)"
                />
                <span class="courses-shop__main courses-shop__main--static">
                  <span class="courses-shop__icone" aria-hidden="true">{{ article.icone || '🛒' }}</span>
                  <span class="courses-shop__text">
                    <span class="courses-shop__nom">{{ article.nom }}</span>
                    <span v-if="article.suivi_durabilite" class="courses-shop__tag">durée de vie</span>
                  </span>
                </span>
              </label>
            </li>
          </ul>
          <button
            type="button"
            class="courses-shop__clear"
            :disabled="saving"
            @click="emit('clear-bag')"
          >
            Vider le sac
          </button>
          <p class="courses-shop__clear-hint">
            Les articles avec suivi de durée de vie sont conservés.
          </p>
        </div>
      </section>
    </template>

    <div v-if="confirmOpen" class="courses-shop__modal" role="dialog" aria-modal="true">
      <div class="courses-shop__modal-card">
        <h3>Mettre à jour la durée de vie ?</h3>
        <p>
          Certains articles cochés ont un suivi de durée de vie. Veux-tu enregistrer
          aujourd’hui comme date du dernier achat ?
        </p>
        <label class="courses-shop__modal-check">
          <input v-model="updateDurabilite" type="checkbox" />
          Oui, mettre à jour la date du dernier achat
        </label>
        <div class="courses-shop__modal-actions">
          <button type="button" class="courses-shop__modal-cancel" @click="confirmOpen = false">
            Annuler
          </button>
          <button type="button" class="courses-shop__finish" @click="confirmFinish">
            Confirmer
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.courses-shop__select-label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--color-text-light);
  margin-bottom: 1rem;
}

.courses-shop__select {
  min-height: 48px;
  padding: 0.55rem 0.75rem;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
  font-size: 1rem;
}

.courses-shop__hint,
.courses-shop__empty {
  color: var(--color-text-light);
  line-height: 1.45;
}

.courses-shop__progress {
  margin-bottom: 1rem;
}

.courses-shop__progress-label {
  display: block;
  font-weight: 800;
  margin-bottom: 0.35rem;
}

.courses-shop__progress-bar {
  display: block;
  height: 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-border) 80%, transparent);
  overflow: hidden;
}

.courses-shop__progress-fill {
  display: block;
  height: 100%;
  background: color-mix(in srgb, var(--color-tertiary) 70%, var(--color-primary-dark));
  border-radius: inherit;
  transition: width 0.2s ease;
}

.courses-shop__group {
  margin-bottom: 1.1rem;
}

.courses-shop__rayon {
  margin: 0 0 0.45rem;
  font-size: 0.9rem;
  font-weight: 800;
  color: var(--color-text-light);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.courses-shop__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.courses-shop__row {
  display: flex;
  align-items: stretch;
  gap: 0.55rem;
  min-height: 52px;
  padding: 0.35rem 0.45rem;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-background) 90%, var(--color-primary) 10%);
}

.courses-shop__row--done {
  opacity: 0.62;
}

.courses-shop__check {
  width: 22px;
  height: 22px;
  margin: auto 0 auto 0.25rem;
  flex-shrink: 0;
  accent-color: var(--color-primary-dark);
}

.courses-shop__main {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
  min-height: 44px;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  padding: 0.25rem 0.35rem;
}

.courses-shop__main--static {
  cursor: default;
}

.courses-shop__icone {
  font-size: 1.4rem;
}

.courses-shop__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.courses-shop__nom {
  font-weight: 700;
  font-size: 1rem;
}

.courses-shop__qty,
.courses-shop__tag {
  font-size: 0.8rem;
  color: var(--color-text-light);
}

.courses-shop__actions {
  margin: 1.25rem 0;
}

.courses-shop__finish,
.courses-shop__clear {
  width: 100%;
  min-height: 48px;
  border-radius: 12px;
  border: none;
  font-weight: 800;
  cursor: pointer;
}

.courses-shop__finish {
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  color: #2c3e50;
}

.courses-shop__finish:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.courses-shop__bag {
  border-radius: 14px;
  border: 1px solid var(--color-border);
  overflow: hidden;
  margin-bottom: 1rem;
}

.courses-shop__bag-toggle {
  width: 100%;
  min-height: 48px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  border: none;
  background: color-mix(in srgb, var(--color-border) 35%, transparent);
  color: var(--color-text);
  font-weight: 700;
  cursor: pointer;
}

.courses-shop__bag-body {
  padding: 0.75rem;
}

.courses-shop__clear {
  margin-top: 0.75rem;
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.courses-shop__clear-hint {
  margin: 0.45rem 0 0;
  font-size: 0.78rem;
  color: var(--color-text-light);
}

.courses-shop__modal {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(20, 20, 30, 0.45);
}

.courses-shop__modal-card {
  width: min(100%, 22rem);
  padding: 1.25rem;
  border-radius: 16px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.2);
}

.courses-shop__modal-card h3 {
  margin: 0 0 0.5rem;
  font-size: 1.05rem;
}

.courses-shop__modal-card p {
  margin: 0 0 0.85rem;
  color: var(--color-text-light);
  font-size: 0.92rem;
  line-height: 1.4;
}

.courses-shop__modal-check {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  font-size: 0.9rem;
  margin-bottom: 1rem;
}

.courses-shop__modal-actions {
  display: flex;
  gap: 0.5rem;
}

.courses-shop__modal-cancel {
  flex: 1;
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.courses-shop__modal-actions .courses-shop__finish {
  flex: 1;
}
</style>
