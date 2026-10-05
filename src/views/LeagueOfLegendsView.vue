<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import LolRadarChart from '../components/jeux/LolRadarChart.vue'
import LolItemTooltipCard from '../components/jeux/LolItemTooltipCard.vue'
import { APP_PAGE_IDS } from '../constants/common/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'
import { supabase } from '../lib/supabase.js'
import {
  LOL_PLATFORM_OPTIONS,
  buildEloComparison,
  csPerMin,
  dayEndEpoch,
  dayStartEpoch,
  fetchChampionHighlights,
  fetchLeagueEntries,
  fetchRecentMatches,
  formatMasteryPoints,
  formatMatchDate,
  formatMatchDuration,
  formatQueueLabel,
  formatRankLabel,
  formatRoleLabel,
  killParticipationPct,
  lolChampionIcon,
  lolChampionIconByName,
  lolItemIconUrl,
  lolItemName,
  lolItemTooltip,
  ensureLolItemCatalog,
  lolProfileIconUrl,
  lolRankEmblemUrl,
  participantItems,
  pickRankedEntries,
  resolveRiotAccount,
  totalCs,
} from '../services/jeux/riot.js'
import {
  deleteLolAccount,
  listLolAccounts,
  touchLolAccountSync,
  upsertLolAccount,
} from '../services/jeux/lolAccounts.js'
import { resolveSessionUser } from '../utils/auth/sessionUser.js'

defineOptions({ name: 'LeagueOfLegendsView' })

usePageDisplayLabel(APP_PAGE_IDS.JEUX, 'League of Legends', {
  setDocumentTitle: true,
})

const PAGE_SIZE = 10

const userId = ref(null)
const accounts = ref([])
const selectedAccountId = ref(null)
const matches = ref([])
const hasMoreMatches = ref(false)
const page = ref(1)

const isLoadingAccounts = ref(true)
const isSavingAccount = ref(false)
const isLoadingMatches = ref(false)
const isLoadingRanks = ref(false)
const isLoadingChampions = ref(false)
const topChampions = ref([])
const errorMessage = ref('')
const matchesError = ref('')

const showAddForm = ref(false)
const gameNameInput = ref('')
const tagLineInput = ref('')
const labelInput = ref('')
const platformInput = ref('euw1')

const dateFrom = ref('')
const dateTo = ref('')
const resultFilter = ref('all') // all | win | loss
const queueFilter = ref('all') // all | 420 | 440 | 400 | 450

const leagueSolo = ref(null)
const leagueFlex = ref(null)

const selectedMatch = ref(null)

/** Tooltip item hors overflow du modal (Teleport body). */
const itemTipId = ref(null)
const itemTipStyle = ref({})

const selectedAccount = computed(() =>
  accounts.value.find((item) => item.id === selectedAccountId.value) ?? null,
)

const filteredMatches = computed(() => {
  let list = matches.value
  if (resultFilter.value === 'win') {
    list = list.filter((m) => m.participant?.win === true)
  } else if (resultFilter.value === 'loss') {
    list = list.filter((m) => m.participant?.win === false)
  }
  if (queueFilter.value !== 'all') {
    const q = Number(queueFilter.value)
    list = list.filter((m) => Number(m.queueId) === q)
  }
  return list
})

const compareData = computed(() => {
  const match = selectedMatch.value
  if (!match?.participant) return null
  const ranked =
    Number(match.queueId) === 440 ? leagueFlex.value : leagueSolo.value
  return buildEloComparison(match.participant, match.gameDuration, ranked)
})

function wrClass(winRate) {
  const n = Number(winRate)
  if (!Number.isFinite(n)) return ''
  return n >= 50 ? 'lol-champ-icon__wr--good' : 'lol-champ-icon__wr--bad'
}

function riotDisplayName(account) {
  return `${account.game_name}#${account.tag_line}`
}

function kdaLabel(participant) {
  if (!participant) return '—'
  return `${participant.kills ?? 0} / ${participant.deaths ?? 0} / ${participant.assists ?? 0}`
}

function playerLabel(p) {
  if (!p) return '—'
  const name = p.riotIdGameName || p.summonerName || 'Joueur'
  const tag = p.riotIdTagline ? `#${p.riotIdTagline}` : ''
  return `${name}${tag}`
}

function teamOf(match, teamId) {
  return (match?.participants ?? []).filter((p) => Number(p.teamId) === teamId)
}

function myTeamId(match) {
  return Number(match?.participant?.teamId) || 100
}

async function loadAccounts() {
  if (!userId.value) return
  isLoadingAccounts.value = true
  errorMessage.value = ''
  try {
    accounts.value = await listLolAccounts(supabase, userId.value)
    if (
      selectedAccountId.value &&
      !accounts.value.some((item) => item.id === selectedAccountId.value)
    ) {
      selectedAccountId.value = null
    }
    if (!selectedAccountId.value && accounts.value.length) {
      selectedAccountId.value = accounts.value[0].id
    }
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Impossible de charger les comptes.'
  } finally {
    isLoadingAccounts.value = false
  }
}

async function addAccount() {
  if (!userId.value || isSavingAccount.value) return
  errorMessage.value = ''

  const gameName = gameNameInput.value.trim()
  const tagLine = tagLineInput.value.trim().replace(/^#/, '')
  if (!gameName || !tagLine) {
    errorMessage.value = 'Indique le pseudo et la tagline (ex. Mel + EUW).'
    return
  }

  isSavingAccount.value = true
  try {
    const resolved = await resolveRiotAccount(gameName, tagLine, platformInput.value)
    const account = resolved?.account
    const summoner = resolved?.summoner
    if (!account?.puuid) throw new Error('Compte Riot introuvable.')

    const { solo, flex } = pickRankedEntries(resolved?.leagueEntries)
    const saved = await upsertLolAccount(supabase, userId.value, {
      label: labelInput.value,
      gameName: account.gameName ?? gameName,
      tagLine: account.tagLine ?? tagLine,
      puuid: account.puuid,
      platform: resolved.platform ?? platformInput.value,
      routing: resolved.routing,
      summonerId: summoner?.id ?? summoner?.summonerId ?? null,
      summonerLevel: summoner?.summonerLevel ?? null,
      profileIconId: summoner?.profileIconId ?? null,
      metadata: {
        revisionDate: summoner?.revisionDate ?? null,
        leagueSolo: solo,
        leagueFlex: flex,
      },
    })

    gameNameInput.value = ''
    tagLineInput.value = ''
    labelInput.value = ''
    showAddForm.value = false
    await loadAccounts()
    selectedAccountId.value = saved.id
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Impossible d’ajouter le compte.'
  } finally {
    isSavingAccount.value = false
  }
}

async function removeAccount(accountId) {
  if (!userId.value || !accountId) return
  const ok = window.confirm('Retirer ce compte League of Legends ?')
  if (!ok) return
  try {
    await deleteLolAccount(supabase, userId.value, accountId)
    if (selectedAccountId.value === accountId) {
      selectedAccountId.value = null
      matches.value = []
      leagueSolo.value = null
      leagueFlex.value = null
      selectedMatch.value = null
    }
    await loadAccounts()
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Suppression impossible.'
  }
}

async function loadChampionHighlights() {
  const account = selectedAccount.value
  if (!account?.puuid) {
    topChampions.value = []
    return
  }

  isLoadingChampions.value = true
  try {
    const data = await fetchChampionHighlights(account.puuid, {
      platform: account.platform || 'euw1',
      days: 90,
    })
    topChampions.value = Array.isArray(data?.champions) ? data.champions : []
  } catch (err) {
    console.warn('champion highlights:', err)
    topChampions.value = []
  } finally {
    isLoadingChampions.value = false
  }
}

async function loadRanksForSelected() {
  const account = selectedAccount.value
  if (!account?.puuid) {
    leagueSolo.value = null
    leagueFlex.value = null
    return
  }

  const cachedSolo = account.metadata?.leagueSolo ?? null
  const cachedFlex = account.metadata?.leagueFlex ?? null
  if (cachedSolo || cachedFlex) {
    leagueSolo.value = cachedSolo
    leagueFlex.value = cachedFlex
  }

  isLoadingRanks.value = true
  try {
    const data = await fetchLeagueEntries(
      account.puuid,
      account.platform || 'euw1',
      account.summoner_id || null,
    )
    const { solo, flex } = pickRankedEntries(data?.entries)
    leagueSolo.value = solo
    leagueFlex.value = flex

    if (userId.value && account.id) {
      await touchLolAccountSync(supabase, userId.value, account.id, {
        metadata: {
          ...(account.metadata && typeof account.metadata === 'object' ? account.metadata : {}),
          leagueSolo: solo,
          leagueFlex: flex,
        },
      })
    }
  } catch (err) {
    console.warn('league entries:', err)
    if (!leagueSolo.value && !leagueFlex.value) {
      leagueSolo.value = null
      leagueFlex.value = null
    }
  } finally {
    isLoadingRanks.value = false
  }
}

function matchQueryOptions() {
  const account = selectedAccount.value
  const startTime = dateFrom.value ? dayStartEpoch(dateFrom.value) : null
  const endTime = dateTo.value ? dayEndEpoch(dateTo.value) : null
  const queueId = queueFilter.value !== 'all' ? Number(queueFilter.value) : null

  return {
    platform: account?.platform || 'euw1',
    count: PAGE_SIZE,
    start: (page.value - 1) * PAGE_SIZE,
    startTime: startTime ?? undefined,
    endTime: endTime ?? undefined,
    // Historique large par défaut : la pagination gère les 10 / page
    days: startTime == null && endTime == null ? 90 : undefined,
    queueId: queueId && Number.isFinite(queueId) ? queueId : undefined,
  }
}

async function loadMatchesForSelected() {
  const account = selectedAccount.value
  if (!account?.puuid) {
    matches.value = []
    hasMoreMatches.value = false
    return
  }

  isLoadingMatches.value = true
  matchesError.value = ''
  try {
    const data = await fetchRecentMatches(account.puuid, matchQueryOptions())
    matches.value = Array.isArray(data?.matches) ? data.matches : []
    hasMoreMatches.value = Boolean(data?.hasMore)

    if (userId.value && account.id) {
      await touchLolAccountSync(supabase, userId.value, account.id)
    }
  } catch (err) {
    console.error(err)
    matchesError.value = err.message || 'Impossible de charger les matchs.'
    matches.value = []
    hasMoreMatches.value = false
  } finally {
    isLoadingMatches.value = false
  }
}

function selectAccount(accountId) {
  if (selectedAccountId.value === accountId) return
  selectedAccountId.value = accountId
  page.value = 1
  hideItemTip()
  selectedMatch.value = null
}

function openMatch(match) {
  hideItemTip()
  selectedMatch.value = match
}

function closeMatch() {
  hideItemTip()
  selectedMatch.value = null
}

/**
 * Affiche la fiche item en fixed hors du modal (évite le clip overflow).
 * @param {MouseEvent | FocusEvent} event
 * @param {number} itemId
 */
function showItemTip(event, itemId) {
  const el = /** @type {HTMLElement | null} */ (event.currentTarget)
  if (!el || !itemId) return
  const rect = el.getBoundingClientRect()
  const tipWidth = 290
  const gap = 10
  const margin = 10
  let left = rect.left + rect.width / 2
  left = Math.min(window.innerWidth - margin - tipWidth / 2, Math.max(margin + tipWidth / 2, left))

  const spaceBelow = window.innerHeight - rect.bottom
  const spaceAbove = rect.top
  const preferBelow = spaceBelow >= 240 || spaceBelow >= spaceAbove

  itemTipId.value = itemId
  itemTipStyle.value = preferBelow
    ? {
        top: `${Math.round(rect.bottom + gap)}px`,
        left: `${Math.round(left)}px`,
        transform: 'translateX(-50%)',
        maxHeight: `${Math.max(160, spaceBelow - gap - margin)}px`,
      }
    : {
        top: 'auto',
        bottom: `${Math.round(window.innerHeight - rect.top + gap)}px`,
        left: `${Math.round(left)}px`,
        transform: 'translateX(-50%)',
        maxHeight: `${Math.max(160, spaceAbove - gap - margin)}px`,
      }
}

function hideItemTip() {
  itemTipId.value = null
  itemTipStyle.value = {}
}

function goFirstPage() {
  if (page.value <= 1 || isLoadingMatches.value) return
  page.value = 1
  void loadMatchesForSelected()
}

function goPrevPage() {
  if (page.value <= 1 || isLoadingMatches.value) return
  page.value -= 1
  void loadMatchesForSelected()
}

function goNextPage() {
  if (!hasMoreMatches.value || isLoadingMatches.value) return
  page.value += 1
  void loadMatchesForSelected()
}

function resetFilters() {
  dateFrom.value = ''
  dateTo.value = ''
  resultFilter.value = 'all'
  queueFilter.value = 'all'
  page.value = 1
  if (selectedAccount.value) void loadMatchesForSelected()
}

watch(selectedAccountId, async (id) => {
  if (!id) {
    matches.value = []
    leagueSolo.value = null
    leagueFlex.value = null
    topChampions.value = []
    return
  }
  page.value = 1
  // Matchs d’abord (priorité UI) — le highlight champions tape fort l’API Riot
  // et faisait échouer une partie des détails → seulement 2–3 parties affichées.
  await loadMatchesForSelected()
  void loadRanksForSelected()
  void loadChampionHighlights()
})

watch([dateFrom, dateTo, queueFilter], () => {
  if (!selectedAccount.value) return
  page.value = 1
  void loadMatchesForSelected()
})

onMounted(async () => {
  const user = await resolveSessionUser()
  if (user) {
    userId.value = user.id
    await loadAccounts()
  } else {
    isLoadingAccounts.value = false
  }
  void ensureLolItemCatalog()
})
</script>

<template>
  <div class="lol-page">
    <header class="lol-page__header">
      <p class="lol-page__eyebrow">
        <RouterLink to="/jeux" class="lol-page__back">← Jeux</RouterLink>
      </p>
      <h1 class="lol-page__title">League of Legends</h1>
      <p class="lol-page__subtitle">
        Suivi multi-comptes : elo, matchs, détail de partie et comparatif au niveau de ton rang.
      </p>
    </header>

    <p v-if="errorMessage" class="lol-page__error" role="alert">{{ errorMessage }}</p>

    <!-- Onglets comptes -->
    <div class="lol-tabs" role="tablist" aria-label="Comptes Riot">
      <p v-if="isLoadingAccounts" class="lol-muted lol-tabs__loading">Chargement des comptes…</p>
      <template v-else>
        <button
          v-for="account in accounts"
          :key="account.id"
          type="button"
          role="tab"
          class="lol-tab"
          :class="{ 'lol-tab--active': account.id === selectedAccountId }"
          :aria-selected="account.id === selectedAccountId"
          @click="selectAccount(account.id)"
        >
          <img
            v-if="lolProfileIconUrl(account.profile_icon_id)"
            :src="lolProfileIconUrl(account.profile_icon_id)"
            alt=""
            class="lol-tab__icon"
          />
          <span class="lol-tab__text">
            <span class="lol-tab__name">{{ riotDisplayName(account) }}</span>
            <span v-if="account.label" class="lol-tab__label">{{ account.label }}</span>
          </span>
          <span
            class="lol-tab__remove"
            title="Retirer"
            @click.stop="removeAccount(account.id)"
          >×</span>
        </button>

        <button
          type="button"
          class="lol-tab lol-tab--add"
          :aria-expanded="showAddForm"
          @click="showAddForm = !showAddForm"
        >
          + Compte
        </button>
      </template>
    </div>

    <!-- Formulaire ajout -->
    <section v-if="showAddForm" class="lol-card lol-card--add" aria-labelledby="lol-add-title">
      <h2 id="lol-add-title" class="lol-card__title">Ajouter un compte</h2>
      <form class="lol-form" @submit.prevent="addAccount">
        <label class="lol-field">
          <span class="lol-field__label">Pseudo</span>
          <input
            v-model="gameNameInput"
            type="text"
            class="lol-input"
            placeholder="Mel"
            autocomplete="off"
            maxlength="64"
            required
          />
        </label>
        <label class="lol-field">
          <span class="lol-field__label">Tagline</span>
          <input
            v-model="tagLineInput"
            type="text"
            class="lol-input"
            placeholder="EUW"
            autocomplete="off"
            maxlength="16"
            required
          />
        </label>
        <label class="lol-field">
          <span class="lol-field__label">Libellé (optionnel)</span>
          <input
            v-model="labelInput"
            type="text"
            class="lol-input"
            placeholder="Principal, smurf…"
            maxlength="80"
          />
        </label>
        <label class="lol-field">
          <span class="lol-field__label">Région</span>
          <select v-model="platformInput" class="lol-input">
            <option v-for="opt in LOL_PLATFORM_OPTIONS" :key="opt.id" :value="opt.id">
              {{ opt.label }}
            </option>
          </select>
        </label>
        <div class="lol-form__actions">
          <button type="button" class="lol-btn" @click="showAddForm = false">Annuler</button>
          <button type="submit" class="lol-btn lol-btn--primary" :disabled="isSavingAccount">
            {{ isSavingAccount ? 'Ajout…' : 'Enregistrer' }}
          </button>
        </div>
      </form>
    </section>

    <p v-if="!isLoadingAccounts && !accounts.length && !showAddForm" class="lol-muted">
      Aucun compte — clique sur « + Compte » pour commencer.
    </p>

    <template v-if="selectedAccount">
      <!-- Elo Solo / Flex -->
      <section class="lol-ranks" aria-label="Classements">
        <article class="lol-rank-card">
          <img
            :src="lolRankEmblemUrl(leagueSolo?.tier)"
            alt=""
            class="lol-rank-card__emblem"
          />
          <div>
            <p class="lol-rank-card__queue">Solo / Duo</p>
            <p class="lol-rank-card__tier">{{ formatRankLabel(leagueSolo) }}</p>
            <p v-if="leagueSolo" class="lol-rank-card__wl">
              {{ leagueSolo.wins ?? 0 }}V · {{ leagueSolo.losses ?? 0 }}D
              <template v-if="(leagueSolo.wins || 0) + (leagueSolo.losses || 0) > 0">
                ·
                {{
                  Math.round(
                    ((leagueSolo.wins || 0) /
                      ((leagueSolo.wins || 0) + (leagueSolo.losses || 0))) *
                      100,
                  )
                }}%
              </template>
            </p>
            <p v-else-if="isLoadingRanks" class="lol-muted">Chargement…</p>
            <p v-else class="lol-muted">Pas encore classé</p>
          </div>
        </article>
        <article class="lol-rank-card">
          <img
            :src="lolRankEmblemUrl(leagueFlex?.tier)"
            alt=""
            class="lol-rank-card__emblem"
          />
          <div>
            <p class="lol-rank-card__queue">Flex</p>
            <p class="lol-rank-card__tier">{{ formatRankLabel(leagueFlex) }}</p>
            <p v-if="leagueFlex" class="lol-rank-card__wl">
              {{ leagueFlex.wins ?? 0 }}V · {{ leagueFlex.losses ?? 0 }}D
              <template v-if="(leagueFlex.wins || 0) + (leagueFlex.losses || 0) > 0">
                ·
                {{
                  Math.round(
                    ((leagueFlex.wins || 0) /
                      ((leagueFlex.wins || 0) + (leagueFlex.losses || 0))) *
                      100,
                  )
                }}%
              </template>
            </p>
            <p v-else-if="isLoadingRanks" class="lol-muted">Chargement…</p>
            <p v-else class="lol-muted">Pas encore classé</p>
          </div>
        </article>
        <div class="lol-rank-card lol-rank-card--meta">
          <p class="lol-rank-card__queue">Compte</p>
          <p class="lol-rank-card__tier">{{ riotDisplayName(selectedAccount) }}</p>
          <p class="lol-muted">
            {{ selectedAccount.platform }}
            <template v-if="selectedAccount.summoner_level">
              · niv. {{ selectedAccount.summoner_level }}
            </template>
          </p>
        </div>
      </section>

      <section
        v-if="topChampions.length || isLoadingChampions"
        class="lol-champs"
        aria-label="Champions les plus joués"
      >
        <p v-if="isLoadingChampions" class="lol-muted">Chargement des champions…</p>
        <ul v-else class="lol-champs__icons">
          <li v-for="champ in topChampions" :key="champ.championName" class="lol-champ-icon">
            <img
              v-if="lolChampionIcon(champ.championName, champ.championId)"
              :src="lolChampionIcon(champ.championName, champ.championId)"
              :alt="champ.championName"
              :title="champ.championName"
              class="lol-champ-icon__img"
            />
            <p class="lol-champ-icon__stat" :class="wrClass(champ.winRate)">
              {{ champ.winRate }}% WR
            </p>
            <p class="lol-champ-icon__stat">{{ formatMasteryPoints(champ.masteryPoints) }}</p>
            <p class="lol-champ-icon__stat lol-champ-icon__stat--share">
              {{ champ.playShare ?? 0 }}% joué
            </p>
          </li>
        </ul>
      </section>

      <!-- Filtres + liste -->
      <section class="lol-card" aria-labelledby="lol-matches-title">
        <div class="lol-matches__head">
          <h2 id="lol-matches-title" class="lol-card__title">Historique</h2>
          <button
            type="button"
            class="lol-btn"
            :disabled="isLoadingMatches"
            @click="loadMatchesForSelected"
          >
            Actualiser
          </button>
        </div>

        <div class="lol-filters">
          <label class="lol-filter">
            Du
            <input v-model="dateFrom" type="date" class="lol-input lol-input--sm" />
          </label>
          <label class="lol-filter">
            Au
            <input v-model="dateTo" type="date" class="lol-input lol-input--sm" />
          </label>
          <label class="lol-filter">
            Résultat
            <select v-model="resultFilter" class="lol-input lol-input--sm">
              <option value="all">Tous</option>
              <option value="win">Victoires</option>
              <option value="loss">Défaites</option>
            </select>
          </label>
          <label class="lol-filter">
            File
            <select v-model="queueFilter" class="lol-input lol-input--sm">
              <option value="all">Toutes</option>
              <option value="420">Classé Solo/Duo</option>
              <option value="440">Classé Flex</option>
              <option value="400">Draft</option>
              <option value="430">Blind</option>
              <option value="450">ARAM</option>
              <option value="490">Quickplay</option>
            </select>
          </label>
          <button type="button" class="lol-btn lol-btn--ghost" @click="resetFilters">
            Réinit.
          </button>
        </div>

        <p v-if="isLoadingMatches" class="lol-muted">Chargement des matchs…</p>
        <p v-else-if="matchesError" class="lol-page__error">{{ matchesError }}</p>
        <template v-else>
          <p v-if="!filteredMatches.length" class="lol-muted">
            Aucun match pour ces filtres.
          </p>
          <ul v-else class="lol-matches">
            <li v-for="match in filteredMatches" :key="match.matchId">
              <button
                type="button"
                class="lol-match"
                :class="{
                  'lol-match--win': match.participant?.win === true,
                  'lol-match--loss': match.participant?.win === false,
                }"
                @click="openMatch(match)"
              >
                <img
                  v-if="lolChampionIconByName(match.participant?.championName)"
                  :src="lolChampionIconByName(match.participant?.championName)"
                  alt=""
                  class="lol-match__champ"
                />
                <div class="lol-match__body">
                  <p class="lol-match__line1">
                    <span class="lol-match__champ-name">
                      {{ match.participant?.championName || 'Champion' }}
                    </span>
                    <span class="lol-match__result">
                      {{ match.participant?.win ? 'Victoire' : 'Défaite' }}
                    </span>
                    <span class="lol-match__role">
                      {{ formatRoleLabel(match.participant?.teamPosition) }}
                    </span>
                  </p>
                  <p class="lol-match__meta">
                    {{ formatQueueLabel(match.queueId, match.gameMode) }}
                    · {{ formatMatchDate(match.gameCreation) }}
                    · {{ formatMatchDuration(match.gameDuration) }}
                  </p>
                  <div class="lol-match__items">
                    <img
                      v-for="(itemId, idx) in participantItems(match.participant)"
                      :key="`${match.matchId}-${idx}`"
                      :src="lolItemIconUrl(itemId)"
                      :alt="lolItemName(itemId)"
                      :title="lolItemTooltip(itemId)"
                      class="lol-match__item"
                    />
                  </div>
                </div>
                <div class="lol-match__stats">
                  <p class="lol-match__kda">{{ kdaLabel(match.participant) }}</p>
                  <p class="lol-match__sub">
                    {{ csPerMin(match.participant, match.gameDuration).toFixed(1) }} CS/min
                    ·
                    {{ killParticipationPct(match.participant, match.teamKills) ?? '—' }}% KP
                  </p>
                </div>
              </button>
            </li>
          </ul>

          <div class="lol-pager">
            <button
              type="button"
              class="lol-btn"
              :disabled="page <= 1 || isLoadingMatches"
              title="Première page"
              @click="goFirstPage"
            >
              ⟪ Début
            </button>
            <button
              type="button"
              class="lol-btn"
              :disabled="page <= 1 || isLoadingMatches"
              @click="goPrevPage"
            >
              ← Précédent
            </button>
            <span class="lol-pager__label">Page {{ page }}</span>
            <button
              type="button"
              class="lol-btn"
              :disabled="!hasMoreMatches || isLoadingMatches"
              @click="goNextPage"
            >
              Suivant →
            </button>
          </div>
        </template>
      </section>
    </template>

    <Teleport to="body">
      <div
        v-if="itemTipId && selectedMatch"
        class="lol-item-tip-portal"
        :style="itemTipStyle"
        role="tooltip"
      >
        <LolItemTooltipCard :item-id="itemTipId" />
      </div>
    </Teleport>

    <!-- Détail match (zone contenu, à droite de la sidebar) -->
    <div
      v-if="selectedMatch"
      class="lol-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lol-detail-title"
      @click.self="closeMatch"
    >
      <div
        class="lol-detail"
        :class="{
          'lol-detail--win': selectedMatch.participant?.win === true,
          'lol-detail--loss': selectedMatch.participant?.win === false,
        }"
      >
        <header class="lol-detail__header">
          <div>
            <h2 id="lol-detail-title" class="lol-detail__title">
              {{ selectedMatch.participant?.championName || 'Match' }}
              ·
              {{ selectedMatch.participant?.win ? 'Victoire' : 'Défaite' }}
            </h2>
            <p class="lol-detail__meta">
              {{ formatQueueLabel(selectedMatch.queueId, selectedMatch.gameMode) }}
              · {{ formatRoleLabel(selectedMatch.participant?.teamPosition) }}
              · {{ formatMatchDuration(selectedMatch.gameDuration) }}
              · {{ formatMatchDate(selectedMatch.gameCreation) }}
            </p>
          </div>
          <button type="button" class="lol-btn" @click="closeMatch">Fermer</button>
        </header>

        <div class="lol-detail__hero">
          <img
            v-if="lolChampionIconByName(selectedMatch.participant?.championName)"
            :src="lolChampionIconByName(selectedMatch.participant?.championName)"
            alt=""
            class="lol-detail__champ"
          />
          <div>
            <p class="lol-detail__kda">{{ kdaLabel(selectedMatch.participant) }}</p>
            <p class="lol-detail__kda-label">
              KILL / MORT / ASSIST ·
              {{ totalCs(selectedMatch.participant) }} CS
              ({{ csPerMin(selectedMatch.participant, selectedMatch.gameDuration).toFixed(1) }}/min)
              ·
              {{ killParticipationPct(selectedMatch.participant, selectedMatch.teamKills) ?? '—' }} % KP
            </p>
            <div class="lol-detail__items">
              <span
                v-for="(itemId, idx) in participantItems(selectedMatch.participant)"
                :key="`d-${idx}`"
                class="lol-item-tip"
                tabindex="0"
                @mouseenter="showItemTip($event, itemId)"
                @mouseleave="hideItemTip"
                @focus="showItemTip($event, itemId)"
                @blur="hideItemTip"
              >
                <img
                  :src="lolItemIconUrl(itemId)"
                  :alt="lolItemName(itemId)"
                  class="lol-detail__item"
                />
              </span>
            </div>
          </div>
        </div>

        <div class="lol-detail__teams">
          <section class="lol-team lol-team--blue">
            <h3 class="lol-team__title">
              Équipe bleue
              <span v-if="myTeamId(selectedMatch) === 100">· la vôtre</span>
              <span v-else>· ennemie</span>
            </h3>
            <ul class="lol-team__list">
              <li
                v-for="p in teamOf(selectedMatch, 100)"
                :key="p.puuid"
                class="lol-team__row"
                :class="{ 'lol-team__row--you': p.puuid === selectedMatch.participant?.puuid }"
              >
                <img
                  v-if="lolChampionIconByName(p.championName)"
                  :src="lolChampionIconByName(p.championName)"
                  alt=""
                  class="lol-team__champ"
                />
                <div class="lol-team__info">
                  <p class="lol-team__name">
                    {{ playerLabel(p) }}
                    <span v-if="p.puuid === selectedMatch.participant?.puuid" class="lol-you">Vous</span>
                  </p>
                  <p class="lol-team__champ-name">{{ p.championName }}</p>
                </div>
                <p class="lol-team__kda">{{ kdaLabel(p) }}</p>
              </li>
            </ul>
          </section>

          <section class="lol-team lol-team--red">
            <h3 class="lol-team__title">
              Équipe rouge
              <span v-if="myTeamId(selectedMatch) === 200">· la vôtre</span>
              <span v-else>· ennemie</span>
            </h3>
            <ul class="lol-team__list">
              <li
                v-for="p in teamOf(selectedMatch, 200)"
                :key="p.puuid"
                class="lol-team__row"
                :class="{ 'lol-team__row--you': p.puuid === selectedMatch.participant?.puuid }"
              >
                <img
                  v-if="lolChampionIconByName(p.championName)"
                  :src="lolChampionIconByName(p.championName)"
                  alt=""
                  class="lol-team__champ"
                />
                <div class="lol-team__info">
                  <p class="lol-team__name">
                    {{ playerLabel(p) }}
                    <span v-if="p.puuid === selectedMatch.participant?.puuid" class="lol-you">Vous</span>
                  </p>
                  <p class="lol-team__champ-name">{{ p.championName }}</p>
                </div>
                <p class="lol-team__kda">{{ kdaLabel(p) }}</p>
              </li>
            </ul>
          </section>
        </div>

        <section v-if="compareData" class="lol-detail__compare-preview">
          <h3 class="lol-card__title">
            Comparatif même elo
            ({{
              formatRankLabel(
                Number(selectedMatch.queueId) === 440 ? leagueFlex : leagueSolo,
              ) || 'ton elo'
            }})
          </h3>
          <div class="lol-compare-inline">
            <div class="lol-compare-chart">
              <LolRadarChart :axes="compareData.radar" :size="240" />
            </div>
            <ul class="lol-compare-list">
              <li v-for="m in compareData.metrics" :key="m.key">
                <span>{{ m.label }}</span>
                <strong>{{ m.you.toLocaleString('fr-FR') }}</strong>
                <span class="lol-muted">vs {{ m.elo.toLocaleString('fr-FR') }}</span>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lol-page {
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
  min-width: 0;
}

.lol-page__header {
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  text-align: center;
}

.lol-page__eyebrow {
  margin: 0 0 0.35rem;
  align-self: flex-start;
}

.lol-page__back {
  color: #8e6aa8;
  text-decoration: none;
  font-size: 0.88rem;
  font-weight: 600;
}

.lol-page__title {
  margin: 0;
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
}

.lol-page__subtitle {
  margin: 0.5rem auto 0;
  color: #6c757d;
  font-size: 1rem;
  max-width: 42rem;
  line-height: 1.45;
}

.lol-page__error {
  margin: 0 0 1rem;
  padding: 0.65rem 0.8rem;
  border-radius: 10px;
  background: rgba(192, 57, 43, 0.1);
  color: #a93226;
  font-size: 0.9rem;
}

.lol-muted {
  margin: 0;
  color: #8b7a96;
  font-size: 0.9rem;
}

.lol-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 1rem;
  align-items: center;
}

.lol-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid rgba(173, 129, 190, 0.35);
  background: rgba(255, 255, 255, 0.7);
  border-radius: 999px;
  padding: 0.35rem 0.65rem 0.35rem 0.4rem;
  font: inherit;
  cursor: pointer;
  color: #3b2a4a;
  max-width: 16rem;
}

.lol-tab--active {
  background: linear-gradient(135deg, rgba(213, 181, 234, 0.55), rgba(173, 129, 190, 0.35));
  border-color: rgba(173, 129, 190, 0.7);
  font-weight: 700;
}

.lol-tab--add {
  border-style: dashed;
  color: #5b3d7a;
  font-weight: 700;
  padding-inline: 0.85rem;
}

.lol-tab__icon {
  width: 1.55rem;
  height: 1.55rem;
  border-radius: 50%;
  object-fit: cover;
}

.lol-tab__text {
  display: grid;
  min-width: 0;
  text-align: left;
}

.lol-tab__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.86rem;
}

.lol-tab__label {
  font-size: 0.68rem;
  color: #8b7a96;
}

.lol-tab__remove {
  margin-left: 0.15rem;
  color: #a895bc;
  font-size: 1.1rem;
  line-height: 1;
  padding: 0 0.15rem;
}

.lol-tab__remove:hover {
  color: #c0392b;
}

.lol-card {
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(213, 181, 234, 0.35);
  border-radius: 16px;
  padding: 1.1rem 1.15rem 1.2rem;
  margin-bottom: 1rem;
}

.lol-card__title {
  margin: 0 0 0.75rem;
  font-size: 1.05rem;
  font-weight: 800;
  color: #2c3e50;
}

.lol-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 0.75rem;
  align-items: end;
}

.lol-form__actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.lol-field {
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
  min-width: 0;
}

.lol-field__label {
  font-size: 0.78rem;
  font-weight: 700;
  color: #6d5a7e;
}

.lol-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(173, 129, 190, 0.4);
  border-radius: 10px;
  padding: 0.5rem 0.65rem;
  font: inherit;
  background: #fff;
  color: #2c3e50;
}

.lol-input--sm {
  width: auto;
  min-width: 7rem;
  padding: 0.28rem 0.45rem;
}

.lol-btn {
  border: 1px solid rgba(173, 129, 190, 0.4);
  background: #fff;
  color: #5b3d7a;
  border-radius: 10px;
  padding: 0.5rem 0.9rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.lol-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.lol-btn--primary {
  background: linear-gradient(135deg, #d5b5ea, #ad81be);
  border-color: transparent;
  color: #fff;
}

.lol-btn--ghost {
  background: transparent;
}

.lol-ranks {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.lol-rank-card {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  padding: 0.9rem 1rem;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(213, 181, 234, 0.35);
}

.lol-rank-card__emblem {
  width: 3.2rem;
  height: 3.2rem;
  object-fit: contain;
  flex-shrink: 0;
}

.lol-rank-card__queue {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 700;
  color: #8b7a96;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.lol-rank-card__tier {
  margin: 0.15rem 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: #2c3e50;
}

.lol-rank-card__wl {
  margin: 0;
  font-size: 0.82rem;
  color: #5b3d7a;
  font-weight: 650;
}

.lol-matches__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  margin-bottom: 0.55rem;
}

.lol-matches__head .lol-card__title {
  margin: 0;
}

.lol-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  margin-bottom: 0.85rem;
}

.lol-filter {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8rem;
  font-weight: 650;
  color: #6d5a7e;
}

.lol-champs {
  margin: 0 0 1rem;
}

.lol-champs__icons {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  width: 100%;
}

.lol-champ-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
}

.lol-champ-icon__img {
  width: min(5.5rem, 100%);
  aspect-ratio: 1;
  height: auto;
  border-radius: 14px;
  object-fit: cover;
  border: 1px solid rgba(213, 181, 234, 0.4);
}

.lol-champ-icon__stat {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 700;
  color: #5b3d7a;
  text-align: center;
  line-height: 1.25;
}

.lol-champ-icon__wr--good {
  color: #2f6b45;
}

.lol-champ-icon__wr--bad {
  color: #a93226;
}

.lol-champ-icon__stat--share {
  color: #8b7a96;
  font-weight: 650;
}

.lol-matches {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
}

.lol-match {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: center;
  width: 100%;
  text-align: left;
  padding: 0.7rem 0.8rem;
  border-radius: 14px;
  border: 1px solid transparent;
  cursor: pointer;
  font: inherit;
  color: inherit;
  transition: transform 0.12s ease;
}

.lol-match:hover {
  transform: translateY(-1px);
}

.lol-match--win {
  background: linear-gradient(90deg, rgba(114, 160, 152, 0.28), rgba(114, 160, 152, 0.08) 55%, rgba(255, 255, 255, 0.45));
  border-color: rgba(114, 160, 152, 0.45);
}

.lol-match--loss {
  background: linear-gradient(90deg, rgba(192, 57, 43, 0.24), rgba(192, 57, 43, 0.08) 55%, rgba(255, 255, 255, 0.45));
  border-color: rgba(192, 57, 43, 0.4);
}

.lol-match__champ {
  width: 2.7rem;
  height: 2.7rem;
  border-radius: 10px;
  object-fit: cover;
}

.lol-match__line1 {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: baseline;
}

.lol-match__champ-name {
  font-weight: 800;
  color: #2c3e50;
}

.lol-match__result {
  font-size: 0.78rem;
  font-weight: 750;
}

.lol-match--win .lol-match__result {
  color: #2f6b45;
}

.lol-match--loss .lol-match__result {
  color: #a93226;
}

.lol-match__role {
  font-size: 0.75rem;
  color: #8b7a96;
  font-weight: 650;
}

.lol-match__meta {
  margin: 0.2rem 0 0;
  font-size: 0.78rem;
  color: #8b7a96;
}

.lol-match__items {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem;
  margin-top: 0.35rem;
}

.lol-match__item {
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 4px;
  object-fit: cover;
}

.lol-match__stats {
  text-align: right;
}

.lol-match__kda {
  margin: 0;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: #3b2a4a;
  font-size: 1.05rem;
}

.lol-match__sub {
  margin: 0.2rem 0 0;
  font-size: 0.72rem;
  color: #8b7a96;
  font-weight: 650;
}

.lol-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 1rem;
}

.lol-pager__label {
  font-weight: 700;
  color: #5b3d7a;
  font-size: 0.9rem;
}

.lol-modal {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 260px;
  z-index: 200;
  background: rgba(44, 62, 80, 0.28);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: max(1rem, env(safe-area-inset-top, 0px)) 1rem 2rem;
  overflow-y: auto;
  box-sizing: border-box;
}

@media (max-width: 768px) {
  .lol-modal {
    left: 0;
  }
}

.lol-detail {
  width: min(920px, calc(100vw - 2rem));
  flex-shrink: 0;
  overflow: auto;
  border-radius: 18px;
  padding: 1.15rem 1.2rem 1.35rem;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(12px);
  color: #2c3e50;
  border: 1px solid rgba(213, 181, 234, 0.45);
  box-shadow: 0 16px 40px rgba(44, 62, 80, 0.16);
  margin: auto 0;
  box-sizing: border-box;
}

.lol-detail--win {
  background: linear-gradient(
    135deg,
    rgba(114, 160, 152, 0.22) 0%,
    rgba(255, 255, 255, 0.94) 42%
  );
  border-color: rgba(114, 160, 152, 0.5);
}

.lol-detail--loss {
  background: linear-gradient(
    135deg,
    rgba(192, 57, 43, 0.12) 0%,
    rgba(255, 255, 255, 0.94) 42%
  );
  border-color: rgba(192, 57, 43, 0.32);
}

.lol-detail__header {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.lol-detail__title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 800;
  color: #2c3e50;
}

.lol-detail__meta {
  margin: 0.35rem 0 0;
  color: #8b7a96;
  font-size: 0.88rem;
}

.lol-detail__hero {
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem;
  align-items: center;
  margin-bottom: 1.1rem;
}

.lol-detail__champ {
  width: 4rem;
  height: 4rem;
  border-radius: 12px;
  object-fit: cover;
}

.lol-detail__kda {
  margin: 0;
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: #2c3e50;
}

.lol-detail__kda-label {
  margin: 0.2rem 0 0.45rem;
  color: #8b7a96;
  font-size: 0.8rem;
  font-weight: 650;
}

.lol-detail__items {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.lol-item-tip {
  display: inline-flex;
  cursor: help;
  outline: none;
}

.lol-item-tip:focus-visible .lol-detail__item {
  box-shadow: 0 0 0 2px rgba(173, 129, 190, 0.85);
}

.lol-item-tip-portal {
  position: fixed;
  z-index: 500;
  pointer-events: none;
  overflow: auto;
}

.lol-detail__item {
  width: 2rem;
  height: 2rem;
  border-radius: 6px;
  object-fit: cover;
  display: block;
}

.lol-detail__teams {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.lol-team {
  border-radius: 12px;
  padding: 0.65rem 0.7rem;
  background: rgba(255, 255, 255, 0.55);
}

.lol-team--blue {
  border: 1px solid rgba(90, 150, 220, 0.55);
}

.lol-team--red {
  border: 1px solid rgba(210, 80, 80, 0.55);
}

.lol-team__title {
  margin: 0 0 0.5rem;
  font-size: 0.86rem;
  font-weight: 750;
}

.lol-team__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
}

.lol-team__row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.45rem;
  align-items: center;
  padding: 0.3rem 0.35rem;
  border-radius: 8px;
}

.lol-team__row--you {
  background: rgba(213, 181, 234, 0.28);
}

.lol-team__champ {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  object-fit: cover;
}

.lol-team__name {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lol-team__champ-name {
  margin: 0.1rem 0 0;
  font-size: 0.72rem;
  color: #8b7a96;
}

.lol-team__name {
  color: #2c3e50;
}

.lol-team__title {
  color: #3b2a4a;
}

.lol-team__kda {
  margin: 0;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  font-size: 0.85rem;
}

.lol-you {
  margin-left: 0.35rem;
  font-size: 0.68rem;
  font-weight: 800;
  color: #5b3d7a;
  text-transform: uppercase;
}

.lol-detail__compare-preview {
  margin-top: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(213, 181, 234, 0.35);
}

.lol-compare-inline {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.lol-compare-chart {
  width: 100%;
  display: flex;
  justify-content: center;
}

.lol-compare-list {
  list-style: none;
  margin: 0;
  padding: 0;
  width: 100%;
  max-width: 22rem;
  display: grid;
  gap: 0.35rem;
  font-size: 0.85rem;
  text-align: center;
}

.lol-compare-list strong {
  margin: 0 0.35rem;
}

@media (max-width: 720px) {
  .lol-detail__teams {
    grid-template-columns: 1fr;
  }

  .lol-match {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .lol-match__stats {
    grid-column: 2;
    text-align: left;
  }
}

@media (prefers-color-scheme: dark) {
  .lol-page__title,
  .lol-card__title,
  .lol-match__champ-name,
  .lol-match__kda,
  .lol-rank-card__tier,
  .lol-tab {
    color: #f0e8f8;
  }

  .lol-page__subtitle,
  .lol-muted,
  .lol-match__meta,
  .lol-match__sub,
  .lol-match__role,
  .lol-field__label,
  .lol-filter,
  .lol-rank-card__queue {
    color: #b8a8c8;
  }

  .lol-card,
  .lol-rank-card,
  .lol-tab {
    background: rgba(35, 30, 48, 0.8);
    border-color: rgba(213, 181, 234, 0.22);
  }

  .lol-match--win {
    background: linear-gradient(90deg, rgba(114, 160, 152, 0.32), rgba(35, 30, 48, 0.85));
  }

  .lol-match--loss {
    background: linear-gradient(90deg, rgba(192, 57, 43, 0.3), rgba(35, 30, 48, 0.85));
  }

  .lol-input,
  .lol-btn {
    background: #2a2438;
    border-color: rgba(173, 129, 190, 0.35);
    color: #f0e8f8;
  }

  .lol-btn--primary {
    background: linear-gradient(135deg, #d5b5ea, #ad81be);
    color: #fff;
  }

  .lol-champ-icon__wr--good {
    color: #7dcea0;
  }

  .lol-champ-icon__wr--bad {
    color: #f1948a;
  }

  .lol-champ-icon__stat {
    color: #e8d4f8;
  }

  .lol-champ-icon__stat--share {
    color: #b8a8c8;
  }

  .lol-detail {
    background: rgba(35, 30, 48, 0.96);
    border-color: rgba(213, 181, 234, 0.25);
    color: #f0e8f8;
  }

  .lol-detail--win {
    background: linear-gradient(
      135deg,
      rgba(114, 160, 152, 0.25) 0%,
      rgba(35, 30, 48, 0.96) 45%
    );
  }

  .lol-detail--loss {
    background: linear-gradient(
      135deg,
      rgba(192, 57, 43, 0.18) 0%,
      rgba(35, 30, 48, 0.96) 45%
    );
  }

  .lol-detail__title,
  .lol-detail__kda,
  .lol-team__name,
  .lol-team__title {
    color: #f0e8f8;
  }

  .lol-detail__meta,
  .lol-detail__kda-label,
  .lol-team__champ-name {
    color: #b8a8c8;
  }

  .lol-team {
    background: rgba(255, 255, 255, 0.04);
  }

  .lol-you {
    color: #d5b5ea;
  }

  .lol-detail__compare-preview {
    border-top-color: rgba(213, 181, 234, 0.2);
  }
}
</style>
