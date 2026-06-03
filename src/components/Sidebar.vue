<!-- eslint-disable vue/multi-word-component-names -->
<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '../lib/supabase.js'

const router = useRouter()
const route = useRoute()

const baseUrl = import.meta.env.BASE_URL || '/'

const userName = ref('')
const isOpen = ref(false)
const exercicesExpanded = ref(false)

onMounted(async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    userName.value = user.user_metadata?.nom ?? user.email
  }
})

const navLinksTop = [
  {
    name: 'Dashboard',
    path: '/dashboard',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-svg-icon"><rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect></svg>`,
  },
  {
    name: 'Emploi du temps',
    path: '/timetable',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-svg-icon"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`,
  },
]

const menstruationLink = {
  name: 'Menstruation',
  path: '/menstruation',
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-svg-icon"><path d="M12 22a7 7 0 0 0 7-7c0-5-7-13-7-13S5 10 5 15a7 7 0 0 0 7 7z"></path></svg>`,
}

const exercicesGroup = {
  name: 'Exercices',
  path: '/exercices',
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-svg-icon"><path d="M6.5 6a2.5 2.5 0 0 0 0 5H8"></path><path d="M17.5 13a2.5 2.5 0 0 0 0-5H16"></path><line x1="8" y1="8.5" x2="16" y2="15.5"></line><line x1="16" y1="8.5" x2="8" y2="15.5"></line></svg>`,
  children: [
    {
      name: 'Humeurs',
      path: '/mood',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-svg-icon"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>`,
    },
  ],
}

const settingsLink = {
  name: 'Réglages',
  path: '/settings',
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-svg-icon"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
}

const isActive = (path) => route.path === path

function isInExercicesSection(path) {
  if (path === exercicesGroup.path) return true
  return exercicesGroup.children.some((child) => path === child.path)
}

watch(
  () => route.path,
  (path) => {
    exercicesExpanded.value = isInExercicesSection(path)
  },
  { immediate: true },
)

const toggleExercicesChevron = () => {
  exercicesExpanded.value = !exercicesExpanded.value
}

const goToExercices = () => {
  navigate(exercicesGroup.path)
}

const navigate = (path) => {
  router.push(path)
  isOpen.value = false
}

const handleLogout = async () => {
  await supabase.auth.signOut()
  router.push('/')
}

const toggleSidebar = () => {
  isOpen.value = !isOpen.value
}
</script>

<template>
  <!-- Hamburger button (mobile only) -->
  <button
    class="hamburger"
    @click="toggleSidebar"
    :class="{ 'is-open': isOpen }"
    aria-label="Ouvrir le menu"
  >
    <span></span>
    <span></span>
    <span></span>
  </button>

  <!-- Overlay (mobile) -->
  <div class="sidebar-overlay" :class="{ visible: isOpen }" @click="isOpen = false"></div>

  <!-- Sidebar -->
  <aside class="sidebar" :class="{ 'sidebar--open': isOpen }">
    <!-- Brand -->
    <div class="sidebar-brand">
      <div class="brand-logo-wrapper">
        <img :src="baseUrl + 'icon-512.png'" alt="BetterMe" class="brand-logo" />
      </div>
      <div class="brand-text">
        <span class="brand-name">BetterMe</span>
        <span class="brand-user">{{ userName }}</span>
      </div>
    </div>

    <div class="sidebar-divider"></div>

    <!-- Navigation -->
    <nav class="sidebar-nav">
      <button
        v-for="link in navLinksTop"
        :key="link.path"
        type="button"
        class="nav-link"
        :class="{ 'nav-link--active': isActive(link.path) }"
        @click="navigate(link.path)"
      >
        <span class="nav-icon" v-html="link.icon"></span>
        <span class="nav-label">{{ link.name }}</span>
        <span class="nav-indicator" v-if="isActive(link.path)"></span>
      </button>

      <!-- Exercices (menu dépliant) — après Emploi du temps -->
      <div class="nav-group">
        <div
          class="nav-group__header"
          :class="{
            'nav-group__header--active': isActive(exercicesGroup.path),
            'nav-group__header--open': exercicesExpanded,
          }"
        >
          <button
            type="button"
            class="nav-group__main"
            :class="{ 'nav-group__main--active': isActive(exercicesGroup.path) }"
            @click="goToExercices"
          >
            <span class="nav-icon" v-html="exercicesGroup.icon"></span>
            <span class="nav-label">{{ exercicesGroup.name }}</span>
            <span class="nav-indicator" v-if="isActive(exercicesGroup.path)"></span>
          </button>
          <button
            type="button"
            class="nav-chevron-btn"
            :class="{ 'nav-chevron-btn--open': exercicesExpanded }"
            :aria-expanded="exercicesExpanded"
            aria-controls="exercices-submenu"
            aria-label="Ouvrir ou fermer le sous-menu Exercices"
            @click.stop="toggleExercicesChevron"
          >
            <span class="nav-chevron" :class="{ 'nav-chevron--open': exercicesExpanded }">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </span>
          </button>
        </div>

        <div
          id="exercices-submenu"
          class="nav-group__children"
          :class="{ 'nav-group__children--open': exercicesExpanded }"
        >
          <div class="nav-group__children-inner">
            <button
              v-for="child in exercicesGroup.children"
              :key="child.path"
              type="button"
              class="nav-link nav-link--child"
              :class="{ 'nav-link--active': isActive(child.path) }"
              @click="navigate(child.path)"
            >
              <span class="nav-icon" v-html="child.icon"></span>
              <span class="nav-label">{{ child.name }}</span>
              <span class="nav-indicator" v-if="isActive(child.path)"></span>
            </button>
          </div>
        </div>
      </div>

      <button
        type="button"
        class="nav-link"
        :class="{ 'nav-link--active': isActive(menstruationLink.path) }"
        @click="navigate(menstruationLink.path)"
      >
        <span class="nav-icon" v-html="menstruationLink.icon"></span>
        <span class="nav-label">{{ menstruationLink.name }}</span>
        <span class="nav-indicator" v-if="isActive(menstruationLink.path)"></span>
      </button>
    </nav>

    <!-- Réglages + déconnexion (footer) -->
    <div class="sidebar-footer">
      <div class="sidebar-divider"></div>
      <button class="logout-btn" @click="handleLogout">
        <span class="nav-icon">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="sidebar-svg-icon"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
        </span>
        <span>Déconnexion</span>
      </button>
      <button
        class="nav-link footer-nav-link"
        :class="{ 'nav-link--active': isActive(settingsLink.path) }"
        @click="navigate(settingsLink.path)"
      >
        <span class="nav-icon" v-html="settingsLink.icon"></span>
        <span class="nav-label">{{ settingsLink.name }}</span>
        <span class="nav-indicator" v-if="isActive(settingsLink.path)"></span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
/* ─── Sidebar ─── */
.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  width: 260px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-right: 1px solid rgba(213, 181, 234, 0.3);
  box-shadow: 4px 0 24px rgba(173, 129, 190, 0.1);
  display: flex;
  flex-direction: column;
  z-index: 100;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@media (prefers-color-scheme: dark) {
  .sidebar {
    background: rgba(25, 20, 35, 0.95);
    border-right: 1px solid rgba(213, 181, 234, 0.15);
  }
}

/* ─── Brand block ─── */
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 1.75rem 1.25rem 1.5rem;
}

.brand-logo-wrapper {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(213, 181, 234, 0.35), rgba(149, 209, 170, 0.2));
  border: 1px solid rgba(213, 181, 234, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}

.brand-logo {
  width: 36px;
  height: 36px;
  object-fit: contain;
}

.brand-text {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.brand-name {
  font-size: 1.1rem;
  font-weight: 800;
  color: #ad81be;
  letter-spacing: -0.3px;
  line-height: 1.1;
}

.brand-user {
  font-size: 0.82rem;
  color: #72a098;
  font-weight: 500;
}

/* ─── Divider ─── */
.sidebar-divider {
  height: 1px;
  background: linear-gradient(to right, transparent, rgba(213, 181, 234, 0.4), transparent);
  margin: 0 1rem;
}

/* ─── Nav ─── */
.sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1rem 0.75rem;
  overflow-y: auto;
}

.nav-link {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.75rem 1rem;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: #6c757d;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
}

@media (prefers-color-scheme: dark) {
  .nav-link {
    color: #adb5bd;
  }
}

.nav-link:hover {
  background: rgba(213, 181, 234, 0.12);
  color: #ad81be;
  transform: translateX(3px);
}

.nav-link--active {
  background: linear-gradient(135deg, rgba(213, 181, 234, 0.2), rgba(149, 209, 170, 0.1));
  color: #ad81be;
  font-weight: 700;
  border: 1px solid rgba(213, 181, 234, 0.3);
}

.nav-icon {
  font-size: 1.1rem;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sidebar-svg-icon,
:deep(.sidebar-svg-icon) {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  transition: stroke 0.2s ease;
}

.nav-label {
  flex: 1;
}

.nav-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: linear-gradient(135deg, #d5b5ea, #95d1aa);
  flex-shrink: 0;
}

/* ─── Menu dépliant Exercices ─── */
.nav-group {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.nav-group__header {
  display: flex;
  align-items: stretch;
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  transition: background 0.2s ease;
}

.nav-group__header--open {
  background: rgba(213, 181, 234, 0.08);
}

.nav-group__header--active {
  background: linear-gradient(135deg, rgba(213, 181, 234, 0.2), rgba(149, 209, 170, 0.1));
  border: 1px solid rgba(213, 181, 234, 0.3);
}

.nav-group__main {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
  padding: 0.75rem 0.5rem 0.75rem 1rem;
  border: none;
  border-radius: 0;
  background: transparent;
  color: #6c757d;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: color 0.2s ease, transform 0.2s ease;
}

@media (prefers-color-scheme: dark) {
  .nav-group__main {
    color: #adb5bd;
  }
}

.nav-group__main:hover {
  color: #ad81be;
}

.nav-group__main--active,
.nav-group__header--active .nav-group__main {
  color: #ad81be;
  font-weight: 700;
}

.nav-group__main:hover {
  transform: translateX(3px);
}

.nav-chevron-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  padding: 0;
  border: none;
  border-left: 1px solid transparent;
  border-radius: 0;
  background: transparent;
  color: #6c757d;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease;
}

@media (prefers-color-scheme: dark) {
  .nav-chevron-btn {
    color: #adb5bd;
  }
}

.nav-group__header--active .nav-chevron-btn {
  border-left-color: rgba(213, 181, 234, 0.25);
}

.nav-chevron-btn:hover {
  background: rgba(213, 181, 234, 0.15);
  color: #ad81be;
}

.nav-chevron-btn--open {
  color: #ad81be;
}

.nav-chevron {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  transition: transform 0.25s ease;
}

.nav-chevron svg {
  width: 1rem;
  height: 1rem;
  stroke: currentColor;
}

.nav-chevron--open {
  transform: rotate(180deg);
}

.nav-group__children {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.25s ease;
  overflow: hidden;
}

.nav-group__children--open {
  grid-template-rows: 1fr;
}

.nav-group__children-inner {
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.nav-link--child {
  margin-left: 0.5rem;
  padding-left: 2.25rem;
  font-size: 0.9rem;
}

.nav-link--child:hover {
  transform: translateX(2px);
}

/* ─── Footer ─── */
.sidebar-footer {
  padding: 0 0.75rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex-shrink: 0;
}

.footer-nav-link {
  margin-bottom: 0.25rem;
}

.logout-btn {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid rgba(213, 181, 234, 0.3);
  border-radius: 12px;
  background: transparent;
  color: #ad81be;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.logout-btn:hover {
  background: rgba(213, 181, 234, 0.15);
  transform: translateX(3px);
}

/* ─── Hamburger (mobile only) ─── */
.hamburger {
  display: none;
  position: fixed;
  top: 1rem;
  left: 1rem;
  z-index: 200;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(213, 181, 234, 0.35);
  box-shadow: 0 4px 12px rgba(173, 129, 190, 0.15);
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  cursor: pointer;
  transition: all 0.2s ease;
}

@media (prefers-color-scheme: dark) {
  .hamburger {
    background: rgba(25, 20, 35, 0.9);
  }
}

.hamburger span {
  display: block;
  width: 20px;
  height: 2px;
  background: #ad81be;
  border-radius: 2px;
  transition: all 0.3s ease;
  transform-origin: center;
}

.hamburger.is-open span:nth-child(1) {
  transform: translateY(7px) rotate(45deg);
}
.hamburger.is-open span:nth-child(2) {
  opacity: 0;
  transform: scaleX(0);
}
.hamburger.is-open span:nth-child(3) {
  transform: translateY(-7px) rotate(-45deg);
}

/* ─── Overlay (mobile) ─── */
.sidebar-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
  z-index: 99;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
}

/* ─── Responsive ─── */
@media (max-width: 768px) {
  .sidebar {
    transform: translateX(-100%);
  }
  .sidebar--open {
    transform: translateX(0);
  }
  .hamburger {
    display: flex;
  }
  .hamburger.is-open {
    display: none;
  }
  .sidebar-overlay {
    display: block;
  }
  .sidebar-overlay.visible {
    opacity: 1;
    pointer-events: auto;
  }
}
</style>
