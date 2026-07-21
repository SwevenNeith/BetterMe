import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import AppLayout from '../layouts/AppLayout.vue'

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
const ReadingBookDetailView = () => import('../views/ReadingBookDetailView.vue')
const JournalView = () => import('../views/JournalView.vue')
const JournalEntryView = () => import('../views/JournalEntryView.vue')

const CHUNK_RELOAD_KEY = 'betterme-chunk-reload'

function isDynamicImportChunkError(error) {
  const msg = error?.message ?? String(error)
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module')
  )
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'login',
      component: LoginView
    },
    {
      // All authenticated pages share the AppLayout (sidebar)
      path: '/',
      component: AppLayout,
      children: [
        {
          path: 'dashboard',
          name: 'dashboard',
          component: DashboardView
        },
        {
          path: 'timetable',
          name: 'timetable',
          component: TimeTableView
        },
        {
          path: 'todo',
          name: 'todo',
          component: TodoView,
        },
        {
          path: 'projets',
          name: 'projets',
          component: ProjetsView,
        },
        {
          path: 'projets/:projectId',
          name: 'projet-detail',
          component: ProjectDetailView,
        },
        {
          path: 'lecture',
          name: 'lecture',
          component: LectureView,
        },
        {
          path: 'lecture/:bookId',
          name: 'lecture-livre',
          component: ReadingBookDetailView,
        },
        {
          path: 'lecture/:bookId/spoil/nouveau',
          name: 'lecture-spoil-nouveau',
          component: ReadingSpoilChapterView,
        },
        {
          path: 'lecture/:bookId/spoil/:chapterId/edition',
          name: 'lecture-spoil-edition',
          component: ReadingSpoilChapterView,
        },
        {
          path: 'journal',
          name: 'journal',
          component: JournalView,
        },
        {
          path: 'journal/nouveau',
          name: 'journal-nouveau',
          component: JournalEntryView,
        },
        {
          path: 'journal/:entryId',
          name: 'journal-entree',
          component: JournalEntryView,
        },
        {
          path: 'habit-tracker',
          name: 'habit-tracker',
          component: HabitTrackerView,
        },
        {
          path: 'menstruation',
          name: 'menstruation',
          component: MenstruationView,
        },
        {
          path: 'exercices',
          name: 'exercices',
          component: ExercicesView,
        },
        {
          path: 'mood',
          name: 'mood',
          component: MoodView,
        },
        {
          path: 'settings',
          name: 'settings',
          component: SettingsView,
        },
      ]
    }
  ],
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
