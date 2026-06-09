<script setup>
import { ref } from 'vue'
import MoodScale from '../components/MoodScale.vue'
import MoodDetailsModal from '../components/MoodDetailsModal.vue'
import { useMoodSelection } from '../composables/useMoodSelection.js'

const { selectedMood, resetMood } = useMoodSelection()

const isModalOpen = ref(false)

function onMoodSelected() {
  isModalOpen.value = true
}

function onCancelModal() {
  isModalOpen.value = false
  resetMood()
}
</script>

<template>
  <div class="mood-wrapper">
    <header class="mood-header">
      <h1 class="mood-title">Humeurs</h1>
      <p class="mood-subtitle">Comment te sens-tu en ce moment ?</p>
    </header>

    <section class="mood-card" aria-labelledby="mood-scale-heading">
      <MoodScale :disabled="isModalOpen" @select="onMoodSelected" />
    </section>

    <MoodDetailsModal :open="isModalOpen" :mood="selectedMood" @cancel="onCancelModal" />
  </div>
</template>

<style scoped>
.mood-wrapper {
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
}

.mood-header {
  margin-bottom: 1.5rem;
  text-align: center;
}

.mood-title {
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
  margin: 0;
}

.mood-subtitle {
  margin: 0.5rem 0 0;
  color: #6c757d;
  font-size: 1rem;
}

@media (prefers-color-scheme: dark) {
  .mood-title {
    color: #f0e8f8;
  }
  .mood-subtitle {
    color: #adb5bd;
  }
}

.mood-card {
  width: 100%;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 16px;
  padding: 1.5rem 1rem 1.75rem;
  box-sizing: border-box;
}

@media (prefers-color-scheme: dark) {
  .mood-card {
    background: rgba(35, 30, 48, 0.75);
    border-color: rgba(213, 181, 234, 0.2);
  }
}
</style>
