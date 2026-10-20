/**
 * Compatibilité : l’ancien rappel « promesses » est remplacé par
 * la planification Batterie (même réglages heure / activé).
 */
export {
  createDefaultBatteryPlanningReminderSettings as createDefaultTodoPromesseReminderSettings,
  loadBatteryPlanningReminderSettings as loadTodoPromesseReminderSettings,
  saveBatteryPlanningReminderSettings as saveTodoPromesseReminderSettings,
  rescheduleBatteryPlanningReminder as rescheduleTodoPromesseReminder,
  rescheduleBatteryPlanningReminder,
  getBatteryPageLabelForUser,
} from '../battery/batteryPlanningNotifications.js'
