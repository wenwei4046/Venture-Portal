// Pure helpers for the HR Payment page (2026-09-10, proposal B: department
// board + window). The page reads ONE RPC, payment_cycle(period), and every
// judgement about what it returned lives here so it can be unit-tested
// without Supabase: grouping people by department, what state a department's
// vouchers are in, the "vs last month" figures, the statutory bodies with
// their due dates, and which people the bank file cannot pay.

export type PvStatus = 'draft' | 'pending_approval' | 'approved' | 'paid' | 'voided'
export type Scope = 'staff' | 'directors'
export type Granularity = 'employee' | 'department'

export interface CycleVoucher {
  id: string
  no: string | null
  status: PvStatus
  payment_date: string | null
  created_at: string | null
  approved_at: string | null
  granularity: Granularity
  group_id: string | null
}

export interface CyclePerson {
  row_id: string
  /** hr_staff_costs.id for staff (their People page); null for directors. */
  staff_id: string | null
  scope: Scope
  code: string | null
  name: string
  dept_id: string | null
  dept_name: string
  bank_name: string | null
  bank_account_no: string | null
  gross: number
  net: number
  epf_er: number
  epf_ee: number
  socso_er: number
  socso_ee: number
  eis_er: number
  eis_ee: number
  pcb: number
  skbbk: number
  /** Same person's net in the previous month, null when they were not paid then. */
  prev_net: number | null
  voucher: CycleVoucher | null
}

export interface CycleFunding {
  id: string
  status: 'submitted' | 'pv_generated' | 'completed' | string
  amount: number
  requested_at: string | null
  pv_id: string | null
  pv_no: string | null
  pv_status: string | null
  pv_date: string | null
  paid_amount?: number | null
  target_pool?: string | null
}

export interface CycleStatutoryVoucher {
  id: string
  no: string | null
  payee: string
  status: PvStatus
  amount: number
  payment_date: string | null
  description: string | null
  created_at: string | null
  approved_at: string | null
}

export interface PaymentCycle {
  period: string
  run: {
    id: string
    status: string
    total_amount: number
    submitted_at: string | null
    approved_at: string | null
  } | null
  latest_run_period: string | null
  pool_balance: number
  /** The Alliance payroll account (GL 3010) the PVs and the bank file draw on. */
  payout_bank: { name: string; last4: string } | null
  funding: { staff: CycleFunding | null; directors: CycleFunding | null }
  people: CyclePerson[]
  statutory_vouchers: CycleStatutoryVoucher[]
}

const n = (v: unknown): number => {
  const x = typeof v === 'string' ? Number(v) : (v as number)
  return Number.isFinite(x) ? x : 0
}
export const round2 = (x: number): number => Math.round((Number.isFinite(x) ? x : 0) * 100) / 100

/** jsonb → typed, with every money field coerced to a number. */
export function normaliseCycle(raw: unknown): PaymentCycle {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = (raw ?? {}) as any
  const voucher = (v: unknown): CycleVoucher | null => {
    if (!v || typeof v !== 'object') return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const x = v as any
    return {
      id: String(x.id),
      no: x.no ?? null,
      status: (x.status ?? 'draft') as PvStatus,
      payment_date: x.payment_date ?? null,
      created_at: x.created_at ?? null,
      approved_at: x.approved_at ?? null,
      granularity: x.granularity === 'department' ? 'department' : 'employee',
      group_id: x.group_id ?? null,
    }
  }
  const funding = (f: unknown): CycleFunding | null => {
    if (!f || typeof f !== 'object') return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const x = f as any
    return {
      id: String(x.id),
      status: String(x.status ?? ''),
      amount: n(x.amount),
      requested_at: x.requested_at ?? null,
      pv_id: x.pv_id ?? null,
      pv_no: x.pv_no ?? null,
      pv_status: x.pv_status ?? null,
      pv_date: x.pv_date ?? null,
      paid_amount: x.paid_amount == null ? null : n(x.paid_amount),
      target_pool: x.target_pool ?? null,
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const people: CyclePerson[] = ((r.people ?? []) as any[]).map((p) => ({
    row_id: String(p.row_id),
    staff_id: p.staff_id ?? null,
    scope: p.scope === 'directors' ? 'directors' : 'staff',
    code: p.code ?? null,
    name: String(p.name ?? ''),
    dept_id: p.dept_id ?? null,
    dept_name: String(p.dept_name ?? 'Unassigned'),
    bank_name: p.bank_name ?? null,
    bank_account_no: p.bank_account_no ?? null,
    gross: n(p.gross),
    net: n(p.net),
    epf_er: n(p.epf_er),
    epf_ee: n(p.epf_ee),
    socso_er: n(p.socso_er),
    socso_ee: n(p.socso_ee),
    eis_er: n(p.eis_er),
    eis_ee: n(p.eis_ee),
    pcb: n(p.pcb),
    skbbk: n(p.skbbk),
    prev_net: p.prev_net == null ? null : n(p.prev_net),
    voucher: voucher(p.voucher),
  }))
  return {
    period: String(r.period ?? ''),
    run: r.run
      ? {
          id: String(r.run.id),
          status: String(r.run.status),
          total_amount: n(r.run.total_amount),
          submitted_at: r.run.submitted_at ?? null,
          approved_at: r.run.approved_at ?? null,
        }
      : null,
    latest_run_period: r.latest_run_period ?? null,
    pool_balance: n(r.pool_balance),
    payout_bank: r.payout_bank && r.payout_bank.name ? { name: String(r.payout_bank.name), last4: String(r.payout_bank.last4 ?? '') } : null,
    funding: { staff: funding(r.funding?.staff), directors: funding(r.funding?.directors) },
    people,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    statutory_vouchers: ((r.statutory_vouchers ?? []) as any[]).map((v) => ({
      id: String(v.id),
      no: v.no ?? null,
      payee: String(v.payee ?? ''),
      status: (v.status ?? 'draft') as PvStatus,
      amount: n(v.amount),
      payment_date: v.payment_date ?? null,
      description: v.description ?? null,
      created_at: v.created_at ?? null,
      approved_at: v.approved_at ?? null,
    })),
  }
}

// ── Bank details ─────────────────────────────────────────────────────────────

export type BankIssue = 'missing_account' | 'missing_bank' | 'numeric_bank'

/**
 * Why the Alliance bulk file could not pay this person. A bank NAME that is
 * only digits is an import artefact (Aug 2026: "7847", "7717") — the file
 * would carry a number where the bank goes, so it blocks like a missing one.
 * Directors are paid outside the staff bulk file and never block.
 */
export function bankIssue(p: Pick<CyclePerson, 'scope' | 'bank_name' | 'bank_account_no'>): BankIssue | null {
  if (p.scope === 'directors') return null
  if (!p.bank_account_no || !String(p.bank_account_no).trim()) return 'missing_account'
  const bank = (p.bank_name ?? '').trim()
  if (!bank) return 'missing_bank'
  if (/^\d+$/.test(bank)) return 'numeric_bank'
  return null
}

// ── Departments ──────────────────────────────────────────────────────────────

export type DeptMode = 'none' | 'employee' | 'department' | 'mixed'
export type DeptStage = 'not_generated' | 'partial' | 'pending' | 'approved' | 'paid'

export interface DeptGroup {
  /** dept_id for staff departments, 'directors' for the director batch. */
  key: string
  name: string
  scope: Scope
  dept_id: string | null
  people: CyclePerson[]
  headcount: number
  gross: number
  net: number
  /** gross − net: what the employee side pays into EPF / SOCSO / EIS / PCB / SKBBK. */
  deductions: number
  /** Net of the SAME people last month (only those who were paid then). */
  prev_net: number | null
  /** How many of this month's people were also paid last month. */
  prev_count: number
  generated: number
  paid: number
  pending: number
  mode: DeptMode
  stage: DeptStage
  /** Distinct live vouchers covering this department. */
  vouchers: CycleVoucher[]
  /** The one voucher when the department was compiled as a single PV. */
  deptVoucher: CycleVoucher | null
  blockers: number
}

function stageOf(g: Pick<DeptGroup, 'headcount' | 'generated' | 'paid' | 'pending' | 'vouchers'>): DeptStage {
  if (g.generated === 0) return 'not_generated'
  if (g.generated < g.headcount) return 'partial'
  if (g.pending > 0) return 'pending'
  if (g.paid === g.headcount) return 'paid'
  return 'approved'
}

/**
 * Staff grouped by department (largest net first), directors as one last
 * group. A person with net 0 still belongs to the group (they show, they just
 * never get a voucher), so headcount counts payable people only.
 */
export function groupDepartments(people: CyclePerson[]): DeptGroup[] {
  const map = new Map<string, DeptGroup>()
  for (const p of people) {
    const key = p.scope === 'directors' ? 'directors' : (p.dept_id ?? `name:${p.dept_name}`)
    let g = map.get(key)
    if (!g) {
      g = {
        key,
        name: p.scope === 'directors' ? 'Directors' : p.dept_name,
        scope: p.scope,
        dept_id: p.scope === 'directors' ? null : p.dept_id,
        people: [],
        headcount: 0,
        gross: 0,
        net: 0,
        deductions: 0,
        prev_net: null,
        prev_count: 0,
        generated: 0,
        paid: 0,
        pending: 0,
        mode: 'none',
        stage: 'not_generated',
        vouchers: [],
        deptVoucher: null,
        blockers: 0,
      }
      map.set(key, g)
    }
    g.people.push(p)
  }
  const groups = Array.from(map.values())
  for (const g of groups) {
    g.people.sort((a, b) => a.name.localeCompare(b.name))
    const payable = g.people.filter((p) => p.net > 0)
    g.headcount = payable.length
    g.gross = round2(g.people.reduce((s, p) => s + p.gross, 0))
    g.net = round2(g.people.reduce((s, p) => s + p.net, 0))
    g.deductions = round2(g.gross - g.net)
    const withPrev = g.people.filter((p) => p.prev_net != null)
    g.prev_count = withPrev.length
    g.prev_net = withPrev.length ? round2(withPrev.reduce((s, p) => s + (p.prev_net ?? 0), 0)) : null
    g.blockers = payable.filter((p) => bankIssue(p) != null).length
    const seen = new Map<string, CycleVoucher>()
    let emp = 0
    let dept = 0
    for (const p of payable) {
      if (!p.voucher) continue
      g.generated++
      if (p.voucher.status === 'paid') g.paid++
      else if (p.voucher.status === 'pending_approval' || p.voucher.status === 'draft') g.pending++
      if (p.voucher.granularity === 'department') dept++
      else emp++
      if (!seen.has(p.voucher.id)) seen.set(p.voucher.id, p.voucher)
    }
    g.vouchers = Array.from(seen.values())
    g.mode = emp && dept ? 'mixed' : dept ? 'department' : emp ? 'employee' : 'none'
    g.deptVoucher = g.mode === 'department' && g.vouchers.length === 1 ? g.vouchers[0] : null
    g.stage = stageOf(g)
  }
  return groups.sort((a, b) => {
    if (a.scope !== b.scope) return a.scope === 'directors' ? 1 : -1
    return b.net - a.net || a.name.localeCompare(b.name)
  })
}

// ── vs last month ────────────────────────────────────────────────────────────

export interface Delta {
  abs: number
  pct: number | null
  dir: 'up' | 'down' | 'flat'
}

/** Change from last month; null when there is nothing to compare with. */
export function delta(now: number, prev: number | null | undefined): Delta | null {
  if (prev == null) return null
  const abs = round2(now - prev)
  const pct = prev === 0 ? null : round2((abs / prev) * 100)
  return { abs, pct, dir: Math.abs(abs) < 0.005 ? 'flat' : abs > 0 ? 'up' : 'down' }
}

/** "▲ 3.2% higher than July" — the chip always comes with a plain sentence. */
export function varianceLabel(d: Delta | null, prevMonthName: string): string | null {
  if (!d) return null
  if (d.dir === 'flat') return `Same as ${prevMonthName}`
  const pct = d.pct == null ? '' : `${Math.abs(d.pct).toFixed(1)}% `
  return `${d.dir === 'up' ? '▲' : '▼'} ${pct}${d.dir === 'up' ? 'higher' : 'lower'} than ${prevMonthName}`
}

/** A move a reviewer should look at: more than 20% either way, and at least RM 50. */
export function isNotableMove(d: Delta | null): boolean {
  if (!d || d.pct == null) return false
  return Math.abs(d.pct) >= 20 && Math.abs(d.abs) >= 50
}

// ── Statutory ────────────────────────────────────────────────────────────────

export type Scheme = 'KWSP' | 'SOCSO' | 'EIS' | 'PCB' | 'SKBBK'
export type BodyKey = 'KWSP' | 'PERKESO' | 'LHDN' | 'SKBBK'

export const SCHEMES: Array<{ scheme: Scheme; payee: string; body: BodyKey; label: string; covers: string; portal: string }> = [
  { scheme: 'KWSP', payee: 'KWSP', body: 'KWSP', label: 'KWSP', covers: 'EPF · employer + employee', portal: 'i-Akaun (Majikan)' },
  { scheme: 'SOCSO', payee: 'PERKESO (SOCSO)', body: 'PERKESO', label: 'SOCSO', covers: 'SOCSO · employer + employee', portal: 'PERKESO ASSIST' },
  { scheme: 'EIS', payee: 'PERKESO (EIS)', body: 'PERKESO', label: 'EIS', covers: 'EIS · employer + employee', portal: 'PERKESO ASSIST' },
  { scheme: 'PCB', payee: 'LHDN', body: 'LHDN', label: 'LHDN', covers: 'PCB (MTD)', portal: 'e-PCB Plus / e-Data PCB' },
  { scheme: 'SKBBK', payee: 'SKBBK', body: 'SKBBK', label: 'SKBBK', covers: 'net-only employee deduction', portal: 'PERKESO ASSIST' },
]

export const BODIES: Array<{ key: BodyKey; name: string; covers: string; portal: string; schemes: Scheme[] }> = [
  { key: 'KWSP', name: 'KWSP', covers: 'EPF · employer + employee', portal: 'i-Akaun (Majikan)', schemes: ['KWSP'] },
  { key: 'PERKESO', name: 'PERKESO', covers: 'SOCSO + EIS · two PVs, one body', portal: 'PERKESO ASSIST', schemes: ['SOCSO', 'EIS'] },
  { key: 'LHDN', name: 'LHDN', covers: 'PCB (MTD)', portal: 'e-PCB Plus / e-Data PCB', schemes: ['PCB'] },
  { key: 'SKBBK', name: 'SKBBK', covers: 'net-only employee deduction', portal: 'PERKESO ASSIST', schemes: ['SKBBK'] },
]

export function schemeAmount(p: CyclePerson, scheme: Scheme): number {
  switch (scheme) {
    case 'KWSP':
      return p.epf_er + p.epf_ee
    case 'SOCSO':
      return p.socso_er + p.socso_ee
    case 'EIS':
      return p.eis_er + p.eis_ee
    case 'PCB':
      return p.pcb
    case 'SKBBK':
      return p.skbbk
  }
}

/**
 * Due date of a month's statutory payment: the 15th of the FOLLOWING month.
 * When the 15th is a weekend the bodies disagree: KWSP rolls FORWARD to the
 * next working day, PERKESO and LHDN roll BACK to the last working day before
 * it (PayrollPanda's help centre states the asymmetry). Public holidays are
 * not modelled — the page says so.
 */
export function statutoryDue(period: string, scheme: Scheme): string {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(Date.UTC(y, m, 15)) // month index m = the month after `period`
  const dow = d.getUTCDay() // 0 Sun … 6 Sat
  if (dow === 6 || dow === 0) {
    if (scheme === 'KWSP') {
      d.setUTCDate(d.getUTCDate() + (dow === 6 ? 2 : 1))
    } else {
      d.setUTCDate(d.getUTCDate() - (dow === 6 ? 1 : 2))
    }
  }
  return d.toISOString().slice(0, 10)
}

export type StatStage = 'not_generated' | 'pending' | 'paid'

export interface StatutoryRow {
  scheme: Scheme
  body: BodyKey
  label: string
  payee: string
  covers: string
  portal: string
  staff: number
  directors: number
  total: number
  due: string
  pv: CycleStatutoryVoucher | null
  /** Director-only top-up (Jun 2026 shape), when one was raised. */
  topup: CycleStatutoryVoucher | null
  directorsCovered: boolean
  stage: StatStage
  byDepartment: Array<{ key: string; name: string; amount: number }>
}

const carriesDirectors = (v: CycleStatutoryVoucher) => /directors\)\s*$/.test(String(v.description ?? ''))
const isDirectorOnly = (v: CycleStatutoryVoucher) => /\(directors\)\s*$/.test(String(v.description ?? ''))

export function statutoryRows(cycle: PaymentCycle, groups: DeptGroup[]): StatutoryRow[] {
  const staff = cycle.people.filter((p) => p.scope === 'staff')
  const dirs = cycle.people.filter((p) => p.scope === 'directors' && p.net > 0)
  return SCHEMES.map((s) => {
    const forPayee = cycle.statutory_vouchers.filter((v) => v.payee === s.payee)
    const pv = forPayee.find((v) => !isDirectorOnly(v)) ?? forPayee.find(isDirectorOnly) ?? null
    const topup = forPayee.find((v) => isDirectorOnly(v) && v.id !== pv?.id) ?? null
    const staffAmt = round2(staff.reduce((t, p) => t + schemeAmount(p, s.scheme), 0))
    const dirAmt = round2(dirs.reduce((t, p) => t + schemeAmount(p, s.scheme), 0))
    const paid = (v: CycleStatutoryVoucher | null) => v != null && (v.status === 'paid' || v.status === 'approved')
    const stage: StatStage = !pv ? 'not_generated' : paid(pv) && (!topup || paid(topup)) ? 'paid' : 'pending'
    return {
      scheme: s.scheme,
      body: s.body,
      label: s.label,
      payee: s.payee,
      covers: s.covers,
      portal: s.portal,
      staff: staffAmt,
      directors: dirAmt,
      total: round2(staffAmt + dirAmt),
      due: statutoryDue(cycle.period, s.scheme),
      pv,
      topup,
      directorsCovered: !!topup || (pv ? carriesDirectors(pv) : false),
      stage,
      byDepartment: groups.map((g) => ({
        key: g.key,
        name: g.name,
        amount: round2(g.people.reduce((t, p) => t + schemeAmount(p, s.scheme), 0)),
      })),
    }
  })
}

// ── The month's phase ────────────────────────────────────────────────────────

export type Phase =
  | 'no-payroll'
  | 'drafts-pending'
  | 'approved-ready'
  | 'request-submitted'
  | 'pv-generated'
  | 'funded'

/** Mirrors the pre-2026-09-10 page: the run and its funding request decide. */
export function cyclePhase(cycle: PaymentCycle): Phase {
  if (cycle.people.length === 0) return 'no-payroll'
  if (!cycle.run) return 'drafts-pending'
  if (cycle.run.status === 'paid') return 'funded'
  if (cycle.run.status !== 'approved') return 'drafts-pending'
  const f = cycle.funding.staff
  if (!f) return 'approved-ready'
  if (f.status === 'submitted') return 'request-submitted'
  if (f.status === 'pv_generated') return 'pv-generated'
  return 'funded'
}

/** Directors fund separately; their batch is payable only once that request completed. */
export function directorsFunded(cycle: PaymentCycle): boolean {
  return cycle.funding.directors?.status === 'completed'
}

// ── Totals for the strip ─────────────────────────────────────────────────────

export interface CycleTotals {
  people: number
  staffCount: number
  directorCount: number
  net: number
  gross: number
  staffNet: number
  directorNet: number
  /** Employer EPF + SOCSO + EIS, both scopes. */
  employer: number
  /** Every statutory head, staff + directors. */
  statutory: number
  statutoryStaff: number
  statutoryDirectors: number
  /** net + statutory = CTC = what Finance funded. */
  ctc: number
  prevNet: number | null
}

export function cycleTotals(cycle: PaymentCycle, rows: StatutoryRow[]): CycleTotals {
  const staff = cycle.people.filter((p) => p.scope === 'staff')
  const dirs = cycle.people.filter((p) => p.scope === 'directors' && p.net > 0)
  const sum = (xs: CyclePerson[], f: (p: CyclePerson) => number) => round2(xs.reduce((t, p) => t + f(p), 0))
  const staffNet = sum(staff, (p) => p.net)
  const directorNet = sum(dirs, (p) => p.net)
  const statutoryStaff = round2(rows.reduce((t, r) => t + r.staff, 0))
  const statutoryDirectors = round2(rows.reduce((t, r) => t + r.directors, 0))
  const withPrev = [...staff, ...dirs].filter((p) => p.prev_net != null)
  return {
    people: staff.length + dirs.length,
    staffCount: staff.length,
    directorCount: dirs.length,
    net: round2(staffNet + directorNet),
    gross: sum([...staff, ...dirs], (p) => p.gross),
    staffNet,
    directorNet,
    employer: sum([...staff, ...dirs], (p) => p.epf_er + p.socso_er + p.eis_er),
    statutory: round2(statutoryStaff + statutoryDirectors),
    statutoryStaff,
    statutoryDirectors,
    ctc: round2(staffNet + directorNet + statutoryStaff + statutoryDirectors),
    prevNet: withPrev.length ? sum(withPrev, (p) => p.prev_net ?? 0) : null,
  }
}

/** "5 Sep" from an ISO date or timestamp. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso)
  if (Number.isNaN(d.getTime())) return ''
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`
}

/** "5 Sep 10:12" for an audit footnote (Malaysia time). */
export function shortDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const my = new Date(d.getTime() + 8 * 60 * 60 * 1000)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const hh = String(my.getUTCHours()).padStart(2, '0')
  const mm = String(my.getUTCMinutes()).padStart(2, '0')
  return `${my.getUTCDate()} ${months[my.getUTCMonth()]} ${hh}:${mm}`
}

/** Days from today to an ISO date (negative = overdue). */
export function daysUntil(iso: string, today: Date = new Date()): number {
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - t) / 86400000)
}

/** "15/09" — the date inside an ADP-style pill. */
export function ddmm(iso: string | null | undefined): string {
  if (!iso || iso.length < 10) return ''
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

const dayOf = (iso: string) => new Date(iso + 'T00:00:00Z')

// ── The contributions band (PayrollPanda's header) ───────────────────────────

export interface ContributionTotals {
  gross: number
  /** What the employees pay in, by head; `other` is whatever gross − net the five heads do not explain (advances, unpaid leave). */
  employee: { epf: number; socso: number; eis: number; pcb: number; skbbk: number; other: number; total: number }
  net: number
  employer: { epf: number; socso: number; eis: number; total: number }
  /** gross + employer = CTC, the figure Finance funded. */
  cost: number
}

export function contributionTotals(people: CyclePerson[]): ContributionTotals {
  const sum = (f: (p: CyclePerson) => number) => round2(people.reduce((t, p) => t + f(p), 0))
  const gross = sum((p) => p.gross)
  const net = sum((p) => p.net)
  const epf = sum((p) => p.epf_ee)
  const socso = sum((p) => p.socso_ee)
  const eis = sum((p) => p.eis_ee)
  const pcb = sum((p) => p.pcb)
  const skbbk = sum((p) => p.skbbk)
  const known = round2(epf + socso + eis + pcb + skbbk)
  const other = round2(gross - net - known)
  const erEpf = sum((p) => p.epf_er)
  const erSocso = sum((p) => p.socso_er)
  const erEis = sum((p) => p.eis_er)
  const erTotal = round2(erEpf + erSocso + erEis)
  return {
    gross,
    employee: { epf, socso, eis, pcb, skbbk, other, total: round2(known + other) },
    net,
    employer: { epf: erEpf, socso: erSocso, eis: erEis, total: erTotal },
    cost: round2(gross + erTotal),
  }
}

// ── A department's row (Deel's cycle list) ───────────────────────────────────

export type SegState = 'done' | 'now' | 'wait' | 'late'
export type Tone = 'muted' | 'accent' | 'alert' | 'ledger' | 'danger'

export interface DeptTimeline {
  /** The one sentence over the bar: "Ready to generate · pay date 5 Sep". */
  sentence: string
  tone: Tone
  /** funded · generated · approved · paid */
  segments: [SegState, SegState, SegState, SegState]
  /** The right-hand caption under the bar: "Pay date · 5 Sep". */
  caption: string
  /** "Generated 5 Sep 10:12 · Approved 5 Sep 11:03" — empty until a voucher exists. */
  audit: string
}

/**
 * What a department's row says about itself. `funded` is this scope's funding
 * (directors fund separately), `plannedDate` the pay date the controls hold
 * until a voucher fixes it. A pay date that has passed without payment turns
 * the current segment `late` and the sentence to danger.
 */
export function deptTimeline(g: DeptGroup, funded: boolean, plannedDate: string, today: string): DeptTimeline {
  const v = g.vouchers[0]
  const date = v?.payment_date ?? plannedDate
  const overdue = !!date && date < today
  const audit = v?.created_at ? `Generated ${shortDateTime(v.created_at)}${v.approved_at ? ` · Approved ${shortDateTime(v.approved_at)}` : ''}` : ''
  const pvs = g.deptVoucher ? g.deptVoucher.no ?? 'PV' : `${g.vouchers.length} PV${g.vouchers.length === 1 ? '' : 's'}`
  const remaining = g.headcount - g.generated

  if (g.headcount === 0) {
    return { sentence: 'Nobody to pay this month', tone: 'muted', segments: ['wait', 'wait', 'wait', 'wait'], caption: '', audit }
  }
  if (g.stage === 'paid') {
    return { sentence: `Paid ${shortDate(date)} · ${pvs}`, tone: 'ledger', segments: ['done', 'done', 'done', 'done'], caption: `Paid · ${shortDate(date)}`, audit }
  }
  if (g.stage === 'approved') {
    return { sentence: 'Approved · awaiting the bank file', tone: 'ledger', segments: ['done', 'done', 'done', 'now'], caption: `Pay date · ${shortDate(date)}`, audit }
  }
  if (g.stage === 'pending') {
    if (overdue) {
      return { sentence: `Pay date ${shortDate(date)} has passed · still with Principal`, tone: 'danger', segments: ['done', 'done', 'late', 'wait'], caption: `Pay date · ${shortDate(date)}`, audit }
    }
    return { sentence: `Awaiting Principal since ${shortDateTime(v?.created_at)}`, tone: 'alert', segments: ['done', 'done', 'now', 'wait'], caption: `Pay date · ${shortDate(date)}`, audit }
  }
  if (g.stage === 'partial') {
    return {
      sentence: `${g.generated} of ${g.headcount} generated · ${remaining} to go`,
      tone: 'accent',
      segments: ['done', 'now', g.pending > 0 ? 'now' : 'wait', 'wait'],
      caption: `Pay date · ${shortDate(date)}`,
      audit,
    }
  }
  if (!funded) {
    return { sentence: 'Waiting for Finance to fund', tone: 'muted', segments: ['now', 'wait', 'wait', 'wait'], caption: `Pay date · ${shortDate(date)}`, audit }
  }
  if (overdue) {
    return { sentence: `Pay date ${shortDate(date)} has passed · not generated`, tone: 'danger', segments: ['done', 'late', 'wait', 'wait'], caption: `Pay date · ${shortDate(date)}`, audit }
  }
  return { sentence: `Ready to generate · pay date ${shortDate(date)}`, tone: 'accent', segments: ['done', 'now', 'wait', 'wait'], caption: `Pay date · ${shortDate(date)}`, audit }
}

// ── The due pill (ADP's "Due in 5 days (05/27)") ─────────────────────────────

export interface DuePill {
  text: string
  tone: Tone
}

export function duePill(due: string, today: string, paidDate?: string | null): DuePill {
  if (paidDate) return { text: `Paid ${shortDate(paidDate)}`, tone: 'ledger' }
  const n = daysUntil(due, dayOf(today))
  if (n < 0) return { text: `Overdue ${-n} day${n === -1 ? '' : 's'} (${ddmm(due)})`, tone: 'danger' }
  if (n === 0) return { text: `Due today (${ddmm(due)})`, tone: 'alert' }
  if (n <= 7) return { text: `Due in ${n} day${n === 1 ? '' : 's'} (${ddmm(due)})`, tone: 'alert' }
  return { text: `Due in ${n} days (${ddmm(due)})`, tone: 'accent' }
}

// ── The headline (Personio's status word + countdown) ────────────────────────

export interface HeadlineInput {
  cycle: PaymentCycle
  groups: DeptGroup[]
  rows: StatutoryRow[]
  phase: Phase
  staffFunded: boolean
  directorsFunded: boolean
  today: string
  plannedStaffDate: string
  plannedDirectorDate: string
}

export type ActionKind = 'payroll' | 'funding' | 'generate-salary' | 'approvals' | 'generate-statutory' | 'none'

export interface Headline {
  /** The big word: "Ready to generate", "Awaiting Principal", "Month closed". */
  word: string
  /** One sentence under it that says why. */
  detail: string
  tone: Tone
  /** The countdown on the right: what is due next and in how many days (negative = overdue). */
  due: { label: string; date: string | null; days: number | null }
  /** The four-segment bar: submitted → funded → salary PVs → statutory. */
  segments: Array<{ key: 'submitted' | 'funded' | 'salary' | 'statutory'; label: string; note: string; state: SegState }>
  /** The one thing to do now. `generate-salary` gets its label from the board (it depends on the PV-per switch). */
  action: { kind: ActionKind; label: string; href?: string }
}

interface Progress {
  payable: number
  generated: number
  pending: number
  paid: number
  salaryDone: boolean
  salaryPayDate: string | null
  pendingGroupId: string | null
  firstCreated: string | null
  statTotal: number
  statGenerated: number
  statPending: number
  statPaid: number
  statDone: boolean
  nextStatDue: string | null
  lastStatPaid: string | null
}

function progressOf(groups: DeptGroup[], rows: StatutoryRow[]): Progress {
  const live = groups.filter((g) => g.headcount > 0)
  const payable = live.reduce((s, g) => s + g.headcount, 0)
  const generated = live.reduce((s, g) => s + g.generated, 0)
  const pending = live.reduce((s, g) => s + g.pending, 0)
  const paid = live.reduce((s, g) => s + g.paid, 0)
  const pendingV = live.flatMap((g) => g.vouchers).find((v) => v.status === 'pending_approval' || v.status === 'draft')
  const created = live
    .flatMap((g) => g.vouchers)
    .map((v) => v.created_at)
    .filter((x): x is string => !!x)
    .sort()
  const paidDates = live
    .filter((g) => g.stage === 'paid')
    .map((g) => g.vouchers[0]?.payment_date)
    .filter((x): x is string => !!x)
    .sort()
  const openRows = rows.filter((r) => r.total > 0)
  const statPaid = openRows.filter((r) => r.stage === 'paid').length
  const statPending = openRows.filter((r) => r.stage === 'pending').length
  const unpaidDue = openRows
    .filter((r) => r.stage !== 'paid')
    .map((r) => r.due)
    .sort()
  const paidStat = openRows
    .filter((r) => r.stage === 'paid')
    .map((r) => r.pv?.payment_date)
    .filter((x): x is string => !!x)
    .sort()
  return {
    payable,
    generated,
    pending,
    paid,
    salaryDone: payable > 0 && live.every((g) => g.stage === 'paid'),
    salaryPayDate: paidDates[paidDates.length - 1] ?? null,
    pendingGroupId: pendingV?.group_id ?? null,
    firstCreated: created[0] ?? null,
    statTotal: openRows.length,
    statGenerated: openRows.filter((r) => r.pv != null).length,
    statPending,
    statPaid,
    statDone: openRows.length > 0 && statPaid === openRows.length,
    nextStatDue: unpaidDue[0] ?? null,
    lastStatPaid: paidStat[paidStat.length - 1] ?? null,
  }
}

export function cycleHeadline(i: HeadlineInput): Headline {
  const { cycle, phase, today } = i
  const p = progressOf(i.groups, i.rows)
  const run = cycle.run
  const fs = cycle.funding.staff
  const fd = cycle.funding.directors
  const hasDirectors = i.groups.some((g) => g.scope === 'directors' && g.headcount > 0)
  const fundedAll = i.staffFunded && (!hasDirectors || i.directorsFunded)
  const staffDate = i.groups.find((g) => g.scope === 'staff' && g.vouchers[0]?.payment_date)?.vouchers[0]?.payment_date ?? i.plannedStaffDate
  const monthName = new Date(cycle.period + 'T00:00:00Z').toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })
  const days = (d: string | null) => (d ? daysUntil(d, dayOf(today)) : null)

  const seg = (states: [SegState, SegState, SegState, SegState]): Headline['segments'] => [
    { key: 'submitted', label: 'Submitted', note: run ? shortDate(run.submitted_at) : 'not yet', state: states[0] },
    {
      key: 'funded',
      label: 'Funded',
      note: fundedAll ? shortDate(fs?.pv_date ?? fd?.pv_date) : i.staffFunded ? 'directors pending' : phase === 'pv-generated' ? 'with Principal' : phase === 'request-submitted' ? 'with Finance' : 'not yet',
      state: states[1],
    },
    { key: 'salary', label: 'Salary PVs', note: p.payable ? `${p.paid} of ${p.payable} paid` : '—', state: states[2] },
    { key: 'statutory', label: 'Statutory', note: p.statDone ? 'paid' : p.nextStatDue ? `due ${shortDate(p.nextStatDue)}` : '—', state: states[3] },
  ]

  if (phase === 'no-payroll') {
    return {
      word: 'No payroll',
      detail: `Nothing imported for ${monthName} yet.`,
      tone: 'muted',
      due: { label: 'Nothing due', date: null, days: null },
      segments: seg(['wait', 'wait', 'wait', 'wait']),
      action: { kind: 'payroll', label: 'Go to Payroll →', href: '/hr-costing/payroll' },
    }
  }
  if (phase === 'drafts-pending') {
    return {
      word: 'Not submitted',
      detail: `${cycle.people.length} people in draft on the Payroll grid — submit to Finance to start the cycle.`,
      tone: 'alert',
      due: { label: 'Pay date', date: staffDate, days: days(staffDate) },
      segments: seg(['now', 'wait', 'wait', 'wait']),
      action: { kind: 'payroll', label: 'Open Payroll grid →', href: '/hr-costing/payroll' },
    }
  }
  if (phase === 'approved-ready' || phase === 'request-submitted' || phase === 'pv-generated') {
    const amt = run ? run.total_amount : 0
    const word = phase === 'approved-ready' ? 'Awaiting funding' : phase === 'request-submitted' ? 'With Finance' : 'With Principal'
    const detail =
      phase === 'approved-ready'
        ? `No active funding request — the previous one was cancelled. Re-file RM ${fmtMoney(amt)} for staff.`
        : phase === 'request-submitted'
          ? `Funding request RM ${fmtMoney(amt)} filed ${shortDate(fs?.requested_at)} · Finance generates the PV next.`
          : `Funding PV ${fs?.pv_no ?? ''} awaiting Principal · RM ${fmtMoney(amt)}.`
    return {
      word,
      detail,
      tone: phase === 'request-submitted' ? 'accent' : 'alert',
      due: { label: 'Pay date', date: staffDate, days: days(staffDate) },
      segments: seg(['done', 'now', 'wait', 'wait']),
      action: { kind: 'funding', label: 'Funding request' },
    }
  }

  // phase === 'funded'
  const fundedSeg: SegState = fundedAll ? 'done' : 'now'
  if (!p.salaryDone) {
    const overdue = staffDate < today
    if (p.generated === 0) {
      return {
        word: overdue ? 'Pay date passed' : 'Ready to generate',
        detail: `Funded ${shortDate(fs?.pv_date)} · ${p.payable} people · nothing generated yet${hasDirectors && !i.directorsFunded ? ' · directors wait for their own funding' : ''}.`,
        tone: overdue ? 'danger' : 'accent',
        due: { label: 'Pay date', date: staffDate, days: days(staffDate) },
        segments: seg(['done', fundedSeg, overdue ? 'late' : 'now', 'wait']),
        action: { kind: 'generate-salary', label: 'Generate salary PVs' },
      }
    }
    if (p.pending > 0) {
      return {
        word: 'Awaiting Principal',
        detail: `${p.pending} of ${p.payable} salary PVs with Principal since ${shortDateTime(p.firstCreated)} · ${p.paid} paid.`,
        tone: overdue ? 'danger' : 'alert',
        due: { label: 'Pay date', date: staffDate, days: days(staffDate) },
        segments: seg(['done', fundedSeg, overdue ? 'late' : 'now', 'wait']),
        action: { kind: 'approvals', label: 'Open Approvals →', href: p.pendingGroupId ? `/approvals?group_id=${p.pendingGroupId}` : '/approvals' },
      }
    }
    return {
      word: 'Partly paid',
      detail: `${p.paid} of ${p.payable} paid · ${p.payable - p.generated} still to generate.`,
      tone: 'accent',
      due: { label: 'Pay date', date: staffDate, days: days(staffDate) },
      segments: seg(['done', fundedSeg, 'now', 'wait']),
      action: { kind: 'generate-salary', label: 'Generate the rest' },
    }
  }
  if (!p.statDone) {
    const due = p.nextStatDue
    const late = !!due && due < today
    if (p.statGenerated === 0) {
      return {
        word: late ? 'Statutory overdue' : 'Salaries paid',
        detail: `Paid ${shortDate(p.salaryPayDate)} · statutory for ${p.statTotal} PVs not generated yet.`,
        tone: late ? 'danger' : 'accent',
        due: { label: 'Statutory due', date: due, days: days(due) },
        segments: seg(['done', 'done', 'done', late ? 'late' : 'now']),
        action: { kind: 'generate-statutory', label: `Generate statutory · ${p.statTotal} PVs` },
      }
    }
    if (p.statPending > 0) {
      return {
        word: 'Statutory with Principal',
        detail: `${p.statPending} of ${p.statTotal} statutory PVs awaiting approval · ${p.statPaid} paid.`,
        tone: late ? 'danger' : 'alert',
        due: { label: 'Statutory due', date: due, days: days(due) },
        segments: seg(['done', 'done', 'done', late ? 'late' : 'now']),
        action: { kind: 'approvals', label: 'Open Approvals →', href: '/approvals' },
      }
    }
    return {
      word: 'Statutory partly paid',
      detail: `${p.statPaid} of ${p.statTotal} bodies paid · ${p.statTotal - p.statGenerated} still to generate.`,
      tone: late ? 'danger' : 'accent',
      due: { label: 'Statutory due', date: due, days: days(due) },
      segments: seg(['done', 'done', 'done', late ? 'late' : 'now']),
      action: { kind: 'generate-statutory', label: `Generate the rest · ${p.statTotal - p.statGenerated} PVs` },
    }
  }
  return {
    word: 'Month closed',
    detail: `Salaries paid ${shortDate(p.salaryPayDate)} · statutory paid ${shortDate(p.lastStatPaid)} · the HR pool is HR's own money again.`,
    tone: 'ledger',
    due: { label: 'Closed', date: p.lastStatPaid, days: null },
    segments: seg(['done', 'done', 'done', 'done']),
    action: { kind: 'none', label: '' },
  }
}

function fmtMoney(x: number): string {
  return x.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Due dates (Personio's card) ──────────────────────────────────────────────

export type MilestoneState = 'done' | 'next' | 'upcoming' | 'late' | 'none'

export interface Milestone {
  key: string
  date: string | null
  label: string
  state: MilestoneState
}

/**
 * The month's dated milestones in order: submitted, funded, the two pay
 * dates, then the statutory bodies grouped by due date (KWSP rolls a weekend
 * forward while the others roll back, so two chips can appear). The first
 * item not yet done is `next`; a date that has passed undone is `late`.
 */
export function milestones(i: HeadlineInput): Milestone[] {
  const { cycle, today } = i
  const run = cycle.run
  const fs = cycle.funding.staff
  const fd = cycle.funding.directors
  const staff = i.groups.filter((g) => g.scope === 'staff' && g.headcount > 0)
  const dirs = i.groups.filter((g) => g.scope === 'directors' && g.headcount > 0)
  const out: Milestone[] = []
  const push = (key: string, label: string, date: string | null, done: boolean, applicable = true) => {
    let state: MilestoneState = done ? 'done' : 'upcoming'
    if (!applicable) state = 'none'
    else if (!done && date && date < today) state = 'late'
    out.push({ key, label, date, state })
  }

  push('submitted', 'Payroll submitted', run?.submitted_at?.slice(0, 10) ?? null, !!run)
  push('funded-staff', 'Staff funded by Finance', fs?.status === 'completed' ? (fs.pv_date ?? null) : null, fs?.status === 'completed')
  if (dirs.length) push('funded-dirs', 'Directors funded', fd?.status === 'completed' ? (fd.pv_date ?? null) : null, fd?.status === 'completed')
  if (staff.length) {
    const date = staff.find((g) => g.vouchers[0]?.payment_date)?.vouchers[0]?.payment_date ?? i.plannedStaffDate
    push('pay-staff', 'Staff pay date', date, staff.every((g) => g.stage === 'paid'))
  }
  if (dirs.length) {
    const date = dirs[0].vouchers[0]?.payment_date ?? i.plannedDirectorDate
    push('pay-dirs', 'Directors pay date', date, dirs.every((g) => g.stage === 'paid'))
  }
  const byDue = new Map<string, StatutoryRow[]>()
  for (const r of i.rows.filter((r) => r.total > 0)) {
    const list = byDue.get(r.due) ?? []
    list.push(r)
    byDue.set(r.due, list)
  }
  for (const [due, rs] of Array.from(byDue.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const bodies = Array.from(new Set(rs.map((r) => r.body)))
    push(`stat-${due}`, bodies.join(' · '), due, rs.every((r) => r.stage === 'paid'))
  }
  const next = out.find((m) => m.state === 'upcoming')
  if (next) next.state = 'next'
  return out
}

// ── Pay variances (Personio's list, Rippling's compare) ──────────────────────

export interface Variance {
  row_id: string
  name: string
  dept: string
  /** The board key of their group, so a row can open the right window. */
  key: string
  prev: number
  now: number
  d: Delta
}

export interface VarianceSummary {
  /** The biggest moves, largest first. */
  top: Variance[]
  /** People whose net moved at all. */
  changed: number
  /** People who were paid last month too. */
  compared: number
  /** People with no figure last month. */
  joiners: number
  /** Moves a reviewer should look at (≥ 20% and ≥ RM 50). */
  notable: number
}

export function payVariances(people: CyclePerson[], limit = 6): VarianceSummary {
  const paid = people.filter((p) => p.net > 0)
  const compared = paid.filter((p) => p.prev_net != null)
  const all: Variance[] = compared
    .map((p) => ({
      row_id: p.row_id,
      name: p.name,
      dept: p.scope === 'directors' ? 'Directors' : p.dept_name,
      key: p.scope === 'directors' ? 'directors' : (p.dept_id ?? `name:${p.dept_name}`),
      prev: p.prev_net as number,
      now: p.net,
      d: delta(p.net, p.prev_net) as Delta,
    }))
    .filter((v) => v.d.dir !== 'flat')
    .sort((a, b) => Math.abs(b.d.abs) - Math.abs(a.d.abs))
  return {
    top: all.slice(0, limit),
    changed: all.length,
    compared: compared.length,
    joiners: paid.length - compared.length,
    notable: all.filter((v) => isNotableMove(v.d)).length,
  }
}

// ── The month rail (BambooHR's pay-date rail) ────────────────────────────────

export type RailState = 'none' | 'drafts' | 'submitted' | 'funded' | 'closed'

export interface RailMonth {
  period: string
  /** "Aug" */
  mon: string
  year: number
  state: RailState
  current: boolean
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * The months either side of the one on screen, each with how far its cycle
 * got: no run → none; draft → drafts; approved → submitted; funded (the
 * run's staff funding request completed, or the run itself marked paid) →
 * funded; funded with every statutory PV of the run paid (and at least the
 * five bodies) → closed. Runs, funding requests and statutory vouchers come
 * from three plain selects on the page.
 */
export function monthRail(
  period: string,
  runs: Array<{ id: string; period_month: string; status: string }>,
  statutory: Array<{ reference_id: string; status: string }>,
  funding: Array<{ payroll_run_id: string; status: string }> = [],
  before = 4,
  after = 1,
): RailMonth[] {
  const [y, m] = period.split('-').map(Number)
  const out: RailMonth[] = []
  for (let k = -before; k <= after; k++) {
    const d = new Date(Date.UTC(y, m - 1 + k, 1))
    const p = d.toISOString().slice(0, 10)
    const run = runs.find((r) => r.period_month.slice(0, 10) === p && r.status !== 'rejected')
    let state: RailState = 'none'
    if (run) {
      const funded = run.status === 'paid' || funding.some((f) => f.payroll_run_id === run.id && f.status === 'completed')
      if (funded) {
        const vs = statutory.filter((v) => v.reference_id === run.id && v.status !== 'voided')
        const allPaid = vs.length >= 5 && vs.every((v) => v.status === 'paid' || v.status === 'approved')
        state = allPaid ? 'closed' : 'funded'
      } else if (run.status === 'approved') state = 'submitted'
      else state = 'drafts'
    }
    out.push({ period: p, mon: MONTHS[d.getUTCMonth()], year: d.getUTCFullYear(), state, current: p === period })
  }
  return out
}
