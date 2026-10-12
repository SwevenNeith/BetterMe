<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useLolMatchTracker } from '../composables/useLolMatchTracker.js'
import {
  ddragonChampionIconUrl,
  ddragonItemIconUrl,
  ddragonRuneIconUrl,
  ddragonSpellIconUrl,
} from '../services/jeux/lolDataDragon.js'
import { canUseCosmicInsight } from '../utils/jeux/lolCooldownData.js'

defineOptions({ name: 'LolMatchTrackerView' })

const {
  data,
  dataError,
  isLoadingData,
  state,
  patchVersion,
  isPaused,
  flashOn,
  notifPermission,
  MATCH_ROLES,
  filledCount,
  ensureChampionDetail,
  enemyUltInfo,
  enemySpellInfo,
  timerRemainingMs,
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
  enableNotifications,
} = useLolMatchTracker()

const champSearch = ref('')
const showResetModal = ref(false)
const version = computed(() => patchVersion.value)

const filteredChampions = computed(() => {
  const q = String(champSearch.value || '')
    .trim()
    .toLowerCase()
  const list = data.value?.champions || []
  const selected = new Set(state.setupPicks.map((p) => p.championId).filter(Boolean))
  const available = list.filter((c) => !selected.has(c.id))
  if (!q) return available
  return available.filter(
    (c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
  )
})

function roleLabel(roleId) {
  return MATCH_ROLES.find((r) => r.id === roleId)?.label || roleId
}

function selectChampion(champ) {
  if (filledCount.value >= 5) return
  if (addChampion(champ)) void ensureChampionDetail(champ.id)
}

/** Auto-avance dès que l’étape est complète (évite de remonter pour valider). */
watch(filledCount, (n) => {
  if (state.phase !== 'setup' || state.setupStep !== 'champions') return
  if (n >= 5) setSetupStep('roles')
})

watch(
  () => state.setupPicks.map((p) => `${p.pickId}:${p.roleId || ''}`).join('|'),
  () => {
    if (state.phase !== 'setup' || state.setupStep !== 'roles') return
    if (canGoToLoadout()) setSetupStep('loadout')
  },
)

watch(
  () =>
    state.enemies.map((e) =>
      [e.championId, e.spell1Id, e.spell2Id, e.keystoneId, e.secondaryTreeId].join(':'),
    ),
  () => {
    if (state.phase !== 'setup' || state.setupStep !== 'loadout') return
    // Après un 1er passage en live, Config doit rester sur la config (pas de rebond)
    if (shouldAutoStartLive()) setPhase('live')
  },
)

function formatRemaining(ms) {
  const s = Math.ceil(Math.max(0, ms) / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return m > 0 ? `${m}:${String(r).padStart(2, '0')}` : `${r}`
}

function onCosmicToggle(enemyIndex, checked) {
  const enemy = state.enemies[enemyIndex]
  if (!canUseCosmicInsight(enemy.secondaryTreeId)) return
  updateEnemy(enemyIndex, { cosmicInsight: checked })
}

function toggleSummonerSpell(enemyIndex, spellId) {
  const enemy = state.enemies[enemyIndex]
  if (!enemy || !spellId) return
  if (enemy.spell1Id === spellId) {
    updateEnemy(enemyIndex, { spell1Id: null })
    return
  }
  if (enemy.spell2Id === spellId) {
    updateEnemy(enemyIndex, { spell2Id: null })
    return
  }
  if (!enemy.spell1Id) {
    updateEnemy(enemyIndex, { spell1Id: spellId })
    return
  }
  if (!enemy.spell2Id) {
    updateEnemy(enemyIndex, { spell2Id: spellId })
    return
  }
  // Les 2 slots sont pris → remplace le premier
  updateEnemy(enemyIndex, { spell1Id: spellId })
}

function toggleAbility(enemyIndex, kind) {
  const enemy = state.enemies[enemyIndex]
  if (!enemy) return
  if (enemy.timers[kind]) {
    cancelTimer(enemyIndex, kind)
    return
  }
  startTimer(enemyIndex, kind)
}

function goRoles() {
  if (!canGoToRoles()) {
    window.alert('Sélectionne au moins un champion.')
    return
  }
  setSetupStep('roles')
}

function goLoadout() {
  if (!canGoToLoadout()) {
    window.alert('Assigne un rôle distinct à chaque champion.')
    return
  }
  syncPicksToEnemies()
  setSetupStep('loadout')
}

function startLive() {
  if (!canStartLive()) {
    window.alert(
      'Pour chaque champion : 2 sorts d’invocateur, une keystone et un arbre secondaire.',
    )
    return
  }
  setPhase('live')
}

function openResetModal() {
  showResetModal.value = true
}

function closeResetModal() {
  showResetModal.value = false
}

function confirmReset() {
  resetMatch()
  showResetModal.value = false
}

async function askNotif() {
  const result = await enableNotifications()
  if (result === 'denied') {
    window.alert(
      'Notifications refusées. Active-les dans les réglages du navigateur, et coche « League of Legends (partie) » sur tes appareils (Réglages → Appareils).',
    )
  }
}

/** Colonnes live dans l’ordre des rôles (référence stable pour le template). */
const liveLanes = computed(() =>
  MATCH_ROLES.map((role, index) => ({
    role,
    index,
    enemy: state.enemies[index],
  })),
)
</script>

<template>
  <div class="lmt" :class="{ 'lmt--flash': flashOn }">
    <header class="lmt__header">
      <p class="lmt__eyebrow">
        <RouterLink to="/league-of-legends" class="lmt__back">← League of Legends</RouterLink>
      </p>
      <h1 class="lmt__title">Partie en cours</h1>
      <p v-if="patchVersion" class="lmt__patch">Patch {{ patchVersion }}</p>
    </header>

    <p v-if="isLoadingData" class="lmt__status">Chargement Data Dragon…</p>
    <p v-else-if="dataError" class="lmt__error" role="alert">{{ dataError }}</p>

    <template v-if="!isLoadingData && data">
      <!-- SETUP -->
      <section v-if="state.phase === 'setup'" class="lmt__section" aria-label="Configuration">
        <nav class="lmt-steps" aria-label="Étapes">
          <button
            type="button"
            class="lmt-steps__item"
            :class="{ 'lmt-steps__item--on': state.setupStep === 'champions' }"
            @click="setSetupStep('champions')"
          >
            1. Champions
          </button>
          <button
            type="button"
            class="lmt-steps__item"
            :class="{ 'lmt-steps__item--on': state.setupStep === 'roles' }"
            :disabled="!canGoToRoles()"
            @click="goRoles"
          >
            2. Rôles
          </button>
          <button
            type="button"
            class="lmt-steps__item"
            :class="{ 'lmt-steps__item--on': state.setupStep === 'loadout' }"
            :disabled="!canGoToLoadout()"
            @click="goLoadout"
          >
            3. Runes &amp; sorts
          </button>
        </nav>

        <div class="lmt__toolbar">
          <button type="button" class="lmt-btn lmt-btn--danger" @click="openResetModal">
            Nouvelle partie
          </button>
          <button
            v-if="state.setupStep === 'champions'"
            type="button"
            class="lmt-btn lmt-btn--primary"
            :disabled="!canGoToRoles()"
            @click="goRoles"
          >
            Suivant · Rôles
          </button>
          <button
            v-else-if="state.setupStep === 'roles'"
            type="button"
            class="lmt-btn lmt-btn--primary"
            :disabled="!canGoToLoadout()"
            @click="goLoadout"
          >
            Suivant · Runes
          </button>
          <button
            v-else
            type="button"
            class="lmt-btn lmt-btn--primary"
            :disabled="!canStartLive()"
            @click="startLive"
          >
            Démarrer le suivi
          </button>
        </div>

        <!-- Step 1: champions -->
        <div v-if="state.setupStep === 'champions'" class="lmt-step">
          <p class="lmt-hint">
            Sélectionne jusqu’à 5 adversaires ({{ filledCount }}/5). À 5, passage auto aux rôles.
          </p>
          <div v-if="filledCount" class="lmt-picked">
            <button
              v-for="(pick, index) in state.setupPicks"
              :key="pick.pickId"
              type="button"
              class="lmt-picked__chip"
              :title="`Retirer ${pick.championName}`"
              @click="removeChampionAt(index)"
            >
              <img
                :src="ddragonChampionIconUrl(pick.championId, version)"
                alt=""
              />
              <span>{{ pick.championName }}</span>
              <span class="lmt-picked__x" aria-hidden="true">×</span>
            </button>
          </div>
          <input
            v-model="champSearch"
            type="search"
            class="lmt-input lmt-input--search"
            placeholder="Rechercher un champion…"
            :disabled="filledCount >= 5"
          />
          <ul class="lmt-champ-grid" :aria-disabled="filledCount >= 5">
            <li v-for="champ in filteredChampions" :key="champ.id">
              <button
                type="button"
                class="lmt-champ-tile"
                :disabled="filledCount >= 5"
                @click="selectChampion(champ)"
              >
                <img :src="ddragonChampionIconUrl(champ.id, version)" :alt="champ.name" />
                <span>{{ champ.name }}</span>
              </button>
            </li>
          </ul>
        </div>

        <!-- Step 2: roles -->
        <div v-else-if="state.setupStep === 'roles'" class="lmt-step">
          <p class="lmt-hint">
            Choisis le rôle de chaque champion (aucun n’est pré-sélectionné). Passage auto dès que
            c’est fait — Châtiment est pré-coché pour le Jungle.
          </p>
          <div
            v-for="pick in state.setupPicks"
            :key="pick.pickId"
            class="lmt-role-row"
            :class="{ 'lmt-role-row--ok': Boolean(pick.roleId) }"
          >
            <img
              :src="ddragonChampionIconUrl(pick.championId, version)"
              alt=""
              class="lmt-role-row__champ"
            />
            <div class="lmt-role-row__body">
              <strong>{{ pick.championName }}</strong>
              <div class="lmt-role-picks" role="group" :aria-label="`Rôle de ${pick.championName}`">
                <button
                  v-for="role in MATCH_ROLES"
                  :key="role.id"
                  type="button"
                  class="lmt-role-pick"
                  :class="{ 'lmt-role-pick--on': pick.roleId === role.id }"
                  @click="assignPickRole(pick.pickId, role.id)"
                >
                  {{ role.label }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Step 3: loadout (spells + runes) -->
        <div v-else class="lmt-step">
          <p class="lmt-hint">
            2 sorts + keystone + arbre secondaire → passage auto en suivi. Bottes en partie.
          </p>
          <article
            v-for="(enemy, index) in state.enemies"
            v-show="enemy.championId"
            :key="enemy.roleId + '-load'"
            class="lmt-card"
          >
            <header class="lmt-card__head">
              <img
                :src="ddragonChampionIconUrl(enemy.championId, version)"
                alt=""
                class="lmt-card__champ"
              />
              <div>
                <h2>{{ enemy.championName }}</h2>
                <p class="lmt-muted">{{ roleLabel(enemy.roleId) }}</p>
              </div>
            </header>

            <div class="lmt-field">
              <span class="lmt-field__label">Sorts d’invocateur</span>
              <div class="lmt-icon-grid lmt-icon-grid--spells">
                <button
                  v-for="sp in data.summoners"
                  :key="sp.id"
                  type="button"
                  class="lmt-icon-btn"
                  :class="{
                    'lmt-icon-btn--on': enemy.spell1Id === sp.id || enemy.spell2Id === sp.id,
                  }"
                  :title="`${sp.name} (${sp.cooldown?.[0] ?? '?'} s)`"
                  @click="toggleSummonerSpell(index, sp.id)"
                >
                  <img :src="ddragonSpellIconUrl(sp.image, version)" :alt="sp.name" />
                </button>
              </div>
              <p class="lmt-mini">
                Choisis 2 sorts —
                <template v-if="enemy.spell1Id || enemy.spell2Id">
                  {{ data.summoners.find((s) => s.id === enemy.spell1Id)?.name || '…' }}
                  /
                  {{ data.summoners.find((s) => s.id === enemy.spell2Id)?.name || '…' }}
                </template>
                <template v-else>aucun</template>
              </p>
            </div>

            <div class="lmt-field">
              <span class="lmt-field__label">Rune principale</span>
              <div class="lmt-icon-grid lmt-icon-grid--keystones">
                <button
                  v-for="ks in data.keystones"
                  :key="ks.id"
                  type="button"
                  class="lmt-icon-btn lmt-icon-btn--rune"
                  :class="{ 'lmt-icon-btn--on': enemy.keystoneId === ks.id }"
                  :title="`${ks.treeName} — ${ks.name}`"
                  @click="updateEnemy(index, { keystoneId: ks.id })"
                >
                  <img :src="ddragonRuneIconUrl(ks.icon)" :alt="ks.name" />
                </button>
              </div>
            </div>

            <div class="lmt-field">
              <span class="lmt-field__label">Arbre secondaire</span>
              <div class="lmt-icon-grid">
                <button
                  v-for="tree in data.runeTrees"
                  :key="tree.id"
                  type="button"
                  class="lmt-icon-btn lmt-icon-btn--rune"
                  :class="{ 'lmt-icon-btn--on': enemy.secondaryTreeId === tree.id }"
                  :title="tree.name"
                  @click="updateEnemy(index, { secondaryTreeId: tree.id })"
                >
                  <img :src="ddragonRuneIconUrl(tree.icon)" :alt="tree.name" />
                </button>
              </div>
              <label
                v-if="canUseCosmicInsight(enemy.secondaryTreeId)"
                class="lmt-check"
              >
                <input
                  type="checkbox"
                  :checked="enemy.cosmicInsight"
                  @change="onCosmicToggle(index, $event.target.checked)"
                />
                Savoir cosmique (+18 haste invoc.)
              </label>
            </div>
          </article>
        </div>
      </section>

      <!-- LIVE -->
      <section v-else class="lmt__section lmt__section--live" aria-label="Suivi">
        <div class="lmt__toolbar lmt__toolbar--sticky">
          <button type="button" class="lmt-btn" @click="setSetupStep('loadout')">
            Config
          </button>
          <button
            type="button"
            class="lmt-btn"
            :class="{ 'lmt-btn--warn': isPaused }"
            @click="togglePause"
          >
            {{ isPaused ? 'Reprendre' : 'Pause' }}
          </button>
          <button type="button" class="lmt-btn lmt-btn--danger" @click="openResetModal">
            Reset
          </button>
          <button
            type="button"
            class="lmt-btn lmt-btn--sm"
            :disabled="notifPermission === 'granted'"
            @click="askNotif"
          >
            {{
              notifPermission === 'granted'
                ? 'Notifs OK'
                : notifPermission === 'denied'
                  ? 'Notifs refusées'
                  : 'Activer notifs'
            }}
          </button>
        </div>

        <p class="lmt-hint lmt-hint--compact">
          Clic portrait = +1 niv. · Clic sort = lance / annule le CD · Bottes en bas
        </p>

        <div class="lmt-board">
          <article
            v-for="lane in liveLanes"
            :key="lane.role.id"
            class="lmt-lane"
            :class="{ 'lmt-lane--empty': !lane.enemy?.championId }"
          >
            <template v-if="lane.enemy?.championId">
              <button
                type="button"
                class="lmt-lane__portrait"
                :title="`${lane.enemy.championName} — niv. ${lane.enemy.level} (clic = +1)`"
                @click="bumpLevel(lane.index, 1)"
              >
                <img
                  :src="ddragonChampionIconUrl(lane.enemy.championId, version)"
                  :alt="lane.enemy.championName"
                />
                <span class="lmt-lane__level">{{ lane.enemy.level }}</span>
              </button>
              <button
                type="button"
                class="lmt-lane__lvl-down"
                title="Niveau −1"
                :disabled="lane.enemy.level <= 1"
                @click="bumpLevel(lane.index, -1)"
              >
                −
              </button>
              <p class="lmt-lane__name">{{ lane.enemy.championName }}</p>
              <p class="lmt-lane__role">{{ lane.role.label }}</p>

              <div class="lmt-abilities">
                <button
                  type="button"
                  class="lmt-cd"
                  :class="{
                    'lmt-cd--running': lane.enemy.timers.ultimate,
                    'lmt-cd--disabled': !enemyUltInfo(lane.enemy).available,
                  }"
                  :style="{
                    '--remain': lane.enemy.timers.ultimate
                      ? timerRemainRatio(lane.enemy.timers.ultimate)
                      : 0,
                  }"
                  :disabled="!enemyUltInfo(lane.enemy).available"
                  :title="enemyUltInfo(lane.enemy).spell?.name || 'R'"
                  @click="toggleAbility(lane.index, 'ultimate')"
                >
                  <img
                    v-if="enemyUltInfo(lane.enemy).spell?.image?.full"
                    :src="
                      ddragonSpellIconUrl(
                        enemyUltInfo(lane.enemy).spell.image.full,
                        version,
                      )
                    "
                    alt="R"
                  />
                  <span v-else class="lmt-cd__fallback">R</span>
                  <span class="lmt-cd__veil" aria-hidden="true" />
                  <span v-if="lane.enemy.timers.ultimate" class="lmt-cd__time">
                    {{ formatRemaining(timerRemainingMs(lane.enemy.timers.ultimate)) }}
                  </span>
                </button>

                <button
                  v-for="slot in [1, 2]"
                  :key="slot"
                  type="button"
                  class="lmt-cd"
                  :class="{
                    'lmt-cd--running':
                      lane.enemy.timers[slot === 1 ? 'spell1' : 'spell2'],
                    'lmt-cd--disabled': !enemySpellInfo(lane.enemy, slot).spell,
                  }"
                  :style="{
                    '--remain': lane.enemy.timers[slot === 1 ? 'spell1' : 'spell2']
                      ? timerRemainRatio(
                          lane.enemy.timers[slot === 1 ? 'spell1' : 'spell2'],
                        )
                      : 0,
                  }"
                  :disabled="!enemySpellInfo(lane.enemy, slot).spell"
                  :title="enemySpellInfo(lane.enemy, slot).spell?.name || 'Sort'"
                  @click="
                    toggleAbility(lane.index, slot === 1 ? 'spell1' : 'spell2')
                  "
                >
                  <img
                    v-if="enemySpellInfo(lane.enemy, slot).spell"
                    :src="
                      ddragonSpellIconUrl(
                        enemySpellInfo(lane.enemy, slot).spell.image,
                        version,
                      )
                    "
                    alt=""
                  />
                  <span class="lmt-cd__veil" aria-hidden="true" />
                  <span
                    v-if="lane.enemy.timers[slot === 1 ? 'spell1' : 'spell2']"
                    class="lmt-cd__time"
                  >
                    {{
                      formatRemaining(
                        timerRemainingMs(
                          lane.enemy.timers[slot === 1 ? 'spell1' : 'spell2'],
                        ),
                      )
                    }}
                  </span>
                </button>
              </div>

              <div
                v-if="
                  lane.enemy.timers.ultimate ||
                  lane.enemy.timers.spell1 ||
                  lane.enemy.timers.spell2
                "
                class="lmt-fix"
              >
                <button
                  v-for="kind in ['ultimate', 'spell1', 'spell2'].filter(
                    (k) => lane.enemy.timers[k],
                  )"
                  :key="kind"
                  type="button"
                  class="lmt-btn lmt-btn--sm"
                  @click="adjustTimer(lane.index, kind, 5)"
                >
                  {{ kind === 'ultimate' ? 'R' : kind === 'spell1' ? 'D' : 'F' }} −5s
                </button>
              </div>

              <div class="lmt-boots">
                <button
                  type="button"
                  class="lmt-boot"
                  :class="{ 'lmt-boot--on': !lane.enemy.bootsId }"
                  title="Aucune botte"
                  @click="updateEnemy(lane.index, { bootsId: null })"
                >
                  —
                </button>
                <button
                  v-for="boot in data.boots"
                  :key="boot.id"
                  type="button"
                  class="lmt-boot"
                  :class="{ 'lmt-boot--on': lane.enemy.bootsId === boot.id }"
                  :title="boot.name"
                  @click="updateEnemy(lane.index, { bootsId: boot.id })"
                >
                  <img :src="ddragonItemIconUrl(boot.id, version)" :alt="boot.name" />
                </button>
              </div>
            </template>
            <template v-else>
              <div class="lmt-lane__empty">{{ lane.role.label }}</div>
            </template>
          </article>
        </div>
      </section>
    </template>

    <footer class="lmt__legal">
      Cette application n'est pas approuvée par Riot Games et ne reflète pas les opinions de Riot
      Games ou de toute personne officiellement impliquée dans la production de League of Legends.
    </footer>

    <Teleport to="body">
      <div
        v-if="showResetModal"
        class="lmt-modal-overlay"
        role="presentation"
        @click.self="closeResetModal"
      >
        <div
          class="lmt-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lmt-reset-title"
        >
          <h2 id="lmt-reset-title" class="lmt-modal__title">Nouvelle partie ?</h2>
          <p class="lmt-modal__text">
            Cela efface la configuration, les niveaux et les cooldowns en cours.
          </p>
          <div class="lmt-modal__actions">
            <button type="button" class="lmt-btn" @click="closeResetModal">Annuler</button>
            <button type="button" class="lmt-btn lmt-btn--danger" @click="confirmReset">
              Remettre à zéro
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.lmt {
  max-width: 72rem;
  margin: 0 auto;
  padding: 0.75rem 0.75rem 2.5rem;
  box-sizing: border-box;
}

.lmt--flash {
  animation: lmt-flash 0.7s ease;
}

@keyframes lmt-flash {
  0% {
    background: color-mix(in srgb, #ad81be 35%, transparent);
  }
  100% {
    background: transparent;
  }
}

.lmt__header {
  margin-bottom: 0.75rem;
}

.lmt__eyebrow {
  margin: 0 0 0.25rem;
}

.lmt__back {
  color: #6d5a7e;
  text-decoration: none;
  font-weight: 650;
  font-size: 0.9rem;
}

.lmt__title {
  margin: 0;
  font-size: clamp(1.25rem, 4vw, 1.6rem);
  font-weight: 800;
  color: #2c3e50;
}

.lmt__patch,
.lmt__status,
.lmt-muted,
.lmt-mini,
.lmt-hint {
  color: #6c757d;
  font-size: 0.85rem;
}

.lmt__patch {
  margin: 0.2rem 0 0;
}

.lmt__error {
  color: #b33a3a;
  font-weight: 650;
}

.lmt-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  box-sizing: border-box;
  background: rgba(20, 16, 28, 0.55);
  backdrop-filter: blur(4px);
}

.lmt-modal {
  width: min(100%, 22rem);
  margin: auto;
  padding: 1.15rem 1.2rem 1.1rem;
  border-radius: 16px;
  background: #fff;
  border: 1px solid rgba(173, 129, 190, 0.28);
  box-shadow: 0 18px 40px rgba(20, 16, 28, 0.22);
}

.lmt-modal__title {
  margin: 0 0 0.45rem;
  font-size: 1.15rem;
  font-weight: 800;
  color: #2c3e50;
}

.lmt-modal__text {
  margin: 0 0 1rem;
  font-size: 0.9rem;
  color: #6c757d;
  line-height: 1.4;
}

.lmt-modal__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  justify-content: flex-end;
}

@media (prefers-color-scheme: dark) {
  .lmt-modal {
    background: #1e1a28;
    border-color: rgba(213, 181, 234, 0.2);
  }

  .lmt-modal__title {
    color: #f2eef6;
  }
}

.lmt-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
}

.lmt-steps__item {
  flex: 1 1 auto;
  min-width: 6.5rem;
  border: 1px solid rgba(173, 129, 190, 0.35);
  background: rgba(255, 255, 255, 0.7);
  border-radius: 999px;
  padding: 0.45rem 0.7rem;
  font-weight: 700;
  font-size: 0.8rem;
  cursor: pointer;
}

.lmt-steps__item--on {
  background: #ad81be;
  color: #fff;
  border-color: #ad81be;
}

.lmt-steps__item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.lmt__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-bottom: 0.85rem;
}

.lmt__toolbar--sticky {
  position: sticky;
  top: 0;
  z-index: 15;
  padding: 0.4rem 0;
  background: color-mix(in srgb, #f7f4f9 92%, transparent);
  backdrop-filter: blur(6px);
}

.lmt-btn {
  border: 1px solid rgba(44, 62, 80, 0.18);
  background: #fff;
  border-radius: 10px;
  padding: 0.45rem 0.75rem;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}

.lmt-btn--primary {
  background: #ad81be;
  border-color: #ad81be;
  color: #fff;
}

.lmt-btn--danger {
  background: #f8e8e8;
  border-color: #e0b4b4;
  color: #8a3030;
}

.lmt-btn--warn {
  background: #fff3cd;
  border-color: #e0c36a;
}

.lmt-btn--sm {
  padding: 0.3rem 0.5rem;
  font-size: 0.75rem;
}

.lmt-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.lmt-hint {
  margin: 0 0 0.75rem;
}

.lmt-hint--compact {
  margin-bottom: 0.5rem;
  font-size: 0.78rem;
}

.lmt-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(44, 62, 80, 0.18);
  border-radius: 10px;
  padding: 0.55rem 0.7rem;
  font-size: 0.95rem;
  margin-bottom: 0.65rem;
}

.lmt-picked {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.65rem;
}

.lmt-picked__chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: none;
  border-radius: 999px;
  padding: 0.25rem 0.55rem 0.25rem 0.25rem;
  background: #efe6f4;
  font-weight: 700;
  font-size: 0.8rem;
  cursor: pointer;
}

.lmt-picked__chip img {
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 50%;
}

.lmt-picked__x {
  opacity: 0.65;
}

.lmt-champ-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(4.6rem, 1fr));
  gap: 0.4rem;
  max-height: min(55vh, 28rem);
  overflow: auto;
}

.lmt-champ-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  width: 100%;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.55);
  border-radius: 10px;
  padding: 0.35rem;
  cursor: pointer;
  font-size: 0.68rem;
  font-weight: 650;
}

.lmt-champ-tile img {
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 8px;
}

.lmt-champ-tile:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.lmt-role-row {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  padding: 0.65rem;
  margin-bottom: 0.55rem;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.65);
  border: 1px solid rgba(173, 129, 190, 0.2);
}

.lmt-role-row__champ {
  width: 3.2rem;
  height: 3.2rem;
  border-radius: 10px;
  flex-shrink: 0;
}

.lmt-role-row__body {
  flex: 1;
  min-width: 0;
}

.lmt-role-picks {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.35rem;
}

.lmt-role-pick {
  border: 1px solid rgba(44, 62, 80, 0.15);
  background: #fff;
  border-radius: 8px;
  padding: 0.35rem 0.55rem;
  font-weight: 700;
  font-size: 0.78rem;
  cursor: pointer;
}

.lmt-role-pick--on {
  background: #ad81be;
  color: #fff;
  border-color: #ad81be;
}

.lmt-card {
  margin-bottom: 0.85rem;
  padding: 0.85rem;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(173, 129, 190, 0.22);
}

.lmt-card__head {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin-bottom: 0.75rem;
}

.lmt-card__champ {
  width: 3rem;
  height: 3rem;
  border-radius: 10px;
}

.lmt-card__head h2 {
  margin: 0;
  font-size: 1.05rem;
}

.lmt-field {
  margin-bottom: 0.85rem;
}

.lmt-field__label {
  display: block;
  font-weight: 750;
  font-size: 0.82rem;
  margin-bottom: 0.4rem;
}

.lmt-role-row--ok {
  border-color: rgba(149, 209, 170, 0.55);
  box-shadow: inset 0 0 0 1px rgba(149, 209, 170, 0.25);
}

.lmt-icon-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.lmt-icon-grid--keystones {
  /* Toutes les keystones compactes : 1 ligne sur grand écran, wrap sur 2 sinon */
  display: flex;
  flex-wrap: wrap;
  gap: 0.28rem;
  max-width: 100%;
}

.lmt-icon-grid--keystones .lmt-icon-btn {
  width: 2.45rem;
  height: 2.45rem;
  flex: 0 0 auto;
}

.lmt-icon-btn {
  position: relative;
  width: 2.75rem;
  height: 2.75rem;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 10px;
  background: #1a1520;
  cursor: pointer;
  overflow: hidden;
}

.lmt-icon-btn img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.lmt-icon-btn--rune {
  background: #121018;
}

.lmt-icon-btn--on {
  border-color: #f0c36a;
  box-shadow: 0 0 0 2px rgba(240, 195, 106, 0.35);
}

.lmt-check {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.45rem;
  font-size: 0.85rem;
  font-weight: 650;
}

/* Live board */
.lmt-board {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.45rem;
}

.lmt-lane {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
  padding: 0.45rem 0.3rem 0.55rem;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(173, 129, 190, 0.22);
}

.lmt-lane--empty {
  opacity: 0.45;
  min-height: 8rem;
  justify-content: center;
}

.lmt-lane__empty {
  font-size: 0.78rem;
  font-weight: 700;
  color: #8a7a96;
}

.lmt-lane__portrait {
  position: relative;
  width: min(22vw, 4.6rem);
  height: min(22vw, 4.6rem);
  max-width: 4.6rem;
  max-height: 4.6rem;
  padding: 0;
  border: 2px solid #ad81be;
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  background: #1a1520;
}

.lmt-lane__portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.lmt-lane__level {
  position: absolute;
  right: 0.15rem;
  bottom: 0.15rem;
  min-width: 1.35rem;
  height: 1.35rem;
  padding: 0 0.25rem;
  border-radius: 999px;
  background: #2c3e50;
  color: #fff;
  font-size: 0.72rem;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.lmt-lane__lvl-down {
  border: none;
  background: rgba(44, 62, 80, 0.08);
  border-radius: 6px;
  width: 1.6rem;
  height: 1.35rem;
  font-weight: 800;
  cursor: pointer;
  line-height: 1;
}

.lmt-lane__name {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 800;
  text-align: center;
  line-height: 1.15;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lmt-lane__role {
  margin: 0;
  font-size: 0.65rem;
  font-weight: 700;
  color: #8a7a96;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.lmt-abilities {
  display: flex;
  gap: 0.28rem;
  margin-top: 0.2rem;
}

.lmt-cd {
  position: relative;
  width: 2.55rem;
  height: 2.55rem;
  padding: 0;
  border: 1px solid rgba(0, 0, 0, 0.25);
  border-radius: 8px;
  overflow: hidden;
  background: #0e0c12;
  cursor: pointer;
}

.lmt-cd img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.lmt-cd__fallback {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: #fff;
  font-weight: 900;
  font-size: 1.1rem;
}

.lmt-cd__veil {
  position: absolute;
  inset: 0;
  background: conic-gradient(
    rgba(0, 0, 0, 0.72) 0 calc(var(--remain, 0) * 360deg),
    transparent calc(var(--remain, 0) * 360deg)
  );
  pointer-events: none;
}

.lmt-cd__time {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 900;
  font-size: 0.78rem;
  text-shadow: 0 1px 2px #000;
  pointer-events: none;
}

.lmt-cd--disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.lmt-cd--running {
  border-color: #f0c36a;
}

.lmt-fix {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem;
  justify-content: center;
}

.lmt-boots {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem;
  justify-content: center;
  margin-top: 0.25rem;
  max-width: 100%;
}

.lmt-boot {
  width: 1.7rem;
  height: 1.7rem;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.08);
  cursor: pointer;
  overflow: hidden;
  font-size: 0.7rem;
  font-weight: 800;
  color: #6c757d;
}

.lmt-boot img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.lmt-boot--on {
  border-color: #95d1aa;
  box-shadow: 0 0 0 1px rgba(149, 209, 170, 0.5);
}

.lmt__legal {
  margin-top: 1.5rem;
  font-size: 0.7rem;
  color: #8a7a96;
  line-height: 1.35;
}

@media (max-width: 720px) {
  .lmt-board {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .lmt-lane:nth-child(4),
  .lmt-lane:nth-child(5) {
    /* ADC + Support passent sur 2e ligne centrés via auto-flow */
  }
}

@media (max-width: 480px) {
  .lmt-board {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .lmt-cd {
    width: 2.35rem;
    height: 2.35rem;
  }

  .lmt-champ-grid {
    grid-template-columns: repeat(auto-fill, minmax(4.1rem, 1fr));
  }
}

@media (prefers-color-scheme: dark) {
  .lmt__title {
    color: #f2eef6;
  }

  .lmt-btn,
  .lmt-role-pick,
  .lmt-steps__item,
  .lmt-lane,
  .lmt-card,
  .lmt-role-row,
  .lmt-champ-tile {
    background: rgba(30, 26, 40, 0.85);
    color: #eee;
  }

  .lmt__toolbar--sticky {
    background: color-mix(in srgb, #1a1520 92%, transparent);
  }

  .lmt-input {
    background: #1a1520;
    color: #eee;
    border-color: rgba(255, 255, 255, 0.12);
  }
}
</style>
