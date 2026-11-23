<script setup>
import { computed } from 'vue'
import {
  COURSES_PRIORITES,
  COURSES_STATUT_LABELS,
} from '../../constants/courses/courses.js'
import { durabilityCardCaption } from '../../utils/courses/coursesDurability.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  article: { type: Object, default: null },
  saving: { type: Boolean, default: false },
})

const emit = defineEmits([
  'close',
  'edit',
  'add-to-list',
  'mark-purchased',
  'delete',
])

const imageUrl = computed(() => String(props.article?.lien_image || '').trim())
const priorite = computed(
  () => COURSES_PRIORITES.find((p) => p.id === props.article?.priorite) || null,
)
const qtyLabel = computed(() => {
  const a = props.article
  if (!a) return ''
  if (a.quantite != null && a.unite) return `${a.quantite} ${a.unite}`
  if (a.quantite != null) return String(a.quantite)
  if (a.unite) return a.unite
  return ''
})
const statutLabel = computed(
  () => COURSES_STATUT_LABELS[props.article?.statut] || props.article?.statut || '',
)
const dureeHint = computed(() =>
  props.article?.suivi_durabilite ? durabilityCardCaption(props.article) : '',
)
const onList = computed(() => Boolean(props.article?.liste_id))
</script>

<template>
  <Teleport to="body">
    <div v-if="open && article" class="cad-overlay" @click.self="emit('close')">
      <div
        class="cad-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="article.nom"
      >
        <header class="cad-header">
          <h2 class="cad-title">{{ article.nom }}</h2>
          <div class="cad-header-actions">
            <button
              type="button"
              class="cad-icon-btn"
              aria-label="Modifier l’article"
              :disabled="saving"
              @click="emit('edit', article)"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
            <button type="button" class="cad-icon-btn" aria-label="Fermer" @click="emit('close')">
              ✕
            </button>
          </div>
        </header>

        <div class="cad-body">
          <div class="cad-hero" :class="{ 'cad-hero--no-img': !imageUrl }">
            <img
              v-if="imageUrl"
              class="cad-img"
              :src="imageUrl"
              :alt="article.nom"
              loading="lazy"
            />
            <div class="cad-hero-text">
              <p v-if="article.marque" class="cad-marque">{{ article.marque }}</p>
              <p class="cad-statut">{{ statutLabel }}</p>
              <p v-if="qtyLabel" class="cad-meta">Quantité : {{ qtyLabel }}</p>
              <p v-if="article.prix != null" class="cad-meta">Prix : {{ article.prix }} €</p>
              <p v-if="priorite" class="cad-meta">Priorité : {{ priorite.label }}</p>
            </div>
          </div>

          <dl class="cad-facts">
            <div v-if="article.magasin">
              <dt>Magasin</dt>
              <dd>{{ article.magasin.nom }}</dd>
            </div>
            <div v-if="article.categorie">
              <dt>Rayon</dt>
              <dd>{{ article.categorie.icone }} {{ article.categorie.nom }}</dd>
            </div>
            <div v-if="article.liste">
              <dt>Liste</dt>
              <dd>{{ article.liste.nom }}</dd>
            </div>
            <div v-else>
              <dt>Liste</dt>
              <dd class="cad-muted">Pas encore sur une liste</dd>
            </div>
          </dl>

          <p v-if="article.note" class="cad-note">{{ article.note }}</p>
          <p v-if="dureeHint" class="cad-duree">{{ dureeHint }}</p>

          <a
            v-if="article.lien"
            class="cad-link"
            :href="article.lien"
            target="_blank"
            rel="noopener noreferrer"
          >
            Ouvrir le lien de l’article
          </a>
        </div>

        <div class="cad-actions">
          <button
            type="button"
            class="cad-btn cad-btn--primary"
            :disabled="saving"
            @click="emit('add-to-list', article)"
          >
            {{ onList ? 'Changer de liste' : 'Ajouter à la liste de courses' }}
          </button>
          <button
            type="button"
            class="cad-btn"
            :disabled="saving || article.statut === 'achete'"
            @click="emit('mark-purchased', article)"
          >
            Je viens de l’acheter
          </button>
          <button
            type="button"
            class="cad-btn cad-btn--danger"
            :disabled="saving"
            @click="emit('delete', article)"
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cad-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: end center;
  background: rgba(20, 20, 30, 0.45);
}

@media (min-width: 640px) {
  .cad-overlay {
    place-items: center;
    padding: 1rem;
  }
}

.cad-modal {
  width: min(100%, 28rem);
  max-height: min(94vh, 40rem);
  overflow: auto;
  background: var(--color-background);
  border-radius: 18px 18px 0 0;
  border: 1px solid var(--color-border);
}

@media (min-width: 640px) {
  .cad-modal {
    border-radius: 18px;
  }
}

.cad-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 1.1rem 0.5rem;
  position: sticky;
  top: 0;
  background: var(--color-background);
  z-index: 1;
}

.cad-title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 800;
  line-height: 1.25;
}

.cad-header-actions {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}

.cad-icon-btn {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  display: grid;
  place-items: center;
}

.cad-icon-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.cad-body {
  padding: 0.35rem 1.1rem 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.cad-hero {
  display: flex;
  gap: 0.85rem;
  align-items: center;
}

.cad-img {
  width: 4.5rem;
  height: 4.5rem;
  object-fit: cover;
  border-radius: 14px;
  border: 1px solid var(--color-border);
  flex-shrink: 0;
}

.cad-hero--no-img {
  align-items: flex-start;
}

.cad-marque {
  margin: 0;
  font-style: italic;
  color: var(--color-text-light);
}

.cad-statut {
  margin: 0.15rem 0 0;
  font-weight: 750;
}

.cad-meta {
  margin: 0.15rem 0 0;
  font-size: 0.88rem;
  color: var(--color-text-light);
}

.cad-facts {
  margin: 0;
  display: grid;
  gap: 0.45rem;
}

.cad-facts > div {
  display: grid;
  grid-template-columns: 5.5rem 1fr;
  gap: 0.4rem;
  font-size: 0.9rem;
}

.cad-facts dt {
  color: var(--color-text-light);
  font-weight: 700;
}

.cad-facts dd {
  margin: 0;
  font-weight: 600;
}

.cad-muted {
  color: var(--color-text-light);
  font-weight: 500 !important;
}

.cad-note,
.cad-duree {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.4;
  color: var(--color-text-light);
}

.cad-link {
  color: var(--color-primary-dark);
  font-weight: 700;
  font-size: 0.9rem;
}

.cad-actions {
  padding: 0.5rem 1.1rem 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.cad-btn {
  min-height: 48px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  font-weight: 750;
  cursor: pointer;
}

.cad-btn--primary {
  border: none;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  color: #2c3e50;
}

.cad-btn--danger {
  border-color: color-mix(in srgb, #c07878 50%, var(--color-border));
}

.cad-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
