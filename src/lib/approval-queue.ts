// The Approvals queue as rows of a table (2026-10-07).
//
// The page used to draw each pending request as a card and a combined
// approval (a loan and its disbursement voucher, or a payroll batch) as a
// bigger card. The user approved the queue as one table — "英文 排队用表格不错，
// 但把 description 和 pv no 分开" — so a request's description, which is written
// as "HV-PV-202610-0449: Loan Repayment - 5rd Installment", is split here into
// its voucher number and its text, and a group becomes ONE row that carries
// its members (the sample: "Combined · 2", opened to see the loan).
//
// Pure: the page reads the rows and hands them to the client table.

import { officeTime } from '@/lib/office-time'

export interface ApprovalRequestRow {
  id: string
  request_type: string
  description: string | null
  amount: number | string | null
  reference_id: string | null
  reference_table: string | null
  submitted_by: string
  group_id: string | null
  created_at: string
  approved_at: string | null
  status: string
}

export interface QueueMember {
  id: string
  request_type: string
  typeLabel: string
  voucherNo: string | null
  description: string
  amount: number | null
  reference_id: string | null
  reference_table: string | null
}

export interface QueueRow {
  /** The selection key: the request id, or `g:<group_id>` for a combined approval. */
  key: string
  kind: 'single' | 'group'
  id: string | null
  groupId: string | null
  /** The lead voucher's number. */
  voucherNo: string | null
  /** The phone's small print under the description: the number, then what
   *  else the group holds ("HV-PV-202610-0475 + New loan"). */
  voucherLine: string
  description: string
  /** What the lead is approved together with — the loan behind a disbursement. */
  companions: string[]
  typeLabel: string
  requestTypes: string[]
  submitterId: string
  /** Everybody who raised a request in the row — who may not decide it (lib/approval-domains.ts). */
  submitterIds: string[]
  submitterName: string
  submittedAt: string
  /** What approving the row moves. A group's loan and its disbursement
   *  voucher are the same money, so only the vouchers count when there are any. */
  amount: number
  hasAmount: boolean
  members: QueueMember[]
  /** The payment vouchers behind the row — what pool / category are looked up by. */
  voucherIds: string[]
  /** A single request's own page; a group opens its details instead. */
  href: string | null
}

interface Options {
  amountOf: (row: ApprovalRequestRow) => number | null
  nameOf: (userId: string) => string
}

const VOUCHER_PREFIX = /^(HV-(?:PV|OR)-\d{6}-\d{4}):\s*/

/** "HV-PV-202610-0449: Loan Repayment" → the number and the text, apart. A
 *  description written over several lines reads as one. */
export function splitVoucherTitle(description: string | null): { voucherNo: string | null; text: string } {
  const raw = description ?? ''
  const m = raw.match(VOUCHER_PREFIX)
  const rest = m ? raw.slice(m[0].length) : raw
  const text = rest
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' · ')
  return { voucherNo: m ? m[1] : null, text }
}

const TYPE_LABELS: Record<string, string> = {
  payment_voucher: 'Payment voucher',
  new_loan: 'New loan',
  base_rate: 'Base rate',
  tier_change: 'Tier change',
  escalation: 'Escalation',
  new_contract: 'New contract',
  contract_change: 'Contract change',
  dept_expense: 'Dept expense',
  advance: 'Advance',
  invoice_pool_release: 'Invoice pool release',
  profit_withdrawal: 'Profit withdrawal',
  new_fund_source: 'New fund source',
  dept_payment_request: 'Dept request payment',
  loan_cancel: 'Loan cancel',
  terms_change: 'Terms change',
  hr_costing: 'HR costing',
  payroll_run: 'Payroll run',
}

export function requestTypeLabel(type: string): string {
  if (TYPE_LABELS[type]) return TYPE_LABELS[type]
  const words = type.replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Cash out of a group = its payment vouchers (a Loan OUT combo's new_loan
 *  duplicates its disbursement voucher). A group with no voucher sums every member. */
export function groupCashTotal(members: Array<{ request_type: string; amount: number | null }>): number {
  const vouchers = members.filter((m) => m.request_type === 'payment_voucher')
  const counted = vouchers.length > 0 ? vouchers : members
  return round2(counted.reduce((s, m) => s + (m.amount ?? 0), 0))
}

const round2 = (n: number) => Math.round(n * 100) / 100

function member(row: ApprovalRequestRow, opts: Options): QueueMember {
  const { voucherNo, text } = splitVoucherTitle(row.description)
  return {
    id: row.id,
    request_type: row.request_type,
    typeLabel: requestTypeLabel(row.request_type),
    voucherNo,
    description: text,
    amount: opts.amountOf(row),
    reference_id: row.reference_id,
    reference_table: row.reference_table,
  }
}

/** What a batch's descriptions share: "Payroll disbursement Sep 2026 — Aina"
 *  and "… — Bala" are headed by the part before the dash, if every member has it. */
function sharedLead(descriptions: string[]): string {
  const first = descriptions[0] ?? ''
  const head = first.split(' — ')[0].trim()
  if (head && descriptions.length > 1 && descriptions.every((d) => d === head || d.startsWith(`${head} — `))) return head
  return first
}

export function buildQueueRows(pending: ApprovalRequestRow[], opts: Options): QueueRow[] {
  const rows: QueueRow[] = []
  const groups = new Map<string, ApprovalRequestRow[]>()
  const order: Array<{ kind: 'single'; row: ApprovalRequestRow } | { kind: 'group'; groupId: string }> = []
  for (const row of pending) {
    if (!row.group_id) {
      order.push({ kind: 'single', row })
      continue
    }
    if (!groups.has(row.group_id)) {
      groups.set(row.group_id, [])
      order.push({ kind: 'group', groupId: row.group_id })
    }
    groups.get(row.group_id)!.push(row)
  }

  for (const entry of order) {
    if (entry.kind === 'single') {
      const row = entry.row
      const m = member(row, opts)
      rows.push({
        key: row.id,
        kind: 'single',
        id: row.id,
        groupId: null,
        voucherNo: m.voucherNo,
        voucherLine: m.voucherNo ?? '',
        description: m.description,
        companions: [],
        typeLabel: m.typeLabel,
        requestTypes: [row.request_type],
        submitterId: row.submitted_by,
        submitterIds: [row.submitted_by],
        submitterName: opts.nameOf(row.submitted_by),
        submittedAt: row.created_at,
        amount: m.amount ?? 0,
        hasAmount: m.amount !== null,
        members: [m],
        voucherIds: row.request_type === 'payment_voucher' && row.reference_id ? [row.reference_id] : [],
        href: `/approvals/${row.id}`,
      })
      continue
    }

    const members = groups.get(entry.groupId)!.map((r) => member(r, opts))
    const vouchers = members.filter((m) => m.request_type === 'payment_voucher')
    const others = members.filter((m) => m.request_type !== 'payment_voucher')
    const lead = vouchers[0] ?? members[0]
    const allVouchers = others.length === 0
    const types = [...new Set(members.map((m) => m.request_type))]
    const typeLabel = allVouchers
      ? members.length > 1
        ? `Payment voucher × ${members.length}`
        : 'Payment voucher'
      : [...others.map((m) => m.typeLabel).filter((l, i, a) => a.indexOf(l) === i), ...(vouchers.length > 0 ? ['PV'] : [])].join(' + ')
    const tail = allVouchers
      ? members.length > 1
        ? ` + ${members.length - 1} more`
        : ''
      : ` + ${others.map((m) => m.typeLabel).filter((l, i, a) => a.indexOf(l) === i).join(' + ')}`
    const first = groups.get(entry.groupId)!
    const submittedAt = first.reduce((min, r) => (r.created_at < min ? r.created_at : min), first[0].created_at)
    rows.push({
      key: `g:${entry.groupId}`,
      kind: 'group',
      id: null,
      groupId: entry.groupId,
      voucherNo: lead.voucherNo,
      voucherLine: lead.voucherNo ? `${lead.voucherNo}${tail}` : '',
      description: allVouchers ? sharedLead(members.map((m) => m.description)) : lead.description,
      companions: others.map((m) => m.description).filter(Boolean),
      typeLabel,
      requestTypes: types,
      submitterId: first[0].submitted_by,
      submitterIds: [...new Set(first.map((r) => r.submitted_by))],
      submitterName: opts.nameOf(first[0].submitted_by),
      submittedAt,
      amount: groupCashTotal(members),
      hasAmount: members.some((m) => m.amount !== null),
      members,
      voucherIds: vouchers.map((m) => m.reference_id).filter((id): id is string => !!id),
      href: null,
    })
  }
  return rows
}

export interface QueueSummary {
  total: number
  items: number
  combined: number
  oldest: { days: number; row: QueueRow } | null
  /** What the given submitters sent — the executive's share of the queue. */
  bySubmitters: { amount: number; count: number; names: string[] }
}

/**
 * Whole days on the office's calendar from `from` to `to`. Counted from the
 * MACHINE's midnight, a request sent at 00:30 in the office (16:30 UTC the day
 * before) had waited a day longer on the server than it had in the office.
 */
const officeDaysBetween = (from: string | Date, to: Date) =>
  officeTime(to).startOf('day').diff(officeTime(from).startOf('day'), 'day')

export function queueSummary(rows: QueueRow[], now: Date, submitters: ReadonlySet<string> = new Set()): QueueSummary {
  let oldest: QueueRow | null = null
  for (const r of rows) if (!oldest || r.submittedAt < oldest.submittedAt) oldest = r
  const theirs = rows.filter((r) => submitters.has(r.submitterId))
  return {
    total: round2(rows.reduce((s, r) => s + r.amount, 0)),
    items: rows.length,
    combined: rows.filter((r) => r.kind === 'group').length,
    oldest: oldest
      ? { days: Math.max(0, officeDaysBetween(oldest.submittedAt, now)), row: oldest }
      : null,
    bySubmitters: {
      amount: round2(theirs.reduce((s, r) => s + r.amount, 0)),
      count: theirs.length,
      names: [...new Set(theirs.map((r) => r.submitterName))],
    },
  }
}

/**
 * Which login accounts are "the executive": the ones whose staff title sits at
 * a level HR calls Executive, or under it (Senior Executive counts; Assistant
 * and Internship sit below; a manager does not). The rank is HR's own
 * ordering of its title levels, so the line moves with it.
 */
export function executiveSubmitterIds(
  staff: Array<{ user_id: string | null; title_id: string | null }>,
  titles: Array<{ id: string; level_id: string | null }>,
  levels: Array<{ id: string; name: string; rank: number }>,
): Set<string> {
  const executiveRanks = levels.filter((l) => /executive/i.test(l.name)).map((l) => l.rank)
  if (executiveRanks.length === 0) return new Set()
  const ceiling = Math.max(...executiveRanks)
  const rankOfLevel = new Map(levels.map((l) => [l.id, l.rank]))
  const rankOfTitle = new Map(titles.map((t) => [t.id, t.level_id ? rankOfLevel.get(t.level_id) : undefined]))
  const ids = new Set<string>()
  for (const s of staff) {
    if (!s.user_id || !s.title_id) continue
    const rank = rankOfTitle.get(s.title_id)
    if (rank !== undefined && rank <= ceiling) ids.add(s.user_id)
  }
  return ids
}
