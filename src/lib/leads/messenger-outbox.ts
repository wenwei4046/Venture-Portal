import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { deliver, deliverFile, type Delivered, type Outgoing } from './messenger'

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
    const r = row.mediaPath ? await sendFile(client, { ...row, automatic: true }, systemToken) : await deliver({ ...row, automatic: true }, systemToken)
    results.push('mid' in r ? { id: row.id, mid: r.mid } : { id: row.id, error: r.error })
  }
  if (results.length) {
    const done = await client.rpc('lead_outbox_done', { p_results: results })
    if (done.error) console.error('lead_outbox_done failed:', done.error.message)
  }
  return results.filter(r => r.mid).length
}

/** A template's photo or file (mig 20261102120000), read back from `lead-media` with the webhook's client and sent as CS's files go. */
async function sendFile(client: SupabaseClient, row: Outgoing, systemToken: string | undefined): Promise<Delivered> {
  const { data: file, error } = await client.storage.from('lead-media').download(row.mediaPath!)
  if (error || !file) return { error: 'The template’s file could not be read back to send it.' }
  // chat/tpl/<uuid>/<name>: the name as it was picked.
  const filename = row.mediaPath!.replace(/^.*\//, '')
  return deliverFile(row, file, filename, row.mediaMime ?? file.type ?? '', systemToken)
}
