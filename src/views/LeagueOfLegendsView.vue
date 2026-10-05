<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { APP_PAGE_IDS } from '../constants/common/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'
import { supabase } from '../lib/supabase.js'
import {
  LOL_PLATFORM_OPTIONS,
  fetchRecentMatches,
  formatMatchDate,
  formatMatchDuration,
  lolChampionIconByName,
  lolProfileIconUrl,
  parseRiotId,
  resolveRiotAccount,
} from '../services/jeux/riot.js'
import {
  deleteLolAccount,
  listLolAccounts,
  touchLolAccountSync,
  upsertLolAccount,
} from '../services/jeux/lolAccounts.js'

defineOptions({ name: 'LeagueOfLegendsView' })

usePageDisplayLabel(APP_PAGE_IDS.JEUX, 'League of Legends', {
  setDocumentTitle: true,
})

const userId = ref(null)
const accounts = ref([])
const selectedAccountId = ref(null)
const matches = ref([])
const isLoadingAccounts = ref(true)
const isSavingAccount = ref(false)
const isLoadingMatches = ref(false)
const errorMessage = ref('')
const matchesError = ref('')
const daysFilter = ref(7)
const matchCount = ref(10)

const riotIdInput = ref('')
const labelInput = ref('')
const platformInput = ref('euw1')

const selectedAccount = computed(() =>
  accounts.value.find((item) => item.id === selectedAccountId.value) ?? null,
)

const winRate = computed(() => {
  const list = matches.value
  if (!list.length) return null
  const wins = list.filter((m) => m.participant?.win === true).length
  return Math.round((wins / list.length) * 100)
})

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

  let { gameName, tagLine } = parseRiotId(riotIdInput.value)
  if (!gameName || !tagLine) {
    errorMessage.value = 'Indique ton Riot ID au format Pseudo#TAG (ex. Faker#KR1).'
    return
  }

  isSavingAccount.value = true
  try {
    const resolved = await resolveRiotAccount(gameName, tagLine, platformInput.value)
    const account = resolved?.account
    const summoner = resolved?.summoner
    if (!account?.puuid) {
      throw new Error('Compte Riot introuvable.')
    }

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
      },
    })

    riotIdInput.value = ''
    labelInput.value = ''
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
    }
    await loadAccounts()
  } catch (err) {
    console.error(err)
    errorMessage.value = err.message || 'Suppression impossible.'
  }
}

async function loadMatchesForSelected() {
  const account = selectedAccount.value
  if (!account?.puuid) {
    matches.value = []
    return
  }

  isLoadingMatches.value = true
  matchesError.value = ''
  try {
    const data = await fetchRecentMatches(account.puuid, {
      platform: account.platform || 'euw1',
      days: daysFilter.value,
      count: matchCount.value,
    })
    matches.value = Array.isArray(data?.matches) ? data.matches : []

    if (userId.value && account.id) {
      await touchLolAccountSync(supabase, userId.value, account.id)
    }
  } catch (err) {
    console.error(err)
    matchesError.value = err.message || 'Impossible de charger les matchs.'
    matches.value = []
  } finally {
    isLoadingMatches.value = false
  }
}

function selectAccount(accountId) {
  selectedAccountId.value = accountId
}

function kdaLabel(participant) {
  if (!participant) return '—'
  const k = Number(participant.kills) || 0
  const d = Number(participant.deaths) || 0
  const a = Number(participant.assists) || 0
  return `${k}/${d}/${a}`
}

onMounted(async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    userId.value = user.id
    await loadAccounts()
  } else {
    isLoadingAccounts.value = false
  }
})

watch(selectedAccountId, () => {
  void loadMatchesForSelected()
})

watch([daysFilter, matchCount], () => {
  if (selectedAccount.value) void loadMatchesForSelected()
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
        Enregistre un ou plusieurs comptes Riot et consulte tes matchs des derniers jours.
      </p>
    </header>

    <p v-if="errorMessage" class="lol-page__error" role="alert">{{ errorMessage }}</p>

    <section class="lol-card" aria-labelledby="lol-add-title">
      <h2 id="lol-add-title" class="lol-card__title">Ajouter un compte</h2>
      <form class="lol-form" @submit.prevent="addAccount">
        <label class="lol-field">
          <span class="lol-field__label">Riot ID</span>
          <input
            v-model="riotIdInput"
            type="text"
            class="lol-input"
            placeholder="Pseudo#TAG"
            autocomplete="off"
            maxlength="80"
            required
          />
        </label>
        <label class="lol-field">
          <span class="lol-field__label">Libellé (optionnel)</span>
          <input
            v-model="labelInput"
            type="text"
            class="lol-input"
            placeholder="Compte principal, smurf…"
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
        <button type="submit" class="lol-btn lol-btn--primary" :disabled="isSavingAccount">
          {{ isSavingAccount ? 'Ajout…' : 'Enregistrer' }}
        </button>
      </form>
    </section>

    <div class="lol-layout">
      <section class="lol-card" aria-labelledby="lol-accounts-title">
        <h2 id="lol-accounts-title" class="lol-card__title">Mes comptes</h2>
        <p v-if="isLoadingAccounts" class="lol-muted">Chargement…</p>
        <p v-else-if="!accounts.length" class="lol-muted">Aucun compte pour l’instant.</p>
        <ul v-else class="lol-accounts">
          <li v-for="account in accounts" :key="account.id">
            <button
              type="button"
              class="lol-account"
              :class="{ 'lol-account--active': account.id === selectedAccountId }"
              @click="selectAccount(account.id)"
            >
              <img
                v-if="lolProfileIconUrl(account.profile_icon_id)"
                :src="lolProfileIconUrl(account.profile_icon_id)"
                alt=""
                class="lol-account__icon"
              />
              <span class="lol-account__body">
                <span class="lol-account__name">
                  {{ account.game_name }}#{{ account.tag_line }}
                </span>
                <span class="lol-account__meta">
                  <template v-if="account.label">{{ account.label }} · </template>
                  {{ account.platform }}
                  <template v-if="account.summoner_level">
                    · niv. {{ account.summoner_level }}
                  </template>
                </span>
              </span>
            </button>
            <button
              type="button"
              class="lol-account__delete"
              title="Retirer"
              @click="removeAccount(account.id)"
            >
              ×
            </button>
          </li>
        </ul>
      </section>

      <section class="lol-card lol-card--matches" aria-labelledby="lol-matches-title">
        <div class="lol-matches__head">
          <h2 id="lol-matches-title" class="lol-card__title">Matchs récents</h2>
          <div class="lol-filters">
            <label class="lol-filter">
              Jours
              <select v-model.number="daysFilter" class="lol-input lol-input--sm">
                <option :value="3">3</option>
                <option :value="7">7</option>
                <option :value="14">14</option>
                <option :value="30">30</option>
              </select>
            </label>
            <label class="lol-filter">
              Max
              <select v-model.number="matchCount" class="lol-input lol-input--sm">
                <option :value="5">5</option>
                <option :value="10">10</option>
                <option :value="15">15</option>
                <option :value="20">20</option>
              </select>
            </label>
            <button
              type="button"
              class="lol-btn"
              :disabled="!selectedAccount || isLoadingMatches"
              @click="loadMatchesForSelected"
            >
              Actualiser
            </button>
          </div>
        </div>

        <p v-if="!selectedAccount" class="lol-muted">Sélectionne un compte pour voir ses parties.</p>
        <p v-else-if="isLoadingMatches" class="lol-muted">Chargement des matchs…</p>
        <p v-else-if="matchesError" class="lol-page__error">{{ matchesError }}</p>
        <template v-else>
          <p v-if="winRate != null" class="lol-stats">
            {{ matches.length }} partie{{ matches.length > 1 ? 's' : '' }}
            · {{ winRate }} % de victoires
            <span v-if="selectedAccount.last_synced_at" class="lol-muted">
              · sync
              {{ new Date(selectedAccount.last_synced_at).toLocaleString('fr-FR') }}
            </span>
          </p>
          <p v-if="!matches.length" class="lol-muted">
            Aucun match sur les {{ daysFilter }} derniers jours.
          </p>
          <ul v-else class="lol-matches">
            <li
              v-for="match in matches"
              :key="match.matchId"
              class="lol-match"
              :class="{
                'lol-match--win': match.participant?.win === true,
                'lol-match--loss': match.participant?.win === false,
              }"
            >
              <img
                v-if="lolChampionIconByName(match.participant?.championName)"
                :src="lolChampionIconByName(match.participant?.championName)"
                alt=""
                class="lol-match__champ"
              />
              <div class="lol-match__body">
                <p class="lol-match__champ-name">
                  {{ match.participant?.championName || 'Champion' }}
                  <span class="lol-match__result">
                    {{ match.participant?.win ? 'Victoire' : 'Défaite' }}
                  </span>
                </p>
                <p class="lol-match__meta">
                  {{ formatMatchDate(match.gameCreation) }}
                  · {{ formatMatchDuration(match.gameDuration) }}
                  · {{ match.gameMode || '—' }}
                </p>
              </div>
              <p class="lol-match__kda">{{ kdaLabel(match.participant) }}</p>
            </li>
          </ul>
        </template>
      </section>
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
  margin-bottom: 1.25rem;
}

.lol-page__eyebrow {
  margin: 0 0 0.35rem;
}

.lol-page__back {
  color: #8e6aa8;
  text-decoration: none;
  font-size: 0.88rem;
  font-weight: 600;
}

.lol-page__back:hover {
  text-decoration: underline;
}

.lol-page__title {
  margin: 0;
  font-size: 1.85rem;
  font-weight: 800;
  color: #2c3e50;
}

.lol-page__subtitle {
  margin: 0.4rem 0 0;
  color: #6c757d;
  font-size: 0.98rem;
  max-width: 40rem;
}

.lol-page__error {
  margin: 0 0 1rem;
  padding: 0.65rem 0.8rem;
  border-radius: 10px;
  background: rgba(192, 57, 43, 0.1);
  color: #a93226;
  font-size: 0.9rem;
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
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 0.75rem;
  align-items: end;
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
  min-width: 4.5rem;
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

.lol-layout {
  display: grid;
  grid-template-columns: minmax(16rem, 22rem) minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

.lol-muted {
  margin: 0;
  color: #8b7a96;
  font-size: 0.9rem;
}

.lol-accounts {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}

.lol-accounts > li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.35rem;
  align-items: center;
}

.lol-account {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  width: 100%;
  border: 1px solid transparent;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.55);
  padding: 0.45rem 0.55rem;
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: inherit;
}

.lol-account--active {
  border-color: rgba(173, 129, 190, 0.55);
  background: rgba(213, 181, 234, 0.22);
}

.lol-account__icon {
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}

.lol-account__body {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
}

.lol-account__name {
  font-weight: 750;
  color: #2c3e50;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lol-account__meta {
  font-size: 0.75rem;
  color: #8b7a96;
}

.lol-account__delete {
  border: none;
  background: transparent;
  color: #a895bc;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.2rem 0.35rem;
  border-radius: 6px;
}

.lol-account__delete:hover {
  background: rgba(192, 57, 43, 0.1);
  color: #c0392b;
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
}

.lol-filter {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8rem;
  font-weight: 650;
  color: #6d5a7e;
}

.lol-stats {
  margin: 0 0 0.75rem;
  font-size: 0.88rem;
  font-weight: 650;
  color: #5b3d7a;
}

.lol-matches {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
}

.lol-match {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.65rem;
  align-items: center;
  padding: 0.55rem 0.65rem;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid rgba(213, 181, 234, 0.25);
}

.lol-match--win {
  border-left: 3px solid #72a098;
}

.lol-match--loss {
  border-left: 3px solid #c0392b;
}

.lol-match__champ {
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 8px;
  object-fit: cover;
}

.lol-match__champ-name {
  margin: 0;
  font-weight: 750;
  color: #2c3e50;
}

.lol-match__result {
  margin-left: 0.35rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: #6d5a7e;
}

.lol-match--win .lol-match__result {
  color: #2f6b45;
}

.lol-match--loss .lol-match__result {
  color: #a93226;
}

.lol-match__meta {
  margin: 0.15rem 0 0;
  font-size: 0.78rem;
  color: #8b7a96;
}

.lol-match__kda {
  margin: 0;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: #3b2a4a;
}

@media (max-width: 860px) {
  .lol-layout {
    grid-template-columns: 1fr;
  }
}

@media (prefers-color-scheme: dark) {
  .lol-page__title,
  .lol-card__title,
  .lol-account__name,
  .lol-match__champ-name,
  .lol-match__kda {
    color: #f0e8f8;
  }

  .lol-page__subtitle,
  .lol-muted,
  .lol-account__meta,
  .lol-match__meta,
  .lol-field__label,
  .lol-filter {
    color: #b8a8c8;
  }

  .lol-card,
  .lol-account,
  .lol-match {
    background: rgba(35, 30, 48, 0.75);
    border-color: rgba(213, 181, 234, 0.2);
  }

  .lol-account--active {
    background: rgba(173, 129, 190, 0.28);
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

  .lol-stats {
    color: #e8d4f8;
  }
}
</style>
