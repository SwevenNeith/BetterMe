<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import ReadingCollectionCombobox from '../components/lecture/ReadingCollectionCombobox.vue'
import { supabase } from '../lib/supabase.js'
import { APP_PAGE_IDS } from '../constants/common/appPages.js'
import { usePageDisplayLabel } from '../composables/usePageDisplayLabel.js'
import { formDraftKey, useFormDraft } from '../composables/useFormDraft.js'
import { listFinanceCategories, ensureFinanceCategory } from '../services/finances/financeCategories.js'
import { getOrCreateFinanceSettings, setOpeningBalance } from '../services/finances/financeSettings.js'
import {
  SUGGESTED_SAVINGS_NAMES,
  createSavingsAccount,
  deleteSavingsAccount,
  listSavingsAccounts,
  updateSavingsAccount,
} from '../services/finances/financeSavingsAccounts.js'
import {
  TX_TYPES,
  TX_TYPE_LABELS,
  createFinanceTransaction,
  deleteFinanceTransaction,
  deleteFinanceTransactions,
  listFinanceTransactions,
  updateFinanceTransaction,
} from '../services/finances/financeTransactions.js'
import {
  MONTH_LONG,
  MONTH_SHORT,
  balanceAtDate,
  categoryDetailBreakdown,
  donutArcPath,
  donutSegments,
  endOfMonthIso,
  filterByAccount,
  findFixedExpenseSeries,
  formatEuro,
  monthlyBalanceSeries,
  monthlyRecap,
  occurredOnForMonth,
  periodAggregates,
  planFixedExpenseRolloversThrough,
  savingsAccountsOverview,
} from '../utils/finances/financeMath.js'

defineOptions({ name: 'FinancesView' })

const { pageTitle } = usePageDisplayLabel(APP_PAGE_IDS.FINANCES, undefined, {
  setDocumentTitle: true,
})

/* Palette app : secondary (bleu), accent (rose), tertiary/success (vert) */
const INCOME_COLORS = ['#8FA2D4', '#A8B8E0', '#6B82C4', '#C5D0EC', '#5A6FB0', '#D8E0F2']
const VARIABLE_COLORS = ['#E8A0C0', '#F0B8D0', '#D489A8', '#F5C4D8', '#C97A9E', '#FADCED']
const FIXED_COLORS = ['#72A098', '#95D1AA', '#5A8A82', '#B0D9C0', '#4D7A72', '#C8E6D4']

const now = new Date()
const userId = ref(null)
const isLoading = ref(true)
const loadError = ref('')
const formError = ref('')
const balanceError = ref('')
const livretError = ref('')
const isSaving = ref(false)
const isSavingBalance = ref(false)
const isSavingLivret = ref(false)
const isTogglingId = ref(null)
const isDeletingId = ref(null)

const settings = ref(null)
const transactions = ref([])
const categories = ref([])
const savingsAccounts = ref([])

const selectedYear = ref(now.getFullYear())
const selectedMonth = ref(now.getMonth() + 1)
const selectedAccountTab = ref('cc')

const formOpen = ref(false)
const editingId = ref(null)
const formCardRef = ref(null)
const openingBalanceDraft = ref('')
const livretFormOpen = ref(false)
const editingLivretId = ref(null)
const ccOpeningFormOpen = ref(false)

/** @type {import('vue').Ref<null | { kind: 'delete' | 'save-edit' | 'delete-livret', tx?: object, livret?: object }>} */
const confirmDialog = ref(null)

const emptyForm = () => ({
  occurredOn: new Date().toISOString().slice(0, 10),
  txType: TX_TYPES.VARIABLE,
  category: '',
  detail: '',
  amount: '',
})

const emptyLivretForm = () => ({
  name: '',
  openingBalance: '',
})

const amountForm = reactive(emptyForm())
const livretForm = reactive(emptyLivretForm())
const isEditMode = computed(() => Boolean(editingId.value))
const isCcTab = computed(() => selectedAccountTab.value === 'cc')

/** null = compte courant */
const selectedAccountId = computed(() => (isCcTab.value ? null : selectedAccountTab.value))

/** Premier mois utilisable : mois courant, ou plus tôt s’il existe déjà des montants. */
const periodFloor = computed(() => {
  let year = now.getFullYear()
  let month = now.getMonth() + 1
  for (const tx of transactions.value) {
    const on = String(tx.occurred_on || '')
    const y = Number(on.slice(0, 4))
    const m = Number(on.slice(5, 7))
    if (!y || !m) continue
    if (y < year || (y === year && m < month)) {
      year = y
      month = m
    }
  }
  return { year, month }
})

/** Année courante + horizon futur (prévisionnel). */
const FUTURE_YEAR_HORIZON = 5

const availableYears = computed(() => {
  const floor = periodFloor.value
  const current = now.getFullYear()
  const years = new Set()
  for (let y = floor.year; y <= current + FUTURE_YEAR_HORIZON; y += 1) {
    years.add(y)
  }
  for (const tx of transactions.value) {
    const y = Number(String(tx.occurred_on || '').slice(0, 4))
    if (y && y >= floor.year) years.add(y)
  }
  return [...years].sort((a, b) => a - b)
})

const availableMonths = computed(() => {
  const floor = periodFloor.value
  const year = selectedYear.value
  // Année du plancher : à partir du mois plancher ; années suivantes : tous les mois
  const start = year <= floor.year ? floor.month : 1
  const months = []
  for (let m = start; m <= 12; m += 1) {
    months.push({ month: m, label: MONTH_SHORT[m - 1] })
  }
  return months
})

function clampSelectedPeriod() {
  const years = availableYears.value
  if (!years.length) return
  if (!years.includes(selectedYear.value)) {
    const current = now.getFullYear()
    selectedYear.value = years.includes(current) ? current : years[0]
  }
  const months = availableMonths.value.map((m) => m.month)
  if (!months.includes(selectedMonth.value)) {
    selectedMonth.value = months[0] ?? periodFloor.value.month
  }
}

watch([availableYears, availableMonths], () => {
  clampSelectedPeriod()
})

const balanceInitialized = computed(() => Boolean(settings.value?.balance_initialized))
const ccOpeningBalance = computed(() => Number(settings.value?.opening_balance) || 0)

const livretsOverview = computed(() =>
  savingsAccountsOverview(savingsAccounts.value, transactions.value),
)

/** Dashboard haut : toujours le compte courant. */
const CC_ACCOUNT_ID = null

const periodEndIso = computed(() => endOfMonthIso(selectedYear.value, selectedMonth.value))

const periodAgg = computed(() =>
  periodAggregates(
    transactions.value,
    selectedYear.value,
    selectedMonth.value,
    CC_ACCOUNT_ID,
  ),
)

const periodEndBalance = computed(() =>
  balanceAtDate(
    ccOpeningBalance.value,
    transactions.value,
    periodEndIso.value,
    CC_ACCOUNT_ID,
  ),
)

const yearSeries = computed(() =>
  monthlyBalanceSeries(
    ccOpeningBalance.value,
    transactions.value,
    selectedYear.value,
    CC_ACCOUNT_ID,
  ),
)

const yearRecap = computed(() => {
  const months = new Set(availableMonths.value.map((m) => m.month))
  return monthlyRecap(transactions.value, selectedYear.value, CC_ACCOUNT_ID).filter((m) =>
    months.has(m.month),
  )
})

const incomeDonut = computed(() => donutSegments(periodAgg.value.incomeByCat, INCOME_COLORS))
const fixedDonut = computed(() => donutSegments(periodAgg.value.fixedByCat, FIXED_COLORS))
const variableDonut = computed(() => donutSegments(periodAgg.value.variableByCat, VARIABLE_COLORS))

/** @type {import('vue').Ref<null | { kind: 'income' | 'fixed' | 'variable', name: string, color: string, amount: number, pct: number }>} */
const donutHover = ref(null)

const donutHoverDetails = computed(() => {
  const hover = donutHover.value
  if (!hover) return []
  const txType =
    hover.kind === 'income'
      ? TX_TYPES.INCOME
      : hover.kind === 'fixed'
        ? TX_TYPES.FIXED
        : TX_TYPES.VARIABLE
  return categoryDetailBreakdown(
    transactions.value,
    selectedYear.value,
    selectedMonth.value,
    CC_ACCOUNT_ID,
    txType,
    hover.name,
  )
})

function setDonutHover(kind, seg) {
  donutHover.value = {
    kind,
    name: seg.name,
    color: seg.color,
    amount: seg.amount,
    pct: seg.pct,
  }
}

function clearDonutHover(kind) {
  if (donutHover.value?.kind === kind) donutHover.value = null
}

function isDonutSegActive(kind, seg) {
  return donutHover.value?.kind === kind && donutHover.value?.name === seg.name
}

function isDonutSegDimmed(kind, seg) {
  return Boolean(donutHover.value?.kind === kind && donutHover.value?.name !== seg.name)
}

const lineChart = computed(() => {
  const points = yearSeries.value
  const values = points.map((p) => p.balance)
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const pad = (max - min) * 0.12 || 100
  const yMin = min - pad
  const yMax = max + pad
  const w = 640
  const h = 240
  const left = 8
  const right = 8
  const top = 36
  const bottom = 28
  const innerW = w - left - right
  const innerH = h - top - bottom
  const focusMonth =
    selectedYear.value === now.getFullYear() ? now.getMonth() + 1 : selectedMonth.value
  const coords = points.map((p, i) => {
    const x = left + (innerW * i) / Math.max(points.length - 1, 1)
    const t = (p.balance - yMin) / (yMax - yMin || 1)
    const y = top + innerH * (1 - t)
    const labelAbove = i % 2 === 0
    return {
      ...p,
      x,
      y,
      isFocus: p.month === focusMonth,
      labelAbove,
      labelY: labelAbove ? y - 12 : y + 18,
      labelBgY: labelAbove ? y - 26 : y + 6,
    }
  })
  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ')
  const area =
    coords.length > 0
      ? `${line} L ${coords[coords.length - 1].x} ${top + innerH} L ${coords[0].x} ${top + innerH} Z`
      : ''
  return { w, h, coords, line, area, focusMonth }
})

const accountTabs = computed(() => {
  const tabs = [
    {
      id: 'cc',
      name: 'Compte courant',
      balance: balanceAtDate(
        ccOpeningBalance.value,
        transactions.value,
        periodEndIso.value,
        null,
      ),
      opening: ccOpeningBalance.value,
    },
  ]
  for (const account of livretsOverview.value) {
    tabs.push({
      id: account.id,
      name: account.name,
      balance: account.balance,
      opening: account.opening_balance,
    })
  }
  return tabs
})

const selectedAccountTabMeta = computed(
  () => accountTabs.value.find((t) => t.id === selectedAccountTab.value) || accountTabs.value[0],
)

const accountHelpTooltip = computed(() => {
  const meta = selectedAccountTabMeta.value
  if (!meta) return ''
  return (
    `Case « Réalisé » cochée = montant effectivement gagné, dépensé ou épargné (impacte le solde). ` +
    `Non cochée = prévisionnel. Solde : ${formatEuro(meta.balance)} (départ ${formatEuro(meta.opening)}).`
  )
})

const visibleTransactions = computed(() => {
  const year = selectedYear.value
  const month = selectedMonth.value
  const prefix = `${year}-${String(month).padStart(2, '0')}-`
  return filterByAccount(transactions.value, selectedAccountId.value)
    .filter((tx) => String(tx.occurred_on || '').startsWith(prefix))
    .slice()
    .sort((a, b) => {
      const byDate = String(a.occurred_on || '').localeCompare(String(b.occurred_on || ''))
      if (byDate !== 0) return byDate
      return String(a.created_at || '').localeCompare(String(b.created_at || ''))
    })
})

const selectedPeriodLabel = computed(
  () => `${MONTH_LONG[selectedMonth.value - 1] || ''} ${selectedYear.value}`,
)

const chartTitle = 'Solde fin de mois — Compte courant'

const financeDraftKey = computed(() => {
  if (!userId.value || !formOpen.value) return null
  return formDraftKey('finance-amount-form', userId.value, editingId.value || 'new')
})

const { clearDraft: clearFinanceDraft, restoreDraft: restoreFinanceDraft } = useFormDraft(
  financeDraftKey,
  {
    enabled: computed(() => Boolean(userId.value) && formOpen.value && !isSaving.value),
    getState: () => ({ ...amountForm }),
    setState: (state) => {
      if (!state || typeof state !== 'object') return
      Object.assign(amountForm, emptyForm(), state)
    },
  },
)

const confirmTitle = computed(() => {
  if (confirmDialog.value?.kind === 'delete') {
    return confirmDialog.value?.seriesCount > 1
      ? 'Supprimer cette dépense fixe ?'
      : 'Supprimer ce montant ?'
  }
  if (confirmDialog.value?.kind === 'save-edit') {
    return confirmDialog.value?.seriesCount > 1
      ? 'Modifier cette dépense fixe ?'
      : 'Enregistrer les modifications ?'
  }
  if (confirmDialog.value?.kind === 'delete-livret') return 'Supprimer ce compte ?'
  return ''
})

const confirmMessage = computed(() => {
  const tx = confirmDialog.value?.tx
  const livret = confirmDialog.value?.livret
  const seriesCount = Number(confirmDialog.value?.seriesCount) || 1
  if (confirmDialog.value?.kind === 'delete' && tx) {
    if (seriesCount > 1) {
      return `« ${tx.category} » (${formatEuro(tx.amount)}) et ses ${seriesCount} occurrences (tous les mois) seront définitivement supprimées. Les autres montants restent inchangés.`
    }
    return `« ${tx.category} » (${formatEuro(tx.amount)}) sera définitivement supprimé.`
  }
  if (confirmDialog.value?.kind === 'save-edit') {
    if (seriesCount > 1) {
      return `Les changements (montant, catégorie, détail, jour) seront appliqués aux ${seriesCount} occurrences de cette dépense fixe. Le statut « Réalisé » de chaque mois reste indépendant.`
    }
    return 'Les changements seront appliqués à ce montant.'
  }
  if (confirmDialog.value?.kind === 'delete-livret' && livret) {
    return `« ${livret.name} » sera supprimé. Les montants d’épargne liés ne seront plus rattachés à ce compte.`
  }
  return ''
})

function seriesForFixedTx(tx) {
  if (!tx || tx.tx_type !== TX_TYPES.FIXED) return tx?.id ? [tx] : []
  const series = findFixedExpenseSeries(transactions.value, tx)
  return series.length ? series : [tx]
}

const isRollingFixed = ref(false)

async function syncFixedExpenseRollovers() {
  if (!userId.value || isRollingFixed.value) return
  const payloads = planFixedExpenseRolloversThrough(
    transactions.value,
    selectedYear.value,
    selectedMonth.value,
  )
  if (!payloads.length) return

  isRollingFixed.value = true
  try {
    for (const payload of payloads) {
      await createFinanceTransaction(supabase, userId.value, payload)
    }
    transactions.value = await listFinanceTransactions(supabase, userId.value)
  } catch (err) {
    console.error(err)
  } finally {
    isRollingFixed.value = false
  }
}

async function loadAll() {
  if (!userId.value) return
  isLoading.value = true
  loadError.value = ''
  try {
    const [s, txs, cats, accounts] = await Promise.all([
      getOrCreateFinanceSettings(supabase, userId.value),
      listFinanceTransactions(supabase, userId.value),
      listFinanceCategories(supabase, userId.value),
      listSavingsAccounts(supabase, userId.value),
    ])
    settings.value = s
    transactions.value = txs
    categories.value = cats
    savingsAccounts.value = accounts
    if (s?.balance_initialized) {
      openingBalanceDraft.value = String(Number(s.opening_balance) || 0).replace('.', ',')
    } else {
      openingBalanceDraft.value = ''
    }
    await syncFixedExpenseRollovers()
  } catch (err) {
    console.error(err)
    loadError.value = err?.message || 'Impossible de charger les finances.'
  } finally {
    isLoading.value = false
  }
}

watch([selectedYear, selectedMonth], () => {
  if (!userId.value || isLoading.value) return
  syncFixedExpenseRollovers()
})

async function saveOpeningBalance() {
  if (!userId.value || isSavingBalance.value) return
  balanceError.value = ''
  const raw = String(openingBalanceDraft.value).replace(/\s/g, '').replace(',', '.')
  const amount = Number(raw)
  if (!Number.isFinite(amount)) {
    balanceError.value = 'Entre un montant valide en euros.'
    return
  }
  isSavingBalance.value = true
  try {
    settings.value = await setOpeningBalance(supabase, userId.value, amount)
    openingBalanceDraft.value = String(amount).replace('.', ',')
    ccOpeningFormOpen.value = false
  } catch (err) {
    console.error(err)
    balanceError.value = err?.message || 'Enregistrement impossible.'
  } finally {
    isSavingBalance.value = false
  }
}

function openEditCcOpeningBalance() {
  balanceError.value = ''
  openingBalanceDraft.value = String(ccOpeningBalance.value).replace('.', ',')
  ccOpeningFormOpen.value = true
  livretFormOpen.value = false
  formOpen.value = false
}

function closeCcOpeningForm() {
  if (isSavingBalance.value) return
  ccOpeningFormOpen.value = false
  balanceError.value = ''
  openingBalanceDraft.value = String(ccOpeningBalance.value).replace('.', ',')
}

function defaultOccurredOn() {
  const y = selectedYear.value
  const m = selectedMonth.value
  const today = new Date()
  if (y === today.getFullYear() && m === today.getMonth() + 1) {
    return today.toISOString().slice(0, 10)
  }
  return `${y}-${String(m).padStart(2, '0')}-01`
}

function openAddForm() {
  editingId.value = null
  formError.value = ''
  Object.assign(amountForm, emptyForm())
  amountForm.occurredOn = defaultOccurredOn()
  formOpen.value = true
  ccOpeningFormOpen.value = false
  livretFormOpen.value = false
  nextTick(() => {
    restoreFinanceDraft()
    formCardRef.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}

function openEditForm(tx) {
  if (!tx?.id) return
  editingId.value = tx.id
  Object.assign(amountForm, {
    occurredOn: tx.occurred_on,
    txType: tx.tx_type,
    category: tx.category || '',
    detail: tx.detail || '',
    amount: String(tx.amount).replace('.', ','),
  })
  formError.value = ''
  formOpen.value = true
  nextTick(() => {
    formCardRef.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}

function closeAddForm() {
  formOpen.value = false
  editingId.value = null
  formError.value = ''
  clearFinanceDraft()
  Object.assign(amountForm, emptyForm())
}

function validateForm() {
  formError.value = ''
  const amountRaw = String(amountForm.amount).replace(/\s/g, '').replace(',', '.')
  const amount = Number(amountRaw)
  if (!amountForm.occurredOn) {
    formError.value = 'La date est obligatoire.'
    return null
  }
  if (!amountForm.txType) {
    formError.value = 'Choisis un type.'
    return null
  }
  if (!String(amountForm.category || '').trim()) {
    formError.value = 'La catégorie est obligatoire.'
    return null
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    formError.value = 'Entre un montant positif en euros.'
    return null
  }
  return amount
}

function requestSubmit() {
  const amount = validateForm()
  if (amount == null) return
  if (isEditMode.value) {
    const existing = transactions.value.find((t) => t.id === editingId.value)
    const seriesCount =
      existing?.tx_type === TX_TYPES.FIXED ? seriesForFixedTx(existing).length : 1
    confirmDialog.value = { kind: 'save-edit', seriesCount }
    return
  }
  void persistAmount(amount)
}

function requestDelete(tx) {
  if (!tx?.id) return
  const seriesCount = tx.tx_type === TX_TYPES.FIXED ? seriesForFixedTx(tx).length : 1
  confirmDialog.value = { kind: 'delete', tx, seriesCount }
}

function requestDeleteLivret(livret) {
  if (!livret?.id) return
  confirmDialog.value = { kind: 'delete-livret', livret }
}

function closeConfirm() {
  if (isSaving.value || isDeletingId.value || isSavingLivret.value) return
  confirmDialog.value = null
}

async function confirmAction() {
  const dialog = confirmDialog.value
  if (!dialog) return
  if (dialog.kind === 'delete') {
    await removeTransaction(dialog.tx)
    return
  }
  if (dialog.kind === 'delete-livret') {
    await removeLivret(dialog.livret)
    return
  }
  if (dialog.kind === 'save-edit') {
    const amount = validateForm()
    if (amount == null) {
      confirmDialog.value = null
      return
    }
    confirmDialog.value = null
    await persistAmount(amount)
  }
}

async function persistAmount(amount) {
  if (!userId.value || isSaving.value) return
  isSaving.value = true
  try {
    const category = await ensureFinanceCategory(supabase, userId.value, amountForm.category)
    const accountId = selectedAccountId.value
    if (editingId.value) {
      const existing = transactions.value.find((t) => t.id === editingId.value)
      const series =
        existing?.tx_type === TX_TYPES.FIXED ? seriesForFixedTx(existing) : existing ? [existing] : []

      if (existing?.tx_type === TX_TYPES.FIXED && series.length > 1) {
        for (const sibling of series) {
          const y = Number(String(sibling.occurred_on || '').slice(0, 4))
          const m = Number(String(sibling.occurred_on || '').slice(5, 7))
          const occurredOn =
            y && m
              ? occurredOnForMonth(amountForm.occurredOn, y, m)
              : amountForm.occurredOn
          await updateFinanceTransaction(supabase, userId.value, sibling.id, {
            occurredOn,
            txType: amountForm.txType,
            category,
            detail: amountForm.detail,
            amount,
            // Conservé par mois : on ne touche pas à applied
            accountId: existing.account_id ?? accountId,
          })
        }
      } else {
        await updateFinanceTransaction(supabase, userId.value, editingId.value, {
          occurredOn: amountForm.occurredOn,
          txType: amountForm.txType,
          category,
          detail: amountForm.detail,
          amount,
          applied: existing?.applied ?? false,
          accountId: existing?.account_id ?? accountId,
        })
      }
    } else {
      await createFinanceTransaction(supabase, userId.value, {
        occurredOn: amountForm.occurredOn,
        txType: amountForm.txType,
        category,
        detail: amountForm.detail,
        amount,
        applied: false,
        accountId,
      })
    }
    clearFinanceDraft()
    closeAddForm()
    await loadAll()
  } catch (err) {
    console.error(err)
    formError.value = err?.message || 'Enregistrement impossible.'
  } finally {
    isSaving.value = false
  }
}

async function toggleApplied(tx) {
  if (!userId.value || !tx?.id || isTogglingId.value) return
  isTogglingId.value = tx.id
  try {
    const updated = await updateFinanceTransaction(supabase, userId.value, tx.id, {
      applied: !tx.applied,
    })
    const idx = transactions.value.findIndex((t) => t.id === tx.id)
    if (idx >= 0) transactions.value[idx] = updated
  } catch (err) {
    console.error(err)
    loadError.value = err?.message || 'Mise à jour impossible.'
  } finally {
    isTogglingId.value = null
  }
}

async function removeTransaction(tx) {
  if (!userId.value || !tx?.id || isDeletingId.value) return
  isDeletingId.value = tx.id
  try {
    if (tx.tx_type === TX_TYPES.FIXED) {
      const series = seriesForFixedTx(tx)
      const ids = series.map((entry) => entry.id).filter(Boolean)
      await deleteFinanceTransactions(supabase, userId.value, ids)
      const idSet = new Set(ids)
      transactions.value = transactions.value.filter((t) => !idSet.has(t.id))
      if (editingId.value && idSet.has(editingId.value)) closeAddForm()
    } else {
      await deleteFinanceTransaction(supabase, userId.value, tx.id)
      transactions.value = transactions.value.filter((t) => t.id !== tx.id)
      if (editingId.value === tx.id) closeAddForm()
    }
    categories.value = await listFinanceCategories(supabase, userId.value)
    confirmDialog.value = null
  } catch (err) {
    console.error(err)
    loadError.value = err?.message || 'Suppression impossible.'
  } finally {
    isDeletingId.value = null
  }
}

function openAddLivretForm() {
  editingLivretId.value = null
  Object.assign(livretForm, emptyLivretForm())
  livretError.value = ''
  livretFormOpen.value = true
  ccOpeningFormOpen.value = false
  formOpen.value = false
}

function openEditLivretForm(livret) {
  if (!livret?.id) return
  editingLivretId.value = livret.id
  Object.assign(livretForm, {
    name: livret.name,
    openingBalance: String(livret.opening_balance).replace('.', ','),
  })
  livretError.value = ''
  livretFormOpen.value = true
  ccOpeningFormOpen.value = false
  formOpen.value = false
}

function closeLivretForm() {
  livretFormOpen.value = false
  editingLivretId.value = null
  livretError.value = ''
  Object.assign(livretForm, emptyLivretForm())
}

function pickSuggestedLivret(name) {
  livretForm.name = name
}

async function saveLivret() {
  if (!userId.value || isSavingLivret.value) return
  livretError.value = ''
  const name = String(livretForm.name || '').trim()
  if (!name) {
    livretError.value = 'Le nom du compte est obligatoire.'
    return
  }
  const raw = String(livretForm.openingBalance || '0').replace(/\s/g, '').replace(',', '.')
  const openingBalance = Number(raw)
  if (!Number.isFinite(openingBalance)) {
    livretError.value = 'Solde initial invalide.'
    return
  }
  isSavingLivret.value = true
  try {
    if (editingLivretId.value) {
      await updateSavingsAccount(supabase, userId.value, editingLivretId.value, {
        name,
        openingBalance,
      })
      closeLivretForm()
      savingsAccounts.value = await listSavingsAccounts(supabase, userId.value)
    } else {
      const created = await createSavingsAccount(supabase, userId.value, { name, openingBalance })
      closeLivretForm()
      savingsAccounts.value = await listSavingsAccounts(supabase, userId.value)
      if (created?.id) selectedAccountTab.value = created.id
    }
  } catch (err) {
    console.error(err)
    livretError.value = err?.message || 'Enregistrement impossible.'
  } finally {
    isSavingLivret.value = false
  }
}

async function removeLivret(livret) {
  if (!userId.value || !livret?.id || isDeletingId.value) return
  isDeletingId.value = livret.id
  try {
    await deleteSavingsAccount(supabase, userId.value, livret.id)
    savingsAccounts.value = savingsAccounts.value.filter((a) => a.id !== livret.id)
    if (editingLivretId.value === livret.id) closeLivretForm()
    if (selectedAccountTab.value === livret.id) selectedAccountTab.value = 'cc'
    confirmDialog.value = null
    await loadAll()
  } catch (err) {
    console.error(err)
    loadError.value = err?.message || 'Suppression du compte impossible.'
  } finally {
    isDeletingId.value = null
  }
}

function typeLabel(type) {
  return TX_TYPE_LABELS[type] || type
}

function typeClass(type) {
  if (type === TX_TYPES.INCOME) return 'is-income'
  if (type === TX_TYPES.FIXED) return 'is-fixed'
  return 'is-variable'
}

/** Catégorie « épargne » (insensible à la casse / accents). */
function isSavingsCategory(category) {
  const normalized = String(category || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
  return normalized === 'epargne' || normalized.includes('epargne')
}

onMounted(async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) userId.value = user.id
  await loadAll()
})
</script>

<template>
  <div class="finances-wrapper">
    <header class="finances-header">
      <h1 class="finances-title">{{ pageTitle }}</h1>
      <p class="finances-subtitle">
        Suivi de ton compte courant, revenus et dépenses — tout en euros.
      </p>
    </header>

    <p v-if="loadError" class="finances-error" role="alert">{{ loadError }}</p>
    <p v-if="isLoading" class="finances-loading">Chargement…</p>

    <template v-else>
      <section v-if="!balanceInitialized" class="finances-card balance-setup">
        <h2 class="section-title">Solde du compte courant</h2>
        <p class="section-hint">
          Indique ton solde actuel en euros pour démarrer le suivi. Les montants restent
          prévisionnels tant que la case « Réalisé » n’est pas cochée.
        </p>
        <form class="balance-form" @submit.prevent="saveOpeningBalance">
          <label class="field">
            <span>Solde actuel (€)</span>
            <input
              v-model="openingBalanceDraft"
              type="text"
              inputmode="decimal"
              placeholder="ex. 1520,50"
              required
              autocomplete="off"
            />
          </label>
          <p v-if="balanceError" class="field-error">{{ balanceError }}</p>
          <button type="submit" class="btn-primary" :disabled="isSavingBalance">
            {{ isSavingBalance ? 'Enregistrement…' : 'Enregistrer le solde' }}
          </button>
        </form>
      </section>

      <template v-else>
        <!-- Disposition type dashboard : gauche période+KPIs / droite courbe / bas 3 colonnes -->
        <div class="dashboard">
          <aside class="dashboard-left">
            <section class="finances-card period-card">
              <h2 class="section-title">{{ pageTitle }}</h2>
              <p class="section-hint">Vue centrée sur le compte courant.</p>
              <div class="period-layout">
                <label class="period-year-mobile">
                  <span class="period-year-mobile__label">Année</span>
                  <select
                    class="period-year-mobile__select"
                    :value="selectedYear"
                    aria-label="Année"
                    @change="selectedYear = Number($event.target.value)"
                  >
                    <option v-for="y in availableYears" :key="'mob-y-' + y" :value="y">
                      {{ y }}
                    </option>
                  </select>
                </label>
                <div class="year-list" role="listbox" aria-label="Année">
                  <button
                    v-for="y in availableYears"
                    :key="y"
                    type="button"
                    class="year-btn"
                    :class="{ active: y === selectedYear }"
                    role="option"
                    :aria-selected="y === selectedYear"
                    @click="selectedYear = y"
                  >
                    {{ y }}
                  </button>
                </div>
                <div class="period-separator" aria-hidden="true" />
                <div class="month-grid" role="listbox" aria-label="Mois">
                  <button
                    v-for="m in availableMonths"
                    :key="m.label"
                    type="button"
                    class="month-btn"
                    :class="{ active: m.month === selectedMonth }"
                    role="option"
                    :aria-selected="m.month === selectedMonth"
                    @click="selectedMonth = m.month"
                  >
                    {{ m.label }}
                  </button>
                </div>
              </div>
            </section>

            <div class="kpi-stack">
              <article class="kpi-card kpi-balance">
                <div class="kpi-text">
                  <p class="kpi-label">Solde fin de période :</p>
                  <p class="kpi-value">{{ formatEuro(periodEndBalance) }}</p>
                  <p class="kpi-hint">Montants réalisés uniquement</p>
                </div>
                <span class="kpi-icon" aria-hidden="true">€</span>
              </article>
              <article class="kpi-card">
                <div class="kpi-text">
                  <p class="kpi-label">Épargne sur la période :</p>
                  <p
                    class="kpi-value"
                    :class="{ positive: periodAgg.savings >= 0, negative: periodAgg.savings < 0 }"
                  >
                    {{ periodAgg.savings >= 0 ? '+' : '' }}{{ formatEuro(periodAgg.savings) }}
                  </p>
                  <p class="kpi-hint">
                    Revenus {{ formatEuro(periodAgg.realizedIncome) }} − fixes
                    {{ formatEuro(periodAgg.realizedFixed) }} − variables
                    {{ formatEuro(periodAgg.realizedVariable) }}
                  </p>
                </div>
                <span class="kpi-icon muted" aria-hidden="true">⬆</span>
              </article>
              <article class="kpi-card">
                <div class="kpi-text">
                  <p class="kpi-label">Taux endettement :</p>
                  <p class="kpi-value">{{ periodAgg.debtRatio }} %</p>
                  <p class="kpi-hint">Dépenses fixes réalisées ÷ revenus réalisés</p>
                </div>
                <span class="kpi-icon muted" aria-hidden="true">%</span>
              </article>
            </div>
          </aside>

          <section class="finances-card chart-card dashboard-chart">
            <h2 class="section-title chart-title">{{ chartTitle }}</h2>
            <p class="section-hint">
              {{ selectedYear }} — solde du compte courant (montants réalisés uniquement).
            </p>
            <div class="line-chart-wrap">
              <svg
                class="line-chart"
                :viewBox="`0 0 ${lineChart.w} ${lineChart.h}`"
                role="img"
                :aria-label="`Évolution du solde en ${selectedYear}`"
              >
                <defs>
                  <linearGradient id="finAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="var(--fin-chart-area)" />
                    <stop offset="100%" stop-color="transparent" />
                  </linearGradient>
                </defs>
                <path v-if="lineChart.area" class="chart-area" :d="lineChart.area" fill="url(#finAreaGrad)" />
                <path
                  v-if="lineChart.line"
                  class="chart-line"
                  :d="lineChart.line"
                  fill="none"
                  stroke="var(--fin-chart-stroke)"
                  stroke-width="2.75"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                <g
                  v-for="c in lineChart.coords"
                  :key="c.month"
                  class="chart-point"
                  :class="{ 'is-focus': c.isFocus, 'is-below': !c.labelAbove }"
                >
                  <circle
                    class="chart-dot"
                    :cx="c.x"
                    :cy="c.y"
                    :r="c.isFocus ? 5.5 : 4"
                    fill="var(--fin-chart-dot-fill)"
                    stroke="var(--fin-chart-stroke)"
                    :stroke-width="c.isFocus ? 2.5 : 2"
                  />
                  <rect
                    class="chart-label-bg"
                    :x="c.x - 26"
                    :y="c.labelBgY"
                    width="52"
                    height="15"
                    rx="4"
                    fill="var(--fin-chart-label-bg)"
                    stroke="var(--fin-chart-label-stroke)"
                  />
                  <text :x="c.x" :y="c.labelY" text-anchor="middle" class="chart-label">
                    {{ formatEuro(c.balance) }}
                  </text>
                  <text
                    :x="c.x"
                    :y="lineChart.h - 8"
                    text-anchor="middle"
                    class="chart-axis"
                    :class="{ 'is-focus': c.isFocus }"
                  >
                    {{ c.short }}
                  </text>
                </g>
              </svg>
            </div>
          </section>

          <section class="breakdown-grid dashboard-breakdown">
            <article class="finances-card breakdown-col theme-income">
              <table class="fin-table">
                <thead>
                  <tr>
                    <th>Revenus</th>
                    <th>Montant</th>
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in periodAgg.incomeByCat" :key="'in-' + row.name">
                    <td>{{ row.name }}</td>
                    <td>{{ formatEuro(row.amount) }}</td>
                    <td>{{ row.pct }} %</td>
                  </tr>
                  <tr v-if="!periodAgg.incomeByCat.length">
                    <td colspan="3" class="empty-row">Aucun revenu réalisé ce mois</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <td>TOTAL</td>
                    <td>{{ formatEuro(periodAgg.realizedIncome) }}</td>
                    <td>100 %</td>
                  </tr>
                </tfoot>
              </table>
              <div
                v-if="periodAgg.hasRealizedIncome"
                class="donut-wrap"
                @mouseleave="clearDonutHover('income')"
              >
                <svg viewBox="0 0 100 100" class="donut" role="img" aria-label="Répartition des revenus par catégorie">
                  <circle
                    cx="50"
                    cy="50"
                    r="32"
                    fill="none"
                    stroke="color-mix(in srgb, var(--color-secondary) 18%, transparent)"
                    stroke-width="16"
                  />
                  <path
                    v-for="(seg, i) in incomeDonut"
                    :key="'id-' + i"
                    class="donut-seg"
                    :class="{
                      'is-active': isDonutSegActive('income', seg),
                      'is-dimmed': isDonutSegDimmed('income', seg),
                    }"
                    :d="donutArcPath(seg.startAngle, seg.endAngle)"
                    :fill="seg.color"
                    @mouseenter="setDonutHover('income', seg)"
                    @focus="setDonutHover('income', seg)"
                    tabindex="0"
                    role="button"
                    :aria-label="`${seg.name} : ${formatEuro(seg.amount)} (${seg.pct} %)`"
                  />
                  <text x="50" y="52" text-anchor="middle" class="donut-center">
                    {{ formatEuro(periodAgg.realizedIncome) }}
                  </text>
                </svg>
                <div
                  v-if="donutHover?.kind === 'income'"
                  class="donut-detail-panel"
                  role="tooltip"
                >
                  <p class="donut-detail-title">
                    <span class="donut-detail-swatch" :style="{ background: donutHover.color }" />
                    {{ donutHover.name }}
                    <span class="donut-detail-meta">
                      {{ formatEuro(donutHover.amount) }} · {{ donutHover.pct }} %
                    </span>
                  </p>
                  <ul class="donut-detail-list">
                    <li v-for="row in donutHoverDetails" :key="'in-d-' + row.name">
                      <span>{{ row.name }}</span>
                      <span>{{ formatEuro(row.amount) }}</span>
                      <span>{{ row.pct }} %</span>
                    </li>
                  </ul>
                </div>
              </div>
              <p v-else class="chart-pending">Graphique dès qu’un revenu est marqué réalisé.</p>
            </article>

            <article class="finances-card breakdown-col theme-fixed">
              <table class="fin-table">
                <thead>
                  <tr>
                    <th>Dépenses fixes</th>
                    <th>Montant</th>
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in periodAgg.fixedByCat" :key="'fx-' + row.name">
                    <td>{{ row.name }}</td>
                    <td>{{ formatEuro(row.amount) }}</td>
                    <td>{{ row.pct }} %</td>
                  </tr>
                  <tr v-if="!periodAgg.fixedByCat.length">
                    <td colspan="3" class="empty-row">Aucune dépense fixe réalisée</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <td>TOTAL</td>
                    <td>{{ formatEuro(periodAgg.realizedFixed) }}</td>
                    <td>100 %</td>
                  </tr>
                </tfoot>
              </table>
              <div
                v-if="periodAgg.hasRealizedFixed"
                class="donut-wrap"
                @mouseleave="clearDonutHover('fixed')"
              >
                <svg viewBox="0 0 100 100" class="donut" role="img" aria-label="Répartition des dépenses fixes par catégorie">
                  <circle
                    cx="50"
                    cy="50"
                    r="32"
                    fill="none"
                    stroke="color-mix(in srgb, var(--color-secondary) 18%, transparent)"
                    stroke-width="16"
                  />
                  <path
                    v-for="(seg, i) in fixedDonut"
                    :key="'fd-' + i"
                    class="donut-seg"
                    :class="{
                      'is-active': isDonutSegActive('fixed', seg),
                      'is-dimmed': isDonutSegDimmed('fixed', seg),
                    }"
                    :d="donutArcPath(seg.startAngle, seg.endAngle)"
                    :fill="seg.color"
                    @mouseenter="setDonutHover('fixed', seg)"
                    @focus="setDonutHover('fixed', seg)"
                    tabindex="0"
                    role="button"
                    :aria-label="`${seg.name} : ${formatEuro(seg.amount)} (${seg.pct} %)`"
                  />
                  <text x="50" y="52" text-anchor="middle" class="donut-center">
                    {{ formatEuro(periodAgg.realizedFixed) }}
                  </text>
                </svg>
                <div
                  v-if="donutHover?.kind === 'fixed'"
                  class="donut-detail-panel"
                  role="tooltip"
                >
                  <p class="donut-detail-title">
                    <span class="donut-detail-swatch" :style="{ background: donutHover.color }" />
                    {{ donutHover.name }}
                    <span class="donut-detail-meta">
                      {{ formatEuro(donutHover.amount) }} · {{ donutHover.pct }} %
                    </span>
                  </p>
                  <ul class="donut-detail-list">
                    <li v-for="row in donutHoverDetails" :key="'fx-d-' + row.name">
                      <span>{{ row.name }}</span>
                      <span>{{ formatEuro(row.amount) }}</span>
                      <span>{{ row.pct }} %</span>
                    </li>
                  </ul>
                </div>
              </div>
              <p v-else class="chart-pending">Graphique dès qu’une dépense fixe est réalisée.</p>
            </article>

            <article class="finances-card breakdown-col theme-variable">
              <table class="fin-table">
                <thead>
                  <tr>
                    <th>Dépenses variables</th>
                    <th>Montant</th>
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in periodAgg.variableByCat" :key="'vr-' + row.name">
                    <td>{{ row.name }}</td>
                    <td>{{ formatEuro(row.amount) }}</td>
                    <td>{{ row.pct }} %</td>
                  </tr>
                  <tr v-if="!periodAgg.variableByCat.length">
                    <td colspan="3" class="empty-row">Aucune dépense variable réalisée</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <td>TOTAL</td>
                    <td>{{ formatEuro(periodAgg.realizedVariable) }}</td>
                    <td>100 %</td>
                  </tr>
                </tfoot>
              </table>
              <div
                v-if="periodAgg.hasRealizedVariable"
                class="donut-wrap"
                @mouseleave="clearDonutHover('variable')"
              >
                <svg viewBox="0 0 100 100" class="donut" role="img" aria-label="Répartition des dépenses variables par catégorie">
                  <circle
                    cx="50"
                    cy="50"
                    r="32"
                    fill="none"
                    stroke="color-mix(in srgb, var(--color-secondary) 18%, transparent)"
                    stroke-width="16"
                  />
                  <path
                    v-for="(seg, i) in variableDonut"
                    :key="'vd-' + i"
                    class="donut-seg"
                    :class="{
                      'is-active': isDonutSegActive('variable', seg),
                      'is-dimmed': isDonutSegDimmed('variable', seg),
                    }"
                    :d="donutArcPath(seg.startAngle, seg.endAngle)"
                    :fill="seg.color"
                    @mouseenter="setDonutHover('variable', seg)"
                    @focus="setDonutHover('variable', seg)"
                    tabindex="0"
                    role="button"
                    :aria-label="`${seg.name} : ${formatEuro(seg.amount)} (${seg.pct} %)`"
                  />
                  <text x="50" y="52" text-anchor="middle" class="donut-center">
                    {{ formatEuro(periodAgg.realizedVariable) }}
                  </text>
                </svg>
                <div
                  v-if="donutHover?.kind === 'variable'"
                  class="donut-detail-panel"
                  role="tooltip"
                >
                  <p class="donut-detail-title">
                    <span class="donut-detail-swatch" :style="{ background: donutHover.color }" />
                    {{ donutHover.name }}
                    <span class="donut-detail-meta">
                      {{ formatEuro(donutHover.amount) }} · {{ donutHover.pct }} %
                    </span>
                  </p>
                  <ul class="donut-detail-list">
                    <li v-for="row in donutHoverDetails" :key="'vr-d-' + row.name">
                      <span>{{ row.name }}</span>
                      <span>{{ formatEuro(row.amount) }}</span>
                      <span>{{ row.pct }} %</span>
                    </li>
                  </ul>
                </div>
              </div>
              <p v-else class="chart-pending">Graphique dès qu’une dépense variable est réalisée.</p>
            </article>
          </section>
        </div>

        <section class="finances-card">
          <h2 class="section-title">Récapitulatif {{ selectedYear }}</h2>
          <p class="section-hint">
            Revenus (+) et dépenses (−) par mois sur le compte courant. En rouge lorsque les
            dépenses dépassent les revenus.
          </p>
          <div class="recap-grid">
            <article
              v-for="m in yearRecap"
              :key="'recap-' + m.month"
              class="recap-item"
              :class="{ overspend: m.overspend, active: m.month === selectedMonth }"
              role="button"
              tabindex="0"
              @click="selectedMonth = m.month"
              @keydown.enter="selectedMonth = m.month"
            >
              <p class="recap-month">{{ m.short }}</p>
              <p class="recap-plus">+ {{ formatEuro(m.income) }}</p>
              <p class="recap-minus">− {{ formatEuro(m.expenses) }}</p>
            </article>
          </div>
        </section>

        <section class="finances-card">
          <div class="cc-head epargne-head">
            <div class="account-title-row">
              <h2 class="section-title">{{ selectedAccountTabMeta.name }}</h2>
              <span class="account-help" tabindex="0" :aria-label="accountHelpTooltip">
                <span class="account-help__icon" aria-hidden="true">i</span>
                <span class="account-help__tooltip" role="tooltip">{{ accountHelpTooltip }}</span>
              </span>
            </div>
            <div class="account-section-actions">
              <button type="button" class="btn-primary" @click="openAddForm">
                Ajouter un montant
              </button>
              <button type="button" class="btn-secondary" @click="openAddLivretForm">
                Ajouter un compte
              </button>
              <button
                v-if="isCcTab"
                type="button"
                class="btn-link"
                @click="openEditCcOpeningBalance"
              >
                Solde de départ
              </button>
              <template v-if="!isCcTab">
                <button
                  type="button"
                  class="btn-link"
                  @click="
                    openEditLivretForm({
                      id: selectedAccountTabMeta.id,
                      name: selectedAccountTabMeta.name,
                      opening_balance: selectedAccountTabMeta.opening,
                    })
                  "
                >
                  Modifier
                </button>
                <button
                  type="button"
                  class="btn-link danger"
                  :disabled="isDeletingId === selectedAccountTab"
                  @click="
                    requestDeleteLivret({
                      id: selectedAccountTabMeta.id,
                      name: selectedAccountTabMeta.name,
                    })
                  "
                >
                  Supprimer
                </button>
              </template>
            </div>
          </div>

          <nav class="account-tabs" role="tablist" aria-label="Comptes">
            <button
              v-for="tab in accountTabs"
              :key="tab.id"
              type="button"
              class="account-tab"
              role="tab"
              :aria-selected="selectedAccountTab === tab.id"
              :class="{ 'account-tab--active': selectedAccountTab === tab.id }"
              :title="`${tab.name} — ${formatEuro(tab.balance)}`"
              @click="selectedAccountTab = tab.id"
            >
              <span class="account-tab__label">{{ tab.name }}</span>
              <span class="account-tab__balance">{{ formatEuro(tab.balance) }}</span>
            </button>
          </nav>

          <div class="account-period-bar">
            <label class="account-year-field">
              <span class="account-year-label">Année</span>
              <select
                class="account-year-select"
                :value="selectedYear"
                aria-label="Année des montants"
                @change="selectedYear = Number($event.target.value)"
              >
                <option v-for="y in availableYears" :key="'acc-y-' + y" :value="y">{{ y }}</option>
              </select>
            </label>
            <nav class="month-tabs" role="tablist" aria-label="Mois du compte">
              <button
                v-for="m in availableMonths"
                :key="'acc-m-' + m.month"
                type="button"
                class="month-tab"
                role="tab"
                :aria-selected="selectedMonth === m.month"
                :class="{ 'month-tab--active': selectedMonth === m.month }"
                @click="selectedMonth = m.month"
              >
                {{ m.label }}
              </button>
            </nav>
          </div>

          <div v-if="formOpen" ref="formCardRef" class="form-card account-inline-form">
            <div class="form-card-head">
              <h3 class="section-title nested">
                {{ isEditMode ? 'Modifier le montant' : 'Nouveau montant' }}
              </h3>
              <button type="button" class="btn-ghost" @click="closeAddForm">Fermer</button>
            </div>
            <p class="section-hint form-hint">
              Ajouté sur <strong>{{ selectedAccountTabMeta.name }}</strong>. Par défaut
              <strong>prévisionnel</strong> — coche « Réalisé » quand c’est effectif.
            </p>
            <form class="amount-form" @submit.prevent="requestSubmit">
              <label class="field">
                <span>Date</span>
                <input v-model="amountForm.occurredOn" type="date" required />
              </label>
              <label class="field">
                <span>Type</span>
                <select v-model="amountForm.txType" required>
                  <option :value="TX_TYPES.INCOME">Revenu</option>
                  <option :value="TX_TYPES.FIXED">Dépense fixe</option>
                  <option :value="TX_TYPES.VARIABLE">Dépense variable</option>
                </select>
              </label>
              <div class="field">
                <span>Catégorie</span>
                <ReadingCollectionCombobox
                  v-model="amountForm.category"
                  :collections="categories"
                  appearance="form"
                  placeholder="Salaire, Courses, Loyer…"
                  empty-message="Aucune catégorie"
                  toggle-aria-label="Ouvrir les catégories"
                />
              </div>
              <label class="field">
                <span>Info spécifique</span>
                <input
                  v-model="amountForm.detail"
                  type="text"
                  placeholder="ex. Carrefour, Leclerc…"
                  maxlength="200"
                />
              </label>
              <label class="field">
                <span>Montant (€)</span>
                <input
                  v-model="amountForm.amount"
                  type="text"
                  inputmode="decimal"
                  placeholder="0,00"
                  required
                />
              </label>
              <p v-if="formError" class="field-error">{{ formError }}</p>
              <div class="form-actions">
                <button type="button" class="btn-ghost" @click="closeAddForm">Annuler</button>
                <button type="submit" class="btn-primary" :disabled="isSaving">
                  {{ isSaving ? 'Enregistrement…' : isEditMode ? 'Enregistrer' : 'Ajouter' }}
                </button>
              </div>
            </form>
          </div>

          <div v-if="ccOpeningFormOpen && isCcTab" class="form-card account-inline-form">
            <div class="form-card-head">
              <h3 class="form-card-title">Solde de départ du compte courant</h3>
              <button type="button" class="btn-ghost" @click="closeCcOpeningForm">Fermer</button>
            </div>
            <p class="form-hint">
              Corrige uniquement le solde de départ. Tes montants déjà enregistrés sont conservés ;
              le solde affiché sera recalculé à partir de cette base.
            </p>
            <form class="amount-form" @submit.prevent="saveOpeningBalance">
              <label class="field">
                <span>Solde de départ (€)</span>
                <input
                  v-model="openingBalanceDraft"
                  type="text"
                  inputmode="decimal"
                  placeholder="ex. 1520,50"
                  required
                  autocomplete="off"
                />
              </label>
              <p v-if="balanceError" class="field-error">{{ balanceError }}</p>
              <div class="form-actions">
                <button type="button" class="btn-ghost" @click="closeCcOpeningForm">Annuler</button>
                <button type="submit" class="btn-primary" :disabled="isSavingBalance">
                  {{ isSavingBalance ? 'Enregistrement…' : 'Enregistrer' }}
                </button>
              </div>
            </form>
          </div>

          <div v-if="livretFormOpen" class="form-card account-inline-form">
            <div class="form-card-head">
              <h3 class="section-title nested">
                {{ editingLivretId ? 'Modifier le compte' : 'Nouveau compte' }}
              </h3>
              <button type="button" class="btn-ghost" @click="closeLivretForm">Fermer</button>
            </div>
            <div class="suggested-livrets">
              <button
                v-for="name in SUGGESTED_SAVINGS_NAMES"
                :key="name"
                type="button"
                class="chip"
                @click="pickSuggestedLivret(name)"
              >
                {{ name }}
              </button>
            </div>
            <form class="amount-form" @submit.prevent="saveLivret">
              <label class="field">
                <span>Nom du compte</span>
                <input
                  v-model="livretForm.name"
                  type="text"
                  placeholder="ex. Livret A, PEL, Épargne vacances…"
                  required
                />
              </label>
              <label class="field">
                <span>Solde actuel (€)</span>
                <input
                  v-model="livretForm.openingBalance"
                  type="text"
                  inputmode="decimal"
                  placeholder="0,00"
                  required
                />
              </label>
              <p v-if="livretError" class="field-error">{{ livretError }}</p>
              <div class="form-actions">
                <button type="button" class="btn-ghost" @click="closeLivretForm">Annuler</button>
                <button type="submit" class="btn-primary" :disabled="isSavingLivret">
                  {{ isSavingLivret ? 'Enregistrement…' : 'Enregistrer' }}
                </button>
              </div>
            </form>
          </div>

          <div v-if="!visibleTransactions.length" class="empty-block">
            Aucun montant en {{ selectedPeriodLabel }} sur ce compte. Clique sur « Ajouter un
            montant ».
          </div>
          <div v-else class="cc-table-wrap">
            <table class="cc-table">
              <thead>
                <tr>
                  <th class="col-check">Réalisé</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Statut</th>
                  <th>Catégorie</th>
                  <th>Info</th>
                  <th class="col-amount">Montant</th>
                  <th class="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="tx in visibleTransactions"
                  :key="tx.id"
                  :class="{
                    applied: tx.applied,
                    provisional: !tx.applied,
                    'is-savings-cat': isSavingsCategory(tx.category),
                    [typeClass(tx.tx_type)]: true,
                  }"
                >
                  <td class="col-check">
                    <input
                      type="checkbox"
                      :checked="tx.applied"
                      :disabled="isTogglingId === tx.id"
                      :aria-label="tx.applied ? 'Marquer comme prévisionnel' : 'Marquer comme réalisé'"
                      @change="toggleApplied(tx)"
                    />
                  </td>
                  <td>{{ tx.occurred_on }}</td>
                  <td>
                    <span class="type-pill" :class="typeClass(tx.tx_type)">
                      {{ typeLabel(tx.tx_type) }}
                    </span>
                  </td>
                  <td>
                    <span class="status-pill" :class="tx.applied ? 'is-realized' : 'is-planned'">
                      {{ tx.applied ? 'Réalisé' : 'Prévisionnel' }}
                    </span>
                  </td>
                  <td>{{ tx.category }}</td>
                  <td class="detail-cell">{{ tx.detail || '—' }}</td>
                  <td class="col-amount" :class="typeClass(tx.tx_type)">
                    <template v-if="tx.tx_type === TX_TYPES.INCOME"
                      >+{{ formatEuro(tx.amount) }}</template
                    >
                    <template v-else>−{{ formatEuro(tx.amount) }}</template>
                  </td>
                  <td class="col-actions">
                    <button type="button" class="btn-link" @click="openEditForm(tx)">
                      Modifier
                    </button>
                    <button
                      type="button"
                      class="btn-link danger"
                      :disabled="isDeletingId === tx.id"
                      @click="requestDelete(tx)"
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <ul v-if="visibleTransactions.length" class="tx-cards">
            <li
              v-for="tx in visibleTransactions"
              :key="'card-' + tx.id"
              class="tx-card"
              :class="{
                provisional: !tx.applied,
                'is-savings-cat': isSavingsCategory(tx.category),
                [typeClass(tx.tx_type)]: true,
              }"
            >
              <div class="tx-card__head">
                <label class="tx-card__realized">
                  <input
                    type="checkbox"
                    :checked="tx.applied"
                    :disabled="isTogglingId === tx.id"
                    :aria-label="tx.applied ? 'Marquer comme prévisionnel' : 'Marquer comme réalisé'"
                    @change="toggleApplied(tx)"
                  />
                  <span class="status-pill" :class="tx.applied ? 'is-realized' : 'is-planned'">
                    {{ tx.applied ? 'Réalisé' : 'Prévisionnel' }}
                  </span>
                </label>
                <p class="tx-card__amount" :class="typeClass(tx.tx_type)">
                  <template v-if="tx.tx_type === TX_TYPES.INCOME"
                    >+{{ formatEuro(tx.amount) }}</template
                  >
                  <template v-else>−{{ formatEuro(tx.amount) }}</template>
                </p>
              </div>
              <p class="tx-card__date">{{ tx.occurred_on }}</p>
              <div class="tx-card__tags">
                <span class="type-pill" :class="typeClass(tx.tx_type)">
                  {{ typeLabel(tx.tx_type) }}
                </span>
                <span class="tx-card__cat">{{ tx.category }}</span>
              </div>
              <p v-if="tx.detail" class="tx-card__detail">{{ tx.detail }}</p>
              <div class="tx-card__actions">
                <button type="button" class="btn-link" @click="openEditForm(tx)">Modifier</button>
                <button
                  type="button"
                  class="btn-link danger"
                  :disabled="isDeletingId === tx.id"
                  @click="requestDelete(tx)"
                >
                  Supprimer
                </button>
              </div>
            </li>
          </ul>
        </section>
      </template>
    </template>

    <div
      v-if="confirmDialog"
      class="confirm-overlay"
      @click.self="closeConfirm"
      @keydown.escape="closeConfirm"
    >
      <div
        class="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="finance-confirm-title"
        aria-describedby="finance-confirm-message"
      >
        <h2 id="finance-confirm-title" class="confirm-title">{{ confirmTitle }}</h2>
        <p id="finance-confirm-message" class="confirm-message">{{ confirmMessage }}</p>
        <div class="confirm-actions">
          <button
            type="button"
            class="btn-ghost"
            :disabled="isSaving || Boolean(isDeletingId)"
            @click="closeConfirm"
          >
            Annuler
          </button>
          <button
            type="button"
            class="btn-primary"
            :class="{
              danger:
                confirmDialog.kind === 'delete' || confirmDialog.kind === 'delete-livret',
            }"
            :disabled="isSaving || Boolean(isDeletingId)"
            @click="confirmAction"
          >
            <template v-if="confirmDialog.kind === 'delete' || confirmDialog.kind === 'delete-livret'">
              {{ isDeletingId ? 'Suppression…' : 'Supprimer' }}
            </template>
            <template v-else>
              {{ isSaving ? 'Enregistrement…' : 'Confirmer' }}
            </template>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.finances-wrapper {
  flex: 1;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 1.5rem 1.25rem 3rem;
  box-sizing: border-box;
  --fin-chart-stroke: var(--color-primary-dark);
  --fin-chart-area: color-mix(in srgb, var(--color-primary-dark) 42%, transparent);
  --fin-chart-dot-fill: #ffffff;
  --fin-chart-label-bg: rgba(255, 255, 255, 0.94);
  --fin-chart-label-stroke: color-mix(in srgb, var(--color-primary-dark) 35%, transparent);
}

.period-year-mobile {
  display: none;
}

.tx-cards {
  display: none;
  list-style: none;
  margin: 0;
  padding: 0;
}

.finances-header {
  margin-bottom: 1.25rem;
  text-align: center;
}

.finances-title {
  font-size: 2rem;
  font-weight: 800;
  color: #2c3e50;
  margin: 0;
}

.finances-subtitle {
  margin: 0.5rem 0 0;
  color: #6c757d;
  font-size: 1rem;
}

.finances-error {
  color: #b42318;
  background: rgba(180, 35, 24, 0.08);
  border: 1px solid rgba(180, 35, 24, 0.2);
  border-radius: 12px;
  padding: 0.75rem 1rem;
  margin: 0 0 1rem;
}

.finances-loading {
  text-align: center;
  color: #6c757d;
}

.finances-card {
  width: 100%;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  border: 1px solid color-mix(in srgb, var(--color-primary) 40%, var(--color-border));
  border-radius: 16px;
  padding: 1.25rem 1.25rem 1.35rem;
  margin-bottom: 0;
  box-sizing: border-box;
}

.section-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: #2c3e50;
}

.chart-title {
  text-align: center;
}

.section-hint {
  margin: 0.35rem 0 0;
  color: #6c757d;
  font-size: 0.9rem;
  line-height: 1.45;
}

.toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}

.btn-secondary {
  border: 1px solid color-mix(in srgb, var(--color-primary-dark) 50%, transparent);
  border-radius: 12px;
  padding: 0.65rem 1.15rem;
  background: rgba(255, 255, 255, 0.55);
  color: color-mix(in srgb, var(--color-primary-dark) 55%, var(--color-text));
  font-weight: 800;
  cursor: pointer;
}

.btn-secondary:hover {
  background: color-mix(in srgb, var(--color-primary) 35%, transparent);
}

.dashboard {
  display: grid;
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
  grid-template-areas:
    'left chart'
    'breakdown breakdown';
  gap: 0.85rem;
  margin-bottom: 1rem;
  align-items: stretch;
}

.dashboard-left {
  grid-area: left;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.dashboard-chart {
  grid-area: chart;
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.dashboard-breakdown {
  grid-area: breakdown;
}

.period-layout {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.85rem;
  align-items: stretch;
}

.period-separator {
  width: 1px;
  flex-shrink: 0;
  align-self: stretch;
  background: color-mix(in srgb, var(--color-primary-dark) 35%, transparent);
  border-radius: 1px;
}

.year-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 4.25rem;
  max-height: 11.5rem;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 0.15rem;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--color-primary-dark) 45%, transparent) transparent;
}

.year-list::-webkit-scrollbar {
  width: 4px;
}

.year-list::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--color-primary-dark) 45%, transparent);
  border-radius: 999px;
}

.year-btn,
.month-btn {
  border: 1px solid color-mix(in srgb, var(--color-primary-dark) 30%, transparent);
  background: rgba(255, 255, 255, 0.55);
  color: var(--color-text);
  border-radius: 10px;
  padding: 0.4rem 0.45rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}

.year-btn.active,
.month-btn.active {
  background: color-mix(in srgb, var(--color-primary) 45%, transparent);
  border-color: var(--color-primary-dark);
  color: var(--color-text);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary-dark) 22%, transparent);
}

.month-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.35rem;
  flex: 1;
}

.kpi-stack {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  flex: 1;
}

.kpi-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  border: 1px solid color-mix(in srgb, var(--color-primary) 40%, var(--color-border));
  border-radius: 16px;
  padding: 1rem 1.1rem;
  flex: 1;
}

.kpi-balance {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--color-primary) 55%, transparent),
    color-mix(in srgb, var(--color-secondary) 40%, transparent)
  );
  border-color: color-mix(in srgb, var(--color-primary-dark) 40%, transparent);
}

.kpi-text {
  min-width: 0;
}

.kpi-label {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-text-light);
}

.kpi-value {
  margin: 0.35rem 0 0;
  font-size: 1.55rem;
  font-weight: 800;
  color: #2c3e50;
  line-height: 1.15;
}

.kpi-value.positive {
  color: #2d6a4f;
}

.kpi-value.negative {
  color: #b42318;
}

.kpi-hint {
  margin: 0.2rem 0 0;
  font-size: 0.72rem;
  color: #6c757d;
}

.kpi-icon {
  flex-shrink: 0;
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.55);
  color: var(--color-primary-dark);
  font-weight: 800;
  font-size: 1.1rem;
}

.kpi-icon.muted {
  background: color-mix(in srgb, var(--color-primary) 35%, transparent);
  font-size: 0.95rem;
}

.btn-primary {
  border: none;
  border-radius: 12px;
  padding: 0.65rem 1.15rem;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  color: #fff;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 6px 16px color-mix(in srgb, var(--color-primary-dark) 30%, transparent);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary.danger {
  background: linear-gradient(135deg, #d45454, #b42318);
  box-shadow: 0 6px 16px rgba(180, 35, 24, 0.25);
}

.btn-ghost {
  border: 1px solid color-mix(in srgb, var(--color-primary-dark) 40%, transparent);
  background: transparent;
  color: color-mix(in srgb, var(--color-primary-dark) 50%, var(--color-text));
  border-radius: 10px;
  padding: 0.5rem 0.9rem;
  font-weight: 700;
  cursor: pointer;
}

.btn-link {
  border: none;
  background: none;
  color: var(--color-primary-dark);
  font-weight: 700;
  cursor: pointer;
  padding: 0.2rem 0.25rem;
  white-space: nowrap;
}

.btn-link.danger {
  color: #b42318;
}

.form-card {
  margin-bottom: 1rem;
}

.account-inline-form {
  margin: 0 0 1rem;
  padding: 1rem 1.05rem;
  border-radius: 14px;
  background: color-mix(in srgb, var(--color-primary) 10%, rgba(255, 255, 255, 0.72));
  border: 1px solid color-mix(in srgb, var(--color-primary-dark) 22%, transparent);
}

.form-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.amount-form,
.balance-form {
  display: grid;
  gap: 0.85rem;
}

.amount-form {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-text-light);
}

.field input,
.field select {
  border: 1px solid color-mix(in srgb, var(--color-primary-dark) 35%, var(--color-border));
  border-radius: 10px;
  padding: 0.55rem 0.7rem;
  background: rgba(255, 255, 255, 0.8);
  color: var(--color-text);
  font-weight: 600;
}

.field-error {
  grid-column: 1 / -1;
  margin: 0;
  color: #b42318;
  font-size: 0.9rem;
}

.form-actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
}

.line-chart-wrap {
  margin-top: 0.75rem;
  overflow-x: auto;
  flex: 1;
  display: flex;
  align-items: center;
}

.line-chart {
  width: 100%;
  min-width: 480px;
  height: auto;
}

.chart-label {
  font-size: 7.5px;
  fill: var(--color-text);
  font-weight: 700;
}

.chart-axis {
  font-size: 9px;
  fill: var(--color-text-light);
}

.chart-axis.is-focus {
  fill: var(--color-text);
  font-weight: 800;
}

.breakdown-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.85rem;
  align-items: stretch;
}

.breakdown-col {
  padding: 0.85rem;
  margin-top: 0;
  height: 100%;
  box-sizing: border-box;
}

.fin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}

.fin-table th,
.fin-table td {
  padding: 0.4rem 0.35rem;
  text-align: left;
  border-bottom: 1px solid color-mix(in srgb, var(--color-secondary) 15%, transparent);
}

.fin-table th {
  font-weight: 800;
  color: #fff;
}

.theme-income .fin-table thead,
.theme-income .fin-table tfoot tr {
  background: var(--color-secondary);
  color: #fff;
}

.theme-fixed .fin-table thead,
.theme-fixed .fin-table tfoot tr {
  background: var(--color-tertiary);
  color: #fff;
}

.theme-variable .fin-table thead,
.theme-variable .fin-table tfoot tr {
  background: #e8a0c0;
  color: #fff;
}

.theme-income .fin-table tfoot td,
.theme-fixed .fin-table tfoot td,
.theme-variable .fin-table tfoot td {
  color: #fff;
  font-weight: 800;
  border-bottom: none;
}

.fin-table tfoot td {
  padding-top: 0.5rem;
}

.empty-row {
  color: #6c757d;
  font-style: italic;
}

.donut-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.65rem;
  margin-top: 0.75rem;
  position: relative;
}

.donut {
  width: 150px;
  height: 150px;
}

.donut-seg {
  cursor: pointer;
  outline: none;
  transition: opacity 0.15s ease;
}

.donut-seg.is-dimmed {
  opacity: 0.35;
}

.donut-seg.is-active {
  opacity: 1;
  filter: brightness(1.05);
}

.donut-center {
  font-size: 7px;
  font-weight: 800;
  fill: #2c3e50;
  pointer-events: none;
}

.donut-detail-panel {
  width: 100%;
  max-width: 16rem;
  padding: 0.55rem 0.65rem;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid color-mix(in srgb, var(--color-primary-dark) 22%, transparent);
  box-shadow: 0 6px 16px color-mix(in srgb, var(--color-text) 10%, transparent);
}

.donut-detail-title {
  margin: 0 0 0.4rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.45rem;
  font-size: 0.78rem;
  font-weight: 800;
  color: var(--color-text);
}

.donut-detail-swatch {
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 3px;
  flex-shrink: 0;
}

.donut-detail-meta {
  font-weight: 700;
  color: var(--color-text-light);
  font-size: 0.72rem;
}

.donut-detail-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.25rem;
}

.donut-detail-list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 0.45rem;
  font-size: 0.74rem;
  font-weight: 650;
  color: var(--color-text);
}

.donut-detail-list li span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.donut-detail-list li span:nth-child(2),
.donut-detail-list li span:nth-child(3) {
  color: var(--color-text-light);
  white-space: nowrap;
}

.recap-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0.55rem;
  margin-top: 0.85rem;
}

.finances-card + .finances-card,
.dashboard + .finances-card {
  margin-top: 1rem;
}

.breakdown-grid > .breakdown-col {
  margin-top: 0;
}

.recap-item {
  border: 1px solid color-mix(in srgb, var(--color-primary-dark) 28%, transparent);
  border-radius: 12px;
  padding: 0.55rem 0.5rem;
  background: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}

.recap-item.active {
  border-color: var(--color-primary-dark);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary-dark) 22%, transparent);
}

.recap-item.overspend {
  background: rgba(180, 35, 24, 0.08);
  border-color: rgba(180, 35, 24, 0.35);
}

.recap-item.overspend .recap-minus {
  color: #b42318;
  font-weight: 800;
}

.recap-month {
  margin: 0;
  font-weight: 800;
  color: #2c3e50;
  font-size: 0.85rem;
}

.recap-plus {
  margin: 0.25rem 0 0;
  color: #2d6a4f;
  font-size: 0.78rem;
  font-weight: 700;
}

.recap-minus {
  margin: 0.1rem 0 0;
  color: #6c757d;
  font-size: 0.78rem;
  font-weight: 700;
}

.cc-head {
  margin-bottom: 0.75rem;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  flex-wrap: wrap;
}

.account-title-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}

.account-help {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  outline: none;
}

.account-help__icon {
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 0.72rem;
  font-weight: 800;
  font-style: italic;
  line-height: 1;
  color: var(--color-primary-dark);
  background: color-mix(in srgb, var(--color-primary) 35%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary-dark) 35%, transparent);
  cursor: help;
}

.account-help__tooltip {
  position: absolute;
  left: 0;
  top: calc(100% + 0.45rem);
  z-index: 20;
  width: min(22rem, 72vw);
  padding: 0.65rem 0.75rem;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid color-mix(in srgb, var(--color-primary-dark) 30%, transparent);
  box-shadow: 0 8px 22px color-mix(in srgb, var(--color-text) 14%, transparent);
  color: var(--color-text);
  font-size: 0.78rem;
  font-weight: 600;
  line-height: 1.45;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: translateY(-2px);
  transition:
    opacity 0.15s ease,
    visibility 0.15s ease,
    transform 0.15s ease;
}

.account-help:hover .account-help__tooltip,
.account-help:focus .account-help__tooltip,
.account-help:focus-within .account-help__tooltip {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.account-toolbar-actions {
  display: flex;
  gap: 0.35rem;
  flex-shrink: 0;
}

.account-tabs {
  display: flex;
  gap: 0.5rem;
  margin: 0.85rem 0 0.65rem;
  padding: 0.35rem;
  border-radius: 14px;
  background: color-mix(in srgb, var(--color-primary) 18%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary) 30%, transparent);
  overflow-x: auto;
}

.account-period-bar {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin: 0 0 0.9rem;
  flex-wrap: wrap;
}

.account-year-field {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}

.account-year-label {
  font-size: 0.78rem;
  font-weight: 800;
  color: var(--color-text-light);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.account-year-select {
  border: 1px solid color-mix(in srgb, var(--color-primary-dark) 35%, transparent);
  border-radius: 10px;
  padding: 0.4rem 0.55rem;
  background: rgba(255, 255, 255, 0.75);
  color: var(--color-text);
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}

.month-tabs {
  display: flex;
  gap: 0.35rem;
  flex: 1;
  min-width: 0;
  padding: 0.3rem;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-secondary) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-secondary) 22%, transparent);
  overflow-x: auto;
}

.month-tab {
  flex: 1;
  min-width: max-content;
  border: none;
  border-radius: 8px;
  padding: 0.4rem 0.55rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-text-light);
  background: transparent;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    box-shadow 0.15s ease;
}

.month-tab:hover {
  color: var(--color-primary-dark);
  background: rgba(255, 255, 255, 0.45);
}

.month-tab--active {
  color: var(--color-primary-dark);
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary-dark) 16%, transparent);
}

.account-tab {
  flex: 1;
  min-width: max-content;
  border: none;
  border-radius: 10px;
  padding: 0.6rem 0.85rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  font-weight: 700;
  color: #6c757d;
  background: transparent;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;
}

.account-tab__label {
  font-size: 0.9rem;
  line-height: 1.2;
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-tab__balance {
  font-size: 0.78rem;
  font-weight: 800;
  opacity: 0.85;
}

.account-tab:hover {
  color: var(--color-primary-dark);
  background: rgba(255, 255, 255, 0.45);
}

.account-tab--active {
  color: var(--color-primary-dark);
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary-dark) 18%, transparent);
}

.account-section-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  align-items: center;
  justify-content: flex-end;
}

.account-section-actions .btn-primary,
.account-section-actions .btn-secondary {
  padding: 0.4rem 0.75rem;
  border-radius: 10px;
  font-size: 0.82rem;
  font-weight: 700;
  line-height: 1.2;
}

.account-section-actions .btn-primary {
  box-shadow: 0 3px 10px color-mix(in srgb, var(--color-primary-dark) 22%, transparent);
}

.form-hint {
  margin: 0 0 0.85rem;
}

.chart-pending {
  margin: 0.85rem 0 0;
  text-align: center;
  color: #6c757d;
  font-size: 0.82rem;
  font-style: italic;
}

.status-pill {
  display: inline-block;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 800;
}

.status-pill.is-realized {
  background: color-mix(in srgb, var(--color-success) 45%, #fff);
  color: #1f5c40;
}

.status-pill.is-planned {
  background: color-mix(in srgb, var(--color-primary) 28%, #e8e4ef);
  color: #4a3f55;
}

.cc-table tr.provisional {
  opacity: 0.78;
}

.account-balance-line {
  margin: 0 0 0.75rem;
  color: #2c3e50;
  font-size: 0.95rem;
}

.account-opening {
  color: #6c757d;
  font-weight: 600;
  font-size: 0.85rem;
}

.epargne-head {
  /* layout handled by .cc-head */
}

.section-title.nested {
  font-size: 1rem;
}

.suggested-livrets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.85rem;
}

.chip {
  border: 1px solid color-mix(in srgb, var(--color-tertiary) 40%, transparent);
  background: color-mix(in srgb, var(--color-tertiary) 14%, transparent);
  color: color-mix(in srgb, var(--color-tertiary) 55%, var(--color-text));
  border-radius: 999px;
  padding: 0.28rem 0.65rem;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}

.field-hint {
  font-size: 0.75rem;
  font-weight: 600;
  color: #b42318;
}

.empty-block {
  color: #6c757d;
  padding: 0.5rem 0;
}

.cc-table-wrap {
  overflow-x: auto;
}

.cc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}

.cc-table th,
.cc-table td {
  padding: 0.55rem 0.45rem;
  text-align: left;
  border-bottom: 1px solid color-mix(in srgb, var(--color-secondary) 16%, transparent);
  vertical-align: middle;
}

.cc-table th {
  font-weight: 800;
  color: var(--color-text-light);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.col-check {
  width: 2.5rem;
  text-align: center;
}

.col-amount {
  text-align: right;
  font-weight: 800;
  white-space: nowrap;
}

.col-actions {
  width: 9rem;
  text-align: right;
  white-space: nowrap;
}

.detail-cell {
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.type-pill {
  display: inline-block;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 800;
}

.type-pill.is-income {
  background: color-mix(in srgb, var(--color-secondary) 38%, #fff);
  color: #2f4578;
}

.type-pill.is-fixed {
  background: color-mix(in srgb, var(--color-tertiary) 42%, #fff);
  color: #1f524a;
}

.type-pill.is-variable {
  background: color-mix(in srgb, #e8a0c0 48%, #fff);
  color: #7a2f52;
}

.col-amount.is-income {
  color: #2d6a4f;
}

.col-amount.is-fixed,
.col-amount.is-variable {
  color: #8a4a5a;
}

.tx-card__amount.is-income {
  color: #2d6a4f;
}

.tx-card__amount.is-fixed,
.tx-card__amount.is-variable {
  color: #8a4a5a;
}

.cc-table tr.is-savings-cat {
  background: color-mix(in srgb, var(--color-tertiary) 22%, transparent);
}

.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(30, 24, 40, 0.45);
  display: grid;
  place-items: center;
  padding: 1rem;
}

.confirm-dialog {
  width: min(100%, 26rem);
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid color-mix(in srgb, var(--color-primary) 45%, var(--color-border));
  border-radius: 16px;
  padding: 1.25rem 1.35rem;
  box-shadow: 0 16px 40px color-mix(in srgb, var(--color-text) 18%, transparent);
}

.confirm-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: #2c3e50;
}

.confirm-message {
  margin: 0.65rem 0 0;
  color: var(--color-text-light);
  line-height: 1.45;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  margin-top: 1.1rem;
}

@media (max-width: 1100px) {
  .dashboard {
    grid-template-columns: 1fr;
    grid-template-areas:
      'left'
      'chart'
      'breakdown';
  }

  .kpi-stack {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .breakdown-grid {
    grid-template-columns: 1fr;
  }

  .recap-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 700px) {
  .finances-wrapper {
    padding: 1rem 0.85rem 2.5rem;
  }

  .finances-title {
    font-size: 1.55rem;
  }

  .finances-card,
  .kpi-card {
    padding: 1rem 0.95rem;
    border-radius: 14px;
  }

  .period-layout {
    flex-direction: column;
    gap: 0.65rem;
  }

  .period-year-mobile {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.55rem 0.7rem;
    border-radius: 12px;
    background: color-mix(in srgb, var(--color-primary) 16%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-primary-dark) 28%, transparent);
  }

  .period-year-mobile__label {
    font-size: 0.78rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--color-text-light);
  }

  .period-year-mobile__select {
    border: none;
    background: transparent;
    color: var(--color-text);
    font-weight: 800;
    font-size: 1rem;
    text-align: right;
    cursor: pointer;
  }

  .year-list,
  .period-separator {
    display: none;
  }

  .month-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.4rem;
  }

  .month-btn {
    padding: 0.55rem 0.2rem;
    font-size: 0.78rem;
  }

  .kpi-stack {
    grid-template-columns: 1fr;
    gap: 0.55rem;
  }

  .line-chart-wrap {
    overflow: visible;
  }

  .line-chart {
    min-width: 0;
    width: 100%;
  }

  .chart-label {
    font-size: 7px;
    font-weight: 800;
  }

  .chart-label-bg {
    opacity: 0.92;
  }

  .chart-point.is-focus .chart-label {
    font-size: 8px;
  }

  .chart-axis {
    font-size: 7.5px;
  }

  .chart-axis.is-focus {
    font-size: 8.5px;
    font-weight: 800;
    fill: var(--color-text);
  }

  .amount-form {
    grid-template-columns: 1fr;
  }

  .recap-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.45rem;
  }

  .cc-head {
    flex-direction: column;
    align-items: stretch;
    gap: 0.75rem;
  }

  .account-section-actions {
    justify-content: stretch;
  }

  .account-section-actions .btn-primary,
  .account-section-actions .btn-secondary {
    flex: 1;
    text-align: center;
  }

  .account-tabs {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.4rem;
    overflow: visible;
    padding: 0.4rem;
  }

  .account-tab {
    flex: none;
    width: 100%;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    padding: 0.7rem 0.85rem;
    border-radius: 12px;
  }

  .account-tab__label {
    max-width: none;
    font-size: 0.92rem;
  }

  .account-tab__balance {
    font-size: 0.85rem;
  }

  .account-period-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 0.55rem;
  }

  .account-year-field {
    justify-content: space-between;
    padding: 0.5rem 0.7rem;
    border-radius: 12px;
    background: color-mix(in srgb, var(--color-primary) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-primary-dark) 25%, transparent);
  }

  .account-year-select {
    border: none;
    background: transparent;
    font-size: 1rem;
    text-align: right;
  }

  .month-tabs {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.35rem;
    overflow: visible;
    padding: 0.4rem;
  }

  .month-tab {
    flex: none;
    min-width: 0;
    padding: 0.5rem 0.15rem;
    font-size: 0.74rem;
  }

  .cc-table-wrap {
    display: none;
  }

  .tx-cards {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .tx-card {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.85rem 0.9rem;
    border-radius: 14px;
    background: color-mix(in srgb, var(--color-primary) 10%, rgba(255, 255, 255, 0.72));
    border: 1px solid color-mix(in srgb, var(--color-primary-dark) 20%, transparent);
  }

  .tx-card.is-savings-cat {
    background: color-mix(in srgb, var(--color-tertiary) 20%, rgba(255, 255, 255, 0.7));
    border-color: color-mix(in srgb, var(--color-tertiary) 40%, transparent);
  }

  .tx-card.provisional {
    opacity: 0.9;
  }

  .tx-card__head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
  }

  .tx-card__realized {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    cursor: pointer;
  }

  .tx-card__amount {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 800;
    white-space: nowrap;
  }

  .tx-card__date {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--color-text-light);
  }

  .tx-card__tags {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
  }

  .tx-card__cat {
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--color-text);
  }

  .tx-card__detail {
    margin: 0;
    font-size: 0.8rem;
    color: var(--color-text-light);
  }

  .tx-card__actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding-top: 0.25rem;
  }

  .donut-detail-panel {
    max-width: none;
  }
}

@media (prefers-color-scheme: dark) {
  .finances-wrapper {
    --fin-chart-stroke: var(--color-primary);
    --fin-chart-area: color-mix(in srgb, var(--color-primary) 55%, transparent);
    --fin-chart-dot-fill: var(--color-background);
    --fin-chart-label-bg: color-mix(in srgb, var(--color-background) 88%, var(--color-primary));
    --fin-chart-label-stroke: color-mix(in srgb, var(--color-primary) 45%, transparent);
  }

  .finances-title,
  .section-title,
  .kpi-value,
  .recap-month,
  .donut-center,
  .confirm-title {
    color: var(--color-text);
  }

  .finances-subtitle,
  .section-hint,
  .kpi-label,
  .kpi-hint,
  .finances-loading,
  .empty-block,
  .empty-row,
  .recap-minus,
  .chart-axis,
  .confirm-message {
    color: #c5c0d0;
  }

  .chart-label {
    fill: var(--color-text);
  }

  .chart-axis {
    fill: #c5c0d0;
  }

  .finances-card,
  .kpi-card,
  .confirm-dialog {
    background: color-mix(in srgb, var(--color-background) 88%, var(--color-primary));
    border-color: color-mix(in srgb, var(--color-primary) 32%, transparent);
  }

  .kpi-balance {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--color-primary) 45%, transparent),
      color-mix(in srgb, var(--color-secondary) 35%, transparent)
    );
  }

  .year-btn,
  .month-btn,
  .field input,
  .field select,
  .recap-item {
    background: color-mix(in srgb, var(--color-background) 75%, var(--color-primary));
    color: var(--color-text);
    border-color: color-mix(in srgb, var(--color-primary) 32%, transparent);
  }

  .year-btn.active,
  .month-btn.active {
    background: color-mix(in srgb, var(--color-primary) 55%, transparent);
    color: #fff;
    border-color: var(--color-primary);
  }

  .btn-ghost {
    color: var(--color-text);
  }

  .cc-table th {
    color: var(--color-text);
  }

  .cc-table th,
  .cc-table td {
    border-bottom-color: color-mix(in srgb, var(--color-primary) 18%, transparent);
  }

  .field {
    color: var(--color-text-light);
  }

  .account-tabs {
    background: color-mix(in srgb, var(--color-background) 70%, var(--color-primary));
    border-color: color-mix(in srgb, var(--color-primary) 22%, transparent);
  }

  .account-year-select,
  .period-year-mobile__select {
    background: color-mix(in srgb, var(--color-background) 80%, var(--color-primary));
    color: var(--color-text);
    border-color: color-mix(in srgb, var(--color-primary) 28%, transparent);
  }

  .period-year-mobile,
  .account-year-field {
    background: color-mix(in srgb, var(--color-background) 72%, var(--color-primary));
    border-color: color-mix(in srgb, var(--color-primary) 28%, transparent);
  }

  .month-tabs {
    background: color-mix(in srgb, var(--color-background) 70%, var(--color-secondary));
    border-color: color-mix(in srgb, var(--color-secondary) 22%, transparent);
  }

  .month-tab {
    color: var(--color-text-light);
  }

  .month-tab:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .month-tab--active {
    background: color-mix(in srgb, var(--color-background) 85%, var(--color-primary));
    color: var(--color-primary);
  }

  .account-tab {
    color: var(--color-text-light);
  }

  .account-tab:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .account-tab--active {
    background: color-mix(in srgb, var(--color-background) 85%, var(--color-primary));
    color: var(--color-primary);
  }

  .account-help__tooltip {
    background: color-mix(in srgb, var(--color-background) 94%, var(--color-primary));
    border-color: color-mix(in srgb, var(--color-primary) 30%, transparent);
    color: var(--color-text);
  }

  .account-inline-form {
    background: color-mix(in srgb, var(--color-background) 88%, var(--color-primary));
    border-color: color-mix(in srgb, var(--color-primary) 28%, transparent);
  }

  .donut-detail-panel {
    background: color-mix(in srgb, var(--color-background) 92%, var(--color-primary));
    border-color: color-mix(in srgb, var(--color-primary) 28%, transparent);
  }

  .donut-center {
    fill: var(--color-text);
  }

  .status-pill.is-realized {
    background: color-mix(in srgb, var(--color-success) 28%, var(--color-background));
    color: var(--color-success);
  }

  .status-pill.is-planned {
    background: color-mix(in srgb, var(--color-primary) 22%, var(--color-background));
    color: var(--color-primary);
  }

  .type-pill.is-income {
    background: color-mix(in srgb, var(--color-secondary) 35%, var(--color-background));
    color: #c5d4f5;
  }

  .type-pill.is-fixed {
    background: color-mix(in srgb, var(--color-tertiary) 35%, var(--color-background));
    color: #b5e0d4;
  }

  .type-pill.is-variable {
    background: color-mix(in srgb, #e8a0c0 32%, var(--color-background));
    color: #f5c4d8;
  }

  .tx-card {
    background: color-mix(in srgb, var(--color-background) 82%, var(--color-primary));
    border-color: color-mix(in srgb, var(--color-primary) 28%, transparent);
  }

  .tx-card.is-savings-cat {
    background: color-mix(in srgb, var(--color-background) 78%, var(--color-tertiary));
    border-color: color-mix(in srgb, var(--color-tertiary) 40%, transparent);
  }

  .account-balance-line {
    color: var(--color-text);
  }

  .account-opening {
    color: var(--color-text-light);
  }

  .btn-secondary {
    background: color-mix(in srgb, var(--color-background) 80%, var(--color-primary));
    color: var(--color-text);
    border-color: color-mix(in srgb, var(--color-primary-dark) 40%, transparent);
  }

  .chip {
    color: var(--color-success);
    background: color-mix(in srgb, var(--color-tertiary) 22%, transparent);
  }

  .kpi-icon {
    background: color-mix(in srgb, var(--color-background) 80%, var(--color-primary));
    color: var(--color-primary);
  }
}
</style>
