/**
 * Réorganise components / services / constants / utils par domaine.
 * Usage: node scripts/reorganize-by-domain.mjs
 */
import { mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SRC = join(ROOT, 'src')

/** @type {Record<string, string>} */
const MOVES = {}

function map(from, to) {
  MOVES[from.replace(/\\/g, '/')] = to.replace(/\\/g, '/')
}

function toPosix(p) {
  return p.replace(/\\/g, '/')
}

// ─── components/common ───────────────────────────────────────────
;[
  'AppConfirmDialog.vue',
  'ColorPickerField.vue',
  'EmojiPickerField.vue',
  'EmojiTextField.vue',
  'NotificationPrompt.vue',
  'RichSpoilHtmlContent.vue',
  'RichTextColorPicker.vue',
  'RichTextNoteEditor.vue',
  'Sidebar.vue',
  'TheWelcome.vue',
  'WelcomeItem.vue',
  'VisibilityOnboardingModal.vue',
].forEach((f) => map(`components/${f}`, `components/common/${f}`))

;[
  'DashboardActiveProjects.vue',
  'DashboardCheckinFooter.vue',
  'DashboardComfortImages.vue',
  'DashboardDailyNote.vue',
  'DashboardEmotionalCheckin.vue',
  'DashboardHabitsAnnual.vue',
  'DashboardNotesGraph.vue',
  'DashboardPinnedNote.vue',
  'DashboardReadingInProgress.vue',
  'DashboardTodayTodos.vue',
  'DashboardVisibilityWidgetRow.vue',
  'DashboardWidgetBlock.vue',
  'DashboardWordOfTheDay.vue',
].forEach((f) => map(`components/${f}`, `components/dashboard/${f}`))

;[
  'TodoEncouragementMessage.vue',
  'TodoItemCard.vue',
  'TodoLinkedSubForm.vue',
  'TodoSnoozePromptModal.vue',
].forEach((f) => map(`components/${f}`, `components/todo/${f}`))

map('components/TimetablePlanningSubForm.vue', 'components/timetable/TimetablePlanningSubForm.vue')

;[
  'ProjectItemProgress.vue',
  'ProjectPauseEditFields.vue',
  'ProjectPauseIconButton.vue',
].forEach((f) => map(`components/${f}`, `components/projets/${f}`))

;[
  'ReadingBookFiche.vue',
  'ReadingBookModal.vue',
  'ReadingBooksFilterPopover.vue',
  'ReadingBookSheet.vue',
  'ReadingCollectionCombobox.vue',
  'ReadingHalfRating.vue',
  'ReadingPickModal.vue',
  'ReadingRereadingsSection.vue',
  'ReadingSpoilBook.vue',
  'ReadingSpoilChapterForm.vue',
  'ReadingSpoilChapterModal.vue',
  'ReadingSpoilSection.vue',
].forEach((f) => map(`components/${f}`, `components/lecture/${f}`))

;[
  'NotesExtensionsModal.vue',
  'NotesGraphView.vue',
  'NotesTabsBar.vue',
  'NotesTemplateSettingsModal.vue',
  'NotesTreeNode.vue',
  'NotesVaultThemeModal.vue',
].forEach((f) => map(`components/${f}`, `components/notes/${f}`))

;[
  'MenstruationCycleCalendar.vue',
  'MenstruationNaturalCycleCalendar.vue',
  'MenstruationNaturelSymptoms.vue',
  'MenstruationPatternsPanel.vue',
  'MenstruationPiluleSymptoms.vue',
  'MenstruationSymptomEntriesNav.vue',
  'MenstruationSymptomSections.vue',
].forEach((f) => map(`components/${f}`, `components/menstruation/${f}`))

;[
  'HabitDayEntryPanel.vue',
  'HabitManageList.vue',
  'HabitReadingBookSessionModal.vue',
  'HabitReadingDetailsPanel.vue',
  'HabitReadingImportModal.vue',
  'HabitReadingLibraryPickerModal.vue',
  'HabitTrackerGrid.vue',
].forEach((f) => map(`components/${f}`, `components/habit/${f}`))

;[
  'JournalEntryBook.vue',
  'JournalPromptPickerModal.vue',
].forEach((f) => map(`components/${f}`, `components/journal/${f}`))

;[
  'DictionaryEntryModal.vue',
  'DictionaryLinkEntryModal.vue',
].forEach((f) => map(`components/${f}`, `components/dictionnaire/${f}`))

;[
  'MoodDetailsModal.vue',
  'MoodScale.vue',
].forEach((f) => map(`components/${f}`, `components/mood/${f}`))

map('components/SettingsVisibilityPanel.vue', 'components/settings/SettingsVisibilityPanel.vue')

;[
  'WorkspaceLayoutPicker.vue',
  'WorkspacePagePicker.vue',
  'WorkspacePane.vue',
].forEach((f) => map(`components/${f}`, `components/workspace/${f}`))

map('components/ResourcesFilterPopover.vue', 'components/ressources/ResourcesFilterPopover.vue')

;[
  'dailyReminders.js',
  'durationUtils.js',
  'notificationRealign.js',
  'notifications.js',
  'rollingReminderWindow.js',
  'rollingTimetableReminders.js',
  'scheduledReminders.js',
].forEach((f) => map(`services/${f}`, `services/common/${f}`))

;[
  'comfortImages.js',
  'dailyNotes.js',
  'dashboardVisibility.js',
  'reconfortMatching.js',
  'reconfortMessages.js',
  'reconfortNotifications.js',
].forEach((f) => map(`services/${f}`, `services/dashboard/${f}`))

;[
  'todoItemReminders.js',
  'todoItems.js',
  'todoPromesseNotifications.js',
  'todoPromesseSettings.js',
  'todoSnooze.js',
  'todoTimetableLink.js',
].forEach((f) => map(`services/${f}`, `services/todo/${f}`))

;[
  'timetableCategories.js',
  'timetableEvents.js',
].forEach((f) => map(`services/${f}`, `services/timetable/${f}`))

;[
  'projectCleanup.js',
  'projectDoneSync.js',
  'projectPauseReasons.js',
  'projectProgress.js',
  'projects.js',
].forEach((f) => map(`services/${f}`, `services/projets/${f}`))

;[
  'readingBookAliases.js',
  'readingBooks.js',
  'readingCollections.js',
  'readingRereadings.js',
  'readingSpoilChapters.js',
].forEach((f) => map(`services/${f}`, `services/lecture/${f}`))

;[
  'noteFolders.js',
  'noteImages.js',
  'notes.js',
  'notesExtensions.js',
  'noteTemplateExtension.js',
  'noteTodoSync.js',
  'noteVaults.js',
  'noteVaultSettings.js',
].forEach((f) => map(`services/${f}`, `services/notes/${f}`))

;[
  'menstruationCalendar.js',
  'menstruationCalendarNaturel.js',
  'menstruationCycleModePreference.js',
  'menstruationCycleModeSwitch.js',
  'menstruationCycles.js',
  'menstruationCyclesNaturel.js',
  'menstruationNotifications.js',
  'menstruationNotificationSync.js',
  'menstruationPatternNotifications.js',
  'menstruationPatterns.js',
  'menstruationPatternThresholds.js',
  'menstruationSymptomEnrichment.js',
  'menstruationSymptoms.js',
  'menstruationSymptomsNaturel.js',
  'menstruationSymptomsPilule.js',
].forEach((f) => map(`services/${f}`, `services/menstruation/${f}`))

;[
  'habitLogs.js',
  'habits.js',
].forEach((f) => map(`services/${f}`, `services/habit/${f}`))

;[
  'journalEntries.js',
  'journalPrompts.js',
].forEach((f) => map(`services/${f}`, `services/journal/${f}`))

;[
  'dictionaryAliases.js',
  'dictionaryEntries.js',
].forEach((f) => map(`services/${f}`, `services/dictionnaire/${f}`))

map('services/emotionLogs.js', 'services/mood/emotionLogs.js')

;[
  'pageVisibility.js',
  'visibilityOnboarding.js',
].forEach((f) => map(`services/${f}`, `services/settings/${f}`))

;[
  'resourceCategories.js',
  'resourceItems.js',
].forEach((f) => map(`services/${f}`, `services/ressources/${f}`))

map('constants/appPages.js', 'constants/common/appPages.js')
map('constants/markdownTutorial.js', 'constants/common/markdownTutorial.js')

;[
  'dailyNotes.js',
  'dashboardPinnedNotes.js',
  'dashboardWidgets.js',
].forEach((f) => map(`constants/${f}`, `constants/dashboard/${f}`))

map('constants/todoOptions.js', 'constants/todo/todoOptions.js')
map('constants/habitOptions.js', 'constants/habit/habitOptions.js')
map('constants/moods.js', 'constants/mood/moods.js')
map('constants/dictionaryWordTypes.js', 'constants/dictionnaire/dictionaryWordTypes.js')
map('constants/workspacePages.js', 'constants/workspace/workspacePages.js')

;[
  'projectPause.js',
  'projectProgress.js',
].forEach((f) => map(`constants/${f}`, `constants/projets/${f}`))

;[
  'notesExtensions.js',
  'noteStatus.js',
  'noteTemplates.js',
  'noteVaults.js',
].forEach((f) => map(`constants/${f}`, `constants/notes/${f}`))

;[
  'asyncTimeout.js',
  'renderMarkdown.js',
  'sanitizeHtml.js',
  'richNoteTextColors.js',
].forEach((f) => map(`utils/${f}`, `utils/common/${f}`))

map('utils/dashboardWordOfTheDay.js', 'utils/dashboard/dashboardWordOfTheDay.js')

;[
  'todoCalendar.js',
  'todoEncouragement.js',
  'todoPlanningDates.js',
  'todoTimetableBridge.js',
].forEach((f) => map(`utils/${f}`, `utils/todo/${f}`))

;[
  'habitCalendar.js',
  'habitProjectLink.js',
  'habitReadingLink.js',
  'habitStats.js',
].forEach((f) => map(`utils/${f}`, `utils/habit/${f}`))

;[
  'notesGraph.js',
  'notesSplitSync.js',
  'notesTree.js',
  'noteWidgets.js',
].forEach((f) => map(`utils/${f}`, `utils/notes/${f}`))

;[
  'readingBookFilters.js',
  'readingBookForm.js',
  'readingPick.js',
].forEach((f) => map(`utils/${f}`, `utils/lecture/${f}`))

map('utils/projectProgressPeriods.js', 'utils/projets/projectProgressPeriods.js')
map('utils/resourceForm.js', 'utils/ressources/resourceForm.js')

;[
  'dictionary.js',
  'dictionaryLookup.js',
].forEach((f) => map(`utils/${f}`, `utils/dictionnaire/${f}`))

function ensureDir(abs) {
  mkdirSync(abs, { recursive: true })
}

function listFilesRecursive(dir) {
  /** @type {string[]} */
  const out = []
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, name.name)
    if (name.isDirectory()) out.push(...listFilesRecursive(abs))
    else out.push(abs)
  }
  return out
}

function gitMv(fromAbs, toAbs) {
  ensureDir(dirname(toAbs))
  try {
    execSync(`git mv -- "${fromAbs}" "${toAbs}"`, { cwd: ROOT, stdio: 'pipe' })
  } catch {
    if (existsSync(fromAbs)) renameSync(fromAbs, toAbs)
    else if (!existsSync(toAbs)) throw new Error(`Missing source: ${fromAbs}`)
  }
}

/** Map oldRel -> newRel including extensionless keys for .js */
function buildLookup(oldToNew) {
  /** @type {Map<string, string>} */
  const lookup = new Map()
  for (const [oldRel, newRel] of oldToNew) {
    lookup.set(oldRel, newRel)
    if (oldRel.endsWith('.js')) {
      lookup.set(oldRel.slice(0, -3), newRel)
    }
  }
  return lookup
}

/**
 * Rewrite relative imports using old importer location semantics.
 */
function rewriteFile(fileAbs, oldToNew, newToOld, lookup) {
  const ext = fileAbs.slice(fileAbs.lastIndexOf('.'))
  if (!['.js', '.vue', '.ts', '.mjs'].includes(ext)) return false

  let text = readFileSync(fileAbs, 'utf8')
  const original = text

  const importerNewRel = toPosix(relative(SRC, fileAbs))
  const importerOldRel = newToOld.get(importerNewRel) || importerNewRel
  const importerOldDir = dirname(join(SRC, importerOldRel))

  const re =
    /((?:import|export)\s+[\s\S]*?\sfrom\s+|import\s*\()\s*(['"])(\.[^'"]+)\2/g

  text = text.replace(re, (full, prefix, quote, spec) => {
    // Resolve as from OLD importer path (where the import was written for)
    const targetOldAbsGuess = resolve(importerOldDir, spec)
    let targetOldRel = toPosix(relative(SRC, targetOldAbsGuess))

    // Try with extensions for lookup
    let newRel = lookup.get(targetOldRel)
    if (!newRel) {
      for (const e of ['.js', '.vue']) {
        newRel = lookup.get(targetOldRel + e)
        if (newRel) {
          targetOldRel = targetOldRel + e
          break
        }
      }
    }

    // If target didn't move and importer didn't move, keep
    // If target didn't move but importer did, recompute relative to unmoved target
    if (!newRel) {
      // Unmoved target: file should exist at targetOldAbsGuess (possibly with ext)
      let unmovedAbs = null
      for (const candidate of [
        targetOldAbsGuess,
        `${targetOldAbsGuess}.js`,
        `${targetOldAbsGuess}.vue`,
      ]) {
        if (existsSync(candidate)) {
          unmovedAbs = candidate
          break
        }
      }
      // Also: target might have been at old path that equals current if not in MOVES
      // If importer moved, relative path to unmoved target changes
      if (unmovedAbs) {
        let newSpec = toPosix(relative(dirname(fileAbs), unmovedAbs))
        if (!newSpec.startsWith('.')) newSpec = `./${newSpec}`
        if (!spec.endsWith('.js') && !spec.endsWith('.vue') && newSpec.endsWith('.js')) {
          newSpec = newSpec.slice(0, -3)
        }
        if (newSpec === spec) return full
        return `${prefix}${quote}${newSpec}${quote}`
      }
      return full
    }

    const newAbs = join(SRC, newRel)
    let newSpec = toPosix(relative(dirname(fileAbs), newAbs))
    if (!newSpec.startsWith('.')) newSpec = `./${newSpec}`
    if (!spec.endsWith('.js') && !spec.endsWith('.vue') && newSpec.endsWith('.js')) {
      newSpec = newSpec.slice(0, -3)
    }
    return `${prefix}${quote}${newSpec}${quote}`
  })

  if (text !== original) {
    writeFileSync(fileAbs, text, 'utf8')
    return true
  }
  return false
}

// ─── main ────────────────────────────────────────────────────────
console.log(`Moving ${Object.keys(MOVES).length} files…`)

const oldToNew = new Map(Object.entries(MOVES))
const newToOld = new Map([...oldToNew.entries()].map(([o, n]) => [n, o]))
const lookup = buildLookup(oldToNew)

let moved = 0
for (const [from, to] of Object.entries(MOVES)) {
  const fromAbs = join(SRC, from)
  const toAbs = join(SRC, to)
  if (existsSync(toAbs) && !existsSync(fromAbs)) {
    console.log(`skip (already): ${to}`)
    continue
  }
  if (!existsSync(fromAbs)) {
    console.warn(`WARN missing: ${from}`)
    continue
  }
  gitMv(fromAbs, toAbs)
  moved++
}
console.log(`Moved ${moved} files.`)

const allFiles = listFilesRecursive(SRC)
let rewritten = 0
for (const fileAbs of allFiles) {
  if (rewriteFile(fileAbs, oldToNew, newToOld, lookup)) rewritten++
}
console.log(`Rewrote imports in ${rewritten} files.`)

// Verify unresolved relative imports
let broken = 0
for (const fileAbs of listFilesRecursive(SRC)) {
  const ext = fileAbs.slice(fileAbs.lastIndexOf('.'))
  if (!['.js', '.vue', '.ts'].includes(ext)) continue
  const text = readFileSync(fileAbs, 'utf8')
  const re = /(?:from\s+|import\s*\()\s*(['"])(\.[^'"]+)\1/g
  let m
  while ((m = re.exec(text))) {
    const spec = m[2]
    const base = resolve(dirname(fileAbs), spec)
    const ok = [base, `${base}.js`, `${base}.vue`, `${base}.ts`].some((p) => existsSync(p))
    if (!ok) {
      broken++
      console.warn(`BROKEN in ${toPosix(relative(ROOT, fileAbs))}: ${spec}`)
    }
  }
}
console.log(`Broken relative imports: ${broken}`)
console.log('Done.')
