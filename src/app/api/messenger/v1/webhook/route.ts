import { NextResponse, after } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient } from '@/lib/supabase/admin'
import { pushSoon } from '@/lib/push/outbox'
import { adIdsOf, nameAdsFromMeta } from '@/lib/member/crm-ad-names-meta'
import { sendAutoReplies } from '@/lib/member/crm-auto-reply'
import { signatureValid, verifyHandshake } from '@/lib/whatsapp/webhook'
import { parseMessengerDelivery } from '@/lib/messenger/webhook'
import { pageToken, profileName } from '@/lib/messenger/send'
import { sendLeadOutbox } from '@/lib/leads/messenger-outbox'
import { adAccountName } from '@/lib/leads/ad-account'

/**
 * /api/messenger/v1/webhook — the Callback URL for our Facebook Pages'
 * Messenger. A second endpoint of THE SECOND MACHINE-INGEST SYSTEM, Meta
 * (user-approved 2026-10-01 for Messenger), under the same narrow exception as
 * /api/whatsapp/v1/webhook, every part of it required:
 *
 *   - GET is Meta's one-time handshake: answer hub.challenge only when
 *     hub.verify_token equals MESSENGER_VERIFY_TOKEN (or WHATSAPP_VERIFY_TOKEN
 *     — one Meta app), in constant time. Unset → 503.
 *   - POST is authenticated by X-Hub-Signature-256 = HMAC of the RAW body with
 *     META_APP_SECRET, in constant time. Unset secret or wrong signature →
 *     refused and logged.
 *   - the CRM's Pages (META_PAGE_IDS) go to the CRM; any other Page's messages go to Lead View
 *     (`lead_ingest_messenger`, mig 20261026110000), which keeps only a Page a brand names (`lead_brands.fb_page_id`)
 *     and ignores the rest; after the answer, the templates' messages it wrote are sent (`lead_outbox` /
 *     `lead_outbox_done`, service role only — lib/leads/messenger-outbox.ts).
 *   - the service-role client is used for ONE thing: the ingest RPC
 *     `crm_ingest_messenger`, which owns every write and the delivery log; a
 *     refused delivery is logged straight to crm_channel_events; after the answer, an ad with no name yet is named
 *     from Ads Manager through crm_ads_unnamed / crm_meta_name_ad (service role only, mig 20261019100000), and the
 *     chat's person's auto-replies go through crm_auto_reply_due / _claim / _done (mig 20261019120000).
 *   - before it, the customer's name is asked of Meta with the Page's token
 *     (best effort, 3 s): Messenger, unlike WhatsApp, does not send it.
 *   - excluded from the session middleware.
 *   - a delivery that brought customers' messages is pushed to the phones of whoever has those chats once Meta has
 *     its answer (`pushSoon`, mig 20261014030000) — the outbox's own secret and the publishable key, never the
 *     service role.
 *
 * 200 for every signed delivery it chose not to apply; non-2xx only for what a
 * retry can fix (500) or a human must (401 / 503).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function client(): SupabaseClient {
  return adminClient() as unknown as SupabaseClient
}

const verifyToken = () => process.env.MESSENGER_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN

export async function GET(request: Request) {
  const outcome = verifyHandshake(new URL(request.url).searchParams, verifyToken())
  if (!outcome.ok) return NextResponse.json({ error: outcome.reason }, { status: outcome.status })
  return new Response(outcome.challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
}

export async function POST(request: Request) {
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret) return NextResponse.json({ error: 'messenger webhook not configured' }, { status: 503 })

  const raw = await request.text()
  if (!signatureValid(raw, request.headers.get('x-hub-signature-256'), appSecret)) {
    await client().from('crm_channel_events').insert({ channel: 'messenger', status: 'rejected', message: 'signature did not match', payload: null })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    await client().from('crm_channel_events').insert({ channel: 'messenger', status: 'rejected', message: 'invalid JSON', payload: null })
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const delivery = parseMessengerDelivery(body)
  // Our Pages only.
  const pages = new Set((process.env.META_PAGE_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean))
  const ours = <T extends { pageId: string }>(rows: T[]) => (pages.size ? rows.filter(r => pages.has(r.pageId)) : rows)
  const messages = ours(delivery.messages)
  const reads = ours(delivery.reads)
  // Every other Page's messages are Lead View's (a brand's Page); with no CRM Pages set, the CRM takes them all, as before.
  const leadMessages = pages.size ? delivery.messages.filter(m => !pages.has(m.pageId)) : []
  const ignored = delivery.ignored + (delivery.reads.length - reads.length)

  // Names: Messenger does not send them. Asked once per customer per delivery, best effort.
  const systemToken = process.env.META_SYSTEM_USER_TOKEN?.trim()
  if (systemToken && delivery.messages.length) {
    const tokens = new Map<string, string | null>()
    const names = new Map<string, string | null>()
    for (const m of [...messages, ...leadMessages]) {
      if (!tokens.has(m.pageId)) tokens.set(m.pageId, await pageToken(m.pageId, systemToken))
      const token = tokens.get(m.pageId)
      if (token && !names.has(m.psid)) names.set(m.psid, await profileName(m.pageId, m.psid, token))
      m.name = names.get(m.psid) ?? null
    }
  }

  // Lead View's own function and answer. A failure there answers 500 after the CRM's are kept: Meta retries the whole
  // delivery, and both sides keep a message by Meta's id, so a retry takes nothing twice.
  let leadsFailed = false
  if (leadMessages.length) {
    // Which brand an ad's customer is: the ad account's name decides 2990s mini (lib/leads/ad-account.ts).
    const forLeads = await Promise.all(leadMessages.map(async m => m.ad?.sourceId
      ? { ...m, ad: { ...m.ad, account: await adAccountName(m.ad.sourceId, systemToken) } }
      : m))
    const lead = await client().rpc('lead_ingest_messenger', { p_messages: forLeads })
    if (lead.error) {
      console.error('lead_ingest_messenger failed:', lead.error.message)
      leadsFailed = true
    } else {
      const contacts = ((lead.data as { contacts?: string[] } | null)?.contacts ?? []).filter(Boolean)
      if (contacts.length) after(() => sendLeadOutbox(client(), contacts, process.env.META_SYSTEM_USER_TOKEN?.trim()).then(() => undefined))
    }
  }

  const { data, error } = await client().rpc('crm_ingest_messenger', {
    p_messages: messages, p_delivered: delivery.delivered, p_reads: reads, p_ignored: ignored, p_payload: body,
  })
  if (error) {
    console.error('crm_ingest_messenger failed:', error.message)
    return NextResponse.json({ ok: false, error: 'ingest failed' }, { status: 500 })
  }
  if (leadsFailed) return NextResponse.json({ ok: false, error: 'lead ingest failed' }, { status: 500 })
  // Only a delivery with new messages can have told somebody something (a receipt-only one never does).
  if (Number((data as { messages?: unknown } | null)?.messages) > 0) pushSoon()
  // An ad with no name yet: Ads Manager's, asked once Meta has its answer (lib/member/crm-ad-names-meta.ts).
  const ads = adIdsOf(messages)
  if (ads.length) after(() => nameAdsFromMeta(client(), ads, process.env.META_SYSTEM_USER_TOKEN?.trim()).then(() => undefined))
  // The auto-replies of whoever the chat is given to (lib/member/crm-auto-reply.ts), once Meta has its answer.
  const said = messages.map(m => m.externalId)
  if (said.length) after(() => sendAutoReplies(client(), 'messenger', said, process.env.META_SYSTEM_USER_TOKEN?.trim()).then(() => undefined))
  return NextResponse.json({ ok: true, result: data })
}
