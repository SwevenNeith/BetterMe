import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import AppLayout from '../layouts/AppLayout.vue'

const DashboardView = () => import('../views/DashboardView.vue')
const TimeTableView = () => import('../views/TimeTableView.vue')
const SettingsView = () => import('../views/SettingsView.vue')
const MenstruationView = () => import('../views/MenstruationView.vue')
const MoodView = () => import('../views/MoodView.vue')
const ExercicesView = () => import('../views/ExercicesView.vue')

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
          path: 'menstruation',
          name: 'menstruation',
          component: MenstruationView,
        },
        {
          path: 'settings',
          name: 'settings',
          component: SettingsView,
        },
      ]
    }
  ]
})

export default router
