/**
 * État éphémère de la partie (localStorage) + timers horodatés + push multi-appareils.
 */

import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  JUNGLE_ROLE_ID,
  MATCH_ROLES,
  MATCH_TRACKER_STORAGE_KEY,
  SMITE_SUMMONER_ID,
} from '../constants/jeux/lolMatchTrackerConfig.js'
import {
  fetchChampionDetail,
  loadLolMatchTrackerData,
} from '../services/jeux/lolDataDragon.js'
import {
  cancelAllLolMatchCooldownNotifications,
  cancelLolMatchCooldownNotification,
  isLolMatchNotificationsEnabled,
  pushLolMatchCooldownNow,
  resolveLolMatchUserId,
  scheduleLolMatchCooldownNotification,
} from '../services/jeux/lolMatchNotifications.js'
import {
  applyHaste,
  ultimateBaseCooldown,
  ultimateRankFromLevel,
} from '../utils/jeux/lolCooldownData.js'
import {
  playAlertBeep,
  releaseWakeLock,
  requestNotificationPermission,
  requestWakeLock,
  showMatchNotification,
  vibrateAlert,
} from './useLolMatchAlerts.js'

function newPickId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `pick-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function emptyEnemy(roleId) {
  return {
    roleId,
    championId: null,
    championName: '',
    spell1Id: null,
    spell2Id: null,
    keystoneId: null,
    secondaryTreeId: null,
    bootsId: null,
    cosmicInsight: false,
    level: 1,
    ultRankOverride: null,
    abilityHaste: 0,
    timers: {
      spell1: null,
      spell2: null,
      ultimate: null,
    },
  }
}

function emptyPick(partial = {}) {
  return {
    pickId: newPickId(),
    championId: null,
    championName: '',
    /** null jusqu’à l’étape rôles — pas de pré-remplissage */
    roleId: null,
    spell1Id: null,
    spell2Id: null,
    keystoneId: null,
    secondaryTreeId: null,
    bootsId: null,
    cosmicInsight: false,
    level: 1,
    ultRankOverride: null,
    abilityHaste: 0,
    ...partial,
  }
}

/** Pré-sélectionne Châtiment pour le Jungle. */
function ensureJungleSmiteOnPick(pick) {
  if (!pick || pick.roleId !== JUNGLE_ROLE_ID) return
  if (pick.spell1Id === SMITE_SUMMONER_ID || pick.spell2Id === SMITE_SUMMONER_ID) return
  if (!pick.spell1Id) pick.spell1Id = SMITE_SUMMONER_ID
  else if (!pick.spell2Id) pick.spell2Id = SMITE_SUMMONER_ID
  else pick.spell1Id = SMITE_SUMMONER_ID
}

function createInitialState() {
  return {
    version: 3,
    phase: 'setup', // setup | live
    /** champions | roles | loadout */
    setupStep: 'champions',
    /** Champions choisis avant / pendant l’assignation de rôle. */
    setupPicks: [],
    enemies: MATCH_ROLES.map((r) => emptyEnemy(r.id)),
    /** Une fois en live, « Config » ne doit pas être renvoyé auto en suivi. */
    hasEnteredLive: false,
    pausedAt: null,
    earlyAlertEnabled: false,
    earlyAlertSec: 10,
    notifiedKeys: {},
  }
}

function normalizeEnemy(roleId, raw = {}) {
  return {
    ...emptyEnemy(roleId),
    ...raw,
    roleId,
    timers: {
      spell1: raw?.timers?.spell1 ?? null,
      spell2: raw?.timers?.spell2 ?? null,
      ultimate: raw?.timers?.ultimate ?? null,
    },
  }
}

function normalizePick(raw = {}) {
  return emptyPick({
    pickId: raw.pickId || newPickId(),
    championId: raw.championId || null,
    championName: raw.championName || '',
    roleId: raw.roleId || null,
    spell1Id: raw.spell1Id || null,
    spell2Id: raw.spell2Id || null,
    keystoneId: raw.keystoneId ?? null,
    secondaryTreeId: raw.secondaryTreeId ?? null,
    bootsId: raw.bootsId || null,
    cosmicInsight: Boolean(raw.cosmicInsight),
    level: Math.max(1, Math.min(18, Number(raw.level) || 1)),
    ultRankOverride: raw.ultRankOverride ?? null,
    abilityHaste: Math.max(0, Number(raw.abilityHaste) || 0),
  })
}

function picksFromEnemies(enemies, { clearRoles = false } = {}) {
  return (enemies || [])
    .filter((e) => e?.championId)
    .map((e) =>
      normalizePick({
        ...e,
        roleId: clearRoles ? null : e.roleId || null,
      }),
    )
}

function loadState() {
  try {
    // Migrer aussi l’ancienne clé v2 si présente
    const raw =
      localStorage.getItem(MATCH_TRACKER_STORAGE_KEY) ||
      localStorage.getItem('betterme-lol-match-tracker-v2')
    if (!raw) return createInitialState()
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return createInitialState()
    const base = createInitialState()
    const setupStep = ['champions', 'roles', 'loadout'].includes(parsed.setupStep)
      ? parsed.setupStep
      : 'champions'
    const enemies = MATCH_ROLES.map((role, i) =>
      normalizeEnemy(role.id, parsed.enemies?.[i] || {}),
    )
    let setupPicks = Array.isArray(parsed.setupPicks)
      ? parsed.setupPicks.filter((p) => p?.championId).map((p) => normalizePick(p))
      : []
    if (!setupPicks.length) {
      // Ancien format : rôles déjà collés aux slots → on les oublie pour l’étape rôles
      setupPicks = picksFromEnemies(enemies, {
        clearRoles: setupStep === 'champions' || setupStep === 'roles',
      })
    }
    return {
      ...base,
      ...parsed,
      version: 3,
      setupStep,
      earlyAlertEnabled: false,
      setupPicks,
      enemies,
      hasEnteredLive: Boolean(parsed.hasEnteredLive) || parsed.phase === 'live',
      notifiedKeys:
        parsed.notifiedKeys && typeof parsed.notifiedKeys === 'object'
          ? parsed.notifiedKeys
          : {},
    }
  } catch {
    return createInitialState()
  }
}

function persistState(state) {
  try {
    localStorage.setItem(MATCH_TRACKER_STORAGE_KEY, JSON.stringify(state))
  } catch (err) {
    console.warn('match tracker persist', err)
  }
}

export function useLolMatchTracker() {
  const data = ref(null)
  const dataError = ref('')
  const isLoadingData = ref(true)
  const state = reactive(loadState())
  const nowMs = ref(Date.now())
  const flashOn = ref(false)
  const notifPermission = ref(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  )
  const wakeLockSupported = ref(
    typeof navigator !== 'undefined' && Boolean(navigator.wakeLock?.request),
  )
  const wakeLockActive = ref(false)
  /** @type {import('vue').Ref<WakeLockSentinel | null>} */
  const wakeLockSentinel = ref(null)
  const userId = ref(null)

  const championDetails = reactive({})

  let tickTimer = null
  let persistTimer = null

  const patchVersion = computed(() => data.value?.version || '')
  const isPaused = computed(() => state.pausedAt != null)
  const effectiveNow = computed(() =>
    state.pausedAt != null ? state.pausedAt : nowMs.value,
  )
  const filledEnemies = computed(() => state.enemies.filter((e) => e.championId))
  const filledCount = computed(() => state.setupPicks.length)

  function schedulePersist() {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = null
      persistState(state)
    }, 200)
  }

  watch(state, schedulePersist, { deep: true })

  async function ensureData() {
    isLoadingData.value = true
    dataError.value = ''
    try {
      data.value = await loadLolMatchTrackerData()
      sanitizeSpellIdsAgainstCatalog()
    } catch (err) {
      console.error(err)
      dataError.value = err?.message || 'Impossible de charger Data Dragon.'
    } finally {
      isLoadingData.value = false
    }
  }

  /** Retire les sorts hors catalogue CLASSIC (ex. Cherry Flash). */
  function sanitizeSpellIdsAgainstCatalog() {
    const valid = new Set((data.value?.summoners || []).map((s) => s.id))
    const scrub = (row) => {
      if (row.spell1Id && !valid.has(row.spell1Id)) row.spell1Id = null
      if (row.spell2Id && !valid.has(row.spell2Id)) row.spell2Id = null
    }
    state.enemies.forEach(scrub)
    state.setupPicks.forEach(scrub)
  }

  async function ensureChampionDetail(championId) {
    if (!championId || !data.value?.version) return null
    if (championDetails[championId]) return championDetails[championId]
    try {
      const detail = await fetchChampionDetail(data.value.version, championId)
      if (detail) championDetails[championId] = detail
      return detail
    } catch (err) {
      console.warn('champion detail', championId, err)
      return null
    }
  }

  function getSummoner(spellId) {
    return data.value?.summoners?.find((s) => s.id === spellId) || null
  }

  function getKeystone(keystoneId) {
    return data.value?.keystones?.find((k) => k.id === Number(keystoneId)) || null
  }

  function getUltimateSpell(championId) {
    const detail = championDetails[championId]
    if (!detail?.spells?.length) return null
    return detail.spells[3] || null
  }

  function enemySummonerHaste() {
    // Bottes / Cosmic Insight retirés de l’UI → CD invoc. à la valeur de base
    return 0
  }

  function enemyUltInfo(enemy) {
    const spell = getUltimateSpell(enemy.championId)
    const auto = ultimateRankFromLevel(enemy.level, spell)
    const rank =
      enemy.ultRankOverride != null
        ? Math.max(0, Math.min(auto.maxRank, Number(enemy.ultRankOverride) || 0))
        : auto.rank
    const base = ultimateBaseCooldown(spell, rank)
    const nextBase =
      rank > 0 && rank < auto.maxRank
        ? ultimateBaseCooldown(spell, rank + 1)
        : null
    const real = base != null ? applyHaste(base, enemy.abilityHaste) : null
    return {
      spell,
      ...auto,
      rank,
      available: rank > 0,
      baseCooldown: base,
      nextBaseCooldown: nextBase,
      realCooldown: real,
    }
  }

  function enemySpellInfo(enemy, slot) {
    const id = slot === 1 ? enemy.spell1Id : enemy.spell2Id
    const spell = getSummoner(id)
    const base = spell?.cooldown?.[0] ?? null
    const haste = enemySummonerHaste()
    const real = base != null ? applyHaste(base, haste) : null
    return { spell, baseCooldown: base, realCooldown: real, haste }
  }

  function timerRemainingMs(timer) {
    if (!timer?.endsAt) return 0
    return Math.max(0, timer.endsAt - effectiveNow.value)
  }

  function timerProgress(timer) {
    if (!timer?.realSec || timer.realSec <= 0) return 1
    const left = timerRemainingMs(timer) / 1000
    return Math.min(1, Math.max(0, 1 - left / timer.realSec))
  }

  /** Fraction restante (1 = vient d’être lancé, 0 = prêt) pour l’horloge conique. */
  function timerRemainRatio(timer) {
    if (!timer?.realSec || timer.realSec <= 0) return 0
    return Math.min(1, Math.max(0, timerRemainingMs(timer) / (timer.realSec * 1000)))
  }

  function notifTag(enemyIndex, kind) {
    return `${enemyIndex}:${kind}`
  }

  function clearNotified(key) {
    if (state.notifiedKeys[key]) delete state.notifiedKeys[key]
  }

  function markNotified(key) {
    state.notifiedKeys[key] = true
  }

  function timerLabel(enemy, kind) {
    const name = enemy.championName || 'Adversaire'
    if (kind === 'ultimate') return `R de ${name} disponible`
    const slot = kind === 'spell1' ? 1 : 2
    const info = enemySpellInfo(enemy, slot)
    const spellName = info.spell?.name || 'Sort'
    return `${spellName} de ${name} disponible`
  }

  async function syncPushForTimer(enemyIndex, kind) {
    const enemy = state.enemies[enemyIndex]
    const timer = enemy?.timers?.[kind]
    const tag = notifTag(enemyIndex, kind)
    if (!timer?.endsAt) {
      await cancelLolMatchCooldownNotification(tag, userId.value)
      return
    }
    const enabled = await isLolMatchNotificationsEnabled(userId.value)
    if (!enabled) {
      await cancelLolMatchCooldownNotification(tag, userId.value)
      return
    }
    await scheduleLolMatchCooldownNotification({
      userId: userId.value,
      tag,
      title: 'Partie LoL',
      body: timerLabel(enemy, kind),
      endsAtMs: timer.endsAt,
    })
  }

  function startTimer(enemyIndex, kind) {
    const enemy = state.enemies[enemyIndex]
    if (!enemy) return
    let realSec = null
    let baseSec = null
    if (kind === 'ultimate') {
      const info = enemyUltInfo(enemy)
      if (!info.available || info.realCooldown == null) return
      realSec = info.realCooldown
      baseSec = info.baseCooldown
    } else {
      const slot = kind === 'spell1' ? 1 : 2
      const info = enemySpellInfo(enemy, slot)
      if (info.realCooldown == null) return
      realSec = info.realCooldown
      baseSec = info.baseCooldown
    }
    const endsAt = effectiveNow.value + realSec * 1000
    enemy.timers[kind] = { endsAt, baseSec, realSec }
    clearNotified(notifTag(enemyIndex, kind))
    void syncPushForTimer(enemyIndex, kind)
  }

  function cancelTimer(enemyIndex, kind) {
    const enemy = state.enemies[enemyIndex]
    if (!enemy) return
    enemy.timers[kind] = null
    clearNotified(notifTag(enemyIndex, kind))
    void cancelLolMatchCooldownNotification(notifTag(enemyIndex, kind), userId.value)
  }

  function adjustTimer(enemyIndex, kind, deltaSec) {
    const enemy = state.enemies[enemyIndex]
    const timer = enemy?.timers?.[kind]
    if (!timer) return
    timer.endsAt -= Number(deltaSec) * 1000
    clearNotified(notifTag(enemyIndex, kind))
    void syncPushForTimer(enemyIndex, kind)
  }

  async function fireAlert(message, key) {
    markNotified(key)
    flashOn.value = true
    setTimeout(() => {
      flashOn.value = false
    }, 700)
    void playAlertBeep()
    vibrateAlert()
    await showMatchNotification({
      title: 'Partie LoL',
      body: message,
      tag: key,
    })
    // Push immédiat vers tous les appareils (prefs lol_match), même hors page
    void pushLolMatchCooldownNow({
      userId: userId.value,
      title: 'Partie LoL',
      body: message,
      tag: key,
    })
  }

  function checkAlerts() {
    if (state.phase !== 'live' || isPaused.value) return
    const now = effectiveNow.value

    state.enemies.forEach((enemy, index) => {
      for (const kind of ['spell1', 'spell2', 'ultimate']) {
        const timer = enemy.timers[kind]
        if (!timer?.endsAt) continue
        const key = notifTag(index, kind)
        const left = timer.endsAt - now

        if (left <= 0 && !state.notifiedKeys[key]) {
          void fireAlert(timerLabel(enemy, kind), key)
          enemy.timers[kind] = null
          void cancelLolMatchCooldownNotification(key, userId.value)
        }
      }
    })
  }

  function togglePause() {
    if (state.pausedAt != null) {
      const pausedFor = Date.now() - state.pausedAt
      state.enemies.forEach((enemy, index) => {
        for (const kind of ['spell1', 'spell2', 'ultimate']) {
          if (enemy.timers[kind]?.endsAt) {
            enemy.timers[kind].endsAt += pausedFor
            void syncPushForTimer(index, kind)
          }
        }
      })
      state.pausedAt = null
    } else {
      state.pausedAt = Date.now()
    }
  }

  function setPhase(phase) {
    if (phase === 'live') {
      syncPicksToEnemies()
      state.hasEnteredLive = true
    }
    state.phase = phase
  }

  /** Auto-passage loadout → live uniquement avant le 1er suivi. */
  function shouldAutoStartLive() {
    return !state.hasEnteredLive && canStartLive()
  }

  /** Aligne enemies[] sur les picks qui ont un rôle (loadout + live). */
  function syncPicksToEnemies() {
    const next = MATCH_ROLES.map((r) => emptyEnemy(r.id))
    for (const pick of state.setupPicks) {
      if (!pick.championId || !pick.roleId) continue
      const idx = MATCH_ROLES.findIndex((r) => r.id === pick.roleId)
      if (idx < 0) continue
      ensureJungleSmiteOnPick(pick)
      const prev = state.enemies[idx]
      const sameChamp = prev?.championId === pick.championId
      next[idx] = {
        ...emptyEnemy(pick.roleId),
        championId: pick.championId,
        championName: pick.championName,
        spell1Id: pick.spell1Id,
        spell2Id: pick.spell2Id,
        keystoneId: pick.keystoneId,
        secondaryTreeId: pick.secondaryTreeId,
        bootsId: sameChamp ? prev.bootsId ?? pick.bootsId : pick.bootsId,
        cosmicInsight: pick.cosmicInsight,
        level: sameChamp ? prev.level || pick.level : pick.level,
        ultRankOverride: sameChamp ? prev.ultRankOverride : pick.ultRankOverride,
        abilityHaste: sameChamp ? prev.abilityHaste : pick.abilityHaste,
        timers: sameChamp
          ? {
              spell1: prev.timers?.spell1 ?? null,
              spell2: prev.timers?.spell2 ?? null,
              ultimate: prev.timers?.ultimate ?? null,
            }
          : { spell1: null, spell2: null, ultimate: null },
      }
    }
    state.enemies = next
  }

  /** Recopie loadout enemies → picks (après édition en étape 3 / live). */
  function syncEnemiesToPicks() {
    for (const enemy of state.enemies) {
      if (!enemy.championId) continue
      const pick =
        state.setupPicks.find((p) => p.roleId === enemy.roleId) ||
        state.setupPicks.find((p) => p.championId === enemy.championId)
      if (!pick) continue
      pick.roleId = enemy.roleId
      pick.spell1Id = enemy.spell1Id
      pick.spell2Id = enemy.spell2Id
      pick.keystoneId = enemy.keystoneId
      pick.secondaryTreeId = enemy.secondaryTreeId
      pick.bootsId = enemy.bootsId
      pick.cosmicInsight = enemy.cosmicInsight
      pick.level = enemy.level
      pick.ultRankOverride = enemy.ultRankOverride
      pick.abilityHaste = enemy.abilityHaste
    }
  }

  function setSetupStep(step) {
    if (!['champions', 'roles', 'loadout'].includes(step)) return
    if (state.phase === 'live') syncEnemiesToPicks()
    state.phase = 'setup'
    state.setupStep = step
    if (step === 'roles') {
      // Aucun rôle pré-sélectionné : l’utilisateur choisit tout
      state.setupPicks.forEach((p) => {
        p.roleId = null
      })
    }
    if (step === 'loadout') {
      syncPicksToEnemies()
    }
  }

  function addChampion(champ) {
    if (!champ?.id) return false
    if (state.setupPicks.some((p) => p.championId === champ.id)) return false
    if (state.setupPicks.length >= 5) return false
    state.setupPicks.push(
      emptyPick({
        championId: champ.id,
        championName: champ.name,
        roleId: null,
        level: 1,
      }),
    )
    return true
  }

  function removeChampionAt(pickIndex) {
    const pick = state.setupPicks[pickIndex]
    if (!pick) return
    if (pick.roleId) {
      const enemyIndex = MATCH_ROLES.findIndex((r) => r.id === pick.roleId)
      if (enemyIndex >= 0) {
        for (const kind of ['spell1', 'spell2', 'ultimate']) {
          void cancelLolMatchCooldownNotification(notifTag(enemyIndex, kind), userId.value)
        }
        state.enemies[enemyIndex] = emptyEnemy(pick.roleId)
      }
    }
    state.setupPicks.splice(pickIndex, 1)
  }

  /** Assigne un rôle à un pick (sans pré-sélection). Jungle → Châtiment. */
  function assignPickRole(pickId, roleId) {
    const pick = state.setupPicks.find((p) => p.pickId === pickId)
    if (!pick?.championId) return
    for (const other of state.setupPicks) {
      if (other.pickId !== pickId && other.roleId === roleId) {
        other.roleId = null
      }
    }
    pick.roleId = roleId
    ensureJungleSmiteOnPick(pick)
  }

  function bumpLevel(index, delta = 1) {
    const enemy = state.enemies[index]
    if (!enemy?.championId) return
    const next = Math.max(1, Math.min(18, (enemy.level || 1) + delta))
    enemy.level = next
    const pick = state.setupPicks.find(
      (p) => p.roleId === enemy.roleId || p.championId === enemy.championId,
    )
    if (pick) pick.level = next
  }

  function resetMatch() {
    void cancelAllLolMatchCooldownNotifications(userId.value)
    const next = createInitialState()
    Object.assign(state, next)
    state.setupPicks = []
    state.enemies = MATCH_ROLES.map((r) => emptyEnemy(r.id))
  }

  function updateEnemy(index, patch) {
    const enemy = state.enemies[index]
    if (!enemy) return
    Object.assign(enemy, patch)
    if (patch.championId) {
      void ensureChampionDetail(patch.championId)
    }
    const pick = state.setupPicks.find(
      (p) => p.roleId === enemy.roleId || p.championId === enemy.championId,
    )
    if (pick) {
      for (const key of [
        'spell1Id',
        'spell2Id',
        'keystoneId',
        'level',
        'ultRankOverride',
        'abilityHaste',
        'championId',
        'championName',
      ]) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) {
          pick[key] = enemy[key]
        }
      }
      if (enemy.roleId) pick.roleId = enemy.roleId
    }
  }

  function canGoToRoles() {
    return filledCount.value >= 1
  }

  function canGoToLoadout() {
    if (!state.setupPicks.length) return false
    return state.setupPicks.every((p) => Boolean(p.roleId))
  }

  function enemyLoadoutComplete(enemy) {
    return Boolean(
      enemy?.championId && enemy.spell1Id && enemy.spell2Id && enemy.keystoneId,
    )
  }

  function canStartLive() {
    const rows =
      filledEnemies.value.length > 0
        ? filledEnemies.value
        : state.setupPicks.filter((p) => p.championId && p.roleId)
    return rows.length > 0 && rows.every((e) => enemyLoadoutComplete(e))
  }

  async function enableNotifications() {
    const result = await requestNotificationPermission()
    notifPermission.value = result
    return result
  }

  async function enableWakeLock() {
    const { wakeLock, supported } = await requestWakeLock()
    wakeLockSupported.value = supported
    wakeLockSentinel.value = wakeLock
    wakeLockActive.value = Boolean(wakeLock)
  }

  async function disableWakeLock() {
    await releaseWakeLock(wakeLockSentinel.value)
    wakeLockSentinel.value = null
    wakeLockActive.value = false
  }

  onMounted(async () => {
    userId.value = await resolveLolMatchUserId()
    await ensureData()
    for (const enemy of state.enemies) {
      if (enemy.championId) void ensureChampionDetail(enemy.championId)
    }
    for (const pick of state.setupPicks) {
      if (pick.championId) void ensureChampionDetail(pick.championId)
    }
    tickTimer = setInterval(() => {
      nowMs.value = Date.now()
      checkAlerts()
    }, 250)
    if (state.phase === 'live') void enableWakeLock()
    document.addEventListener('visibilitychange', onVisibility)
  })

  function onVisibility() {
    if (document.visibilityState === 'visible' && state.phase === 'live') {
      void enableWakeLock()
    }
  }

  onBeforeUnmount(() => {
    if (tickTimer) clearInterval(tickTimer)
    if (persistTimer) clearTimeout(persistTimer)
    persistState(state)
    document.removeEventListener('visibilitychange', onVisibility)
    void disableWakeLock()
  })

  watch(
    () => state.phase,
    (phase) => {
      if (phase === 'live') void enableWakeLock()
      else void disableWakeLock()
    },
  )

  return {
    data,
    dataError,
    isLoadingData,
    state,
    patchVersion,
    isPaused,
    effectiveNow,
    flashOn,
    notifPermission,
    wakeLockSupported,
    wakeLockActive,
    championDetails,
    filledEnemies,
    filledCount,
    MATCH_ROLES,
    ensureChampionDetail,
    getSummoner,
    getKeystone,
    enemyUltInfo,
    enemySpellInfo,
    enemySummonerHaste,
    timerRemainingMs,
    timerProgress,
    timerRemainRatio,
    startTimer,
    cancelTimer,
    adjustTimer,
    togglePause,
    setPhase,
    setSetupStep,
    syncPicksToEnemies,
    addChampion,
    removeChampionAt,
    assignPickRole,
    bumpLevel,
    resetMatch,
    updateEnemy,
    canGoToRoles,
    canGoToLoadout,
    canStartLive,
    shouldAutoStartLive,
    enemyLoadoutComplete,
    enableNotifications,
    enableWakeLock,
    disableWakeLock,
  }
}
