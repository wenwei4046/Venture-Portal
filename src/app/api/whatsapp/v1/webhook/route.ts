import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient } from '@/lib/supabase/admin'
import { pushSoon } from '@/lib/push/outbox'
import { parseDelivery, signatureValid, verifyHandshake } from '@/lib/whatsapp/webhook'

/**
 * /api/whatsapp/v1/webhook — the WhatsApp Cloud API's Callback URL.
 *
 * THE SECOND MACHINE-INGEST SYSTEM (Meta; the user approved 2026-10-01 for
 * Messenger and 2026-10-02 for WhatsApp under the same approval). Same narrow
 * exception as the Houzs ERP receiver, every part of it required:
 *
 *   - GET is Meta's one-time handshake: answer hub.challenge only when
 *     hub.verify_token equals WHATSAPP_VERIFY_TOKEN (constant time). Unset → 503.
 *   - POST is authenticated by Meta's signature, X-Hub-Signature-256 = HMAC
 *     of the RAW body with META_APP_SECRET (constant time), never a session or
 *     a query param. Unset secret or wrong signature → refused and logged.
 *   - the service-role client is used for ONE thing: the ingest RPC
 *     `crm_ingest_whatsapp`, which owns every write (and the delivery log);
 *     a refused delivery is logged straight to crm_channel_events.
 *   - the path is excluded from the session middleware.
 *   - a delivery that brought customers' messages is pushed to the phones of whoever has those chats once Meta has
 *     its answer (`pushSoon`, mig 20261014030000 wrote the notices beside the messages) — through the outbox's own
 *     secret and the publishable key, never this route's service role.
 *
 * ANSWERS 200 FOR EVERY SIGNED DELIVERY IT CHOSE NOT TO APPLY (a duplicate,
 * a field we do not read). Meta retries non-2xx with backoff for hours and
 * then disables the webhook, so non-2xx is kept for what a retry can fix
 * (500) or a human must fix (401 / 503).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The crm_* tables / RPC postdate database.types.ts — untyped-client convention.
function client(): SupabaseClient {
  return adminClient() as unknown as SupabaseClient
}

export async function GET(request: Request) {
  const outcome = verifyHandshake(new URL(request.url).searchParams, process.env.WHATSAPP_VERIFY_TOKEN)
  if (!outcome.ok) return NextResponse.json({ error: outcome.reason }, { status: outcome.status })
  // Meta expects the challenge back verbatim, as plain text.
  return new Response(outcome.challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
}

export async function POST(request: Request) {
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret) return NextResponse.json({ error: 'whatsapp webhook not configured' }, { status: 503 })

  // The signature covers the exact bytes Meta sent, so read the body as text first.
  const raw = await request.text()
  if (!signatureValid(raw, request.headers.get('x-hub-signature-256'), appSecret)) {
    await client().from('crm_channel_events').insert({
      channel: 'whatsapp', status: 'rejected', message: 'signature did not match', payload: null,
    })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    await client().from('crm_channel_events').insert({ channel: 'whatsapp', status: 'rejected', message: 'invalid JSON', payload: null })
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const delivery = parseDelivery(body)
  const { data, error } = await client().rpc('crm_ingest_whatsapp', {
    p_messages: delivery.messages,
    p_statuses: delivery.statuses,
    p_ignored: delivery.ignored,
    p_payload: body,
  })
  if (error) {
    // Logged by Supabase; Meta retries a 500, which is what a passing outage needs.
    console.error('crm_ingest_whatsapp failed:', error.message)
    return NextResponse.json({ ok: false, error: 'ingest failed' }, { status: 500 })
  }
  // Only a delivery with new messages can have told somebody something (a receipt-only one never does).
  if (Number((data as { messages?: unknown } | null)?.messages) > 0) pushSoon()
  return NextResponse.json({ ok: true, result: data })
}
