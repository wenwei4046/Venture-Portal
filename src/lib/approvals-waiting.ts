// What waits for one reader's decision (2026-10-17 — the Principal's own view
// takes Finance's view, and Approvals is the tab the user opens most: "make
// sure the approve tab is fullfill as well, cause usually i use that"). The
// Overview's line ("7 requests waiting for your approval"), its Approvals
// tile and the phone's Approvals tab count the queue's items as the queue
// lists them — a combined approval (a payroll batch, a loan and its
// disbursement) one item — and only those the reader may decide, asked as the
// queue asks each row (`decision`, lib/approval-domains.ts).

import type { SupabaseClient } from '@supabase/supabase-js'
import { decision, type Approver } from '@/lib/approval-domains'
import { fetchAllRows } from '@/lib/paginate'

export interface WaitingRow {
  id: string
  group_id: string | null
  request_type: string
  submitted_by: string
}

/** The queue's items this reader may decide: a request, or a combined approval whole. Pure. */
export function decidableCount(pending: readonly WaitingRow[], user: Approver | null | undefined): number {
  if (!user) return 0
  const items = new Map<string, { types: Set<string>; submitters: Set<string> }>()
  for (const r of pending) {
    const key = r.group_id ? `g:${r.group_id}` : r.id
    const item = items.get(key) ?? { types: new Set<string>(), submitters: new Set<string>() }
    item.types.add(r.request_type)
    item.submitters.add(r.submitted_by)
    items.set(key, item)
  }
  let n = 0
  for (const item of items.values()) if (decision(user, [...item.types], [...item.submitters]).may) n++
  return n
}

/**
 * Read: the pending requests this session sees (its row policies), counted for the reader. A failed
 * read says nothing (null) rather than a wrong zero.
 */
export async function readApprovalsWaiting(supabase: SupabaseClient, user: Approver): Promise<number | null> {
  try {
    const rows = await fetchAllRows<WaitingRow>(
      (from, to) =>
        supabase
          .from('approval_requests')
          .select('id, group_id, request_type, submitted_by')
          .eq('status', 'pending')
          .order('id')
          .range(from, to),
      'readApprovalsWaiting',
    )
    return decidableCount(rows, user)
  } catch {
    return null
  }
}
