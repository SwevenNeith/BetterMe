<script setup>
const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  prompts: {
    type: Array,
    default: () => [],
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
  error: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['close', 'select'])

function onSelect(prompt) {
  emit('select', prompt)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="journal-prompt-overlay" @click.self="emit('close')">
      <div class="journal-prompt-dialog" role="dialog" aria-modal="true" aria-labelledby="journal-prompt-title">
        <header class="journal-prompt-dialog__header">
          <div>
            <h2 id="journal-prompt-title" class="journal-prompt-dialog__title">Choisir ma prompt</h2>
            <p class="journal-prompt-dialog__hint">La prompt choisie remplacera le titre actuel.</p>
          </div>
          <button type="button" class="journal-prompt-dialog__close" aria-label="Fermer" @click="emit('close')">
            ✕
          </button>
        </header>

        <p v-if="error" class="journal-prompt-dialog__error">{{ error }}</p>
        <p v-else-if="isLoading" class="journal-prompt-dialog__status">Chargement…</p>
        <p v-else-if="!props.prompts.length" class="journal-prompt-dialog__status">
          Aucune prompt dans la table pour le moment.
        </p>

        <div v-else class="journal-prompt-dialog__table-wrap">
          <table class="journal-prompt-dialog__table">
            <thead>
              <tr>
                <th>Prompt</th>
                <th>Statut</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr v-for="prompt in props.prompts" :key="prompt.id">
                <td>{{ prompt.prompt_text }}</td>
                <td>
                  <span
                    class="journal-prompt-dialog__badge"
                    :class="prompt.isDone ? 'journal-prompt-dialog__badge--done' : 'journal-prompt-dialog__badge--pending'"
                  >
                    {{ prompt.isDone ? 'Fait' : 'Pas fait' }}
                  </span>
                </td>
                <td>
                  <button type="button" class="journal-prompt-dialog__pick" @click="onSelect(prompt)">
                    Choisir
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.journal-prompt-overlay {
  position: fixed;
  inset: 0;
  z-index: 1400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(20, 24, 32, 0.5);
  backdrop-filter: blur(4px);
}

.journal-prompt-dialog {
  width: min(96vw, 52rem);
  max-height: min(90vh, 42rem);
  overflow: auto;
  border-radius: 18px;
  border: 1px solid rgba(173, 129, 190, 0.35);
  background: linear-gradient(180deg, #fffefb 0%, #faf6ff 100%);
  box-shadow: 0 18px 50px rgba(92, 62, 112, 0.18);
  padding: 1rem 1.05rem 1.1rem;
  box-sizing: border-box;
}

.journal-prompt-dialog__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.85rem;
}

.journal-prompt-dialog__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: #3d2f4a;
}

.journal-prompt-dialog__hint,
.journal-prompt-dialog__status,
.journal-prompt-dialog__error {
  margin: 0.35rem 0 0;
  font-size: 0.88rem;
  color: #6c757d;
}

.journal-prompt-dialog__error {
  color: #b02a37;
  margin-bottom: 0.85rem;
}

.journal-prompt-dialog__close {
  border: none;
  background: transparent;
  color: #6c757d;
  cursor: pointer;
  font-size: 1rem;
}

.journal-prompt-dialog__table-wrap {
  overflow: auto;
}

.journal-prompt-dialog__table {
  width: 100%;
  border-collapse: collapse;
}

.journal-prompt-dialog__table th,
.journal-prompt-dialog__table td {
  padding: 0.75rem 0.6rem;
  text-align: left;
  border-bottom: 1px solid rgba(213, 181, 234, 0.24);
  vertical-align: top;
}

.journal-prompt-dialog__table th {
  font-size: 0.82rem;
  font-weight: 800;
  color: #8b7a96;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.journal-prompt-dialog__table td:first-child {
  color: #2c3e50;
  font-weight: 600;
}

.journal-prompt-dialog__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.28rem 0.55rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 800;
}

.journal-prompt-dialog__badge--done {
  background: rgba(149, 209, 170, 0.22);
  color: #3b7f55;
}

.journal-prompt-dialog__badge--pending {
  background: rgba(213, 181, 234, 0.22);
  color: #7a5f8a;
}

.journal-prompt-dialog__pick {
  padding: 0.5rem 0.8rem;
  border-radius: 10px;
  border: 1px solid rgba(173, 129, 190, 0.35);
  background: rgba(255, 255, 255, 0.9);
  color: #6b4f7c;
  font-weight: 700;
  cursor: pointer;
}
</style>
