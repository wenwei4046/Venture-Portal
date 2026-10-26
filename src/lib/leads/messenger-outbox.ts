import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { deliver, type Outgoing } from './messenger'

/**
 * A template's messages for the conversations a webhook delivery reached (mig 20261026110000): what the runner wrote
 * when the customer's message came in, sent through the brand's Page, and what Meta said kept — the CRM's auto-replies'
 * way (lib/member/crm-auto-reply.ts). Handed the webhook's client (its ingest's job, nothing more): `lead_outbox` and
 * `lead_outbox_done` are the service role's alone. Never throws: a failure is the message's "not sent".
 */
export async function sendLeadOutbox(client: SupabaseClient, contacts: string[], systemToken: string | undefined): Promise<number> {
  if (!contacts.length) return 0
  const { data, error } = await client.rpc('lead_outbox', { p_contacts: contacts })
  if (error) {
    console.error('lead_outbox failed:', error.message)
    return 0
  }
  const rows = (data ?? []) as Array<Outgoing & { id: number }>
  const results: Array<{ id: number; mid?: string; error?: string }> = []
  // One after another: a template's messages must reach the customer in their order.
  for (const row of rows) {
    const r = await deliver(row, systemToken)
    results.push('mid' in r ? { id: row.id, mid: r.mid } : { id: row.id, error: r.error })
  }
  if (results.length) {
    const done = await client.rpc('lead_outbox_done', { p_results: results })
    if (done.error) console.error('lead_outbox_done failed:', done.error.message)
  }
  return results.filter(r => r.mid).length
}
