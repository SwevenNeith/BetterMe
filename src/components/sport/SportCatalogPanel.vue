<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  EQUIPMENT_PRESET_FILTERS,
  WGER_LICENSE_NOTE,
} from '../../constants/sport/wger.js'
import {
  listWgerCategories,
  listWgerEquipment,
  listWgerMuscles,
  searchWgerExercises,
  getWgerExercise,
} from '../../services/sport/wgerApi.js'
import SportExerciseCard from './SportExerciseCard.vue'

defineOptions({ name: 'SportCatalogPanel' })

const props = defineProps({
  favoriteWgerIds: { type: Array, default: () => [] },
  customExercises: { type: Array, default: () => [] },
})

const emit = defineEmits(['favorite', 'add', 'refresh-favorites', 'create-custom'])

const search = ref('')
const debouncedSearch = ref('')
const muscleId = ref('')
const categoryId = ref('')
const equipmentPreset = ref('')
const favoritesOnly = ref(false)
const page = ref(1)
const pageSize = 24

const muscles = ref([])
const categories = ref([])
const equipment = ref([])
const results = ref([])
const totalCount = ref(0)
const hasMore = ref(false)
const loading = ref(false)
const loadingRefs = ref(false)
const error = ref('')
const detail = ref(null)
const detailOpen = ref(false)
const customName = ref('')
const customDesc = ref('')

let debounceTimer = null
let abortController = null

const favoriteSet = computed(() => new Set((props.favoriteWgerIds || []).map(Number)))

const equipmentIdForApi = computed(() => {
  const preset = equipmentPreset.value
  if (!preset || preset === 'favorites') return null
  const ids = EQUIPMENT_PRESET_FILTERS[preset]
  return ids?.[0] ?? null
})

async function loadRefs(force = false) {
  loadingRefs.value = true
  try {
    const [m, c, e] = await Promise.all([
      listWgerMuscles({ bypassCache: force }),
      listWgerCategories({ bypassCache: force }),
      listWgerEquipment({ bypassCache: force }),
    ])
    muscles.value = m
    categories.value = c
    equipment.value = e
  } catch (err) {
    error.value = err?.message || 'Impossible de charger les filtres Wger.'
  } finally {
    loadingRefs.value = false
  }
}

async function loadPage() {
  if (favoritesOnly.value) {
    results.value = []
    totalCount.value = 0
    hasMore.value = false
    return
  }
  abortController?.abort()
  abortController = new AbortController()
  loading.value = true
  error.value = ''
  try {
    const res = await searchWgerExercises({
      page: page.value,
      pageSize,
      search: debouncedSearch.value,
      muscleId: muscleId.value ? Number(muscleId.value) : null,
      categoryId: categoryId.value ? Number(categoryId.value) : null,
      equipmentId: equipmentIdForApi.value,
      signal: abortController.signal,
    })
    results.value = res.results
    totalCount.value = res.count
    hasMore.value = res.hasMore
  } catch (err) {
    if (err?.name === 'AbortError') return
    error.value = err?.message || 'Catalogue Wger indisponible.'
    results.value = []
  } finally {
    loading.value = false
  }
}

const displayed = computed(() => {
  if (favoritesOnly.value) {
    // Favoris = exercices stockés côté parent (custom + wger favoris déjà mappés)
    return (props.customExercises || [])
      .filter((ex) => ex.is_favorite)
      .map((row) => ({
        id: row.wger_id || row.id,
        wger_id: row.wger_id,
        source: row.source,
        name: row.name,
        description: row.description || '',
        categoryName: row.category_name,
        muscles: (row.muscle_ids || []).map((id) => ({ id, name: String(id) })),
        equipment: (row.equipment_ids || []).map((id) => ({ id, name: String(id) })),
        muscleIds: row.muscle_ids || [],
        equipmentIds: row.equipment_ids || [],
        imageUrl: row.image_url,
        languageCode: row.language_code,
        dbId: row.id,
      }))
  }
  return results.value
})

function onSearchInput() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debouncedSearch.value = search.value.trim()
    page.value = 1
  }, 350)
}

watch([debouncedSearch, muscleId, categoryId, equipmentPreset, favoritesOnly, page], () => {
  void loadPage()
})

async function openDetails(ex) {
  detailOpen.value = true
  detail.value = { ...ex, loading: true }
  if (ex.source === 'custom' || !ex.id || String(ex.id).includes('-')) {
    detail.value = {
      ...ex,
      instructionsHtml: ex.instructions || '',
      loading: false,
    }
    return
  }
  try {
    const full = await getWgerExercise(ex.id)
    detail.value = { ...full, loading: false }
  } catch (err) {
    detail.value = {
      ...ex,
      loading: false,
      error: err?.message || 'Détail indisponible (Wger hors ligne).',
    }
  }
}

function submitCustom() {
  const name = customName.value.trim()
  if (!name) return
  emit('create-custom', {
    name,
    description: customDesc.value.trim() || null,
    is_favorite: true,
  })
  customName.value = ''
  customDesc.value = ''
}

onMounted(async () => {
  await loadRefs()
  await loadPage()
})

onUnmounted(() => {
  clearTimeout(debounceTimer)
  abortController?.abort()
})
</script>

<template>
  <section class="scp" aria-label="Catalogue d’exercices">
    <div class="scp__filters">
      <label class="scp-field">
        Recherche
        <input v-model="search" type="search" class="scp-input" placeholder="Nom d’exercice…" @input="onSearchInput" />
      </label>
      <label class="scp-field">
        Muscle
        <select v-model="muscleId" class="scp-input" :disabled="favoritesOnly">
          <option value="">Tous</option>
          <option v-for="m in muscles" :key="m.id" :value="String(m.id)">{{ m.name }}</option>
        </select>
      </label>
      <label class="scp-field">
        Catégorie
        <select v-model="categoryId" class="scp-input" :disabled="favoritesOnly">
          <option value="">Toutes</option>
          <option v-for="c in categories" :key="c.id" :value="String(c.id)">{{ c.name }}</option>
        </select>
      </label>
      <label class="scp-field">
        Matériel
        <select v-model="equipmentPreset" class="scp-input" :disabled="favoritesOnly">
          <option value="">Tous</option>
          <option value="none">Sans matériel</option>
          <option value="dumbbell">Haltères</option>
          <option value="barbell">Barre</option>
          <option value="kettlebell">Kettlebell</option>
          <option value="machines">Machines (câble)*</option>
        </select>
      </label>
      <label class="scp-check">
        <input v-model="favoritesOnly" type="checkbox" />
        Favoris uniquement
      </label>
    </div>
    <p class="scp__hint">
      * Wger n’expose pas de filtre « machines » générique : approximation via Cable machine.
      {{ WGER_LICENSE_NOTE }}
    </p>

    <p v-if="error" class="scp__error" role="alert">{{ error }}</p>
    <p v-else-if="loading || loadingRefs" class="scp__muted">Chargement…</p>
    <p v-else-if="!displayed.length" class="scp__muted">Aucun exercice pour ces filtres.</p>

    <ul v-else class="scp__list">
      <li v-for="ex in displayed" :key="`${ex.source || 'wger'}-${ex.dbId || ex.id}`">
        <SportExerciseCard
          :exercise="ex"
          :favorite="favoriteSet.has(Number(ex.wger_id || ex.id)) || Boolean(ex.is_favorite)"
          @details="openDetails"
          @favorite="emit('favorite', $event)"
          @add="emit('add', $event)"
        />
      </li>
    </ul>

    <form class="scp-custom" @submit.prevent="submitCustom">
      <h3 class="scp-custom__title">Exercice personnalisé</h3>
      <p class="scp__hint">Hors catalogue Wger — stocké dans Supabase, distinct des imports.</p>
      <input v-model="customName" class="scp-input" placeholder="Nom" required />
      <input v-model="customDesc" class="scp-input" placeholder="Description (optionnel)" />
      <button type="submit" class="scp-btn">Créer + favori</button>
    </form>

    <div v-if="!favoritesOnly && (page > 1 || hasMore)" class="scp__pager">
      <button type="button" class="scp-btn" :disabled="page <= 1 || loading" @click="page -= 1">
        Précédent
      </button>
      <span class="scp__muted">Page {{ page }} · {{ totalCount }} résultats</span>
      <button type="button" class="scp-btn" :disabled="!hasMore || loading" @click="page += 1">
        Suivant
      </button>
      <button type="button" class="scp-btn" :disabled="loading" @click="loadRefs(true); loadPage()">
        Rafraîchir
      </button>
    </div>

    <div v-if="detailOpen && detail" class="scp-modal" role="dialog" aria-modal="true" aria-label="Détail exercice">
      <div class="scp-modal__card">
        <button type="button" class="scp-modal__close" aria-label="Fermer" @click="detailOpen = false">×</button>
        <h3 class="scp-modal__title">{{ detail.name }}</h3>
        <p v-if="detail.loading" class="scp__muted">Chargement du détail…</p>
        <p v-else-if="detail.error" class="scp__error">{{ detail.error }}</p>
        <template v-else>
          <img
            v-if="detail.imageUrl"
            :src="detail.imageUrl"
            :alt="detail.name"
            class="scp-modal__img"
          />
          <p class="scp__line"><strong>Muscles</strong> · {{ (detail.muscles || []).map((m) => m.name).join(', ') || '—' }}</p>
          <p class="scp__line"><strong>Secondaires</strong> · {{ (detail.musclesSecondary || []).map((m) => m.name).join(', ') || '—' }}</p>
          <p class="scp__line"><strong>Matériel</strong> · {{ (detail.equipment || []).map((e) => e.name).join(', ') || 'Poids du corps' }}</p>
          <div
            v-if="detail.instructionsHtml"
            class="scp-modal__html"
            v-html="detail.instructionsHtml"
          />
          <p v-else-if="detail.description" class="scp-modal__text">{{ detail.description }}</p>
          <p v-else class="scp__muted">Pas d’instructions disponibles.</p>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.scp__filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.65rem;
  margin-bottom: 0.5rem;
}
.scp-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: #6d5a7e;
}
.scp-input {
  border: 1px solid rgba(213, 181, 234, 0.4);
  border-radius: 10px;
  padding: 0.5rem 0.65rem;
  font: inherit;
  font-size: 0.92rem;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.85);
  color: #2c3e50;
}
.scp-check {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.88rem;
  font-weight: 650;
  color: #5e4a6c;
  align-self: end;
  padding-bottom: 0.35rem;
}
.scp__hint {
  margin: 0 0 0.85rem;
  font-size: 0.75rem;
  color: #8a739c;
  line-height: 1.4;
}
.scp__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.65rem;
}
.scp-custom {
  margin: 1rem 0;
  padding: 0.85rem;
  border-radius: 12px;
  border: 1px dashed rgba(213, 181, 234, 0.5);
  display: grid;
  gap: 0.45rem;
}
.scp-custom__title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 800;
}
.scp__pager {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin-top: 1rem;
}
.scp-btn {
  border: 1px solid rgba(213, 181, 234, 0.45);
  background: rgba(255, 255, 255, 0.7);
  border-radius: 10px;
  padding: 0.4rem 0.7rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.scp__muted {
  color: #6d5a7e;
}
.scp__error {
  color: #c0392b;
  font-weight: 650;
}
.scp__line {
  margin: 0.35rem 0 0;
  font-size: 0.88rem;
  color: #5a4a66;
}
.scp-modal {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(20, 16, 28, 0.45);
  display: grid;
  place-items: center;
  padding: 1rem;
}
.scp-modal__card {
  position: relative;
  width: min(560px, 100%);
  max-height: min(85vh, 720px);
  overflow: auto;
  background: #fff;
  border-radius: 16px;
  padding: 1.15rem 1.1rem 1.25rem;
  border: 1px solid rgba(213, 181, 234, 0.35);
}
.scp-modal__close {
  position: absolute;
  top: 0.5rem;
  right: 0.6rem;
  border: none;
  background: transparent;
  font-size: 1.4rem;
  cursor: pointer;
  color: #6d5a7e;
}
.scp-modal__title {
  margin: 0 1.5rem 0.65rem 0;
  font-size: 1.2rem;
  font-weight: 800;
  color: #2c3e50;
}
.scp-modal__img {
  width: 100%;
  max-height: 220px;
  object-fit: contain;
  border-radius: 12px;
  margin-bottom: 0.65rem;
  background: rgba(173, 129, 190, 0.08);
}
.scp-modal__html :deep(ol),
.scp-modal__html :deep(ul) {
  padding-left: 1.2rem;
  margin: 0.4rem 0;
}
.scp-modal__html :deep(p),
.scp-modal__text {
  margin: 0.4rem 0;
  line-height: 1.5;
  color: #3b2a4a;
  font-size: 0.92rem;
}
@media (prefers-color-scheme: dark) {
  .scp-input,
  .scp-btn,
  .scp-modal__card {
    background: #2a2438;
    color: #f0e8f8;
    border-color: rgba(213, 181, 234, 0.25);
  }
  .scp-modal__title {
    color: #f0e8f8;
  }
}
</style>
