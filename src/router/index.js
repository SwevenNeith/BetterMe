import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import AppLayout from '../layouts/AppLayout.vue'
import DashboardView from '../views/DashboardView.vue'
import TimeTableView from '../views/TimeTableView.vue'
import SettingsView from '../views/SettingsView.vue'
import MenstruationView from '../views/MenstruationView.vue'
import MoodView from '../views/MoodView.vue'
import ExercicesView from '../views/ExercicesView.vue'

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
