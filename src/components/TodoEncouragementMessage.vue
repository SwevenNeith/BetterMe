<script setup>
import { computed } from 'vue'
import { getTodoEncouragementCategory, getTodoEncouragementMessage } from '../utils/todoEncouragement.js'

const props = defineProps({
  stats: {
    type: Object,
    required: true,
  },
  dateIso: {
    type: String,
    default: '',
  },
})

const message = computed(() => getTodoEncouragementMessage(props.stats, props.dateIso))
const category = computed(() => getTodoEncouragementCategory(props.stats))
</script>

<template>
  <p
    v-if="message"
    class="todo-encouragement"
    :class="`todo-encouragement--${category}`"
    role="status"
  >
    {{ message }}
  </p>
</template>

<style scoped>
.todo-encouragement {
  margin: 0.75rem 0 0;
  padding: 0.65rem 0.85rem;
  border-radius: 12px;
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1.45;
  text-align: center;
  color: #6c757d;
  background: rgba(213, 181, 234, 0.1);
  border: 1px solid rgba(213, 181, 234, 0.22);
}

.todo-encouragement--complete {
  color: #3d8b5f;
  background: rgba(149, 209, 170, 0.14);
  border-color: rgba(149, 209, 170, 0.35);
}

.todo-encouragement--almost {
  color: #ad81be;
  background: rgba(213, 181, 234, 0.14);
  border-color: rgba(213, 181, 234, 0.32);
}

.todo-encouragement--halfway {
  color: #72a098;
  background: rgba(149, 209, 170, 0.1);
  border-color: rgba(149, 209, 170, 0.28);
}

.todo-encouragement--started {
  color: #7a8f9e;
}

.todo-encouragement--notStarted {
  color: #8c98a4;
}

.todo-encouragement--empty {
  color: #95a5a6;
  background: rgba(149, 165, 166, 0.1);
  border-color: rgba(149, 165, 166, 0.22);
}

@media (prefers-color-scheme: dark) {
  .todo-encouragement {
    color: #c8cdd2;
    background: rgba(213, 181, 234, 0.1);
    border-color: rgba(213, 181, 234, 0.18);
  }

  .todo-encouragement--complete {
    color: #95d1aa;
    background: rgba(149, 209, 170, 0.12);
    border-color: rgba(149, 209, 170, 0.28);
  }

  .todo-encouragement--almost {
    color: #d5b5ea;
    background: rgba(213, 181, 234, 0.12);
    border-color: rgba(213, 181, 234, 0.22);
  }

  .todo-encouragement--halfway {
    color: #a8d4be;
    background: rgba(149, 209, 170, 0.1);
    border-color: rgba(149, 209, 170, 0.22);
  }

  .todo-encouragement--started,
  .todo-encouragement--notStarted {
    color: #adb5bd;
  }

  .todo-encouragement--empty {
    color: #adb5bd;
    background: rgba(149, 165, 166, 0.08);
    border-color: rgba(149, 165, 166, 0.18);
  }
}
</style>
