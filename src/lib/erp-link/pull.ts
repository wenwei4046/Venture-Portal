/**
 * A pull: what to fetch, and how a fetched document becomes a delivery.
 *
 * The push feed hands the portal one delivery per changed document. A pull
 * has to work that out for itself: the ERP's list gives every header in the
 * month, and only the documents whose commission-relevant header has moved
 * since the last pull are worth their two further requests (lines, payments).
 * The comparison is a hash of those header fields, kept per document in
 * `erp_pull_docs`.
 *
 * What a fetched document turns into is the SAME delivery shape the ERP's
 * outbox would have posted (`ErpDelivery` in erp-sync/contract.ts), so the
 * translation to the canonical order, and the ingest RPC after it, are the
 * ones the push feed already proved.
 */

import { createHash } from 'node:crypto'
import type { ErpDelivery } from '@/lib/erp-sync/contract'
import type { ErpRow } from './client'
import type { PullItem } from './stats'

// The browser-safe half — stats and the plan's item shape — lives in
// ./stats so ErpLinkPanel can import it without dragging node:crypto in.
export { addPullStats, describePull, emptyPullStats } from './stats'
export type { PullItem, PullStats } from './stats'

/**
 * The header fields a commission run can feel. Anything else changing on the
 * ERP (an address, a remark, a delivery date) is not a reason to re-read the
 * document. `updated_at`, `version` and `revision` are included so an edit
 * to the lines that leaves every rollup the same is still noticed when the
 * ERP stamps it; a rollup that moved is noticed regardless.
 */
export const LIST_HASH_FIELDS = [
  'doc_no',
  'so_date',
  'status',
  'on_hold',
  'hold_reason',
  'held_at',
  'branding',
  'agent',
  'salesperson_id',
  'debtor_code',
  'debtor_name',
  'sales_location',
  'local_total_sen',
  'subtotal_sen',
  'total_cost_sen',
  'total_revenue_sen',
  'total_margin_sen',
  'line_count',
  'balance_sen',
  'balance_sen_live',
  'paid_total_sen',
  'paid_sen',
  'deposit_sen',
  'delivery_fee_sen',
  'revision',
  'version',
  'created_at',
  'updated_at',
] as const

/** A stable digest of the commission-relevant header fields of one list row. */
export function listRowHash(row: ErpRow): string {
  const picked: Record<string, unknown> = {}
  for (const k of LIST_HASH_FIELDS) {
    if (row[k] !== undefined) picked[k] = row[k]
  }
  return createHash('sha1').update(JSON.stringify(picked)).digest('hex')
}

/** `2026-09-01` → `{ from: '2026-09-01', to: '2026-09-30' }`. */
export function monthBounds(period: string): { from: string; to: string } {
  const m = /^(\d{4})-(\d{2})-01$/.exec(period)
  if (!m) throw new Error('Period must be the first of a month (YYYY-MM-01)')
  const y = Number(m[1])
  const mo = Number(m[2])
  if (mo < 1 || mo > 12) throw new Error('Period must be the first of a month (YYYY-MM-01)')
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  return { from: period, to: `${m[1]}-${m[2]}-${String(last).padStart(2, '0')}` }
}

export function docNoOf(row: ErpRow): string | null {
  const v = row.doc_no
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s === '' ? null : s
}

export interface KnownDoc {
  listHash: string
}

export interface PullPlan {
  /** Documents the ERP listed in the month. */
  listed: number
  /** Listed documents whose header has not moved since the last pull. */
  unchanged: number
  items: PullItem[]
}

/**
 * Which documents a pull must fetch: every listed document whose hash is new
 * or different (all of them when `force`), then every document the last pull
 * knew in this month that the ERP no longer lists — deleted, or re-dated into
 * another month; the fetch will say which.
 */
export function planPull(listRows: ErpRow[], known: ReadonlyMap<string, KnownDoc>, force: boolean): PullPlan {
  const items: PullItem[] = []
  const seen = new Set<string>()
  let unchanged = 0

  for (const row of listRows) {
    const docNo = docNoOf(row)
    if (!docNo || seen.has(docNo)) continue
    seen.add(docNo)
    const hash = listRowHash(row)
    const prev = known.get(docNo)
    if (!force && prev && prev.listHash === hash) {
      unchanged++
      continue
    }
    items.push({ docNo, hash, kind: 'changed' })
  }

  for (const docNo of known.keys()) {
    if (!seen.has(docNo)) items.push({ docNo, hash: '', kind: 'verify' })
  }

  return { listed: seen.size, unchanged, items }
}

export interface DeliveryInput {
  docNo: string
  header: ErpRow
  items: ErpRow[]
  payments: ErpRow[]
  /** The ERP company the pull reads; stamped when the header carries none. */
  companyId: number
  /** When the portal built this snapshot — the ordering token. */
  snapshotAt: string
}

/**
 * The delivery the ERP's outbox would have built for this document, from what
 * its REST API answers. Two translations the contract relies on:
 *
 *   - `balance_sen_live` — the list's live balance. The detail answers the
 *     same figure as a SIGNED `balance_sen` (the ERP's soBalanceSen, local
 *     total less every payment), so that is what the deposit gate reads.
 *   - `salesperson` — the detail already resolves `salesperson_name` from
 *     scm.staff beside `salesperson_id`; the `agent` text is the fallback.
 */
export function buildDelivery(input: DeliveryInput): ErpDelivery {
  const h = input.header
  const header: ErpRow = { ...h }

  if (header.balance_sen_live === undefined && header.balance_sen !== undefined) {
    header.balance_sen_live = header.balance_sen
  }
  if (header.paid_total_sen === undefined && header.paid_sen_total !== undefined) {
    header.paid_total_sen = header.paid_sen_total
  }
  if (header.company_id === undefined || header.company_id === null) {
    header.company_id = input.companyId
  }

  const spId = h.salesperson_id
  const spName =
    typeof h.salesperson_name === 'string' && h.salesperson_name.trim() !== ''
      ? h.salesperson_name
      : typeof h.agent === 'string' && h.agent.trim() !== ''
        ? h.agent
        : null

  return {
    docNo: input.docNo,
    snapshotAt: input.snapshotAt,
    deleted: false,
    header,
    items: input.items,
    payments: input.payments,
    salesperson: spId !== undefined && spId !== null ? { id: spId, name: spName } : spName ? { name: spName } : null,
  }
}

/** The delivery for a document the ERP no longer has. */
export function deletedDelivery(docNo: string, snapshotAt: string): ErpDelivery {
  return { docNo, snapshotAt, deleted: true }
}

/** Run `fn` over `items` at most `limit` at a time, keeping order in the result. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return results
}
