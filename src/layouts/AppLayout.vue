<script setup>
import { RouterView } from 'vue-router';
import AppSidebar from '../components/Sidebar.vue';
</script>

<template>
  <div class="app-layout">
    <AppSidebar />
    <main class="app-content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  min-height: 100vh;
  width: 100%;
  background-color: #f9f6fd;
  overflow-x: hidden;
}

@media (prefers-color-scheme: dark) {
  .app-layout {
    background-color: #1a1724;
  }
}

.app-content {
  /* Offset for the sidebar width on desktop */
  margin-left: 260px;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  transition: margin-left 0.3s ease;
}

/* On mobile, sidebar is overlaid — no margin needed */
@media (max-width: 768px) {
  .app-content {
    margin-left: 0;
    /* Push content down a bit so it's not behind the hamburger */
    padding-top: 3.5rem;
  }
}
</style>
