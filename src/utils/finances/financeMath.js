/**
 * Calculs finances (EUR) — soldes et agrégats par compte.
 * accountId null = compte courant.
 */

import { TX_TYPES } from '../../services/finances/financeTransactions.js'

export const MONTH_SHORT = [
  'Janv',
  'Févr',
  'Mars',
  'Avr',
  'Mai',
  'Juin',
  'Juil',
  'Août',
  'Sept',
  'Oct',
  'Nov',
  'Déc',
]

export const MONTH_LONG = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
]

/** @param {number} n */
export function formatEuro(n) {
  const v = Number(n) || 0
  return (
    new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v) + ' €'
  )
}

/** @param {number} n */
export function formatEuroSigned(n) {
  const v = Number(n) || 0
  const abs = formatEuro(Math.abs(v))
  if (v > 0) return `+${abs}`
  if (v < 0) return `−${abs}`
  return abs
}

function isExpense(type) {
  return type === TX_TYPES.FIXED || type === TX_TYPES.VARIABLE
}

function isIncome(type) {
  return type === TX_TYPES.INCOME
}

/**
 * Delta signé (+ revenu, − dépense).
 * @param {{ tx_type: string, amount: number }} tx
 */
export function txDelta(tx) {
  const amount = Number(tx.amount) || 0
  if (isIncome(tx.tx_type)) return amount
  if (isExpense(tx.tx_type)) return -amount
  return 0
}

/**
 * @param {{ account_id?: string|null }} tx
 * @param {string|null} accountId
 */
export function belongsToAccount(tx, accountId) {
  const id = accountId || null
  const txId = tx.account_id || null
  return txId === id
}

/**
 * Filtre les transactions d’un compte (null = compte courant).
 * @param {Array} transactions
 * @param {string|null} accountId
 */
export function filterByAccount(transactions, accountId) {
  return (transactions ?? []).filter((tx) => belongsToAccount(tx, accountId))
}

/**
 * Solde à une date (ops réalisées uniquement) pour un compte.
 * @param {number} openingBalance
 * @param {Array} transactions
 * @param {string} endDateInclusive
 * @param {string|null} [accountId]
 */
export function balanceAtDate(openingBalance, transactions, endDateInclusive, accountId = null) {
  let bal = Number(openingBalance) || 0
  for (const tx of filterByAccount(transactions, accountId)) {
    if (!tx.applied) continue
    if (String(tx.occurred_on) > endDateInclusive) continue
    bal += txDelta(tx)
  }
  return Math.round(bal * 100) / 100
}

/**
 * @param {number} year
 * @param {number} month 1-12
 */
export function endOfMonthIso(year, month) {
  const last = new Date(year, month, 0)
  const m = String(last.getMonth() + 1).padStart(2, '0')
  const d = String(last.getDate()).padStart(2, '0')
  return `${last.getFullYear()}-${m}-${d}`
}

/**
 * @param {number} year
 * @param {number} month 1-12
 */
export function startOfMonthIso(year, month) {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

function inMonth(tx, year, month) {
  const on = String(tx.occurred_on || '')
  if (on.length < 7) return false
  const [y, m] = on.split('-').map(Number)
  return y === year && m === month
}

function mapToSortedRows(map, total) {
  return [...map.entries()]
    .map(([name, amount]) => ({
      name,
      amount: Math.round(amount * 100) / 100,
      pct: total > 0 ? Math.round((amount / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
}

/**
 * Agrégats d’un mois pour un compte.
 * Les lignes de catégories pour les donuts utilisent les montants réalisés.
 * @param {Array} transactions
 * @param {number} year
 * @param {number} month
 * @param {string|null} [accountId]
 */
export function periodAggregates(transactions, year, month, accountId = null) {
  const inPeriod = filterByAccount(transactions, accountId).filter((tx) =>
    inMonth(tx, year, month),
  )

  let income = 0
  let fixed = 0
  let variable = 0
  let realizedIncome = 0
  let realizedFixed = 0
  let realizedVariable = 0
  let plannedIncome = 0
  let plannedFixed = 0
  let plannedVariable = 0

  /** @type {Map<string, number>} */
  const incomeByCat = new Map()
  /** @type {Map<string, number>} */
  const fixedByCat = new Map()
  /** @type {Map<string, number>} */
  const variableByCat = new Map()
  /** @type {Map<string, number>} */
  const incomeByCatAll = new Map()
  /** @type {Map<string, number>} */
  const fixedByCatAll = new Map()
  /** @type {Map<string, number>} */
  const variableByCatAll = new Map()

  for (const tx of inPeriod) {
    const amount = Number(tx.amount) || 0
    const cat = String(tx.category || 'Autres').trim() || 'Autres'
    if (tx.tx_type === TX_TYPES.INCOME) {
      income += amount
      incomeByCatAll.set(cat, (incomeByCatAll.get(cat) || 0) + amount)
      if (tx.applied) {
        realizedIncome += amount
        incomeByCat.set(cat, (incomeByCat.get(cat) || 0) + amount)
      } else plannedIncome += amount
    } else if (tx.tx_type === TX_TYPES.FIXED) {
      fixed += amount
      fixedByCatAll.set(cat, (fixedByCatAll.get(cat) || 0) + amount)
      if (tx.applied) {
        realizedFixed += amount
        fixedByCat.set(cat, (fixedByCat.get(cat) || 0) + amount)
      } else plannedFixed += amount
    } else if (tx.tx_type === TX_TYPES.VARIABLE) {
      variable += amount
      variableByCatAll.set(cat, (variableByCatAll.get(cat) || 0) + amount)
      if (tx.applied) {
        realizedVariable += amount
        variableByCat.set(cat, (variableByCat.get(cat) || 0) + amount)
      } else plannedVariable += amount
    }
  }

  const expenses = fixed + variable
  const realizedExpenses = realizedFixed + realizedVariable
  const plannedExpenses = plannedFixed + plannedVariable
  const capacity = Math.round((income - fixed - variable) * 100) / 100
  // Épargne période = revenus − dépenses fixes − dépenses variables (réalisés)
  const savings = Math.round((realizedIncome - realizedFixed - realizedVariable) * 100) / 100
  const debtRatio =
    realizedIncome > 0 ? Math.round((realizedFixed / realizedIncome) * 1000) / 10 : 0

  return {
    income: Math.round(income * 100) / 100,
    fixed: Math.round(fixed * 100) / 100,
    variable: Math.round(variable * 100) / 100,
    expenses: Math.round(expenses * 100) / 100,
    capacity,
    savings,
    debtRatio,
    realizedIncome: Math.round(realizedIncome * 100) / 100,
    realizedFixed: Math.round(realizedFixed * 100) / 100,
    realizedVariable: Math.round(realizedVariable * 100) / 100,
    realizedExpenses: Math.round(realizedExpenses * 100) / 100,
    plannedIncome: Math.round(plannedIncome * 100) / 100,
    plannedFixed: Math.round(plannedFixed * 100) / 100,
    plannedVariable: Math.round(plannedVariable * 100) / 100,
    plannedExpenses: Math.round(plannedExpenses * 100) / 100,
    hasRealizedIncome: realizedIncome > 0,
    hasRealizedFixed: realizedFixed > 0,
    hasRealizedVariable: realizedVariable > 0,
    incomeByCat: mapToSortedRows(incomeByCat, realizedIncome),
    fixedByCat: mapToSortedRows(fixedByCat, realizedFixed),
    variableByCat: mapToSortedRows(variableByCat, realizedVariable),
    incomeByCatAll: mapToSortedRows(incomeByCatAll, income),
    fixedByCatAll: mapToSortedRows(fixedByCatAll, fixed),
    variableByCatAll: mapToSortedRows(variableByCatAll, variable),
  }
}

/**
 * Courbe solde fin de mois (réalisé) pour un compte.
 * @param {number} openingBalance
 * @param {Array} transactions
 * @param {number} year
 * @param {string|null} [accountId]
 */
export function monthlyBalanceSeries(openingBalance, transactions, year, accountId = null) {
  return MONTH_LONG.map((label, i) => {
    const month = i + 1
    const end = endOfMonthIso(year, month)
    const balance = balanceAtDate(openingBalance, transactions, end, accountId)
    return { month, label, short: MONTH_SHORT[i], balance, end }
  })
}

/**
 * Récap +/− par mois pour un compte.
 * @param {Array} transactions
 * @param {number} year
 * @param {string|null} [accountId]
 */
export function monthlyRecap(transactions, year, accountId = null) {
  return MONTH_LONG.map((label, i) => {
    const month = i + 1
    const agg = periodAggregates(transactions, year, month, accountId)
    return {
      month,
      label,
      short: MONTH_SHORT[i],
      income: agg.income,
      expenses: agg.expenses,
      overspend: agg.expenses > agg.income && (agg.income > 0 || agg.expenses > 0),
    }
  })
}

/**
 * Vue d’ensemble des comptes d’épargne (soldes réalisés).
 * @param {Array} accounts
 * @param {Array} transactions
 * @param {string} [endDateInclusive]
 */
export function savingsAccountsOverview(accounts, transactions, endDateInclusive) {
  return (accounts ?? []).map((account) => {
    const end = endDateInclusive || '9999-12-31'
    const balance = balanceAtDate(account.opening_balance, transactions, end, account.id)
    const movements = filterByAccount(transactions, account.id).filter(
      (tx) => tx.applied && String(tx.occurred_on) <= end,
    )
    return {
      ...account,
      balance,
      contributed: Math.round(
        movements.reduce((s, tx) => s + txDelta(tx), 0) * 100,
      ) / 100,
      movementsCount: movements.length,
    }
  })
}

/**
 * Détail (info spécifique) d’une catégorie réalisée, trié du plus grand au plus petit.
 * @param {Array} transactions
 * @param {number} year
 * @param {number} month
 * @param {string|null} accountId
 * @param {string} txType
 * @param {string} category
 */
export function categoryDetailBreakdown(
  transactions,
  year,
  month,
  accountId,
  txType,
  category,
) {
  const cat = String(category || 'Autres').trim() || 'Autres'
  /** @type {Map<string, number>} */
  const byDetail = new Map()
  let total = 0

  for (const tx of filterByAccount(transactions, accountId)) {
    if (!tx.applied) continue
    if (!inMonth(tx, year, month)) continue
    if (tx.tx_type !== txType) continue
    const txCat = String(tx.category || 'Autres').trim() || 'Autres'
    if (txCat !== cat) continue
    const amount = Number(tx.amount) || 0
    if (amount <= 0) continue
    const detail = String(tx.detail || '').trim() || 'Sans info'
    byDetail.set(detail, (byDetail.get(detail) || 0) + amount)
    total += amount
  }

  return mapToSortedRows(byDetail, total)
}

/**
 * Segments donut SVG.
 * @param {Array<{ name: string, amount: number, pct: number }>} rows
 * @param {string[]} colors
 */
export function donutSegments(rows, colors) {
  const total = rows.reduce((s, r) => s + r.amount, 0)
  if (total <= 0) return []
  let angle = -90
  return rows.map((row, i) => {
    const sweep = (row.amount / total) * 360
    const start = angle
    angle += sweep
    return {
      ...row,
      color: colors[i % colors.length],
      startAngle: start,
      endAngle: angle,
      sweep,
    }
  })
}

/**
 * Arc path for donut slice (degrees, center 50,50, r outer/inner).
 */
export function donutArcPath(startAngle, endAngle, outerR = 40, innerR = 24, cx = 50, cy = 50) {
  const toRad = (deg) => (deg * Math.PI) / 180
  const large = endAngle - startAngle > 180 ? 1 : 0
  const x1 = cx + outerR * Math.cos(toRad(startAngle))
  const y1 = cy + outerR * Math.sin(toRad(startAngle))
  const x2 = cx + outerR * Math.cos(toRad(endAngle))
  const y2 = cy + outerR * Math.sin(toRad(endAngle))
  const x3 = cx + innerR * Math.cos(toRad(endAngle))
  const y3 = cy + innerR * Math.sin(toRad(endAngle))
  const x4 = cx + innerR * Math.cos(toRad(startAngle))
  const y4 = cy + innerR * Math.sin(toRad(startAngle))
  if (Math.abs(endAngle - startAngle) < 0.01) return ''
  if (Math.abs(endAngle - startAngle) >= 359.9) {
    return [
      `M ${cx + outerR} ${cy}`,
      `A ${outerR} ${outerR} 0 1 1 ${cx - outerR} ${cy}`,
      `A ${outerR} ${outerR} 0 1 1 ${cx + outerR} ${cy}`,
      `M ${cx + innerR} ${cy}`,
      `A ${innerR} ${innerR} 0 1 0 ${cx - innerR} ${cy}`,
      `A ${innerR} ${innerR} 0 1 0 ${cx + innerR} ${cy}`,
      'Z',
    ].join(' ')
  }
  return [
    `M ${x1} ${y1}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ')
}

function shiftMonth(year, month, delta) {
  const d = new Date(year, month - 1 + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

function monthIndex(year, month) {
  return year * 12 + month
}

/** Clé de série pour une dépense fixe (compte + catégorie + détail). */
export function fixedExpenseSeriesKey(tx) {
  const account = tx?.account_id || 'cc'
  const cat = String(tx?.category || '')
    .trim()
    .toLowerCase()
  const detail = String(tx?.detail || '')
    .trim()
    .toLowerCase()
  return `${account}|${cat}|${detail}`
}

function fixedTemplateKey(tx) {
  return fixedExpenseSeriesKey(tx)
}

/**
 * Autres mois de la même dépense fixe (même compte / catégorie / détail).
 * @param {Array} transactions
 * @param {object} templateTx
 */
export function findFixedExpenseSeries(transactions, templateTx) {
  if (!templateTx || templateTx.tx_type !== TX_TYPES.FIXED) return []
  const key = fixedExpenseSeriesKey(templateTx)
  return (transactions ?? []).filter(
    (tx) =>
      tx?.id &&
      tx.tx_type === TX_TYPES.FIXED &&
      fixedExpenseSeriesKey(tx) === key,
  )
}

export function occurredOnForMonth(sourceDate, year, month) {
  const day = Number(String(sourceDate || '').slice(8, 10)) || 1
  const lastDay = new Date(year, month, 0).getDate()
  const clamped = Math.min(Math.max(day, 1), lastDay)
  return `${year}-${String(month).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`
}

/**
 * Prépare le report mensuel des dépenses fixes (abonnements) jusqu’au mois cible.
 * Chaque mois reprend les fixes du mois précédent ; si une ligne a été supprimée
 * un mois, elle n’est plus reportée ensuite.
 * @param {Array} transactions
 * @param {number} targetYear
 * @param {number} targetMonth
 * @returns {Array<{ occurredOn: string, txType: string, category: string, detail: string, amount: number, applied: boolean, accountId: string|null }>}
 */
export function planFixedExpenseRolloversThrough(transactions, targetYear, targetMonth) {
  const all = transactions ?? []
  const fixed = all.filter((tx) => tx.tx_type === TX_TYPES.FIXED)
  if (!fixed.length) return []

  let earliest = null
  for (const tx of fixed) {
    const y = Number(String(tx.occurred_on || '').slice(0, 4))
    const m = Number(String(tx.occurred_on || '').slice(5, 7))
    if (!y || !m) continue
    if (!earliest || monthIndex(y, m) < monthIndex(earliest.year, earliest.month)) {
      earliest = { year: y, month: m }
    }
  }
  if (!earliest) return []

  const targetIdx = monthIndex(targetYear, targetMonth)
  if (monthIndex(earliest.year, earliest.month) >= targetIdx) return []

  /** @type {Array} */
  const working = all.map((tx) => ({ ...tx }))
  /** @type {Array} */
  const toCreate = []

  let cursor = shiftMonth(earliest.year, earliest.month, 1)
  while (monthIndex(cursor.year, cursor.month) <= targetIdx) {
    const prev = shiftMonth(cursor.year, cursor.month, -1)
    const accountIds = new Set()
    for (const tx of working) {
      if (tx.tx_type !== TX_TYPES.FIXED) continue
      if (!inMonth(tx, prev.year, prev.month)) continue
      accountIds.add(tx.account_id || null)
    }

    for (const accountId of accountIds) {
      const sources = working.filter(
        (tx) =>
          tx.tx_type === TX_TYPES.FIXED &&
          belongsToAccount(tx, accountId) &&
          inMonth(tx, prev.year, prev.month),
      )
      const existingKeys = new Set(
        working
          .filter(
            (tx) =>
              tx.tx_type === TX_TYPES.FIXED &&
              belongsToAccount(tx, accountId) &&
              inMonth(tx, cursor.year, cursor.month),
          )
          .map(fixedTemplateKey),
      )

      for (const tpl of sources) {
        const key = fixedTemplateKey(tpl)
        if (existingKeys.has(key)) continue
        existingKeys.add(key)
        const payload = {
          occurredOn: occurredOnForMonth(tpl.occurred_on, cursor.year, cursor.month),
          txType: TX_TYPES.FIXED,
          category: tpl.category,
          detail: tpl.detail || '',
          amount: Number(tpl.amount) || 0,
          applied: false,
          accountId: accountId,
        }
        toCreate.push(payload)
        working.push({
          tx_type: TX_TYPES.FIXED,
          occurred_on: payload.occurredOn,
          category: payload.category,
          detail: payload.detail,
          amount: payload.amount,
          applied: false,
          account_id: accountId,
        })
      }
    }

    cursor = shiftMonth(cursor.year, cursor.month, 1)
  }

  return toCreate
}
