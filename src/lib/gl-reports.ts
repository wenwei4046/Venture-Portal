// GL-driven financial reports (P&L / Balance Sheet / Cash Flow).
// Single source of truth = journal_lines. The pages fetch the full ledger once
// (paginated) and every report figure is computed by the pure builders below —
// same dataset the Trial Balance ties to, so the three statements always agree
// with the GL. Format follows the-conts.pages.dev reference: current period |
// comparison period | Δ% | % of revenue, collapsible account groups, inline
// transaction drill-down.

import type { SupabaseClient } from '@supabase/supabase-js'
import { type AccountType, type CashFlowCategory, defaultCashFlowCategoryFor, rangeFor } from './coa'

function r2(n: number): number {
  return Math.round(n * 100) / 100
}

// ─── Raw data ────────────────────────────────────────────────────────────────

export interface GlLine {
  account_code: string
  debit: number
  credit: number
  description: string | null
  entry_id: string
  /** From the parent journal entry. */
  date: string
  entry_no: string | null
  entry_description: string | null
  segment: string
}

export interface CoaAccount {
  code: string
  name: string
  type: AccountType
  parent_code: string | null
  cash_flow_category: CashFlowCategory | null
}

/** Fetch every journal line (joined to its entry) in 1000-row pages. The full
 *  ledger is a few thousand rows — client-side aggregation keeps every report
 *  builder pure and unit-testable. */
export async function fetchAllJournalLines(supabase: SupabaseClient): Promise<GlLine[]> {
  const out: GlLine[] = []
  const PAGE = 1000
  for (let fromIdx = 0; ; fromIdx += PAGE) {
    const { data, error } = await supabase
      .from('journal_lines')
      .select(
        'account_code, debit, credit, description, entry_id, journal_entries!inner(transaction_date, entry_no, description, segment)',
      )
      .order('id', { ascending: true })
      .range(fromIdx, fromIdx + PAGE - 1)
    if (error) throw new Error(`fetchAllJournalLines: ${error.message}`)
    for (const row of data ?? []) {
      const je = row.journal_entries as unknown as {
        transaction_date: string
        entry_no: string | null
        description: string | null
        segment: string | null
      }
      out.push({
        account_code: row.account_code as string,
        debit: Number(row.debit ?? 0),
        credit: Number(row.credit ?? 0),
        description: (row.description as string | null) ?? null,
        entry_id: row.entry_id as string,
        date: je.transaction_date,
        entry_no: je.entry_no,
        entry_description: je.description,
        segment: je.segment ?? '',
      })
    }
    if (!data || data.length < PAGE) break
  }
  return out
}

export async function fetchCoaAccounts(supabase: SupabaseClient): Promise<CoaAccount[]> {
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .select('code, name, type, parent_code, cash_flow_category')
    .order('code')
  if (error) throw new Error(`fetchCoaAccounts: ${error.message}`)
  return (data ?? []).map((a) => ({
    code: a.code as string,
    name: a.name as string,
    type: a.type as AccountType,
    parent_code: (a.parent_code as string | null) ?? null,
    cash_flow_category: (a.cash_flow_category as CashFlowCategory | null) ?? null,
  }))
}

// ─── Shared shapes ───────────────────────────────────────────────────────────

export interface GlTxn {
  date: string
  entryNo: string | null
  description: string
  segment: string
  /** Signed in the account's NATURAL direction (positive grows the account). */
  amount: number
}

export interface AccountNode {
  code: string
  name: string
  current: number
  previous: number
  txns: GlTxn[]
  children: AccountNode[]
}

export interface ReportSection {
  key: string
  label: string
  nodes: AccountNode[]
  current: number
  previous: number
}

export interface Period {
  /** inclusive, 'YYYY-MM-DD' */
  from: string
  to: string
}

export interface ReportFilter {
  current: Period
  previous: Period
  /** journal_entries.segment filter; undefined/'' = all segments. */
  segment?: string
}

// Natural sign per account type: these grow on the DEBIT side; everything else
// (equity, liability, revenue, other_income) grows on the CREDIT side.
const DEBIT_NATURAL: ReadonlySet<AccountType> = new Set(['fixed_asset', 'asset', 'cost', 'expense'])

export function naturalNet(type: AccountType, debit: number, credit: number): number {
  return DEBIT_NATURAL.has(type) ? debit - credit : credit - debit
}

const inPeriod = (l: GlLine, p: Period) => l.date >= p.from && l.date <= p.to
const segPass = (l: GlLine, segment?: string) => !segment || l.segment === segment

function typeOf(code: string, byCode: Map<string, CoaAccount>): AccountType | null {
  const acc = byCode.get(code)
  if (acc) return acc.type
  // Fall back to the numeric range so unmapped codes still land somewhere.
  const n = parseInt(code, 10)
  if (Number.isNaN(n)) return null
  for (const t of ['equity', 'fixed_asset', 'asset', 'liability', 'revenue', 'cost', 'other_income', 'expense'] as AccountType[]) {
    const [lo, hi] = rangeFor(t)
    if (n >= lo && n <= hi) return t
  }
  return null
}

// ─── Account tree builder ────────────────────────────────────────────────────

interface Bucket {
  current: number
  previous: number
  txns: GlTxn[]
}

/** Aggregate lines into per-account current/previous buckets (natural sign).
 *  `currentMode`/`previousMode`: 'movement' sums only lines inside the window;
 *  'balance' sums every line up to the window's `to` (for the Balance Sheet).
 *  Inline txns always list the CURRENT window's movements. */
export function bucketAccounts(
  lines: GlLine[],
  accounts: CoaAccount[],
  filter: ReportFilter,
  types: ReadonlySet<AccountType>,
  mode: 'movement' | 'balance',
): Map<string, Bucket> {
  const byCode = new Map(accounts.map((a) => [a.code, a]))
  const buckets = new Map<string, Bucket>()
  for (const l of lines) {
    if (!segPass(l, filter.segment)) continue
    const t = typeOf(l.account_code, byCode)
    if (!t || !types.has(t)) continue
    const amt = naturalNet(t, l.debit, l.credit)
    const inCur = mode === 'balance' ? l.date <= filter.current.to : inPeriod(l, filter.current)
    const inPrev = mode === 'balance' ? l.date <= filter.previous.to : inPeriod(l, filter.previous)
    if (!inCur && !inPrev) continue
    let b = buckets.get(l.account_code)
    if (!b) {
      b = { current: 0, previous: 0, txns: [] }
      buckets.set(l.account_code, b)
    }
    if (inCur) {
      b.current = r2(b.current + amt)
      if (inPeriod(l, filter.current)) {
        b.txns.push({
          date: l.date,
          entryNo: l.entry_no,
          description: l.description || l.entry_description || '',
          segment: l.segment,
          amount: amt,
        })
      }
    }
    if (inPrev) b.previous = r2(b.previous + amt)
  }
  for (const b of buckets.values()) b.txns.sort((a, c) => a.date.localeCompare(c.date))
  return buckets
}

/** Assemble buckets into a parent→children tree (chart_of_accounts.parent_code),
 *  rolling child totals into parents. Accounts with no activity are dropped. */
export function buildTree(
  accounts: CoaAccount[],
  buckets: Map<string, Bucket>,
  types: ReadonlySet<AccountType>,
): AccountNode[] {
  const nodes = new Map<string, AccountNode>()
  const nodeFor = (a: CoaAccount): AccountNode => {
    let n = nodes.get(a.code)
    if (!n) {
      n = { code: a.code, name: a.name, current: 0, previous: 0, txns: [], children: [] }
      nodes.set(a.code, n)
    }
    return n
  }
  const byCode = new Map(accounts.map((a) => [a.code, a]))
  const roots: AccountNode[] = []
  const attached = new Set<string>()

  // Materialise every account that has activity, plus its ancestors.
  for (const a of accounts) {
    if (!types.has(a.type)) continue
    const b = buckets.get(a.code)
    if (!b) continue
    const n = nodeFor(a)
    n.current = b.current
    n.previous = b.previous
    n.txns = b.txns
    // Walk up the parent chain creating header nodes.
    let child = n
    let childAcc: CoaAccount | undefined = a
    while (childAcc?.parent_code) {
      const parentAcc = byCode.get(childAcc.parent_code)
      if (!parentAcc || !types.has(parentAcc.type)) break
      const p = nodeFor(parentAcc)
      if (!attached.has(child.code)) {
        p.children.push(child)
        attached.add(child.code)
      }
      child = p
      childAcc = parentAcc
    }
    if (!attached.has(child.code)) {
      roots.push(child)
      attached.add(child.code)
    }
  }

  // Roll up child totals + sort by code, depth-first.
  const rollup = (n: AccountNode): void => {
    n.children.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
    for (const c of n.children) {
      rollup(c)
      n.current = r2(n.current + c.current)
      n.previous = r2(n.previous + c.previous)
    }
  }
  roots.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
  for (const ro of roots) rollup(ro)
  return roots
}

const sumNodes = (nodes: AccountNode[]) => ({
  current: r2(nodes.reduce((s, n) => s + n.current, 0)),
  previous: r2(nodes.reduce((s, n) => s + n.previous, 0)),
})

function section(key: string, label: string, nodes: AccountNode[]): ReportSection {
  return { key, label, nodes, ...sumNodes(nodes) }
}

// ─── P&L ─────────────────────────────────────────────────────────────────────

export interface PnlReport {
  revenue: ReportSection
  cost: ReportSection
  otherIncome: ReportSection
  expense: ReportSection
  grossProfit: { current: number; previous: number }
  netIncome: { current: number; previous: number }
}

export function buildPnl(lines: GlLine[], accounts: CoaAccount[], filter: ReportFilter): PnlReport {
  const one = (t: AccountType, key: string, label: string) => {
    const types = new Set<AccountType>([t])
    const buckets = bucketAccounts(lines, accounts, filter, types, 'movement')
    return section(key, label, buildTree(accounts, buckets, types))
  }
  const revenue = one('revenue', 'revenue', 'Revenue')
  const cost = one('cost', 'cost', 'Cost of Goods Sold')
  const otherIncome = one('other_income', 'other_income', 'Other Income')
  const expense = one('expense', 'expense', 'Expenses')
  const grossProfit = {
    current: r2(revenue.current - cost.current),
    previous: r2(revenue.previous - cost.previous),
  }
  const netIncome = {
    current: r2(grossProfit.current + otherIncome.current - expense.current),
    previous: r2(grossProfit.previous + otherIncome.previous - expense.previous),
  }
  return { revenue, cost, otherIncome, expense, grossProfit, netIncome }
}

// ─── Balance Sheet ───────────────────────────────────────────────────────────

export interface BalanceSheetReport {
  fixedAssets: ReportSection
  assets: ReportSection
  liabilities: ReportSection
  equity: ReportSection
  /** Cumulative P&L through each period end (shown inside Equity). */
  earnings: { current: number; previous: number }
  totalAssets: { current: number; previous: number }
  totalLiabEquity: { current: number; previous: number }
  /** totalAssets − totalLiabEquity. 0.00 when the ledger balances. */
  check: { current: number; previous: number }
}

export function buildBalanceSheet(
  lines: GlLine[],
  accounts: CoaAccount[],
  filter: ReportFilter,
): BalanceSheetReport {
  const one = (t: AccountType, key: string, label: string) => {
    const types = new Set<AccountType>([t])
    const buckets = bucketAccounts(lines, accounts, filter, types, 'balance')
    return section(key, label, buildTree(accounts, buckets, types))
  }
  const fixedAssets = one('fixed_asset', 'fixed_asset', 'Fixed Assets')
  const assets = one('asset', 'asset', 'Current Assets')
  const liabilities = one('liability', 'liability', 'Liabilities')
  const equity = one('equity', 'equity', 'Equity')

  // Cumulative earnings = credit-natural net of every P&L account to date.
  const plTypes = new Set<AccountType>(['revenue', 'cost', 'other_income', 'expense'])
  const byCode = new Map(accounts.map((a) => [a.code, a]))
  let earnCur = 0
  let earnPrev = 0
  for (const l of lines) {
    if (!segPass(l, filter.segment)) continue
    const t = typeOf(l.account_code, byCode)
    if (!t || !plTypes.has(t)) continue
    // P&L accounts contribute to equity in CREDIT-natural terms.
    const amt = l.credit - l.debit
    if (l.date <= filter.current.to) earnCur = r2(earnCur + amt)
    if (l.date <= filter.previous.to) earnPrev = r2(earnPrev + amt)
  }
  const earnings = { current: earnCur, previous: earnPrev }

  const totalAssets = {
    current: r2(fixedAssets.current + assets.current),
    previous: r2(fixedAssets.previous + assets.previous),
  }
  const totalLiabEquity = {
    current: r2(liabilities.current + equity.current + earnings.current),
    previous: r2(liabilities.previous + equity.previous + earnings.previous),
  }
  return {
    fixedAssets,
    assets,
    liabilities,
    equity,
    earnings,
    totalAssets,
    totalLiabEquity,
    check: {
      current: r2(totalAssets.current - totalLiabEquity.current),
      previous: r2(totalAssets.previous - totalLiabEquity.previous),
    },
  }
}

// ─── Cash Flow ───────────────────────────────────────────────────────────────

export interface CashFlowReport {
  operating: ReportSection
  investing: ReportSection
  financing: ReportSection
  netChange: { current: number; previous: number }
  openingCash: { current: number; previous: number }
  closingCash: { current: number; previous: number }
  /** closing − (opening + netChange). 0.00 when categorisation covered everything. */
  check: { current: number; previous: number }
}

/** Direct-method cash flow: for every journal entry that moves a bank account,
 *  allocate the bank movement across the entry's non-bank legs (weighted by
 *  amount) and categorise each slice by the counter account's
 *  cash_flow_category. Bank↔bank internal transfers net to zero and drop out. */
export function buildCashFlow(
  lines: GlLine[],
  accounts: CoaAccount[],
  filter: ReportFilter,
  bankCodes: ReadonlySet<string>,
): CashFlowReport {
  const byCode = new Map(accounts.map((a) => [a.code, a]))
  const catOf = (code: string): CashFlowCategory => {
    const acc = byCode.get(code)
    if (acc?.cash_flow_category) return acc.cash_flow_category
    const t = acc?.type ?? typeOf(code, byCode)
    return t ? defaultCashFlowCategoryFor(t) : 'operating'
  }

  // Group lines by entry (segment filter applies at the entry level — every
  // line of an entry shares its segment).
  const byEntry = new Map<string, GlLine[]>()
  for (const l of lines) {
    if (!segPass(l, filter.segment)) continue
    const g = byEntry.get(l.entry_id)
    if (g) g.push(l)
    else byEntry.set(l.entry_id, [l])
  }

  type Flow = { current: number; previous: number; txns: GlTxn[] }
  const flows = new Map<string, Flow>() // counter account code → flow
  let openCur = 0
  let openPrev = 0
  let closeCur = 0
  let closePrev = 0

  for (const legs of byEntry.values()) {
    const date = legs[0].date
    const bankNet = r2(
      legs.filter((l) => bankCodes.has(l.account_code)).reduce((s, l) => s + (l.debit - l.credit), 0),
    )
    // Opening/closing cash track every bank movement regardless of category.
    if (bankNet !== 0) {
      if (date < filter.current.from) openCur = r2(openCur + bankNet)
      if (date <= filter.current.to) closeCur = r2(closeCur + bankNet)
      if (date < filter.previous.from) openPrev = r2(openPrev + bankNet)
      if (date <= filter.previous.to) closePrev = r2(closePrev + bankNet)
    }
    if (bankNet === 0) continue
    const inCur = inPeriod(legs[0], filter.current)
    const inPrev = inPeriod(legs[0], filter.previous)
    if (!inCur && !inPrev) continue

    const counters = legs.filter((l) => !bankCodes.has(l.account_code))
    const weightTotal = counters.reduce((s, l) => s + Math.abs(l.debit - l.credit), 0)
    if (counters.length === 0 || weightTotal === 0) continue
    for (const c of counters) {
      const share = r2((bankNet * Math.abs(c.debit - c.credit)) / weightTotal)
      if (share === 0) continue
      let f = flows.get(c.account_code)
      if (!f) {
        f = { current: 0, previous: 0, txns: [] }
        flows.set(c.account_code, f)
      }
      if (inCur) {
        f.current = r2(f.current + share)
        f.txns.push({
          date,
          entryNo: c.entry_no,
          description: c.description || c.entry_description || '',
          segment: c.segment,
          amount: share,
        })
      }
      if (inPrev) f.previous = r2(f.previous + share)
    }
  }

  const byCat: Record<CashFlowCategory, AccountNode[]> = { operating: [], investing: [], financing: [] }
  for (const [code, f] of flows) {
    const acc = byCode.get(code)
    f.txns.sort((a, b) => a.date.localeCompare(b.date))
    byCat[catOf(code)].push({
      code,
      name: acc?.name ?? code,
      current: f.current,
      previous: f.previous,
      txns: f.txns,
      children: [],
    })
  }
  for (const cat of Object.values(byCat)) {
    cat.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
  }

  const operating = section('operating', 'Operating Activities', byCat.operating)
  const investing = section('investing', 'Investing Activities', byCat.investing)
  const financing = section('financing', 'Financing Activities', byCat.financing)
  const netChange = {
    current: r2(operating.current + investing.current + financing.current),
    previous: r2(operating.previous + investing.previous + financing.previous),
  }
  return {
    operating,
    investing,
    financing,
    netChange,
    openingCash: { current: openCur, previous: openPrev },
    closingCash: { current: closeCur, previous: closePrev },
    check: {
      current: r2(closeCur - openCur - netChange.current),
      previous: r2(closePrev - openPrev - netChange.previous),
    },
  }
}

// ─── Period helpers ──────────────────────────────────────────────────────────

/** 'YYYY-MM' → {from: first day, to: last day}. */
export function monthPeriod(ym: string): Period {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` }
}

export function prevMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}
