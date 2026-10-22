import dayjs from 'dayjs'
import type { createClient } from '@/lib/supabase/server'
import type { User } from '@/types'
import { fetchByKeys } from '@/lib/paginate'
import { approvalHub, type ApprovalHub } from './hub-model'
import { readApprovalQueue, readDecidedSince } from './queue-read'

// The Approvals hub, read (2026-10-17): the queue as the page always read it (`readApprovalQueue` — every waiting
// request at its live amount, who may decide each, its voucher's pool, category, payee and files), the 30 days'
// decisions the Decided card counts (`readDecidedSince` — the phone app's list too), and who each decided voucher
// paid. The reads start together; the payees wait for the decisions that name them.

type Client = Awaited<ReturnType<typeof createClient>>

export async function readApprovalHub(supabase: Client, user: User): Promise<ApprovalHub> {
  const since = dayjs().subtract(30, 'day').toISOString()
  const [queue, decided] = await Promise.all([readApprovalQueue(supabase, user), readDecidedSince(supabase, since)])
  const voucherIds = [...new Set(decided.rows.filter((r) => r.request_type === 'payment_voucher' && r.reference_id).map((r) => r.reference_id as string))]
  const vouchers = await fetchByKeys(voucherIds, (chunk) => supabase.from('payment_vouchers').select('id, payee_name').in('id', chunk), 'readApprovalHub.payees')
  return approvalHub({
    queue: queue.queue,
    summary: queue.summary,
    undecidable: queue.undecidable,
    executives: queue.executives,
    decided,
    payees: new Map(vouchers.map((v) => [v.id as string, (v.payee_name as string | null) ?? ''])),
  })
}
