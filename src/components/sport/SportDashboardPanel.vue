<script setup>
import { computed } from 'vue'
import { formatDuration } from '../../services/sport/sportStats.js'

defineOptions({ name: 'SportDashboardPanel' })

const props = defineProps({
  stats: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
})

const emit = defineEmits(['new-session', 'resume'])

const hasData = computed(() => (props.stats?.totalCompleted || 0) > 0 || props.stats?.activeSession)

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}
</script>

<template>
  <section class="sdp" aria-label="Tableau de bord sport">
    <p v-if="error" class="sdp__error" role="alert">{{ error }}</p>
    <p v-else-if="loading" class="sdp__muted">Chargement du résumé…</p>

    <template v-else-if="stats && hasData">
      <div class="sdp__grid">
        <article class="sdp-card">
          <p class="sdp-card__label">Cette semaine</p>
          <p class="sdp-card__value">
            {{ stats.weekSessionCount }} séance{{ stats.weekSessionCount > 1 ? 's' : '' }}
          </p>
          <p class="sdp-card__sub">{{ stats.weekDurationMin }} min cumulées</p>
        </article>
        <article class="sdp-card">
          <p class="sdp-card__label">Total</p>
          <p class="sdp-card__value">{{ stats.totalCompleted }}</p>
          <p class="sdp-card__sub">séances terminées</p>
        </article>
        <article class="sdp-card">
          <p class="sdp-card__label">Dernière séance</p>
          <p class="sdp-card__value sdp-card__value--sm">{{ stats.lastSession?.name || '—' }}</p>
          <p class="sdp-card__sub">{{ formatDate(stats.lastSession?.started_at) }}</p>
        </article>
        <article class="sdp-card">
          <p class="sdp-card__label">Objectif hebdo</p>
          <p class="sdp-card__value">
            {{ stats.weekSessionCount }}/{{ stats.weeklyGoal || '—' }}
          </p>
          <div
            v-if="stats.weeklyProgress != null"
            class="sdp-progress"
            role="progressbar"
            :aria-valuenow="Math.round(stats.weeklyProgress * 100)"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <span
              class="sdp-progress__bar"
              :style="{ width: `${Math.round(stats.weeklyProgress * 100)}%` }"
            />
          </div>
        </article>
      </div>

      <p v-if="stats.nextPlanned" class="sdp__planned">
        Prochaine planifiée · {{ stats.nextPlanned.name }} —
        {{ formatDate(stats.nextPlanned.planned_at) }}
      </p>
      <p v-if="stats.activeSession" class="sdp__active">
        Séance en cours · {{ stats.activeSession.name }}
        ({{ formatDuration(Math.round((stats.activeSession.active_elapsed_ms || 0) / 1000)) }})
      </p>
    </template>

    <div v-else class="sdp-empty">
      <p class="sdp-empty__title">Pas encore de séances enregistrées</p>
      <p class="sdp-empty__text">
        Utilise les onglets ci-dessus pour créer une séance, en générer une selon ton matériel, ou
        parcourir le catalogue.
      </p>
    </div>

    <div class="sdp__actions">
      <button
        v-if="stats?.activeSession"
        type="button"
        class="sdp-btn sdp-btn--primary"
        @click="emit('resume', stats.activeSession)"
      >
        Reprendre
      </button>
      <button type="button" class="sdp-btn sdp-btn--primary" @click="emit('new-session')">
        Nouvelle séance
      </button>
    </div>
  </section>
</template>

<style scoped>
.sdp__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.75rem;
}

.sdp-card {
  padding: 0.9rem 1rem;
  border-radius: 14px;
  border: 1px solid rgba(213, 181, 234, 0.28);
  background: rgba(255, 255, 255, 0.45);
}

.sdp-card__label {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 750;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6c757d;
}

.sdp-card__value {
  margin: 0.35rem 0 0;
  font-size: 1.55rem;
  font-weight: 800;
  color: #2c3e50;
}

.sdp-card__value--sm {
  font-size: 1.05rem;
}

.sdp-card__sub {
  margin: 0.2rem 0 0;
  font-size: 0.82rem;
  color: #6c757d;
}

.sdp-progress {
  margin-top: 0.55rem;
  height: 8px;
  border-radius: 999px;
  background: rgba(173, 129, 190, 0.18);
  overflow: hidden;
}

.sdp-progress__bar {
  display: block;
  height: 100%;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  border-radius: inherit;
}

.sdp__planned,
.sdp__active,
.sdp__muted {
  margin: 0.85rem 0 0;
  color: #6c757d;
  font-size: 0.92rem;
}

.sdp__active {
  font-weight: 700;
  color: #6b4f7c;
}

.sdp__error {
  margin: 0 0 0.75rem;
  padding: 0.65rem 0.8rem;
  border-radius: 10px;
  background: rgba(192, 57, 43, 0.1);
  color: #c0392b;
  font-weight: 650;
}

.sdp-empty {
  padding: 1.25rem;
  border-radius: 14px;
  border: 1px dashed rgba(213, 181, 234, 0.45);
  text-align: center;
  background: rgba(255, 255, 255, 0.35);
}

.sdp-empty__title {
  margin: 0;
  font-weight: 800;
  color: #2c3e50;
}

.sdp-empty__text {
  margin: 0.45rem auto 0;
  max-width: 32rem;
  color: #6c757d;
  line-height: 1.45;
}

.sdp__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1rem;
  justify-content: center;
}

.sdp-btn {
  border: 1px solid rgba(173, 129, 190, 0.35);
  background: rgba(255, 255, 255, 0.75);
  color: #6b4f7c;
  border-radius: 999px;
  padding: 0.55rem 1rem;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.sdp-btn:hover {
  background: rgba(213, 181, 234, 0.28);
}

.sdp-btn--primary {
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  border-color: transparent;
  color: #fff;
}

.sdp-btn--primary:hover {
  filter: brightness(1.03);
}

@media (prefers-color-scheme: dark) {
  .sdp-card,
  .sdp-empty {
    background: rgba(35, 30, 48, 0.55);
    border-color: rgba(213, 181, 234, 0.22);
  }
  .sdp-card__value,
  .sdp-empty__title {
    color: #f0e8f8;
  }
  .sdp-card__sub,
  .sdp__planned,
  .sdp__muted,
  .sdp-empty__text,
  .sdp-card__label {
    color: #adb5bd;
  }
  .sdp-btn {
    background: rgba(42, 36, 56, 0.9);
    color: #e9d5f5;
  }
}
</style>
