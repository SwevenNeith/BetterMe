import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import AppLayout from '../layouts/AppLayout.vue'
import EmbedLayout from '../layouts/EmbedLayout.vue'

const DashboardView = () => import('../views/DashboardView.vue')
const TimeTableView = () => import('../views/TimeTableView.vue')
const SettingsView = () => import('../views/SettingsView.vue')
const MenstruationView = () => import('../views/MenstruationView.vue')
const MoodView = () => import('../views/MoodView.vue')
const ExercicesView = () => import('../views/ExercicesView.vue')
const ProjetsView = () => import('../views/ProjetsView.vue')
const ProjectDetailView = () => import('../views/ProjectDetailView.vue')
const HabitTrackerView = () => import('../views/HabitTrackerView.vue')
const TodoView = () => import('../views/TodoView.vue')
const LectureView = () => import('../views/LectureView.vue')
const ReadingSpoilChapterView = () => import('../views/ReadingSpoilChapterView.vue')
const ReadingSpoilBookView = () => import('../views/ReadingSpoilBookView.vue')
const ReadingBookDetailView = () => import('../views/ReadingBookDetailView.vue')
const RessourcesView = () => import('../views/RessourcesView.vue')
const JournalView = () => import('../views/JournalView.vue')
const JournalEntryView = () => import('../views/JournalEntryView.vue')
const NotesView = () => import('../views/NotesView.vue')
const DictionnaireView = () => import('../views/DictionnaireView.vue')
const WorkspaceView = () => import('../views/WorkspaceView.vue')

const CHUNK_RELOAD_KEY = 'betterme-chunk-reload'

function isDynamicImportChunkError(error) {
  const msg = error?.message ?? String(error)
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module')
  )
}

/** Routes authentifiées partagées (app + iframes embed). */
function createAppChildRoutes(namePrefix = '') {
  const n = (name) => (namePrefix ? `${namePrefix}${name}` : name)
  return [
    {
      path: 'dashboard',
      name: n('dashboard'),
      component: DashboardView,
    },
    {
      path: 'timetable',
      name: n('timetable'),
      component: TimeTableView,
    },
    {
      path: 'todo',
      name: n('todo'),
      component: TodoView,
    },
    {
      path: 'projets',
      name: n('projets'),
      component: ProjetsView,
    },
    {
      path: 'projets/:projectId',
      name: n('projet-detail'),
      component: ProjectDetailView,
    },
    {
      path: 'lecture',
      name: n('lecture'),
      component: LectureView,
    },
    {
      path: 'lecture/:bookId',
      name: n('lecture-livre'),
      component: ReadingBookDetailView,
    },
    {
      path: 'lecture/:bookId/spoil/nouveau',
      name: n('lecture-spoil-nouveau'),
      component: ReadingSpoilChapterView,
    },
    {
      path: 'lecture/:bookId/spoil/:chapterId/edition',
      name: n('lecture-spoil-edition'),
      component: ReadingSpoilChapterView,
    },
    {
      path: 'lecture/:bookId/spoil/lire/:chapterId?',
      name: n('lecture-spoil-lecture'),
      component: ReadingSpoilBookView,
    },
    {
      path: 'ressources',
      name: n('ressources'),
      component: RessourcesView,
    },
    {
      path: 'journal',
      name: n('journal'),
      component: JournalView,
    },
    {
      path: 'journal/nouveau',
      name: n('journal-nouveau'),
      component: JournalEntryView,
    },
    {
      path: 'journal/:entryId',
      name: n('journal-entree'),
      component: JournalEntryView,
    },
    {
      path: 'notes',
      name: n('notes'),
      component: NotesView,
    },
    {
      path: 'notes/:noteId',
      name: n('notes-detail'),
      component: NotesView,
    },
    {
      path: 'dictionnaire',
      name: n('dictionnaire'),
      component: DictionnaireView,
    },
    {
      path: 'habit-tracker',
      name: n('habit-tracker'),
      component: HabitTrackerView,
    },
    {
      path: 'menstruation',
      name: n('menstruation'),
      component: MenstruationView,
    },
    {
      path: 'exercices',
      name: n('exercices'),
      component: ExercicesView,
    },
    {
      path: 'mood',
      name: n('mood'),
      component: MoodView,
    },
    {
      path: 'settings',
      name: n('settings'),
      component: SettingsView,
    },
  ]
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/',
      component: AppLayout,
      children: [
        ...createAppChildRoutes(),
        {
          path: 'plan-de-travail',
          name: 'plan-de-travail',
          component: WorkspaceView,
        },
      ],
    },
    {
      // Iframes du Plan de Travail : mêmes pages, sans sidebar
      path: '/embed',
      component: EmbedLayout,
      children: createAppChildRoutes('embed-'),
    },
  ],
})

router.beforeEach((to, from) => {
  const fromEmbed = from.path.startsWith('/embed')
  if (!fromEmbed) return true

  if (to.path.startsWith('/embed')) return true
  if (to.name === 'login' || to.path === '/') return true

  // Garde la navigation interne aux iframes sous /embed/...
  const full = to.fullPath.startsWith('/') ? to.fullPath : `/${to.fullPath}`
  return `/embed${full}`
})

router.onError((error) => {
  if (!isDynamicImportChunkError(error)) return
  if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY)
    return
  }
  sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
  window.location.reload()
})

router.afterEach(() => {
  sessionStorage.removeItem(CHUNK_RELOAD_KEY)
})

export default router
