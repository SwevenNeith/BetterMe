<script setup>
import { ref } from 'vue'
import { snapshotDisplayName } from '../../utils/sport/wgerExercise.js'

defineOptions({ name: 'SportTemplatesPanel' })

const props = defineProps({
  templates: { type: Array, default: () => [] },
  selectedTemplate: { type: Object, default: null },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['refresh', 'create', 'start', 'duplicate', 'delete', 'edit'])

const draftName = ref('')

function createEmpty() {
  const name = draftName.value.trim() || 'Nouvelle séance'
  emit('create', {
    name,
    description: '',
    exercises: [],
  })
  draftName.value = ''
}

function confirmDelete(id) {
  if (window.confirm('Supprimer ce modèle ?')) emit('delete', id)
}
</script>

<template>
  <section class="stp" aria-label="Séances enregistrées">
    <div class="stp__create">
      <input v-model="draftName" class="stp-input" placeholder="Nom de la séance" />
      <button type="button" class="stp-btn stp-btn--primary" @click="createEmpty">Créer vide</button>
      <button type="button" class="stp-btn" :disabled="loading" @click="emit('refresh')">Actualiser</button>
    </div>

    <p v-if="loading" class="stp__muted">Chargement…</p>
    <p v-else-if="!templates.length" class="stp__muted">
      Aucun modèle pour l’instant. Utilise le générateur ou crée une séance vide.
    </p>

    <ul v-else class="stp__list">
      <li v-for="t in templates" :key="t.id" class="stp-card">
        <button type="button" class="stp-card__select" @click="emit('edit', t.id)">
          <strong>{{ t.name }}</strong>
          <span class="stp__muted">
            {{ t.estimated_duration_min ? `~${t.estimated_duration_min} min` : 'Durée —' }}
          </span>
        </button>
        <div class="stp-card__actions">
          <button type="button" class="stp-btn stp-btn--primary" @click="emit('start', t.id)">Démarrer</button>
          <button type="button" class="stp-btn" @click="emit('duplicate', t.id)">Dupliquer</button>
          <button type="button" class="stp-btn stp-btn--danger" @click="confirmDelete(t.id)">
            Supprimer
          </button>
        </div>
      </li>
    </ul>

    <div v-if="selectedTemplate?.exercises" class="stp__detail">
      <h3 class="stp__detail-title">{{ selectedTemplate.name }}</h3>
      <p v-if="selectedTemplate.description" class="stp__muted">{{ selectedTemplate.description }}</p>
      <ol class="stp__ex">
        <li v-for="ex in selectedTemplate.exercises" :key="ex.id">
          {{ snapshotDisplayName(ex.snapshot) }}
          · {{ ex.target_sets }}×{{ ex.target_reps ?? '?' }}
          <template v-if="ex.target_weight != null"> · {{ ex.target_weight }}{{ ex.weight_unit }}</template>
        </li>
      </ol>
      <p v-if="!selectedTemplate.exercises.length" class="stp__muted">
        Modèle vide — ajoute des exercices via le catalogue (+ Séance) ou le générateur.
      </p>
    </div>
  </section>
</template>

<style scoped>
.stp__create {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.85rem;
}
.stp-input {
  flex: 1;
  min-width: 12rem;
  border: 1px solid rgba(213, 181, 234, 0.4);
  border-radius: 10px;
  padding: 0.5rem 0.65rem;
  font: inherit;
  font-weight: 600;
}
.stp__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
}
.stp-card {
  border: 1px solid rgba(213, 181, 234, 0.3);
  border-radius: 12px;
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.55);
  display: grid;
  gap: 0.5rem;
}
.stp-card__select {
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font: inherit;
  color: inherit;
  padding: 0;
}
.stp-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.stp-btn {
  border: 1px solid rgba(213, 181, 234, 0.45);
  background: rgba(255, 255, 255, 0.7);
  border-radius: 10px;
  padding: 0.4rem 0.7rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.stp-btn--primary {
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  border-color: transparent;
  color: #fff;
}
.stp-btn--danger {
  color: #c0392b;
}
.stp__muted {
  color: #6d5a7e;
  font-size: 0.88rem;
}
.stp__detail {
  margin-top: 1rem;
  padding: 0.85rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.3);
}
.stp__detail-title {
  margin: 0 0 0.35rem;
  font-size: 1.05rem;
}
.stp__ex {
  margin: 0.5rem 0 0;
  padding-left: 1.2rem;
  line-height: 1.5;
}
@media (max-width: 640px) {
  .stp__create {
    flex-direction: column;
  }
  .stp-input,
  .stp-btn {
    width: 100%;
    min-height: 2.5rem;
  }
  .stp-card__actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .stp-card__actions .stp-btn--danger {
    grid-column: 1 / -1;
  }
}
@media (prefers-color-scheme: dark) {
  .stp__muted {
    color: #c9b8d8;
  }
  .stp-card,
  .stp-input,
  .stp__detail {
    background: #2a2438;
    color: #f0e8f8;
    border-color: rgba(213, 181, 234, 0.22);
  }
  .stp-btn:not(.stp-btn--primary) {
    background: #2a2438;
    color: #f0e8f8;
    border-color: rgba(213, 181, 234, 0.25);
  }
  .stp__detail-title {
    color: #f0e8f8;
  }
}
</style>
