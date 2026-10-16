import type { createClient } from '@/lib/supabase/server'
import { readClaimQueueRow, type ClaimQueueRow } from '@/lib/claim-requests'

// What Payments › Claim requests reads (2026-10-16, lifted out of its page word
// for word so the Finance phone app reads the very same): the claims waiting
// for a voucher and those with the Principal (`claim_payment_queue()`), and the
// active banks a voucher may pay from, the primary first.

type Client = Awaited<ReturnType<typeof createClient>>

export interface PayFromBank {
  id: string
  bank_name: string
  current_balance: number
}

export async function readClaimRequests(supabase: Client): Promise<{ rows: ClaimQueueRow[]; banks: PayFromBank[] }> {
  const [{ data: queue, error }, { data: banks }] = await Promise.all([
    supabase.rpc('claim_payment_queue'),
    supabase
      .from('bank_accounts')
      .select('id, bank_name, current_balance')
      .eq('status', 'active')
      .order('is_primary', { ascending: false }),
  ])
  if (error) throw new Error(`Could not load the claim requests: ${error.message}`)
  return {
    rows: (queue ?? []).map(r => readClaimQueueRow(r as unknown as Record<string, unknown>)),
    banks: (banks ?? []).map(b => ({ id: b.id, bank_name: b.bank_name, current_balance: Number(b.current_balance ?? 0) })),
  }
}
