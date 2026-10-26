<script setup>
import {
  categoryLabelFr,
  equipmentLabelFr,
  muscleLabelFr,
} from '../../constants/sport/wger.js'

defineOptions({ name: 'SportExerciseCard' })

defineProps({
  exercise: { type: Object, required: true },
  favorite: { type: Boolean, default: false },
  showActions: { type: Boolean, default: true },
})

const emit = defineEmits(['details', 'favorite', 'add'])

function muscleLabel(ex) {
  const list = ex.muscles || []
  if (list.length) {
    return list
      .slice(0, 3)
      .map((m) => muscleLabelFr(m))
      .join(', ')
  }
  const ids = ex.muscleIds || ex.muscle_ids || []
  if (!ids.length) return '—'
  return ids.slice(0, 3).map((id) => muscleLabelFr(id)).join(', ')
}

function equipmentLabel(ex) {
  const list = ex.equipment || []
  if (list.length) {
    return list.map((e) => equipmentLabelFr(e)).join(', ')
  }
  const ids = ex.equipmentIds || ex.equipment_ids || []
  if (!ids.length) return 'Poids du corps'
  return ids.map((id) => equipmentLabelFr(id)).join(', ')
}
</script>

<template>
  <article class="sec">
    <div class="sec__media" aria-hidden="true">
      <img v-if="exercise.imageUrl || exercise.image_url" :src="exercise.imageUrl || exercise.image_url" :alt="''" class="sec__img" loading="lazy" />
      <div v-else class="sec__placeholder">{{ (exercise.name || '?').slice(0, 1) }}</div>
    </div>
    <div class="sec__body">
      <div class="sec__top">
        <h3 class="sec__title">{{ exercise.name }}</h3>
        <span v-if="exercise.source === 'custom'" class="sec__badge">Perso</span>
        <span v-else-if="exercise.languageCode === 'fr'" class="sec__badge sec__badge--muted">FR</span>
        <span v-else-if="exercise.languageCode === 'en'" class="sec__badge sec__badge--muted">EN</span>
      </div>
      <p class="sec__meta">
        {{ categoryLabelFr(exercise.categoryName || exercise.category_name) }}
      </p>
      <p class="sec__line"><strong>Muscles</strong> · {{ muscleLabel(exercise) }}</p>
      <p class="sec__line"><strong>Matériel</strong> · {{ equipmentLabel(exercise) }}</p>
      <p v-if="exercise.description" class="sec__desc">{{ exercise.description.slice(0, 140) }}{{ exercise.description.length > 140 ? '…' : '' }}</p>
      <div v-if="showActions" class="sec__actions">
        <button type="button" class="sec-btn" @click="emit('details', exercise)">Détails</button>
        <button type="button" class="sec-btn" :aria-pressed="favorite" @click="emit('favorite', exercise)">
          {{ favorite ? '★ Favori' : '☆ Favori' }}
        </button>
        <button type="button" class="sec-btn sec-btn--primary" @click="emit('add', exercise)">+ Séance</button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.sec {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 0.85rem;
  padding: 0.85rem;
  border-radius: 14px;
  border: 1px solid rgba(213, 181, 234, 0.35);
  background: rgba(255, 255, 255, 0.55);
}
.sec__media {
  width: 88px;
  height: 88px;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(173, 129, 190, 0.12);
}
.sec__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.sec__placeholder {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  font-size: 1.6rem;
  font-weight: 800;
  color: #8e6aa8;
}
.sec__top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}
.sec__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: #2c3e50;
}
.sec__badge {
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: rgba(173, 129, 190, 0.22);
  color: #5e4a6c;
}
.sec__badge--muted {
  background: rgba(143, 162, 212, 0.2);
  color: #4a5a7a;
}
.sec__meta,
.sec__line,
.sec__desc {
  margin: 0.25rem 0 0;
  font-size: 0.82rem;
  color: #6d5a7e;
  line-height: 1.35;
}
.sec__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.65rem;
}
.sec-btn {
  border: 1px solid rgba(213, 181, 234, 0.45);
  background: rgba(255, 255, 255, 0.7);
  color: #3b2a4a;
  border-radius: 10px;
  padding: 0.35rem 0.65rem;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}
.sec-btn--primary {
  background: linear-gradient(135deg, rgba(213, 181, 234, 0.55), rgba(173, 129, 190, 0.45));
  border-color: rgba(173, 129, 190, 0.5);
}
@media (max-width: 640px) {
  .sec {
    grid-template-columns: 64px minmax(0, 1fr);
    gap: 0.65rem;
    padding: 0.7rem;
  }
  .sec__media {
    width: 64px;
    height: 64px;
  }
  .sec__actions {
    gap: 0.35rem;
  }
  .sec-btn {
    min-height: 2.35rem;
    padding: 0.4rem 0.55rem;
  }
}
@media (prefers-color-scheme: dark) {
  .sec {
    background: rgba(35, 30, 48, 0.75);
    border-color: rgba(213, 181, 234, 0.22);
  }
  .sec__title {
    color: #f0e8f8;
  }
  .sec__meta,
  .sec__line,
  .sec__desc {
    color: #c9b8d8;
  }
  .sec__badge {
    color: #e9d5f5;
  }
  .sec-btn {
    background: #2a2438;
    color: #f0e8f8;
    border-color: rgba(213, 181, 234, 0.25);
  }
}
</style>
