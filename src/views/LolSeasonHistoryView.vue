<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { APP_PAGE_IDS } from '../constants/common/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'
import { supabase } from '../lib/supabase.js'
import { resolveSessionUser } from '../utils/auth/sessionUser.js'
import { listLolAccounts } from '../services/jeux/lolAccounts.js'
import {
  ensureLolSettings,
  fetchTopChampionsFromDb,
  listLolSeasonHistory,
  deleteLolSeasonHistory,
} from '../services/jeux/lolMatchStats.js'
import {
  DEFAULT_RANKED_RESET_DATE,
  formatRankedResetDateFr,
} from '../constants/jeux/lolRankedReset.js'
import {
  ensureLolChampionIdCatalog,
  lolChampionIconById,
  lolChampionNameById,
} from '../services/jeux/riot.js'
import {
  buildSeasonTimeline,
  buildSparklineGeometry,
  formatSeasonRankShort,
} from '../utils/jeux/lolSeasonHistory.js'

defineOptions({ name: 'LolSeasonHistoryView' })

usePageDisplayLabel(APP_PAGE_IDS.JEUX, 'Saisons LoL', {
  setDocumentTitle: true,
})

const route = useRoute()
const router = useRouter()

const userId = ref(null)
const accounts = ref([])
const selectedPuuid = ref('')
const historyRows = ref([])
const currentGames = ref(0)
const currentWinRate = ref(/** @type {number|null} */ (null))
const currentRankSolo = ref(null)
const currentRankFlex = ref(null)
const currentSeasonStart = ref(DEFAULT_RANKED_RESET_DATE)
const currentTopChampions = ref([])
const isLoading = ref(true)
const loadError = ref('')

const selectedAccount = computed(
  () => accounts.value.find((a) => a.puuid === selectedPuuid.value) ?? null,
)

const timeline = computed(() =>
  buildSeasonTimeline(historyRows.value, selectedPuuid.value
    ? {
        totalGames: currentGames.value,
        overallWinRate: currentWinRate.value,
        rankSolo: currentRankSolo.value,
        rankFlex: currentRankFlex.value,
        seasonStart: currentSeasonStart.value,
        topChampions: currentTopChampions.value.map((c) => ({
          champion_id: c.championId,
          champion_name: c.championName,
          games: c.games,
          wins: c.wins,
          win_rate: c.winRate,
          play_share: c.playShare,
        })),
        label: `En cours · depuis ${formatRankedResetDateFr(currentSeasonStart.value)}`,
      }
    : null),
)

const gamesChart = computed(() =>
  buildSparklineGeometry(timeline.value.map((p) => p.totalGames), { width: 320, height: 78 }),
)

const wrChart = computed(() =>
  buildSparklineGeometry(timeline.value.map((p) => p.winRate), { width: 320, height: 78 }),
)

const rankChart = computed(() =>
  buildSparklineGeometry(timeline.value.map((p) => p.rankSoloScore), { width: 320, height: 78 }),
)

function riotDisplayName(account) {
  if (!account) return ''
  const name = String(account.game_name || '').trim()
  const tag = String(account.tag_line || '').trim()
  if (name && tag) return `${name}#${tag}`
  return account.label || account.puuid?.slice(0, 8) || 'Compte'
}

function champName(champ) {
  const id = Number(champ?.champion_id || champ?.championId) || 0
  const stored = String(champ?.champion_name || champ?.championName || '').trim()
  if (stored) return stored
  return lolChampionNameById(id) || `Champion ${id}`
}

function formatPct(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return `${Number(value).toFixed(1)}%`
}

async function loadAccounts() {
  if (!userId.value) return
  accounts.value = await listLolAccounts(supabase, userId.value)
  const fromQuery = String(route.query.puuid || '').trim()
  if (fromQuery && accounts.value.some((a) => a.puuid === fromQuery)) {
    selectedPuuid.value = fromQuery
  } else if (accounts.value[0]?.puuid) {
    selectedPuuid.value = accounts.value[0].puuid
  }
}

async function loadPageData() {
  const puuid = selectedPuuid.value
  if (!puuid) {
    historyRows.value = []
    currentGames.value = 0
    currentWinRate.value = null
    currentTopChampions.value = []
    return
  }

  isLoading.value = true
  loadError.value = ''
  try {
    await ensureLolChampionIdCatalog()
    const account = selectedAccount.value
    const settings = await ensureLolSettings(
      puuid,
      account?.platform || 'euw1',
      account?.routing || 'europe',
    )
    currentSeasonStart.value = String(
      settings?.ranked_reset_date || DEFAULT_RANKED_RESET_DATE,
    ).slice(0, 10)

    const [history, top] = await Promise.all([
      listLolSeasonHistory(puuid),
      fetchTopChampionsFromDb(puuid, 3),
    ])
    historyRows.value = history

    const champs = Array.isArray(top.champions) ? top.champions : []
    currentGames.value = Number(top.totalGames) || 0
    currentTopChampions.value = champs.map((c) => ({
      ...c,
      championName: lolChampionNameById(c.championId) || `Champion ${c.championId}`,
    }))

    // WR saison courante : proxy via Solo/Duo (W/L Riot), sinon null
    const soloMeta = account?.metadata?.leagueSolo ?? null
    const flexMeta = account?.metadata?.leagueFlex ?? null
    currentRankSolo.value = soloMeta
    currentRankFlex.value = flexMeta
    const soloW = Number(soloMeta?.wins) || 0
    const soloL = Number(soloMeta?.losses) || 0
    const soloN = soloW + soloL
    currentWinRate.value = soloN > 0 ? (soloW / soloN) * 100 : null
  } catch (err) {
    console.error(err)
    loadError.value = err?.message || 'Impossible de charger l’historique des saisons.'
    historyRows.value = []
  } finally {
    isLoading.value = false
  }
}

async function removeRow(row) {
  if (!selectedPuuid.value || !row?.id || row.isCurrent) return
  const ok = window.confirm('Supprimer cette saison de l’historique ?')
  if (!ok) return
  try {
    await deleteLolSeasonHistory(selectedPuuid.value, row.id)
    historyRows.value = historyRows.value.filter((item) => item.id !== row.id)
  } catch (err) {
    loadError.value = err?.message || 'Suppression impossible.'
  }
}

function onAccountChange() {
  router.replace({
    path: '/league-of-legends/saisons',
    query: selectedPuuid.value ? { puuid: selectedPuuid.value } : {},
  })
}

watch(selectedPuuid, () => {
  void loadPageData()
})

onMounted(async () => {
  const user = await resolveSessionUser()
  if (!user) {
    isLoading.value = false
    return
  }
  userId.value = user.id
  try {
    await loadAccounts()
    await loadPageData()
  } catch (err) {
    loadError.value = err?.message || 'Chargement impossible.'
    isLoading.value = false
  }
})
</script>

<template>
  <div class="lol-seasons-page">
    <header class="lol-seasons-page__header">
      <p class="lol-seasons-page__eyebrow">
        <RouterLink to="/league-of-legends" class="lol-seasons-page__back">
          ← League of Legends
        </RouterLink>
      </p>
      <h1 class="lol-seasons-page__title">Saisons précédentes</h1>
      <p class="lol-seasons-page__subtitle">
        Récap compact + évolution (parties, winrate, rang Solo) face à la saison en cours.
      </p>
    </header>

    <div v-if="accounts.length > 1" class="lol-seasons-page__account">
      <label class="lol-seasons-page__account-label">
        Compte
        <select v-model="selectedPuuid" class="lol-seasons-page__select" @change="onAccountChange">
          <option v-for="account in accounts" :key="account.puuid" :value="account.puuid">
            {{ riotDisplayName(account) }}
          </option>
        </select>
      </label>
    </div>
    <p v-else-if="selectedAccount" class="lol-muted">
      {{ riotDisplayName(selectedAccount) }}
    </p>

    <p v-if="loadError" class="lol-seasons-page__error" role="alert">{{ loadError }}</p>
    <p v-else-if="isLoading" class="lol-muted">Chargement…</p>

    <template v-else>
      <section v-if="timeline.length" class="lol-seasons-page__charts" aria-label="Évolution">
        <article class="lol-chart-card">
          <h2 class="lol-chart-card__title">Parties</h2>
          <svg
            class="lol-chart-card__svg"
            :viewBox="`0 0 ${gamesChart.width} ${gamesChart.height}`"
            role="img"
            aria-label="Courbe du nombre de parties par saison"
          >
            <path v-if="gamesChart.area" class="lol-chart-card__area" :d="gamesChart.area" />
            <path v-if="gamesChart.path" class="lol-chart-card__line" :d="gamesChart.path" />
            <circle
              v-for="(pt, i) in gamesChart.points"
              v-show="pt.y != null"
              :key="`g-${i}`"
              class="lol-chart-card__dot"
              :class="{ 'lol-chart-card__dot--current': timeline[i]?.isCurrent }"
              :cx="pt.x"
              :cy="pt.y"
              r="3.5"
            />
          </svg>
          <p class="lol-chart-card__hint">
            {{ gamesChart.min }} → {{ gamesChart.max }} parties
          </p>
        </article>

        <article class="lol-chart-card">
          <h2 class="lol-chart-card__title">Winrate</h2>
          <svg
            class="lol-chart-card__svg"
            :viewBox="`0 0 ${wrChart.width} ${wrChart.height}`"
            role="img"
            aria-label="Courbe du winrate par saison"
          >
            <path v-if="wrChart.area" class="lol-chart-card__area lol-chart-card__area--wr" :d="wrChart.area" />
            <path v-if="wrChart.path" class="lol-chart-card__line lol-chart-card__line--wr" :d="wrChart.path" />
            <circle
              v-for="(pt, i) in wrChart.points"
              v-show="pt.y != null"
              :key="`w-${i}`"
              class="lol-chart-card__dot lol-chart-card__dot--wr"
              :class="{ 'lol-chart-card__dot--current': timeline[i]?.isCurrent }"
              :cx="pt.x"
              :cy="pt.y"
              r="3.5"
            />
          </svg>
          <p class="lol-chart-card__hint">
            <template v-if="wrChart.points.some((p) => p.value != null)">
              {{ wrChart.min.toFixed(1) }}% → {{ wrChart.max.toFixed(1) }}%
            </template>
            <template v-else>Pas encore de WR archivé</template>
          </p>
        </article>

        <article class="lol-chart-card">
          <h2 class="lol-chart-card__title">Rang Solo</h2>
          <svg
            class="lol-chart-card__svg"
            :viewBox="`0 0 ${rankChart.width} ${rankChart.height}`"
            role="img"
            aria-label="Courbe du rang Solo par saison"
          >
            <path
              v-if="rankChart.area"
              class="lol-chart-card__area lol-chart-card__area--rank"
              :d="rankChart.area"
            />
            <path
              v-if="rankChart.path"
              class="lol-chart-card__line lol-chart-card__line--rank"
              :d="rankChart.path"
            />
            <circle
              v-for="(pt, i) in rankChart.points"
              v-show="pt.y != null"
              :key="`r-${i}`"
              class="lol-chart-card__dot lol-chart-card__dot--rank"
              :class="{ 'lol-chart-card__dot--current': timeline[i]?.isCurrent }"
              :cx="pt.x"
              :cy="pt.y"
              r="3.5"
            />
          </svg>
          <p class="lol-chart-card__hint">Évolution Solo / Duo (score interne)</p>
        </article>
      </section>

      <section class="lol-seasons-page__list-wrap" aria-label="Récapitulatif des saisons">
        <h2 class="lol-seasons-page__list-title">Récapitulatif</h2>
        <ul v-if="timeline.length" class="lol-season-rows">
          <li
            v-for="point in [...timeline].reverse()"
            :key="point.id"
            class="lol-season-row"
            :class="{ 'lol-season-row--current': point.isCurrent }"
          >
            <div class="lol-season-row__main">
              <p class="lol-season-row__label">
                <span v-if="point.isCurrent" class="lol-season-row__badge">Actuel</span>
                {{ point.label }}
              </p>
              <p class="lol-season-row__dates">
                <template v-if="point.isCurrent">
                  Depuis {{ formatRankedResetDateFr(point.seasonStart) }}
                </template>
                <template v-else>
                  {{ formatRankedResetDateFr(point.seasonStart) }}
                  →
                  {{ formatRankedResetDateFr(point.seasonEnd) }}
                </template>
              </p>
            </div>
            <div class="lol-season-row__stats">
              <span>{{ point.totalGames }} p.</span>
              <span>{{ formatPct(point.winRate) }} WR</span>
              <span title="Solo / Duo">S {{ formatSeasonRankShort(point.rankSolo) }}</span>
              <span title="Flex">F {{ formatSeasonRankShort(point.rankFlex) }}</span>
            </div>
            <div
              v-if="point.topChampions.length"
              class="lol-season-row__champs"
              :title="point.topChampions.map((c) => champName(c)).join(', ')"
            >
              <img
                v-for="champ in point.topChampions.slice(0, 3)"
                :key="`${point.id}-${champ.champion_id || champ.championId}`"
                v-show="lolChampionIconById(champ.champion_id || champ.championId)"
                :src="lolChampionIconById(champ.champion_id || champ.championId)"
                :alt="champName(champ)"
                class="lol-season-row__champ-img"
              />
            </div>
            <button
              v-if="!point.isCurrent"
              type="button"
              class="lol-season-row__delete"
              :aria-label="`Supprimer ${point.label}`"
              @click="removeRow(point.raw || point)"
            >
              ×
            </button>
          </li>
        </ul>
        <p v-else class="lol-muted">
          Aucune saison archivée. Au prochain reset, un snapshot apparaîtra ici.
        </p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.lol-seasons-page {
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
  min-width: 0;
}

.lol-seasons-page__header {
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  text-align: center;
}

.lol-seasons-page__eyebrow {
  margin: 0 0 0.35rem;
  align-self: flex-start;
}

.lol-seasons-page__back {
  color: #8e6aa8;
  text-decoration: none;
  font-size: 0.88rem;
  font-weight: 600;
}

.lol-seasons-page__back:hover {
  text-decoration: underline;
}

.lol-seasons-page__title {
  margin: 0;
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
}

.lol-seasons-page__subtitle {
  margin: 0.5rem auto 0;
  color: #6c757d;
  font-size: 1rem;
  max-width: 42rem;
  line-height: 1.45;
}

.lol-muted {
  margin: 0.4rem 0 0;
  color: #6d5a7e;
  font-size: 0.95rem;
  line-height: 1.45;
}

.lol-seasons-page__account {
  margin-bottom: 1rem;
}

.lol-seasons-page__account-label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6d5a7e;
}

.lol-seasons-page__select {
  max-width: 22rem;
  border: 1px solid rgba(213, 181, 234, 0.4);
  border-radius: 10px;
  padding: 0.5rem 0.7rem;
  background: rgba(255, 255, 255, 0.85);
  color: #2c3e50;
  font: inherit;
  font-size: 0.95rem;
  font-weight: 650;
  text-transform: none;
  letter-spacing: normal;
}

.lol-seasons-page__error {
  margin: 0 0 1rem;
  padding: 0.65rem 0.8rem;
  border-radius: 10px;
  background: rgba(192, 57, 43, 0.1);
  color: #c0392b;
  font-weight: 650;
}

.lol-seasons-page__charts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.lol-chart-card {
  border-radius: 14px;
  border: 1px solid rgba(213, 181, 234, 0.3);
  background: rgba(255, 255, 255, 0.55);
  padding: 0.75rem 0.85rem 0.65rem;
}

.lol-chart-card__title {
  margin: 0 0 0.35rem;
  font-size: 0.88rem;
  font-weight: 800;
  color: #3b2a4a;
}

.lol-chart-card__svg {
  width: 100%;
  height: auto;
  display: block;
}

.lol-chart-card__area {
  fill: rgba(173, 129, 190, 0.18);
}

.lol-chart-card__area--wr {
  fill: rgba(143, 162, 212, 0.2);
}

.lol-chart-card__area--rank {
  fill: rgba(149, 209, 170, 0.18);
}

.lol-chart-card__line {
  fill: none;
  stroke: #ad81be;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.lol-chart-card__line--wr {
  stroke: #8fa2d4;
}

.lol-chart-card__line--rank {
  stroke: #72a098;
}

.lol-chart-card__dot {
  fill: #ad81be;
}

.lol-chart-card__dot--wr {
  fill: #8fa2d4;
}

.lol-chart-card__dot--rank {
  fill: #72a098;
}

.lol-chart-card__dot--current {
  stroke: #2c3e50;
  stroke-width: 1.5;
}

.lol-chart-card__hint {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  font-weight: 650;
  color: #7a6a88;
}

.lol-seasons-page__list-title {
  margin: 0 0 0.65rem;
  font-size: 1.05rem;
  font-weight: 800;
  color: #2c3e50;
}

.lol-season-rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}

.lol-season-row {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1.6fr) auto auto;
  align-items: center;
  gap: 0.55rem 0.75rem;
  padding: 0.65rem 0.75rem;
  border-radius: 12px;
  border: 1px solid rgba(213, 181, 234, 0.28);
  background: rgba(255, 255, 255, 0.55);
}

.lol-season-row--current {
  border-color: rgba(173, 129, 190, 0.55);
  background: rgba(213, 181, 234, 0.16);
}

.lol-season-row__label {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 800;
  color: #3b2a4a;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}

.lol-season-row__badge {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #5e4a6c;
  background: rgba(173, 129, 190, 0.28);
  border-radius: 999px;
  padding: 0.12rem 0.4rem;
}

.lol-season-row__dates {
  margin: 0.15rem 0 0;
  font-size: 0.78rem;
  font-weight: 600;
  color: #6d5a7e;
}

.lol-season-row__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.65rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: #4a3a5c;
}

.lol-season-row__champs {
  display: flex;
  gap: 0.25rem;
}

.lol-season-row__champ-img {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  object-fit: cover;
}

.lol-season-row__delete {
  border: none;
  background: transparent;
  color: #c45c5c;
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.15rem 0.35rem;
  border-radius: 8px;
}

.lol-season-row__delete:hover {
  background: rgba(196, 92, 92, 0.1);
}

@media (max-width: 720px) {
  .lol-season-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .lol-season-row__stats {
    grid-column: 1 / -1;
  }

  .lol-season-row__champs {
    grid-column: 1;
  }
}

@media (prefers-color-scheme: dark) {
  .lol-seasons-page__title,
  .lol-seasons-page__list-title,
  .lol-chart-card__title,
  .lol-season-row__label {
    color: #f0e8f8;
  }

  .lol-seasons-page__subtitle,
  .lol-muted,
  .lol-season-row__dates,
  .lol-chart-card__hint,
  .lol-seasons-page__account-label {
    color: #c9b8d8;
  }

  .lol-chart-card,
  .lol-season-row,
  .lol-seasons-page__select {
    background: rgba(35, 30, 48, 0.8);
    border-color: rgba(213, 181, 234, 0.22);
    color: #f0e8f8;
  }

  .lol-season-row--current {
    background: rgba(173, 129, 190, 0.18);
    border-color: rgba(213, 181, 234, 0.4);
  }

  .lol-season-row__stats {
    color: #e8d4f8;
  }

  .lol-season-row__badge {
    color: #f0e8f8;
    background: rgba(213, 181, 234, 0.28);
  }

  .lol-chart-card__dot--current {
    stroke: #f0e8f8;
  }
}
</style>
