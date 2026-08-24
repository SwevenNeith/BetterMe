<script setup>
/**
 * Layout minimal pour les iframes du Plan de Travail.
 * Pas de sidebar : chaque panneau est une app « pleine ».
 */
</script>

<template>
  <div class="embed-layout">
    <RouterView />
  </div>
</template>

<style scoped>
.embed-layout {
  min-height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
  background-color: #f9f6fd;
  overflow-x: hidden;
}

@media (prefers-color-scheme: dark) {
  .embed-layout {
    background-color: #1a1724;
  }
}
</style>
