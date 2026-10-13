// GL-driven financial reports (P&L / Balance Sheet / Cash Flow).
// Single source of truth = journal_lines. The pages fetch the full ledger once
// (paginated) and every report figure is computed by the pure builders below —
// same dataset the Trial Balance ties to, so the three statements always agree
// with the GL. Format follows the-conts.pages.dev reference: current period |
// comparison period | Δ% | % of revenue, collapsible account groups, inline
// transaction drill-down.

import type { SupabaseClient } from '@supabase/supabase-js'
import { ACCOUNT_TYPES, type AccountType, type CashFlowCategory, defaultCashFlowCategoryFor, rangeFor } from './coa'
import { fetchAllRows, fetchAllRowsParallel } from './paginate'
import { payrollFoldOf, type PayrollVoucherText } from './payroll-vouchers'

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
  ref_type: string | null
  ref_id: string | null
  /** Counterparty for drill-down rows: invoice bill-to / voucher payee. */
  party?: string | null
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
 *  builder pure and unit-testable.
 *
 *  VOID/reversal pairs are excluded (`is_reversed = false`, user 2026-07-30:
 *  "cancel 或 void 的不要算"). Both legs of a pair carry the flag (mig
 *  20260730000000 refuses to flag a pair that doesn't net to zero), so no
 *  total moves — the cancelled rows simply stop appearing in statements and
 *  their drill-downs. Matches what the ledger/TB/BS queries already did.
 *
 *  The pages go out together (2026-10-08, `fetchAllRowsParallel`): one after
 *  another they were five round trips in a row (66–95 ms each in production)
 *  in front of every GL statement. */
export async function fetchAllJournalLines(supabase: SupabaseClient): Promise<GlLine[]> {
  const rows = await fetchAllRowsParallel(
    (from, to, withCount) =>
      supabase
        .from('journal_lines')
        .select(
          'account_code, debit, credit, description, entry_id, journal_entries!inner(transaction_date, entry_no, description, segment, reference_type, reference_id, is_reversed)',
          withCount ? { count: 'exact' } : undefined,
        )
        .order('id', { ascending: true })
        .range(from, to),
    'fetchAllJournalLines',
  )
  const out: GlLine[] = []
  for (const row of rows) {
    const je = row.journal_entries as unknown as {
      transaction_date: string
      entry_no: string | null
      description: string | null
      segment: string | null
      reference_type: string | null
      reference_id: string | null
      is_reversed: boolean
    }
    // Skip void/reversal pairs — filtered here (not in the query) to match
    // the existing embedded-column pattern in cfo-reports.fetchBankMovements.
    // Paging stays correct because the pager counts RAW rows: the skip runs
    // only after every page is in.
    if (je.is_reversed) continue
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
      ref_type: je.reference_type,
      ref_id: je.reference_id,
    })
  }
  return out
}

export interface InvoiceRef {
  invoice_no: string | null
  description: string | null
  /** Bill-to label: company short code/name, department, or freetext payer. */
  billTo: string | null
}

export interface GlRefs {
  invoices: Map<string, InvoiceRef>
  /** payment voucher id → payee (PV: paid to / OR: received from). */
  voucherPayees: Map<string, string>
  /** credit note id → the parent invoice's bill-to (CN v2, 2026-08-20) —
   *  optional so hand-built refs (tests) stay valid. */
  creditNoteParties?: Map<string, string>
  /** Set only for a reader who sees payroll by department (2026-10-13,
   *  fetchGlRefs `payrollByPerson: false`): salary voucher id → the batch and
   *  department its lines fold into (applyGlRefs). */
  payrollByDepartment?: Map<string, { label: string; department: string }>
}

/** Reference lookups for enriching drill-down rows: invoice number /
 *  description / bill-to, and voucher payee names.
 *
 *  Every invoice, voucher and credit note is read in 1000-row pages
 *  (2026-10-08): an unranged read stops at PostgREST's 1000 rows without a
 *  word, and the rows past it would simply lose their invoice number and
 *  counterparty in every drill-down. Each answer only feeds a Map by id, so
 *  the pages' `id` order changes nothing else.
 *
 *  `payrollByPerson: false` (lib/roles.ts listsPayrollByPerson, 2026-10-13):
 *  the refs carry `payrollByDepartment`, and applyGlRefs folds each salary
 *  voucher's lines by batch and department — no name reaches a drill-down. */
export async function fetchGlRefs(supabase: SupabaseClient, opts: { payrollByPerson?: boolean } = {}): Promise<GlRefs> {
  const foldPayroll = opts.payrollByPerson === false
  const [invoices, { data: companies }, { data: departments }, vouchers, creditNotes, salaryVouchers] =
    await Promise.all([
      fetchAllRows(
        (from, to) =>
          supabase
            .from('invoices')
            .select('id, invoice_no, description, company_id, billable_to_department_id, billable_to_freetext_name')
            .order('id', { ascending: true })
            .range(from, to),
        'fetchGlRefs invoices',
      ),
      supabase.from('companies').select('id, name, short_code'),
      // Every department: a salary voucher may name any of them (2026-10-13).
      // The internal ones (Venture Office) are kept out of the bill-to resolver
      // below — never a billable party.
      supabase.from('departments').select('id, name, is_internal'),
      fetchAllRows(
        (from, to) =>
          supabase
            .from('payment_vouchers')
            .select('id, payee_name, invoice_id')
            .order('id', { ascending: true })
            .range(from, to),
        'fetchGlRefs vouchers',
      ),
      // CN JEs (reference_type='credit_note') resolve their party through the
      // parent invoice's bill-to. Errors tolerated (dept_manager RLS blocks
      // credit_notes) — those lines just keep a null party.
      fetchAllRows((from, to) =>
        supabase.from('credit_notes').select('id, invoice_id').order('id', { ascending: true }).range(from, to),
      ).catch(() => [] as Array<{ id: string; invoice_id: string }>),
      // The salary vouchers — their batch and department — only for a reader
      // who sees payroll by department (2026-10-13).
      foldPayroll
        ? fetchAllRows(
            (from, to) =>
              supabase
                .from('payment_vouchers')
                .select('id, reference_type, description, payment_date')
                .eq('reference_type', 'payroll_disbursement')
                .order('id', { ascending: true })
                .range(from, to),
            'fetchGlRefs salary vouchers',
          )
        : Promise.resolve([]),
    ])

  const coById = new Map((companies ?? []).map((c) => [c.id as string, (c.short_code as string | null) ?? (c.name as string)]))
  const deptById = new Map(
    (departments ?? []).filter((d) => d.is_internal === false).map((d) => [d.id as string, d.name as string]),
  )
  let payrollByDepartment: GlRefs['payrollByDepartment']
  if (foldPayroll) {
    const names = new Set((departments ?? []).map((d) => d.name as string))
    payrollByDepartment = new Map()
    for (const v of salaryVouchers as Array<PayrollVoucherText & { id: string }>) {
      const fold = payrollFoldOf(v, names)
      if (fold) payrollByDepartment.set(v.id, fold)
    }
  }

  const billToOf = (i: {
    company_id: string | null
    billable_to_department_id: string | null
    billable_to_freetext_name: string | null
  }) =>
    (i.company_id ? coById.get(i.company_id) : null) ??
    (i.billable_to_department_id ? deptById.get(i.billable_to_department_id) : null) ??
    (i.billable_to_freetext_name || null)
  const invoiceBillTo = new Map(
    (invoices ?? []).map((i) => [i.id as string, billToOf(i as Parameters<typeof billToOf>[0])]),
  )

  return {
    invoices: new Map(
      (invoices ?? []).map((i) => [
        i.id as string,
        {
          invoice_no: (i.invoice_no as string | null) ?? null,
          description: (i.description as string | null) ?? null,
          billTo: invoiceBillTo.get(i.id as string) ?? null,
        },
      ]),
    ),
    // Settle receipts often carry a placeholder payee ('—' from the batch
    // settle modal) — the linked INVOICE's bill-to is the real counterparty,
    // so it wins whenever the voucher has an invoice_id. Without this the
    // Monthly R&P per-debtor rows never saw the collections (2026-08-24:
    // Rygis showed 9,500 owing when it truly owed 0).
    voucherPayees: new Map(
      (vouchers ?? []).flatMap((v) => {
        const viaInvoice = v.invoice_id ? invoiceBillTo.get(v.invoice_id as string) ?? null : null
        const payee = viaInvoice ?? (((v.payee_name as string | null) ?? '').trim() || null)
        return payee && payee !== '—' ? [[v.id as string, payee] as [string, string]] : []
      }),
    ),
    creditNoteParties: new Map(
      (creditNotes ?? []).flatMap((cn) => {
        const billTo = invoiceBillTo.get(cn.invoice_id as string) ?? null
        return billTo ? [[cn.id as string, billTo] as [string, string]] : []
      }),
    ),
    ...(payrollByDepartment ? { payrollByDepartment } : {}),
  }
}

/**
 * The journal lines salary vouchers posted, put together by batch, department
 * and day (2026-10-13 — the user: "就算能看到 pv，应该也是看到 by 整个部门才对"):
 * each group stands as ONE entry (`payroll:<day|segment|batch|department>`, no
 * entry number), with one line per account, so every builder reads it as it
 * read each of its vouchers — the cash flow splits an entry's bank leg across
 * its other legs. Named "Payroll net Sep 2026 · Marketing · 12 vouchers", the
 * department as its party. Every other line passes through, in order; a group
 * stands where its first line stood.
 */
export function foldPayrollGlLines(lines: GlLine[], byVoucher: ReadonlyMap<string, { label: string; department: string }>): GlLine[] {
  const out: GlLine[] = []
  const merged = new Map<string, GlLine>()
  const members = new Map<string, Set<string>>()
  for (const l of lines) {
    const isVoucher = l.ref_type === 'payment_voucher' || l.ref_type === 'payment_voucher_void'
    const fold = isVoucher && l.ref_id ? byVoucher.get(l.ref_id) : undefined
    if (!fold) {
      out.push(l)
      continue
    }
    const entry = `payroll:${l.date}|${l.segment}|${fold.label}|${fold.department}${l.ref_type === 'payment_voucher_void' ? '|void' : ''}`
    let ids = members.get(entry)
    if (!ids) {
      ids = new Set()
      members.set(entry, ids)
    }
    ids.add(l.entry_id)
    const key = `${entry}|${l.account_code}`
    const line = merged.get(key)
    if (line) {
      line.debit = r2(line.debit + l.debit)
      line.credit = r2(line.credit + l.credit)
      continue
    }
    const first: GlLine = {
      account_code: l.account_code,
      debit: l.debit,
      credit: l.credit,
      description: null,
      entry_id: entry,
      date: l.date,
      entry_no: null,
      entry_description: `${fold.label} · ${fold.department}`,
      segment: l.segment,
      ref_type: 'payroll_department',
      ref_id: null,
      party: fold.department,
    }
    merged.set(key, first)
    out.push(first)
  }
  for (const line of merged.values()) {
    const n = members.get(line.entry_id)?.size ?? 1
    line.entry_description = `${line.entry_description} · ${n} ${n === 1 ? 'voucher' : 'vouchers'}`
  }
  return out
}

/** Enrich drill-down lines: invoice JEs get "invoice_no · description" plus the
 *  bill-to company as the counterparty; voucher JEs (PV/OR) get the payee as
 *  the counterparty (pay-out to / received from). Pure — returns new objects.
 *  With `refs.payrollByDepartment` (a reader who sees payroll by department)
 *  the salary vouchers' lines are folded first: no name is ever looked up. */
export function applyGlRefs(lines: GlLine[], refs: GlRefs): GlLine[] {
  const source = refs.payrollByDepartment ? foldPayrollGlLines(lines, refs.payrollByDepartment) : lines
  return source.map((l) => {
    if (!l.ref_id) return l
    if (l.ref_type === 'invoice') {
      const ref = refs.invoices.get(l.ref_id)
      if (!ref?.invoice_no) return l
      const label = ref.description ? `${ref.invoice_no} · ${ref.description}` : ref.invoice_no
      return { ...l, description: label, party: ref.billTo }
    }
    if (l.ref_type === 'payment_voucher' || l.ref_type === 'payment_voucher_void') {
      const payee = refs.voucherPayees.get(l.ref_id)
      if (!payee) return l
      return { ...l, party: payee }
    }
    if (l.ref_type === 'credit_note') {
      const party = refs.creditNoteParties?.get(l.ref_id)
      if (!party) return l
      return { ...l, party }
    }
    return l
  })
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
  /** Counterparty: invoice bill-to / voucher payee (null when unknown). */
  party: string | null
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
  /** Cash-flow layout sections (2026-09-18): the section row ITSELF carries the
   *  total — no trailing "— 小计" row, which doubled up with the COA parent
   *  right above it at L1 (user: "看到两个 total 看了会很乱"). */
  headed?: boolean
  /** Set when the section held exactly one COA root named like the section:
   *  that root IS the section row (code, txns, collapse) and `nodes` are its
   *  children, so "Loans Receivable" is not printed twice. */
  root?: AccountNode
}

export interface Period {
  /** inclusive, 'YYYY-MM-DD' */
  from: string
  to: string
}

export interface ReportFilter {
  current: Period
  previous: Period
  /** journal_entries.segment filter; undefined/'' = all segments.
   *  An array means "any of" (e.g. Venture = ['corporate','treasury']). */
  segment?: string | string[]
}

// Natural sign per account type: these grow on the DEBIT side; everything else
// (equity, liability, revenue, other_income) grows on the CREDIT side.
const DEBIT_NATURAL: ReadonlySet<AccountType> = new Set(['fixed_asset', 'asset', 'cost', 'expense'])

export function naturalNet(type: AccountType, debit: number, credit: number): number {
  return DEBIT_NATURAL.has(type) ? debit - credit : credit - debit
}

const inPeriod = (l: GlLine, p: Period) => l.date >= p.from && l.date <= p.to
const segPass = (l: GlLine, segment?: string | string[]) =>
  !segment || segment.length === 0 || (Array.isArray(segment) ? segment.includes(l.segment) : l.segment === segment)

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
          party: l.party ?? null,
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

/** One account's cash movement on ONE side (in or out), pre-tree. */
export interface CashFlowLeaf {
  code: string
  current: number
  previous: number
  txns: GlTxn[]
}

export interface CashFlowReport {
  operating: ReportSection
  investing: ReportSection
  financing: ReportSection
  /** 现金流入 — every counter account's INFLOW slices, gross (user 2026-07-30:
   *  收钱先、出钱后, 拆开显示像银行流水). An account that both received and
   *  paid in the window appears in BOTH sections; inflow + outflow = netChange,
   *  so the statement still ties to the bank movement. */
  inflow: ReportSection
  /** 现金流出 — the OUTFLOW slices (negative amounts). */
  outflow: ReportSection
  /** Flat per-account buckets behind `inflow` / `outflow`, before the COA tree
   *  is built — so a custom layout can group them into its OWN sections and
   *  nest the COA tree inside each one (user 2026-07-30: 借贷/还款 一个 section,
   *  日常开销 一个 section, 顺序自己排). */
  inflowLeaves: CashFlowLeaf[]
  outflowLeaves: CashFlowLeaf[]
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
  const flows = new Map<string, Flow>() // counter account code → NET flow (O/I/F sections)
  // Gross split for the 收/出 presentation: keyed `${code}:in` / `${code}:out`,
  // so a single account can surface on both sides with its own transactions.
  const dirFlows = new Map<string, Flow & { code: string; dir: 'in' | 'out' }>()
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
      const dir: 'in' | 'out' = share > 0 ? 'in' : 'out'
      const dirKey = `${c.account_code}:${dir}`
      let df = dirFlows.get(dirKey)
      if (!df) {
        df = { code: c.account_code, dir, current: 0, previous: 0, txns: [] }
        dirFlows.set(dirKey, df)
      }
      if (inCur) {
        const txn = {
          date,
          entryNo: c.entry_no,
          description: c.description || c.entry_description || '',
          segment: c.segment,
          party: c.party ?? null,
          amount: share,
        }
        f.current = r2(f.current + share)
        f.txns.push(txn)
        df.current = r2(df.current + share)
        df.txns.push(txn)
      }
      if (inPrev) {
        f.previous = r2(f.previous + share)
        df.previous = r2(df.previous + share)
      }
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

  // 收/出 gross sections, nested under their COA parents (user 2026-07-30:
  // "这些自动分类一下父子account") — same buildTree the P&L and Balance Sheet
  // use, so e.g. 3053/3054 roll up under 3020 Loans Receivable and the
  // 4051/4052/4202 payables under 4100. Every COA type is eligible: a cash
  // counter account can be an asset, liability, revenue… Synthetic transfer
  // accounts (IB-XFER / PY-XFER) have no parent and stay top-level.
  const inBuckets = new Map<string, Bucket>()
  const outBuckets = new Map<string, Bucket>()
  for (const df of dirFlows.values()) {
    df.txns.sort((a, b) => a.date.localeCompare(b.date))
    const bucket: Bucket = { current: df.current, previous: df.previous, txns: df.txns }
    ;(df.dir === 'in' ? inBuckets : outBuckets).set(df.code, bucket)
  }
  const allTypes: ReadonlySet<AccountType> = new Set(ACCOUNT_TYPES)
  const inflow = section('inflow', '现金流入 · Money in', buildTree(accounts, inBuckets, allTypes))
  const outflow = section('outflow', '现金流出 · Money out', buildTree(accounts, outBuckets, allTypes))
  const leavesOf = (m: Map<string, Bucket>): CashFlowLeaf[] =>
    [...m.entries()].map(([code, b]) => ({ code, current: b.current, previous: b.previous, txns: b.txns }))
  const netChange = {
    current: r2(operating.current + investing.current + financing.current),
    previous: r2(operating.previous + investing.previous + financing.previous),
  }
  return {
    operating,
    investing,
    financing,
    inflow,
    outflow,
    inflowLeaves: leavesOf(inBuckets),
    outflowLeaves: leavesOf(outBuckets),
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
