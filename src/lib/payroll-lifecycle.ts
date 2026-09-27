// The unified Payroll (2026-09-27): every person's pay on HR › Payroll moves
// draft → completed → submitted → paid, a few people at a time.
//
//   Staff are ticked and Completed on the grid. A salesperson completes when
//   they are closed on Comm Cal; a Director when Director Salary is Completed.
//   Submit to Finance sends everybody Completed since the last press as one
//   BATCH; a Resubmit (right-click) unlocks somebody already sent, whose
//   amounts may then only go up — the next batch carries the difference.
//   Total Close ends the month.
//
// The database enforces every rule (payroll_* functions, the lifecycle
// guard); this module decides what the page OFFERS and says, so it can be
// tested without Supabase.

import { round2 } from '@/lib/payroll-funding'

export type RowStatus = 'draft' | 'completed' | 'submitted' | 'paid'
export type RowScope = 'staff' | 'directors'
/** Where the row's pay is worked out — and therefore where it is Completed. */
export type RowOrigin = 'staff' | 'revenue' | 'director'
export type Tone = 'muted' | 'accent' | 'alert' | 'ledger' | 'danger'

export interface LifecycleRow {
  id: string
  scope: RowScope
  origin: RowOrigin
  status: RowStatus
  name: string
  dept: string
  /** gross + employer EPF / SOCSO / EIS, as the row stands. */
  ctc: number
  /** What the row's standing batches have already sent (0 before the first). */
  submittedCtc: number
  /** Numbers of the standing batches that carried it, oldest first. */
  batchNos: number[]
  completedAt: string | null
  /** Set while the row is unlocked for a Resubmit. */
  topupOpenedAt: string | null
  /** Revenue: when their standing Comm Cal close was made (null = still open there). */
  commCalClosedAt?: string | null
  /** Revenue: a draft row with statement links or a close cannot simply be deleted. */
  sourceLinked?: boolean
}

export interface StatusView {
  label: string
  /** The line under it / the tooltip: when, and what happens next. */
  detail: string
  tone: Tone
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "27 Sep" in Malaysia time, from a timestamp. */
export function dayLabel(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const my = new Date(d.getTime() + 8 * 60 * 60 * 1000)
  return `${my.getUTCDate()} ${MONTHS[my.getUTCMonth()]}`
}

/** "27 Sep 16:40" in Malaysia time. */
export function dayTimeLabel(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const my = new Date(d.getTime() + 8 * 60 * 60 * 1000)
  const hh = String(my.getUTCHours()).padStart(2, '0')
  const mm = String(my.getUTCMinutes()).padStart(2, '0')
  return `${my.getUTCDate()} ${MONTHS[my.getUTCMonth()]} ${hh}:${mm}`
}

export function isTopup(row: Pick<LifecycleRow, 'topupOpenedAt' | 'batchNos'>): boolean {
  return row.topupOpenedAt != null && row.batchNos.length > 0
}

/** What the Status column says about one person. */
export function rowStatusView(row: LifecycleRow): StatusView {
  const last = row.batchNos[row.batchNos.length - 1]
  const where = row.origin === 'revenue' ? 'Comm Cal' : row.origin === 'director' ? 'Director Salary' : null
  switch (row.status) {
    case 'paid':
      return { label: 'Paid', detail: last ? `Batch #${last} · every salary PV paid` : 'Every salary PV paid', tone: 'ledger' }
    case 'submitted':
      return {
        label: last ? `Submitted #${last}` : 'Submitted',
        detail: row.batchNos.length > 1
          ? `With Finance · batches ${row.batchNos.map(n => `#${n}`).join(', ')}`
          : 'With Finance',
        tone: 'alert',
      }
    case 'completed': {
      const when = dayLabel(row.completedAt)
      if (isTopup(row)) {
        return { label: 'Resubmit ready', detail: `Completed ${when} · the next batch sends the difference`, tone: 'accent' }
      }
      return {
        label: when ? `Completed ${when}` : 'Completed',
        detail: row.origin === 'revenue' ? `Closed on Comm Cal ${dayTimeLabel(row.completedAt)} · waiting to be submitted`
          : row.origin === 'director' ? `Completed on Director Salary ${dayTimeLabel(row.completedAt)} · waiting to be submitted`
          : `Completed ${dayTimeLabel(row.completedAt)} · waiting to be submitted`,
        tone: 'ledger',
      }
    }
    case 'draft':
    default:
      if (isTopup(row)) {
        return {
          label: 'Resubmit · editing',
          detail: where
            ? `Unlocked ${dayLabel(row.topupOpenedAt)} — change it on ${where}; amounts can only go up`
            : `Unlocked ${dayLabel(row.topupOpenedAt)} — amounts can only go up, then Complete`,
          tone: 'accent',
        }
      }
      if (row.origin === 'revenue') return { label: 'Open on Comm Cal', detail: 'Completes here when they are closed on Comm Cal', tone: 'muted' }
      if (row.origin === 'director') return { label: 'On Director Salary', detail: 'Completes here when Director Salary is Completed', tone: 'muted' }
      return { label: 'Draft', detail: 'Tick and Complete when the figures are checked', tone: 'muted' }
  }
}

export interface RowActions {
  complete: boolean
  unlock: boolean
  remove: boolean
  resubmit: boolean
  cancelResubmit: boolean
  /** Why the tick box is empty-handed, when it is. */
  hint: string | null
}

/** What can be done to a row from the Payroll page itself. */
export function rowActions(row: LifecycleRow, monthClosed: boolean): RowActions {
  const none: RowActions = { complete: false, unlock: false, remove: false, resubmit: false, cancelResubmit: false, hint: null }
  if (monthClosed) return { ...none, hint: 'This month is closed for good' }
  const here = row.origin === 'staff'
  const topup = isTopup(row)
  const actions: RowActions = {
    complete: here && row.status === 'draft',
    unlock: here && row.status === 'completed',
    remove: row.scope === 'staff' && row.status === 'draft' && !topup && !row.sourceLinked,
    resubmit: (row.status === 'submitted' || row.status === 'paid') && row.batchNos.length > 0,
    cancelResubmit: topup && (row.status === 'draft' || row.status === 'completed'),
    hint: null,
  }
  if (!actions.complete && !actions.unlock && !actions.remove) {
    actions.hint = row.status === 'submitted' || row.status === 'paid'
      ? 'Already with Finance — right-click to Resubmit'
      : row.origin === 'revenue' ? 'Completed from Comm Cal'
      : row.origin === 'director' ? 'Completed from Director Salary'
      : null
  }
  return actions
}

export interface DeptShare {
  dept: string
  people: number
  ctc: number
}

export interface SubmitPreview {
  people: number
  topups: number
  /** What the batch asks Finance to fund: CTC, the difference for a resubmit. */
  ctc: number
  byDept: DeptShare[]
}

/** The batch Submit to Finance would send now: everybody Completed. */
export function submitPreview(rows: LifecycleRow[]): SubmitPreview {
  const waiting = rows.filter(r => r.status === 'completed')
  const byDept = new Map<string, DeptShare>()
  let ctc = 0
  for (const r of waiting) {
    const ask = round2(r.ctc - r.submittedCtc)
    ctc = round2(ctc + ask)
    const d = byDept.get(r.dept) ?? { dept: r.dept, people: 0, ctc: 0 }
    d.people += 1
    d.ctc = round2(d.ctc + ask)
    byDept.set(r.dept, d)
  }
  return {
    people: waiting.length,
    topups: waiting.filter(r => r.batchNos.length > 0).length,
    ctc,
    byDept: [...byDept.values()].sort((a, b) => a.dept.localeCompare(b.dept)),
  }
}

export interface CloseReadiness {
  ready: boolean
  /** People not yet with Finance, by name. */
  waiting: string[]
  reason: string | null
}

/** Total Close needs every person submitted — nobody left in draft or completed. */
export function closeReadiness(rows: LifecycleRow[], monthClosed: boolean): CloseReadiness {
  if (monthClosed) return { ready: false, waiting: [], reason: 'Already closed' }
  if (rows.length === 0) return { ready: false, waiting: [], reason: 'No payroll this month' }
  const waiting = rows.filter(r => r.status !== 'submitted' && r.status !== 'paid').map(r => r.name)
  if (waiting.length > 0) {
    return {
      ready: false,
      waiting,
      reason: `${waiting.length} ${waiting.length === 1 ? 'person has' : 'people have'} not been submitted to Finance yet`,
    }
  }
  return { ready: true, waiting: [], reason: null }
}

export interface StatusCounts {
  draft: number
  completed: number
  submitted: number
  paid: number
  topups: number
}

export function statusCounts(rows: LifecycleRow[]): StatusCounts {
  const c: StatusCounts = { draft: 0, completed: 0, submitted: 0, paid: 0, topups: 0 }
  for (const r of rows) {
    c[r.status] += 1
    if (isTopup(r)) c.topups += 1
  }
  return c
}

// ── Batches ─────────────────────────────────────────────────────────────────

export interface BatchRequest {
  id: string
  status: string
  amount: number
  requestedAt: string | null
  cancelledAt: string | null
  cancellationReason: string | null
  paidAmount: number
  pvCount: number
}

export interface PayrollBatch {
  id: string
  no: number
  status: 'submitted' | 'sent_back'
  legacy: boolean
  submittedAt: string | null
  submittedBy: string | null
  people: number
  topups: number
  total: number
  departments: Array<{ name: string; people: number }>
  sentBackAt: string | null
  sentBackBy: string | null
  sentBackReason: string | null
  request: BatchRequest | null
}

export interface PayrollMonthStatus {
  closed: { at: string; by: string | null } | null
  batches: PayrollBatch[]
  directorLegacyRequest: { status: string; amount: number; requestedAt: string | null } | null
  directorSubmission: { submittedAt: string } | null
}

const num = (v: unknown): number => {
  const x = typeof v === 'string' ? Number(v) : (v as number)
  return Number.isFinite(x) ? x : 0
}

/** payroll_month_status(period) → typed. */
export function normaliseMonthStatus(raw: unknown): PayrollMonthStatus {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = (raw ?? {}) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const batches: PayrollBatch[] = ((r.batches ?? []) as any[]).map(b => ({
    id: String(b.id),
    no: num(b.no),
    status: b.status === 'sent_back' ? 'sent_back' : 'submitted',
    legacy: b.legacy === true,
    submittedAt: b.submitted_at ?? null,
    submittedBy: b.submitted_by ?? null,
    people: num(b.people),
    topups: num(b.topups),
    total: num(b.total),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    departments: Array.isArray(b.departments) ? b.departments.map((d: any) => ({ name: String(d.name ?? ''), people: num(d.people) })) : [],
    sentBackAt: b.sent_back_at ?? null,
    sentBackBy: b.sent_back_by ?? null,
    sentBackReason: b.sent_back_reason ?? null,
    request: b.request ? {
      id: String(b.request.id),
      status: String(b.request.status ?? ''),
      amount: num(b.request.amount),
      requestedAt: b.request.requested_at ?? null,
      cancelledAt: b.request.cancelled_at ?? null,
      cancellationReason: b.request.cancellation_reason ?? null,
      paidAmount: num(b.request.paid_amount),
      pvCount: num(b.request.pv_count),
    } : null,
  }))
  return {
    closed: r.closed ? { at: String(r.closed.at), by: r.closed.by ?? null } : null,
    batches,
    directorLegacyRequest: r.director_legacy_request
      ? { status: String(r.director_legacy_request.status), amount: num(r.director_legacy_request.amount), requestedAt: r.director_legacy_request.requested_at ?? null }
      : null,
    directorSubmission: r.director_submission ? { submittedAt: String(r.director_submission.submitted_at) } : null,
  }
}

export interface BatchFundingView {
  label: string
  detail: string
  tone: Tone
  /** HR may file the funding request again (the last one was cancelled). */
  canRefile: boolean
}

/** Where one batch's money stands — the approval state, beside the batch, never on the Submit button. */
export function batchFundingView(b: PayrollBatch): BatchFundingView {
  if (b.status === 'sent_back') {
    return {
      label: 'Sent back by Finance',
      detail: [dayLabel(b.sentBackAt), b.sentBackBy, b.sentBackReason].filter(Boolean).join(' · ') || 'Its people are Completed again — Submit them when ready',
      tone: 'danger',
      canRefile: false,
    }
  }
  if (b.total <= 0) return { label: 'Nothing to fund', detail: 'This batch carries no money', tone: 'ledger', canRefile: false }
  const q = b.request
  if (!q || q.status === 'cancelled') {
    return {
      label: 'No funding request',
      detail: q?.cancellationReason ? `Cancelled — ${q.cancellationReason}` : 'The request was cancelled — file it again',
      tone: 'danger',
      canRefile: true,
    }
  }
  if (q.status === 'submitted') return { label: 'Waiting for Finance', detail: `Requested ${dayLabel(q.requestedAt)} · Finance raises the funding PV next`, tone: 'alert', canRefile: false }
  if (q.status === 'pv_generated') {
    const part = q.paidAmount > 0 ? ` · RM ${fmt(q.paidAmount)} of ${fmt(q.amount)} funded` : ''
    return { label: 'Funding PV with Principal', detail: `${q.pvCount} PV${q.pvCount === 1 ? '' : 's'} raised${part}`, tone: 'alert', canRefile: false }
  }
  if (q.status === 'completed') return { label: 'Funded', detail: 'The HR pool holds it — pay on HR › Payment', tone: 'ledger', canRefile: false }
  return { label: q.status, detail: '', tone: 'muted', canRefile: false }
}

function fmt(x: number): string {
  return x.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** One line for the header: how many batches, and whether Finance has them all. */
export function batchesHeadline(batches: PayrollBatch[]): { text: string; tone: Tone } | null {
  const standing = batches.filter(b => b.status === 'submitted')
  if (standing.length === 0) return null
  const views = standing.map(batchFundingView)
  const funded = views.filter(v => v.label === 'Funded' || v.label === 'Nothing to fund').length
  const problem = views.some(v => v.tone === 'danger')
  const total = round2(standing.reduce((s, b) => s + b.total, 0))
  return {
    text: `${standing.length} batch${standing.length === 1 ? '' : 'es'} with Finance · RM ${fmt(total)} · ${funded} of ${standing.length} funded`,
    tone: problem ? 'danger' : funded === standing.length ? 'ledger' : 'alert',
  }
}
