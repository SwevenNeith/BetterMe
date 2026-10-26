<script setup>
import { computed, isRef, ref, watch } from 'vue'

defineOptions({ name: 'SportProfilePanel' })

const props = defineProps({
  profile: { type: Object, default: null },
  muscles: { type: Array, default: () => [] },
  equipment: { type: Array, default: () => [] },
  refsLoading: { type: Boolean, default: false },
  refsError: { type: String, default: '' },
  saving: { type: Boolean, default: false },
})

const emit = defineEmits(['save', 'reload-refs'])

const goals = ref('')
const weeklyGoal = ref(3)
const typicalDuration = ref(45)
const weightUnit = ref('kg')
const priorityMuscles = ref([])
const homeEq = ref([])
const gymEq = ref([])
const unavailableEq = ref([])

const listByKey = {
  muscles: priorityMuscles,
  home: homeEq,
  gym: gymEq,
  unavailable: unavailableEq,
}

watch(
  () => props.profile,
  (p) => {
    if (!p) return
    goals.value = p.goals || ''
    weeklyGoal.value = Number(p.weekly_sessions_goal) || 3
    typicalDuration.value = Number(p.typical_duration_min) || 45
    weightUnit.value = p.weight_unit || 'kg'
    priorityMuscles.value = [...(p.priority_muscle_ids || [])].map(Number)
    homeEq.value = [...(p.home_equipment_ids || [])].map(Number)
    gymEq.value = [...(p.gym_equipment_ids || [])].map(Number)
    unavailableEq.value = [...(p.unavailable_equipment_ids || [])].map(Number)
  },
  { immediate: true },
)

const availableCombined = computed(() => {
  const set = new Set([...homeEq.value, ...gymEq.value])
  return [...set]
})

/**
 * @param {'muscles'|'home'|'gym'|'unavailable'} key
 * @param {number|string} id
 */
function toggle(key, id) {
  const listRef = listByKey[key]
  if (!isRef(listRef)) return
  const n = Number(id)
  if (!Number.isFinite(n)) return
  const current = Array.isArray(listRef.value) ? listRef.value : []
  const arr = [...current]
  const idx = arr.indexOf(n)
  if (idx >= 0) arr.splice(idx, 1)
  else arr.push(n)
  listRef.value = arr
}

function save() {
  emit('save', {
    goals: goals.value.trim() || null,
    weekly_sessions_goal: Number(weeklyGoal.value) || 0,
    typical_duration_min: Number(typicalDuration.value) || 45,
    weight_unit: weightUnit.value,
    priority_muscle_ids: priorityMuscles.value,
    home_equipment_ids: homeEq.value,
    gym_equipment_ids: gymEq.value,
    unavailable_equipment_ids: unavailableEq.value,
  })
}
</script>

<template>
  <section class="spp" aria-label="Profil sportif">
    <p class="spp__intro">
      Toutes les infos sont optionnelles. Le générateur et les filtres s’en serviront si tu les
      renseignes. Aucune donnée médicale n’est collectée.
    </p>

    <label class="spp-field">
      Objectifs
      <textarea
        v-model="goals"
        class="spp-input"
        rows="3"
        placeholder="Ex. reprise force, mobilité…"
      />
    </label>

    <div class="spp__row">
      <label class="spp-field">
        Séances / semaine
        <input v-model.number="weeklyGoal" class="spp-input" type="number" min="0" max="14" />
      </label>
      <label class="spp-field">
        Durée habituelle (min)
        <input
          v-model.number="typicalDuration"
          class="spp-input"
          type="number"
          min="5"
          max="300"
        />
      </label>
      <label class="spp-field">
        Unité de charge
        <select v-model="weightUnit" class="spp-input">
          <option value="kg">kg</option>
          <option value="lb">lb</option>
        </select>
      </label>
    </div>

    <p v-if="refsLoading" class="spp__muted">Chargement du catalogue Wger (muscles / matériel)…</p>
    <p v-else-if="refsError" class="spp__error" role="alert">
      {{ refsError }}
      <button type="button" class="spp-link" @click="emit('reload-refs')">Réessayer</button>
    </p>
    <p v-else class="spp__muted">
      Catalogue Wger · {{ muscles.length }} muscle(s), {{ equipment.length }} équipement(s)
      <button type="button" class="spp-link" @click="emit('reload-refs')">Rafraîchir</button>
    </p>

    <fieldset class="spp-set">
      <legend>Muscles prioritaires</legend>
      <div v-if="muscles.length" class="spp-chips">
        <button
          v-for="m in muscles"
          :key="m.id"
          type="button"
          class="spp-chip"
          :class="{ 'spp-chip--on': priorityMuscles.includes(m.id) }"
          :aria-pressed="priorityMuscles.includes(m.id)"
          @click="toggle('muscles', m.id)"
        >
          {{ m.name }}
        </button>
      </div>
      <p v-else class="spp__muted">Aucun muscle chargé.</p>
    </fieldset>

    <fieldset class="spp-set">
      <legend>Matériel à la maison</legend>
      <p class="spp__hint">Liste complète fournie par Wger (pas de filtre local).</p>
      <div v-if="equipment.length" class="spp-chips">
        <button
          v-for="e in equipment"
          :key="`h-${e.id}`"
          type="button"
          class="spp-chip"
          :class="{ 'spp-chip--on': homeEq.includes(e.id) }"
          :aria-pressed="homeEq.includes(e.id)"
          @click="toggle('home', e.id)"
        >
          {{ e.name }}
        </button>
      </div>
      <p v-else class="spp__muted">Aucun équipement chargé.</p>
    </fieldset>

    <fieldset class="spp-set">
      <legend>Matériel en salle</legend>
      <div v-if="equipment.length" class="spp-chips">
        <button
          v-for="e in equipment"
          :key="`g-${e.id}`"
          type="button"
          class="spp-chip"
          :class="{ 'spp-chip--on': gymEq.includes(e.id) }"
          :aria-pressed="gymEq.includes(e.id)"
          @click="toggle('gym', e.id)"
        >
          {{ e.name }}
        </button>
      </div>
      <p v-else class="spp__muted">Aucun équipement chargé.</p>
    </fieldset>

    <fieldset class="spp-set">
      <legend>Matériel inaccessible</legend>
      <div v-if="equipment.length" class="spp-chips">
        <button
          v-for="e in equipment"
          :key="`u-${e.id}`"
          type="button"
          class="spp-chip"
          :class="{ 'spp-chip--on': unavailableEq.includes(e.id) }"
          :aria-pressed="unavailableEq.includes(e.id)"
          @click="toggle('unavailable', e.id)"
        >
          {{ e.name }}
        </button>
      </div>
      <p v-else class="spp__muted">Aucun équipement chargé.</p>
    </fieldset>

    <p class="spp__muted">
      Matériel cumulé utilisable (maison + salle) : {{ availableCombined.length }} /
      {{ equipment.length }} type(s).
    </p>

    <button type="button" class="spp-btn" :disabled="saving || !profile" @click="save">
      {{ saving ? 'Enregistrement…' : 'Enregistrer le profil' }}
    </button>
  </section>
</template>

<style scoped>
.spp__intro,
.spp__muted,
.spp__hint {
  margin: 0 0 1rem;
  color: #6c757d;
  line-height: 1.45;
  font-size: 0.92rem;
}

.spp__hint {
  margin: 0 0 0.55rem;
  font-size: 0.8rem;
}

.spp__error {
  margin: 0 0 1rem;
  color: #c0392b;
  font-weight: 650;
  font-size: 0.9rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.spp-link {
  border: none;
  background: transparent;
  color: #8e6aa8;
  font: inherit;
  font-weight: 750;
  font-size: 0.85rem;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
}

.spp__row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.65rem;
  margin-bottom: 0.85rem;
}

.spp-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: #6c757d;
  margin-bottom: 0.75rem;
}

.spp-input {
  border: 1px solid rgba(213, 181, 234, 0.4);
  border-radius: 10px;
  padding: 0.55rem 0.7rem;
  font: inherit;
  font-size: 0.95rem;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.85);
  color: #2c3e50;
  min-height: 2.6rem;
}

.spp-set {
  border: 1px solid rgba(213, 181, 234, 0.3);
  border-radius: 12px;
  padding: 0.75rem;
  margin: 0 0 0.85rem;
}

.spp-set legend {
  padding: 0 0.35rem;
  font-size: 0.85rem;
  font-weight: 800;
  color: #2c3e50;
}

.spp-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.spp-chip {
  border: 1px solid rgba(213, 181, 234, 0.4);
  background: rgba(255, 255, 255, 0.65);
  border-radius: 999px;
  padding: 0.42rem 0.75rem;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 650;
  cursor: pointer;
  color: #4a3a5c;
  min-height: 2.4rem;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.spp-chip--on {
  background: linear-gradient(135deg, rgba(213, 181, 234, 0.55), rgba(173, 129, 190, 0.45));
  border-color: rgba(173, 129, 190, 0.65);
  color: #3b2a4a;
}

.spp-btn {
  border: none;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  border-radius: 999px;
  padding: 0.7rem 1.15rem;
  font: inherit;
  font-weight: 750;
  cursor: pointer;
  color: #fff;
  min-height: 2.75rem;
  width: 100%;
  max-width: 22rem;
}

.spp-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .spp__row {
    grid-template-columns: 1fr;
  }

  .spp-chip {
    flex: 1 1 calc(50% - 0.45rem);
    text-align: center;
    justify-content: center;
  }

  .spp-btn {
    max-width: none;
  }
}

@media (prefers-color-scheme: dark) {
  .spp__intro,
  .spp__muted,
  .spp__hint,
  .spp-field {
    color: #adb5bd;
  }

  .spp-link {
    color: #d5b5ea;
  }

  .spp-input,
  .spp-chip {
    background: rgba(42, 36, 56, 0.95);
    color: #f0e8f8;
    border-color: rgba(213, 181, 234, 0.28);
  }

  .spp-set {
    border-color: rgba(213, 181, 234, 0.22);
    background: rgba(255, 255, 255, 0.03);
  }

  .spp-set legend {
    color: #f0e8f8;
  }

  .spp-chip--on {
    background: linear-gradient(135deg, rgba(213, 181, 234, 0.35), rgba(173, 129, 190, 0.4));
    color: #f8f0fc;
    border-color: rgba(213, 181, 234, 0.45);
  }
}
</style>
