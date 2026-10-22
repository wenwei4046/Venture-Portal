// The Finance phone app's Approvals (2026-10-15, part 5 — a page the design
// does not draw, made in the app's own style, as the user asked for every
// Finance page): the queue as a hub — what waits in total, the oldest wait in
// a word, a stacked card per list (Pending, Submitted by the executive,
// Decided · 30 days) — its requests as the app's list rows, a combined
// approval's members, and one request as a record with the desktop page's
// facts. Every figure is the desktop's (`approvals/_lib/queue-read`,
// `_lib/request-read`, `lib/approval-queue`); this only shapes them. Pure.

import type { CardTone, HubCardItem } from '@/components/finv/Hub'
import type { HrIconName } from '@/components/hrv/icons'
import { officeTime } from '@/lib/office-time'
import { requestTypeLabel, splitVoucherTitle, type ApprovalRequestRow, type QueueMember, type QueueRow, type QueueSummary } from '@/lib/approval-queue'
import { formatPoolLabel, formatSourcesLabel, type VoucherDetailContext } from '@/lib/voucher-detail'
import { voucherUpstreamHref, voucherUpstreamLabel } from '@/lib/voucher-upstream-href'

export type ApprovalCardKey = 'pending' | 'exec' | 'decided'

/** A record of its own in the app: a voucher, a loan, a fund source. */
export interface AppRecordRef {
  hub: 'payments' | 'fund-out' | 'fund-in'
  id: string
}

export interface ApprovalMember {
  id: string
  label: string
  /** "HV-PV-202610-0475 · Payment voucher". */
  sub: string
  amount: number | null
  isVoucher: boolean
  open: AppRecordRef | null
  /** A decided combined approval's member: how it went. */
  decision: 'approved' | 'rejected' | null
}

export interface ApprovalRow {
  /** The request's id, or `g:<group>` for a combined approval — the queue's selection key. */
  key: string
  kind: 'single' | 'group'
  id: string | null
  groupId: string | null
  title: string
  /** "Payment voucher · Carrie · 14 Oct" — no number (the phone lists' rule). */
  desc: string
  amount: number
  hasAmount: boolean
  /** The requests it holds — a combined approval its members. */
  items: number
  /** Why this reader may not decide it; null = theirs to decide. */
  why: string | null
  executive: boolean
  /** A payment voucher among them — approving may let a department pool overdraw. */
  hasVoucher: boolean
  /** A combined approval of vouchers only: each may be approved or rejected on its own. */
  splittable: boolean
  members: ApprovalMember[]
  decision: 'approved' | 'rejected' | null
  types: string[]
  /** The record's number, where it has one (a voucher's). */
  no: string | null
  /** Who sent it, and when it was sent (pending) or decided (decided) — `D MMM`. */
  sentBy: string
  on: string
}

export interface ApprovalHubModel {
  hero: { value: string; label: string; chip: { text: string; tone: 'alert' | 'def' } | null }
  cards: HubCardItem[]
  pending: ApprovalRow[]
  decided: ApprovalRow[]
  /** The decisions the decided list holds, members counted (the desktop card's figure). */
  decidedCount: number
}

const r2 = (n: number) => Math.round(n * 100) / 100
const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const rm = (n: number) => `RM ${f2(n)}`
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const day = (iso: string) => officeTime(iso).format('D MMM')
/** A row's kind, said only when it is not the queue's everyday payment voucher (most rows are). */
const kindOf = (label: string) => (/^Payment voucher( × \d+)?$/.test(label) ? null : label)
const stamp = (iso: string) => officeTime(iso).format('DD MMM YYYY · HH:mm')

/** "today", "1 day", "5 days" — the desktop's Oldest waiting. */
export function waitLabel(days: number): string {
  if (days <= 0) return 'today'
  return days === 1 ? '1 day' : `${days} days`
}

/** Where a request's record opens in the app, by the table it names. */
export function recordOf(table: string | null, id: string | null): AppRecordRef | null {
  if (!id) return null
  if (table === 'payment_vouchers') return { hub: 'payments', id }
  if (table === 'loans') return { hub: 'fund-out', id }
  if (table === 'fund_sources') return { hub: 'fund-in', id }
  return null
}

function memberOf(m: QueueMember, decision: ApprovalMember['decision'] = null): ApprovalMember {
  const voucher = m.request_type === 'payment_voucher'
  return {
    id: m.id,
    // "SIA JONAS — RM 3,550.97": the amount stands at the line's end already.
    label: (m.amount !== null ? m.description.replace(/\s+—\s+RM\s?[\d,]+(?:\.\d{1,2})?$/, '') : m.description) || m.typeLabel,
    sub: voucher ? (m.voucherNo ?? 'Draft') : [m.voucherNo, m.typeLabel].filter(Boolean).join(' · '),
    amount: m.amount,
    isVoucher: m.request_type === 'payment_voucher',
    open: recordOf(m.reference_table, m.reference_id),
    decision,
  }
}

const card = (key: ApprovalCardKey, tone: CardTone, icon: HrIconName, label: string, sub: string, value: string): HubCardItem => ({ key, tone, icon, label, sub, value })

/** The queue's rows as the app lists them: who may decide each, and whether the executive sent it. */
export function pendingRows(queue: QueueRow[], undecidable: Record<string, string>, executives: ReadonlySet<string>): ApprovalRow[] {
  return queue.map((r) => {
    const vouchers = r.members.filter((m) => m.request_type === 'payment_voucher')
    return {
      key: r.key,
      kind: r.kind,
      id: r.id,
      groupId: r.groupId,
      title: r.kind === 'group' ? groupTitle(r.members) : r.description || r.typeLabel,
      desc: [r.kind === 'group' ? `Combined · ${r.members.length}` : null, kindOf(r.typeLabel), r.submitterName, day(r.submittedAt)].filter(Boolean).join(' · '),
      amount: r.amount,
      hasAmount: r.hasAmount,
      items: 1,
      why: undecidable[r.key] ?? null,
      executive: executives.has(r.submitterId),
      hasVoucher: vouchers.length > 0,
      // A loan riding along cannot be split from its disbursement (approve_voucher_batch_partial refuses it).
      splittable: r.kind === 'group' && vouchers.length === r.members.length,
      members: r.members.map((m) => memberOf(m)),
      decision: null,
      types: r.requestTypes,
      no: r.voucherNo,
      sentBy: r.submitterName,
      on: day(r.submittedAt),
    }
  })
}

/**
 * The last 30 days' decisions as the app lists them: a combined approval folded into one row (its members
 * counted, as Payments' folded batches are), newest first; each at its live amount.
 */
export function decidedRows(rows: ApprovalRequestRow[], opts: { amountOf: (r: ApprovalRequestRow) => number | null; nameOf: (id: string) => string }): ApprovalRow[] {
  const out: ApprovalRow[] = []
  const groups = new Map<string, ApprovalRequestRow[]>()
  const order: Array<{ row: ApprovalRequestRow } | { group: string }> = []
  for (const r of rows) {
    if (!r.group_id) {
      order.push({ row: r })
      continue
    }
    if (!groups.has(r.group_id)) {
      groups.set(r.group_id, [])
      order.push({ group: r.group_id })
    }
    groups.get(r.group_id)!.push(r)
  }
  const member = (r: ApprovalRequestRow): QueueMember => {
    const { voucherNo, text } = splitVoucherTitle(r.description)
    return {
      id: r.id,
      request_type: r.request_type,
      typeLabel: requestTypeLabel(r.request_type),
      voucherNo,
      description: text,
      amount: opts.amountOf(r),
      reference_id: r.reference_id,
      reference_table: r.reference_table,
    }
  }
  const decisionOf = (status: string): 'approved' | 'rejected' => (status === 'approved' ? 'approved' : 'rejected')
  for (const o of order) {
    if ('row' in o) {
      const r = o.row
      const m = member(r)
      const d = decisionOf(r.status)
      out.push({
        key: r.id,
        kind: 'single',
        id: r.id,
        groupId: null,
        title: m.description || m.typeLabel,
        desc: [d === 'approved' ? 'Approved' : 'Rejected', kindOf(m.typeLabel), opts.nameOf(r.submitted_by), r.approved_at ? day(r.approved_at) : null].filter(Boolean).join(' · '),
        amount: m.amount ?? 0,
        hasAmount: m.amount !== null,
        items: 1,
        why: null,
        executive: false,
        hasVoucher: r.request_type === 'payment_voucher',
        splittable: false,
        members: [memberOf(m, d)],
        decision: d,
        types: [r.request_type],
        no: m.voucherNo,
        sentBy: opts.nameOf(r.submitted_by),
        on: r.approved_at ? day(r.approved_at) : '',
      })
      continue
    }
    // In the order they were raised — a batch's voucher numbers in a row (the read is newest decision first).
    const list = [...groups.get(o.group)!].sort((a, b) => a.created_at.localeCompare(b.created_at) || (a.description ?? '').localeCompare(b.description ?? ''))
    const members = list.map(member)
    const vouchers = members.filter((m) => m.request_type === 'payment_voucher')
    const lead = vouchers[0] ?? members[0]
    // Cash out is the vouchers (a loan's disbursement is the same money as the loan), as the queue counts it.
    const counted = vouchers.length > 0 ? vouchers : members
    const approved = list.filter((r) => r.status === 'approved').length
    const d = approved === list.length ? 'approved' : approved === 0 ? 'rejected' : null
    const latest = list.reduce((max, r) => ((r.approved_at ?? '') > max ? (r.approved_at ?? '') : max), '')
    out.push({
      key: `g:${o.group}`,
      kind: 'group',
      id: null,
      groupId: o.group,
      title: groupTitle(members),
      desc: [
        `Combined · ${members.length}`,
        d === 'approved' ? 'Approved' : d === 'rejected' ? 'Rejected' : `${approved} approved · ${list.length - approved} rejected`,
        opts.nameOf(list[0].submitted_by),
        latest ? day(latest) : null,
      ]
        .filter(Boolean)
        .join(' · '),
      amount: r2(counted.reduce((s, m) => s + (m.amount ?? 0), 0)),
      hasAmount: members.some((m) => m.amount !== null),
      items: members.length,
      why: null,
      executive: false,
      hasVoucher: vouchers.length > 0,
      splittable: false,
      members: members.map((m, i) => memberOf(m, decisionOf(list[i].status))),
      decision: d,
      types: [...new Set(members.map((m) => m.request_type))],
      no: lead.voucherNo,
      sentBy: opts.nameOf(list[0].submitted_by),
      on: latest ? day(latest) : '',
    })
  }
  return out
}

/**
 * A combined approval's name: "Payroll disbursement Sep 2026 — Aina" and "… — Bala" are headed by the part
 * before the dash; vouchers that share none — a payroll batch made one voucher a person, "SIA JONAS — RM
 * 3,550.97" — go by the first and how many more ("SIA JONAS + 11 more", as the desktop panel names payees);
 * a loan's disbursement by its own words.
 */
export function groupTitle(members: Array<{ request_type: string; description: string; typeLabel: string }>): string {
  const vouchers = members.filter((m) => m.request_type === 'payment_voucher')
  const lead = vouchers[0] ?? members[0]
  if (!lead) return 'Combined request'
  if (vouchers.length !== members.length || members.length === 1) return lead.description || lead.typeLabel
  const first = lead.description
  const head = first.split(' — ')[0].trim()
  if (head && members.every((m) => m.description === head || m.description.startsWith(`${head} — `))) return head
  return `${head || lead.typeLabel} + ${members.length - 1} more`
}

/** The hub: the pending total over its three cards — each card counts and sums exactly what its list holds. */
export function approvalHubModel(args: {
  queue: QueueRow[]
  summary: QueueSummary
  undecidable: Record<string, string>
  executives: readonly string[]
  decided: ApprovalRow[]
}): ApprovalHubModel {
  const execs = new Set(args.executives)
  const pending = pendingRows(args.queue, args.undecidable, execs)
  const exec = pending.filter((r) => r.executive)
  const execTotal = r2(exec.reduce((s, r) => s + r.amount, 0))
  const decidedCount = args.decided.reduce((n, r) => n + r.items, 0)
  const approved = args.decided.reduce((n, r) => n + r.members.filter((m) => m.decision === 'approved').length, 0)
  const { summary } = args
  const oldest = summary.oldest
  return {
    hero: {
      value: rm(summary.total),
      label: 'Pending · to approve',
      chip: oldest ? { text: `Oldest waiting · ${waitLabel(oldest.days)}`, tone: oldest.days >= 3 ? 'alert' : 'def' } : null,
    },
    cards: [
      card('pending', 'pending_approval', 'calendar', 'Pending', `${plural(summary.items, 'item', 'items')}${summary.combined > 0 ? ` · ${summary.combined} combined` : ''}`, rm(summary.total)),
      card('exec', 'draft', 'staff', 'Submitted by the executive', `${exec.length} of the ${summary.items}`, rm(execTotal)),
      card('decided', 'paid', 'approve', 'Decided · 30 days', `${approved} approved · ${decidedCount - approved} rejected`, String(decidedCount)),
    ],
    pending,
    decided: args.decided,
    decidedCount,
  }
}

// ── One request ─────────────────────────────────────────────────────────────

export interface ApprovalRecordModel {
  id: string
  status: string
  type: string
  typeLabel: string
  title: string
  no: string | null
  amount: number | null
  submittedBy: string
  submittedAt: string
  decidedAt: string | null
  notes: string | null
  /** May this reader decide it (while it waits)? Why not, when not. */
  may: boolean
  why: string | null
  groupId: string | null
  loan: {
    borrower: string
    principal: number
    rate: string
    rateSub: string
    monthlyInterest: number
    open: AppRecordRef
  } | null
  voucher: {
    id: string
    no: string | null
    credit: boolean
    amount: number
    payee: string
    payeeCompany: string | null
    bank: { name: string; number: string; balance: number } | null
    /** The bank holds less than the voucher pays: not approvable (the desktop's pre-check). */
    short: boolean
    pool: string | null
    description: string
    sources: Array<{ pool: string; account: string | null; amount: number }>
    files: Array<{ id: string; name: string; size: number | null }>
    /** What raised it, where it has a page: in the app (a loan, a fund source) or the portal's (a payroll run) — and its portal page, for the computer's drawer. */
    upstream: { label: string; href: string; portalHref: string } | null
  } | null
  /** Any other request's own record in the app (a fund source's, a loan's cancellation). */
  open: AppRecordRef | null
}

/** A record's own page on the computer (2026-10-17, the desktop Approvals drawer): a voucher's, a loan's, a fund source's. */
export function portalHrefOf(r: AppRecordRef): string {
  const base = r.hub === 'payments' ? '/payments' : r.hub === 'fund-out' ? '/fund-out' : '/fund-in'
  return `${base}/${encodeURIComponent(r.id)}`
}

/**
 * Where a request leads on the computer, each to a page of its own (2026-10-17 — the Approvals drawer's ⋯ and the
 * request's full page): the voucher, what raised it, the loan, the fund source.
 */
export function recordLinks(r: Pick<ApprovalRecordModel, 'voucher' | 'loan' | 'open'>): Array<{ key: string; label: string; href: string }> {
  return [
    ...(r.voucher ? [{ key: 'voucher', label: 'Open the voucher', href: `/payments/${r.voucher.id}` }] : []),
    ...(r.voucher?.upstream ? [{ key: 'upstream', label: `Open the ${r.voucher.upstream.label.toLowerCase()}`, href: r.voucher.upstream.portalHref }] : []),
    ...(r.loan ? [{ key: 'loan', label: 'Open the loan', href: portalHrefOf(r.loan.open) }] : []),
    ...(r.open ? [{ key: 'open', label: r.open.hub === 'fund-in' ? 'Open the fund source' : r.open.hub === 'fund-out' ? 'Open the loan' : 'Open the voucher', href: portalHrefOf(r.open) }] : []),
  ]
}

/** A portal page's address, in the app where it has a screen. */
export function inApp(href: string): string {
  const m = /^\/(fund-out|fund-in)\/([^/?#]+)$/.exec(href)
  if (m) return `/fin-app/fund/${m[1] === 'fund-out' ? 'out' : 'in'}?id=${encodeURIComponent(m[2])}`
  return href
}

export function approvalRecordModel(read: {
  approval: {
    id: string
    status: string
    request_type: string
    description: string | null
    submitted_by: string
    created_at: string
    approved_at: string | null
    notes: string | null
    reference_id: string | null
    group_id: string | null
    amount: number | string | null
    reference_table?: unknown
  }
  submitterName: string | null
  verdict: { may: true } | { may: false; why: string }
  loanContext: { company_name?: string; principal?: number; effective_rate?: number; base_rate?: number; risk_premium?: number; loan_id: string } | null
  voucherContext: VoucherDetailContext | null
  insufficientBalance: boolean
}): ApprovalRecordModel {
  const a = read.approval
  const { voucherNo, text } = splitVoucherTitle(a.description)
  const vc = read.voucherContext
  const loan = read.loanContext
  const pct = (n: number | undefined) => ((n ?? 0) * 100).toFixed(3)
  const upstreamHref = vc ? voucherUpstreamHref(vc.voucher.reference_type, vc.voucher.reference_id) : null
  const table = typeof a.reference_table === 'string' ? a.reference_table : null
  return {
    id: a.id,
    status: a.status,
    type: a.request_type,
    typeLabel: requestTypeLabel(a.request_type),
    title: text || requestTypeLabel(a.request_type),
    no: vc?.voucher.voucher_no ?? voucherNo,
    amount: vc ? Number(vc.voucher.amount) : loan ? (loan.principal ?? 0) : a.amount === null ? null : Number(a.amount),
    submittedBy: read.submitterName ?? 'Unknown',
    submittedAt: stamp(a.created_at),
    decidedAt: a.approved_at ? stamp(a.approved_at) : null,
    notes: a.notes,
    may: read.verdict.may,
    why: read.verdict.may ? null : read.verdict.why,
    groupId: a.group_id,
    loan: loan
      ? {
          borrower: loan.company_name ?? '—',
          principal: loan.principal ?? 0,
          rate: `${pct(loan.effective_rate)} % /mo`,
          rateSub: `${pct(loan.base_rate)}% base + ${pct(loan.risk_premium)}% custom`,
          monthlyInterest: r2((loan.principal ?? 0) * (loan.effective_rate ?? 0)),
          open: { hub: 'fund-out', id: loan.loan_id },
        }
      : null,
    voucher: vc
      ? {
          id: vc.voucher.id,
          no: vc.voucher.voucher_no,
          credit: vc.voucher.direction === 'credit',
          amount: Number(vc.voucher.amount),
          payee: vc.voucher.payee_name,
          payeeCompany: vc.payeeCompany ? `${vc.payeeCompany.name} (${vc.payeeCompany.short_code})` : null,
          bank: vc.bank ? { name: vc.bank.bank_name, number: vc.bank.account_number, balance: vc.bank.current_balance } : null,
          short: read.insufficientBalance,
          pool: vc.voucher.direction === 'credit' ? formatPoolLabel(vc.voucher.target_pool) : formatSourcesLabel(vc.sources, vc.voucher.source_pool),
          description: vc.voucher.description,
          // A line's own words (2026-10-22) before its account, as the voucher's drawer says it.
          sources: vc.sources.map((s) => ({ pool: formatPoolLabel(s.pool) ?? s.pool, account: s.description ? [s.description, s.account_label].filter(Boolean).join(' · ') : s.account_label, amount: Number(s.amount) })),
          files: vc.attachments.map((f) => ({ id: f.id, name: f.file_name, size: f.file_size })),
          upstream: upstreamHref ? { label: voucherUpstreamLabel(vc.voucher.reference_type) ?? 'Upstream record', href: inApp(upstreamHref), portalHref: upstreamHref } : null,
        }
      : null,
    open: vc || loan ? null : recordOf(table, a.reference_id),
  }
}
