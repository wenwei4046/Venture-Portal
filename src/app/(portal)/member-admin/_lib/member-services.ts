import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { readClaimRatesAdmin, type ClaimRatesAdmin } from '@/lib/member/claim-rates-admin'
import { requestFactsFromRow, type RequestFacts } from '@/lib/member/member-services'

/**
 * What People › Member services reads with the page (2026-10-10, the HR
 * revamp), besides `member_admin_snapshot()`: each request's names and history
 * (`member_admin_request_facts`) and the claim rates
 * (`member_admin_claim_settings`, 3 ms) — so no tab opens on a Server Action
 * fired by itself. Each asks its own gate; a refusal is null here and the tab
 * says what it can. (Memos and their readers moved to People › Documentation
 * on 2026-10-11.)
 */
async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

export async function loadRequestFacts(): Promise<Record<string, RequestFacts> | null> {
  const { data, error } = await (await client()).rpc('member_admin_request_facts')
  return error ? null : requestFactsFromRow(data)
}

export async function loadClaimRates(): Promise<ClaimRatesAdmin | null> {
  const { data, error } = await (await client()).rpc('member_admin_claim_settings')
  return error ? null : readClaimRatesAdmin(data)
}
