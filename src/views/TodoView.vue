<script setup>
import { ref } from 'vue'

let nextId = 1

const newItemText = ref('')
const items = ref([])

function addItem() {
  const text = newItemText.value.trim()
  if (!text) return

  items.value.push({
    id: nextId++,
    text,
    done: false,
  })
  newItemText.value = ''
}

function toggleItem(id) {
  const item = items.value.find((entry) => entry.id === id)
  if (item) item.done = !item.done
}

function onNewItemKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault()
    addItem()
  }
}
</script>

<template>
  <div class="todo-wrapper">
    <header class="todo-header">
      <h1 class="todo-title">TODO</h1>
      <p class="todo-subtitle">Liste de choses à faire.</p>
    </header>

    <section class="todo-card" aria-label="Liste des tâches">
      <form class="todo-add" @submit.prevent="addItem">
        <input
          v-model="newItemText"
          type="text"
          class="todo-add__input"
          placeholder="Nouvel élément…"
          aria-label="Texte du nouvel élément"
          @keydown="onNewItemKeydown"
        />
        <button type="submit" class="todo-add__btn" :disabled="!newItemText.trim()">
          Ajouter
        </button>
      </form>

      <p v-if="!items.length" class="todo-empty">Aucun élément pour l’instant.</p>

      <ul v-else class="todo-list">
        <li v-for="item in items" :key="item.id" class="todo-item">
          <label class="todo-item__label" :class="{ 'todo-item__label--done': item.done }">
            <input
              type="checkbox"
              class="todo-item__checkbox"
              :checked="item.done"
              :aria-label="item.done ? `Marquer « ${item.text} » comme non fait` : `Marquer « ${item.text} » comme fait`"
              @change="toggleItem(item.id)"
            />
            <span class="todo-item__text">{{ item.text }}</span>
          </label>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.todo-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: none;
  min-width: 0;
  min-height: 100%;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
}

.todo-header {
  margin-bottom: 1.5rem;
  text-align: center;
}

.todo-title {
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
  margin: 0;
}

.todo-subtitle {
  margin: 0.5rem 0 0;
  color: #6c757d;
  font-size: 1rem;
}

.todo-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 0;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 16px;
  padding: 1.25rem;
  box-sizing: border-box;
}

.todo-add {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.todo-add__input {
  flex: 1;
  min-width: 0;
  padding: 0.65rem 0.85rem;
  border: 1px solid rgba(213, 181, 234, 0.45);
  border-radius: 10px;
  font-size: 0.95rem;
  font-weight: 500;
  color: #2c3e50;
  background: rgba(255, 255, 255, 0.85);
  box-sizing: border-box;
}

.todo-add__input:focus {
  outline: none;
  border-color: #ad81be;
  box-shadow: 0 0 0 3px rgba(173, 129, 190, 0.2);
}

.todo-add__btn {
  padding: 0.65rem 1rem;
  border: none;
  border-radius: 10px;
  font-size: 0.9rem;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.todo-add__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.todo-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  text-align: center;
  color: #8c98a4;
  font-size: 0.95rem;
  font-weight: 600;
  padding: 1rem 0.5rem;
}

.todo-list {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-height: 0;
  overflow-y: auto;
}

.todo-item {
  min-width: 0;
}

.todo-item__label {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.65rem 0.75rem;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.todo-item__label:hover {
  background: rgba(213, 181, 234, 0.1);
}

.todo-item__checkbox {
  flex-shrink: 0;
  width: 1.1rem;
  height: 1.1rem;
  margin-top: 0.15rem;
  accent-color: #ad81be;
  cursor: pointer;
}

.todo-item__text {
  flex: 1;
  min-width: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: #2c3e50;
  line-height: 1.4;
  word-break: break-word;
}

.todo-item__label--done .todo-item__text {
  color: #8c98a4;
  text-decoration: line-through;
}

@media (prefers-color-scheme: dark) {
  .todo-title {
    color: #f0e8f8;
  }

  .todo-subtitle,
  .todo-empty {
    color: #adb5bd;
  }

  .todo-card {
    background: rgba(35, 30, 48, 0.75);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .todo-add__input {
    color: #f0e8f8;
    background: rgba(25, 20, 35, 0.6);
    border-color: rgba(213, 181, 234, 0.25);
  }

  .todo-item__text {
    color: #f0e8f8;
  }

  .todo-item__label--done .todo-item__text {
    color: #8c98a4;
  }
}
</style>
