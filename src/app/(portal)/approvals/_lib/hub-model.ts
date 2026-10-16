// The Approvals hub on the computer (2026-10-17 — the user, on the Principal's own view taking Finance's view: "make
// sure the approve tab is fullfill as well, cause usually i use that"). Drawn as Finance's hubs are — the total, a
// card per list, the table, a drawer — on the phone app's own model (`lib/fin-app/approval-model`: the cards, the
// rows, who may decide each, a combined approval's members), with what the computer's table has room for: who is
// paid, the request's kind, who sent it and when, the pool, the category, how it is paid and its files — the old
// queue table's columns. Pure.

import { requestTypeLabel, type ApprovalRequestRow, type QueueRow, type QueueSummary } from '@/lib/approval-queue'
import { approvalHubModel, decidedRows, type ApprovalHubModel, type ApprovalRow } from '@/lib/fin-app/approval-model'

export type ApprovalHubCard = 'pending' | 'exec' | 'decided'

/** A queue row as the desktop's queue reads it (`_lib/queue-read`): the row and its voucher's facts. */
export type QueueItem = QueueRow & { pool: string; category: string; payee: string; payBy: string; attachments: Array<{ id: string }> }

export interface HubRow extends ApprovalRow {
  /** Who is paid — "Landlord Sdn Bhd", "SIA JONAS + 11 more" — else the request's kind. */
  name: string
  /** "Payment voucher", "Payment voucher × 12", "New loan + PV". */
  type: string
  /** When it was sent (waiting) or decided — ISO, for the sort; null when unknown. */
  at: string | null
  pool: string
  category: string
  payBy: string
  files: number
}

export interface ApprovalHub extends Omit<ApprovalHubModel, 'pending' | 'decided'> {
  pending: HubRow[]
  decided: HubRow[]
}

/** A row's kind in words: a request's own, a combined approval's as the queue names it. */
export function typeOf(r: Pick<ApprovalRow, 'kind' | 'types' | 'members'>): string {
  if (r.kind === 'single') return requestTypeLabel(r.types[0] ?? '')
  const vouchers = r.members.filter((m) => m.isVoucher).length
  if (vouchers === r.members.length) return vouchers > 1 ? `Payment voucher × ${vouchers}` : 'Payment voucher'
  const others = [...new Set(r.types.filter((t) => t !== 'payment_voucher').map(requestTypeLabel))]
  return [...others, ...(vouchers > 0 ? ['PV'] : [])].join(' + ')
}

/** "Landlord Sdn Bhd", or for several "Aina + 25 more" (the queue's own way). */
export function payeesOf(names: Array<string | null | undefined>): string {
  const uniq = [...new Set(names.map((n) => (n ?? '').trim()).filter(Boolean))]
  return uniq.length <= 1 ? (uniq[0] ?? '') : `${uniq[0]} + ${uniq.length - 1} more`
}

export function approvalHub(args: {
  queue: QueueItem[]
  summary: QueueSummary
  undecidable: Record<string, string>
  executives: readonly string[]
  decided: { rows: ApprovalRequestRow[]; amountOf: (r: ApprovalRequestRow) => number | null; nameOf: (id: string) => string }
  /** Decided vouchers' payees, by voucher id. */
  payees: ReadonlyMap<string, string>
}): ApprovalHub {
  const decidedBase = decidedRows(args.decided.rows, { amountOf: args.decided.amountOf, nameOf: args.decided.nameOf })
  const base = approvalHubModel({ queue: args.queue, summary: args.summary, undecidable: args.undecidable, executives: args.executives, decided: decidedBase })

  const queueByKey = new Map(args.queue.map((q) => [q.key, q]))
  const pending: HubRow[] = base.pending.map((r) => {
    const q = queueByKey.get(r.key)
    const type = q?.typeLabel ?? typeOf(r)
    return {
      ...r,
      name: q?.payee || type,
      type,
      at: q?.submittedAt ?? null,
      pool: q?.pool ?? '',
      category: q?.category ?? '',
      payBy: q?.payBy ?? '',
      files: q?.attachments.length ?? 0,
    }
  })

  // When each decided row was decided: a request's own moment, a combined approval's latest.
  const decidedAt = new Map<string, string>()
  for (const r of args.decided.rows) {
    const key = r.group_id ? `g:${r.group_id}` : r.id
    const at = r.approved_at ?? ''
    if (at && at > (decidedAt.get(key) ?? '')) decidedAt.set(key, at)
  }
  const decided: HubRow[] = base.decided.map((r) => {
    const type = typeOf(r)
    const paid = r.members.filter((m) => m.isVoucher && m.open).map((m) => args.payees.get(m.open!.id))
    return { ...r, name: payeesOf(paid) || type, type, at: decidedAt.get(r.key) ?? null, pool: '', category: '', payBy: '', files: 0 }
  })

  // The cards stand two to a row beside the table, so their names are short: the phone's full words are
  // "Submitted by the executive" and "Decided · 30 days".
  const approved = decided.reduce((n, r) => n + r.members.filter((m) => m.decision === 'approved').length, 0)
  const cards = base.cards.map((c) =>
    c.key === 'exec' ? { ...c, label: 'By executives' } : c.key === 'decided' ? { ...c, label: 'Decided', sub: `30 days · ${base.decidedCount - approved} rejected` } : c,
  )

  return { ...base, cards, pending, decided }
}

/** The rows a card lists. */
export function rowsOf(hub: Pick<ApprovalHub, 'pending' | 'decided'>, card: ApprovalHubCard, gone: ReadonlySet<string> = new Set()): HubRow[] {
  if (card === 'decided') return hub.decided
  const waiting = hub.pending.filter((r) => !gone.has(r.key))
  return card === 'exec' ? waiting.filter((r) => r.executive) : waiting
}

/** What a search finds: the number, who is paid, the request, its kind, who sent it, the pool and category. */
export function matches(r: HubRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [r.no ?? '', r.name, r.title, r.type, r.sentBy, r.pool, r.category].join(' ').toLowerCase().includes(q)
}
