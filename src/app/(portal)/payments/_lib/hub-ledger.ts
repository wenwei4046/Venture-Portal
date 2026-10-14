import dayjs from 'dayjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { canSeePayrollPayouts, listsPayrollByPerson } from '@/lib/roles'
import { fetchAllRows, fetchAllRowsAsWritten } from '@/lib/paginate'
import { fetchReceiptExtras } from '@/lib/receipt-extras'
import { fetchPaymentExtras } from '@/lib/payment-extras'
import { startRead } from '@/lib/start-read'
import { officeDay, officeMonth, officeTime } from '@/lib/office-time'
import { filterLockedBatches, isPayrollReference, lockPayrollBatches, type LockedBatch } from '@/lib/payroll-vouchers'
import type { User } from '@/types'
import type { VoucherRow } from '../_components/VouchersTable'

// Payments' and Receipt's hubs (2026-10-14, the Finance revamp v2 — D02–D05,
// D09 of `.design/fin-r2/handoff`): the ledger's rows read ONCE, every card's
// list worked out here, the card picked in the browser. The rules are the old
// ledger's (VoucherLedger, retired with Receipt's hub): payroll read by
// department never leaves the server as one person's voucher; a salary batch
// folds under its name; money that moved outside the voucher flow stands in
// All and Paid; an old ?type= / ?pool= / ?from= / ?to= / ?min= / ?max= link
// still narrows the list.

export type HubCardKey = 'all' | 'draft' | 'pending_approval' | 'approved' | 'paid' | 'voided' | 'payroll'

export const STATUS_CARDS: ReadonlyArray<Exclude<HubCardKey, 'all' | 'payroll'>> = ['draft', 'pending_approval', 'approved', 'paid', 'voided']

const POOL_LABELS: Record<string, string> = {
  venture_pool: 'Venture Pool',
  dept_pool_director: 'Director Pool',
  dept_pool_marketing: 'Marketing',
  dept_pool_finance: 'Finance',
  dept_pool_hr: 'HR',
  invoice_payout_pool: 'Invoice Payout',
}

export interface LedgerParams {
  status?: string
  q?: string
  type?: string
  pool?: string
  from?: string
  to?: string
  min?: string
  max?: string
  /** `1`: arrive with Create payment open (the Overview's button). */
  new?: string
}

/** One line of a card's list. */
export interface HubRow {
  /** A voucher's id; `fsr-` / `lout-` / `rpy-` / `fin-` for money that moved outside the flow; `batch:` for a folded salary batch. */
  id: string
  /** voucher → the drawer; extra → its own page; batch → the Payroll batches card, opened on it. */
  kind: 'voucher' | 'extra' | 'batch'
  no: string | null
  name: string
  desc: string
  amount: number
  status: string
  /** `YYYY-MM-DD` on the office's calendar. */
  date: string
  cat: string
  pool: string
  bank: string | null
  href: string | null
  /** The cards that list it. */
  cards: HubCardKey[]
  /** What it counts for: 1, or a folded batch's members in its card. */
  items: number
  /** A batch row's batch. */
  batch: string | null
  /** A paid voucher's date (or a received repayment's) corrected in place — the row menu's Change date. */
  amendDate: { kind: 'voucher' | 'repayment'; id: string; date: string } | null
  /** A received loan repayment's amount corrected in place — Change amount. */
  amendAmount: boolean
}

/** One member of a payroll batch: a voucher, or a department's total read by department. */
export interface HubBatchMember {
  /** The voucher it opens; null for a department's total. */
  id: string | null
  who: string
  /** Its number; for a department's total, how many vouchers it stands for. */
  no: string
  amount: number
  status: string
}

export interface HubBatch {
  key: string
  name: string
  count: number
  total: number
  /** `YYYY-MM-DD`. */
  latest: string
  /** "all paid" · "20 paid · 6 pending". */
  statusText: string
  members: HubBatchMember[]
  locked: boolean
}

export interface HubCardFigure {
  key: HubCardKey
  /** Vouchers (a folded batch's members each); the Payroll batches card, its batches. */
  count: number
  /** Money moved outside the voucher flow on its list (All, Paid). */
  other: number
  amount: number
}

export interface HubLedger {
  receipts: boolean
  /** Payroll Requests is the Payroll payouts right's (its page asks it). */
  seesPayroll: boolean
  /** Read by person: one person's salary voucher may be listed. */
  byPerson: boolean
  hero: { label: string; amount: number }
  cards: HubCardFigure[]
  rows: HubRow[]
  batches: HubBatch[]
  /** The card the URL asked for. */
  initialCard: HubCardKey
  /** An old ?q= link's words, put in the search box. */
  initialQuery: string
  /** Anything to list at all. */
  empty: boolean
}

type VoucherRead = {
  id: string
  voucher_no: string | null
  direction: string
  amount: number | string
  payee_name: string
  status: string
  voucher_type: string | null
  reference_type: string | null
  description: string | null
  payment_date: string | null
  created_at: string
  target_pool: string | null
  source_pool: string | null
  fund_source_id: string | null
  loan_id: string | null
  bank_account_id: string | null
}

type SourceRead = { voucher_id: string; pool: string; account_code: string | null; chart_of_accounts: { name: string } | null }

export interface HubLedgerInput {
  direction: 'debit' | 'credit'
  params: LedgerParams
  seesPayroll: boolean
  byPerson: boolean
  vouchers: VoucherRead[]
  sources: SourceRead[]
  extras: VoucherRow[]
  banks: Array<{ id: string; bank_name: string }>
  departments: string[]
  /** The office's month, `YYYY-MM`. */
  month: string
}

const r2 = (n: number) => Math.round(n * 100) / 100
const isCard = (s: string | undefined): s is HubCardKey =>
  s === 'all' || s === 'payroll' || (STATUS_CARDS as readonly string[]).includes(s ?? '')

/** A list says a status in a word: "pending" for pending approval (the design's chip). */
export function statusWord(status: string, receipts = false): string {
  if (status === 'pending_approval') return 'pending'
  if (receipts && status === 'paid') return 'received'
  return status.replace(/_/g, ' ')
}

/** "all paid" when every voucher stands alike, else "20 paid · 6 pending". */
export function batchStatusText(counts: Record<string, number>, receipts = false): string {
  const entries = Object.entries(counts).filter(([, n]) => n > 0)
  if (entries.length === 1) return `all ${statusWord(entries[0][0], receipts)}`
  return entries
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([s, n]) => `${n} ${statusWord(s, receipts)}`)
    .join(' · ')
}

/** The day a row stands on, on the office's calendar. */
const dayOf = (iso: string) => officeDay(iso).format('YYYY-MM-DD')

export function buildHubLedger(input: HubLedgerInput): HubLedger {
  const { direction, params, seesPayroll, byPerson, vouchers, sources, extras, banks, month } = input
  const receipts = direction === 'credit'
  const q = params.q?.trim() ?? ''
  const typeFilter = params.type ?? ''
  const poolFilter = params.pool ?? ''
  const fromFilter = params.from ?? ''
  const toFilter = params.to ?? ''
  const minFilter = params.min ? parseFloat(params.min) : null
  const maxFilter = params.max ? parseFloat(params.max) : null

  // Each voucher's pools and its accounts' names, in the order the sources came.
  const poolsOf = new Map<string, string[]>()
  const catsOf = new Map<string, string[]>()
  for (const s of sources) {
    poolsOf.set(s.voucher_id, [...(poolsOf.get(s.voucher_id) ?? []), s.pool])
    const label = s.chart_of_accounts?.name ?? (s.account_code ? s.account_code.replace(/_/g, ' ') : null)
    if (label) {
      const cats = catsOf.get(s.voucher_id) ?? []
      if (!cats.includes(label)) cats.push(label)
      catsOf.set(s.voucher_id, cats)
    }
  }
  const bankById = new Map(banks.map((b) => [b.id, b.bank_name]))

  // A repayment PV is typed 'expense' — its fund source or loan says what it is.
  const isLoanRepay = (v: VoucherRead) => v.fund_source_id != null || v.loan_id != null || v.voucher_type === 'loan_repayment'

  // What an old link's filters ask (VoucherLedger's, unchanged).
  const passes = (v: VoucherRead) => {
    if (typeFilter === 'loan_repayment') {
      if (!isLoanRepay(v)) return false
    } else if (typeFilter && v.voucher_type !== typeFilter) return false
    if (poolFilter) {
      if (v.direction === 'credit') {
        if (v.target_pool !== poolFilter) return false
      } else if (!(poolsOf.get(v.id) ?? []).includes(poolFilter)) return false
    }
    const madeOn = dayjs(officeTime(v.created_at).format('YYYY-MM-DD'))
    if (fromFilter && madeOn.isBefore(dayjs(fromFilter), 'day')) return false
    if (toFilter && madeOn.isAfter(dayjs(toFilter), 'day')) return false
    if (minFilter !== null && Number(v.amount) < minFilter) return false
    if (maxFilter !== null && Number(v.amount) > maxFilter) return false
    return true
  }
  const extraPasses = (r: VoucherRow) => {
    if (typeFilter || poolFilter) return false
    if (fromFilter && dayjs(r.paymentOrCreatedDate).isBefore(dayjs(fromFilter), 'day')) return false
    if (toFilter && dayjs(r.paymentOrCreatedDate).isAfter(dayjs(toFilter), 'day')) return false
    if (minFilter !== null && r.amount < minFilter) return false
    if (maxFilter !== null && r.amount > maxFilter) return false
    return true
  }

  const catOf = (v: VoucherRead) => {
    const cats = catsOf.get(v.id) ?? []
    const base = cats.length > 0 ? cats.join(' + ') : '—'
    return isLoanRepay(v) ? `还款 · ${base === '—' ? 'Loan' : base}` : base
  }
  const poolOf = (v: VoucherRead) => {
    if (v.direction === 'credit') return v.target_pool ? (POOL_LABELS[v.target_pool] ?? v.target_pool.replace(/_/g, ' ')) : '—'
    const pools = poolsOf.get(v.id) ?? []
    if (pools.length > 0) return pools.map((p) => POOL_LABELS[p] ?? p.replace(/_/g, ' ')).join(' + ')
    return v.source_pool ? (POOL_LABELS[v.source_pool] ?? v.source_pool.replace(/_/g, ' ')) : '—'
  }
  const firstLine = (text: string | null) => (text ?? '').split(/\r?\n/)[0].trim()

  // ── What each card lists (read by department, payroll stands in its own card only). ──
  const listed = byPerson ? vouchers : vouchers.filter((v) => !isPayrollReference(v.reference_type))

  // ── Payroll batches ──
  // Read by person: each salary voucher, folded under its batch. Read by
  // department: every payroll voucher — salary, statutory, funding — as its
  // batch's department totals, worked out here and never sent on.
  const batchKeyOf = (v: VoucherRead) =>
    v.reference_type === 'payroll_disbursement' ? (v.description ?? 'Payroll disbursement').split(' — ')[0].trim() : null
  let batches: HubBatch[]
  if (byPerson) {
    const byKey = new Map<string, VoucherRead[]>()
    for (const v of vouchers) {
      const key = batchKeyOf(v)
      if (!key || !passes(v)) continue
      byKey.set(key, [...(byKey.get(key) ?? []), v])
    }
    batches = [...byKey.entries()].map(([key, members]) => batchOf(key, members, receipts))
  } else {
    const locked = lockPayrollBatches(
      vouchers.filter((v) => isPayrollReference(v.reference_type)),
      new Set(input.departments),
    )
    const shown = filterLockedBatches(locked, {
      tab: 'all',
      typeFilter,
      poolFilter,
      fromFilter,
      toFilter,
      minFilter,
      maxFilter,
      qFilter: '',
    })
    batches = shown.map((b) => lockedBatchOf(b, receipts))
  }
  batches.sort((a, b) => (a.latest < b.latest ? 1 : a.latest > b.latest ? -1 : a.name.localeCompare(b.name)))

  // ── The rows ──
  const rows: HubRow[] = []
  const folded = new Map<string, VoucherRead[]>()
  for (const v of listed) {
    if (!passes(v)) continue
    const key = byPerson ? batchKeyOf(v) : null
    if (key) {
      folded.set(key, [...(folded.get(key) ?? []), v])
      continue
    }
    const date = dayOf(v.payment_date ?? v.created_at)
    rows.push({
      id: v.id,
      kind: 'voucher',
      no: v.voucher_no,
      name: v.payee_name,
      desc: firstLine(v.description),
      amount: Number(v.amount),
      status: v.status,
      date,
      cat: catOf(v),
      pool: poolOf(v),
      bank: receipts && v.bank_account_id ? (bankById.get(v.bank_account_id) ?? null) : null,
      href: null,
      cards: ['all', v.status as HubCardKey],
      items: 1,
      batch: null,
      // A paid voucher's date is corrected in place — a draft or pending one with Edit, payroll's from HR Payment.
      amendDate:
        v.status === 'paid' && v.payment_date && !isPayrollReference(v.reference_type)
          ? { kind: 'voucher', id: v.id, date: v.payment_date.slice(0, 10) }
          : null,
      amendAmount: false,
    })
  }
  // A salary batch stands in a card as one row of the members it lists there:
  // All holds the whole batch, a status card the members in that status.
  for (const [key, members] of folded) {
    const lists: Array<[HubCardKey, VoucherRead[]]> = [['all', members]]
    for (const s of STATUS_CARDS) {
      const inIt = members.filter((m) => m.status === s)
      if (inIt.length > 0) lists.push([s, inIt])
    }
    for (const [card, inCard] of lists) {
      const b = batchOf(key, inCard, receipts)
      rows.push({
        id: `batch:${card}:${key}`,
        kind: 'batch',
        no: null,
        name: key,
        desc: `${b.count} ${b.count === 1 ? 'voucher' : 'vouchers'} · ${b.statusText}`,
        amount: b.total,
        status: card === 'all' ? (Object.keys(countStatuses(inCard)).length === 1 ? inCard[0].status : 'mixed') : card,
        date: b.latest,
        cat: 'Payroll',
        pool: '—',
        bank: null,
        href: null,
        cards: [card],
        items: b.count,
        batch: key,
        amendDate: null,
        amendAmount: false,
      })
    }
  }
  // Money that moved outside the voucher flow: All and Paid (VoucherLedger's extras).
  for (const r of extras) {
    if (!extraPasses(r)) continue
    rows.push({
      id: r.id,
      kind: 'extra',
      no: r.voucher_no,
      name: r.payee_name,
      desc: firstLine(r.description),
      amount: r.amount,
      status: r.status,
      date: dayOf(r.paymentOrCreatedDate),
      cat: r.catLabel,
      pool: r.poolLabel,
      bank: r.bankLabel ?? null,
      href: r.href ?? null,
      cards: ['all', 'paid'],
      items: 1,
      batch: null,
      amendDate: r.amendDate ?? null,
      amendAmount: r.id.startsWith('rpy-'),
    })
  }
  // Newest first; a day's rows by number, as the ledger's date sort read them.
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.no ?? '').localeCompare(a.no ?? '')))

  // ── The cards' figures: what each card's list holds, as the list's head counts it (2026-10-14 — the
  // All card said 190 vouchers beside a list of 317, its 127 rows of money moved outside the flow uncounted). ──
  const figure = (key: HubCardKey): HubCardFigure => {
    const inCard = rows.filter((r) => r.cards.includes(key))
    return {
      key,
      count: inCard.reduce((n, r) => n + (r.kind === 'extra' ? 0 : r.items), 0),
      other: inCard.filter((r) => r.kind === 'extra').length,
      amount: r2(inCard.reduce((s, r) => s + r.amount, 0)),
    }
  }
  const cards: HubCardFigure[] = [
    figure('all'),
    ...STATUS_CARDS.map((s) => figure(s)),
    // Receipt's hub has no payroll card (D09: All / Draft / Pending / Approved / Received / Voided).
    ...(receipts
      ? []
      : [
          {
            key: 'payroll' as const,
            count: batches.length,
            other: 0,
            amount: r2(batches.reduce((s, b) => s + b.total, 0)),
          },
        ]),
  ]

  // ── The hero: this month's money moved — every voucher (payroll too) and the money outside the flow. ──
  const inMonth = (iso: string) => dayOf(iso).startsWith(month)
  const heroAmount = r2(
    vouchers.filter((v) => v.status === 'paid' && inMonth(v.payment_date ?? v.created_at)).reduce((s, v) => s + Number(v.amount), 0) +
      extras.filter((r) => r.status === 'paid' && inMonth(r.paymentOrCreatedDate)).reduce((s, r) => s + r.amount, 0),
  )
  const monthName = dayjs(`${month}-01`).format('MMMM YYYY')

  return {
    receipts,
    seesPayroll,
    byPerson,
    hero: { label: `${receipts ? 'Total received' : 'Total paid'} · ${monthName}`, amount: heroAmount },
    cards,
    rows,
    batches,
    initialCard: isCard(params.status) ? params.status : 'all',
    initialQuery: q,
    empty: vouchers.length === 0 && extras.length === 0,
  }
}

function countStatuses(vs: Array<{ status: string }>): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const v of vs) counts[v.status] = (counts[v.status] ?? 0) + 1
  return counts
}

/** A salary batch read by person: its vouchers, newest first. */
function batchOf(key: string, members: VoucherRead[], receipts: boolean): HubBatch {
  const latest = members.reduce((d, m) => {
    const at = dayOf(m.payment_date ?? m.created_at)
    return at > d ? at : d
  }, '')
  return {
    key,
    name: key,
    count: members.length,
    // A voided voucher moved no money.
    total: r2(members.filter((m) => m.status !== 'voided').reduce((s, m) => s + Number(m.amount), 0)),
    latest,
    statusText: batchStatusText(countStatuses(members), receipts),
    members: [...members]
      .sort((a, b) => a.payee_name.localeCompare(b.payee_name))
      .map((m) => ({ id: m.id, who: m.payee_name, no: m.voucher_no ?? '—', amount: Number(m.amount), status: m.status })),
    locked: false,
  }
}

/** A batch read by department: one line per department, never a person. */
function lockedBatchOf(b: LockedBatch, receipts: boolean): HubBatch {
  return {
    key: b.label,
    name: b.label,
    count: b.count,
    total: b.total,
    latest: b.latest ? dayOf(b.latest) : '',
    statusText: batchStatusText(b.statusCounts, receipts),
    members: b.departments.map((d) => ({
      id: null,
      who: d.department,
      no: `${d.count} ${d.count === 1 ? 'voucher' : 'vouchers'}`,
      amount: d.total,
      status: d.statuses.length === 1 ? d.statuses[0] : 'mixed',
    })),
    locked: true,
  }
}

/** The ledger's reads, all started together (VoucherLedger's, 2026-10-08), then built. */
export async function loadHubLedger(
  supabase: SupabaseClient,
  user: User,
  direction: 'debit' | 'credit',
  params: LedgerParams,
): Promise<HubLedger> {
  const seesPayroll = canSeePayrollPayouts(user)
  const byPerson = listsPayrollByPerson(user)
  const receipts = direction === 'credit'

  const vouchersRead = startRead(
    fetchAllRows((lo, hi) =>
      supabase
        .from('payment_vouchers')
        .select(
          'id, voucher_no, direction, amount, payee_name, status, voucher_type, reference_type, description, payment_date, created_at, target_pool, source_pool, fund_source_id, loan_id, bank_account_id',
        )
        .eq('direction', direction)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(lo, hi),
    ),
  )
  // Every source row: past PostgREST's 1,000-row cap the vouchers beyond it would lose their pool and category.
  const sourcesRead = startRead(
    fetchAllRowsAsWritten((page) => {
      const query = supabase
        .from('payment_voucher_sources')
        .select('voucher_id, pool, amount, account_code, chart_of_accounts!pvs_account_code_fk(name)')
        .order('amount', { ascending: false })
      return page ? query.order('id', { ascending: true }).range(page.from, page.to) : query
    }).then(
      (data) => data,
      () => [],
    ),
  )
  const banksRead = receipts ? startRead(supabase.from('bank_accounts').select('id, bank_name')) : null
  const departmentsRead = byPerson || receipts ? null : startRead(supabase.from('departments').select('name'))
  const extrasRead = startRead(receipts ? fetchReceiptExtras(supabase) : fetchPaymentExtras(supabase))

  const vouchers = ((await vouchersRead) ?? []) as VoucherRead[]
  const sources = ((await sourcesRead) ?? []) as unknown as SourceRead[]
  const banks = banksRead ? (((await banksRead).data ?? []) as Array<{ id: string; bank_name: string }>) : []
  const departments = departmentsRead ? (((await departmentsRead).data ?? []) as Array<{ name: string }>).map((d) => d.name) : []
  const extras = await extrasRead

  return buildHubLedger({
    direction,
    params,
    seesPayroll,
    byPerson,
    vouchers,
    sources,
    extras,
    banks,
    departments,
    month: officeMonth(),
  })
}
