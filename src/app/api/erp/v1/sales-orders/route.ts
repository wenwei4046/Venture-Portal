import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient } from '@/lib/supabase/admin'
import { parseErpSyncBody, type CanonicalOrder } from '@/lib/erp-sync/contract'
import { acceptedSecrets, providedSecret, secretMatchesAny } from '@/lib/erp-sync/auth'
import { storedFeedSecret } from '@/lib/erp-sync/feed-secret'

/**
 * POST /api/erp/v1/sales-orders — the ERP live feed's receiver.
 *
 * THE ONE POST ROUTE HANDLER, and why it is allowed. The portal's rule is that
 * writes go through Server Actions behind their gates. The caller here is the
 * ERP's DATABASE (pg_net, driven by pg_cron), which cannot call a Server Action
 * and has no session; a machine-to-machine ingest is the case the rule was not
 * written for. The exception is narrow on purpose:
 *
 *   - authenticated by a static secret, the key the ERP generated and
 *     somebody pasted on Comm Cal, or ERP_SYNC_SECRET, never a session;
 *   - the service-role client is used for ONE thing: calling the ingest RPC
 *     that owns every write (and logging what could not reach it);
 *   - the path is excluded from the session middleware;
 *   - every delivery leaves a row in erp_sync_events.
 *
 * ANSWERS 2xx FOR EVERY DELIVERY IT CHOSE NOT TO APPLY. The ERP's drainer keys
 * on the HTTP status: non-2xx keeps the outbox row pending and retries it every
 * ten seconds, forever, so a "refused" order would wedge the queue behind it. A
 * duplicate, a stale snapshot, a held month, a skipped draft — all 200 with the
 * outcome in the body and in the log. Non-2xx is reserved for what a retry can
 * fix (500) or what a human must fix (401 / 422 / 503).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// erp_sync_events / the RPC postdate database.types.ts — untyped-client convention.
// adminClient() builds the service-role client on first call, never at import.
function client(): SupabaseClient {
  return adminClient() as unknown as SupabaseClient
}

interface IngestResult {
  status: string
  docNo: string
  periodMonth: string | null
  message: string
  warnings: string[]
  eventId: string
  orderId?: string
}

export async function POST(request: Request) {
  // The key pasted on Comm Cal (Vault) and/or ERP_SYNC_SECRET (Vercel env),
  // whichever is set. Neither: 503, and the ERP's outbox waits without
  // spending an attempt. Wrong: 401, likewise.
  const secrets = acceptedSecrets(process.env.ERP_SYNC_SECRET, await storedFeedSecret())
  if (secrets.length === 0) {
    return NextResponse.json({ error: 'erp sync not configured' }, { status: 503 })
  }
  if (!secretMatchesAny(providedSecret(request.headers), secrets)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const sb = client()
  const parsed = parseErpSyncBody(body)
  if (!parsed.ok) {
    await sb.from('erp_sync_events').insert({
      doc_no: parsed.docNo,
      status: 'rejected',
      message: parsed.error,
      payload: body as Record<string, unknown>,
    })
    return NextResponse.json({ ok: false, error: parsed.error, docNo: parsed.docNo }, { status: 422 })
  }

  const results: IngestResult[] = []
  let applied = 0
  for (const order of parsed.orders) {
    const { data, error } = await sb.rpc('ingest_erp_sales_order', { p_order: order satisfies CanonicalOrder })
    if (error) {
      await sb.from('erp_sync_events').insert({
        doc_no: order.docNo,
        status: 'error',
        message: error.message,
        snapshot_at: order.snapshotAt,
        payload: order,
      })
      return NextResponse.json(
        { ok: false, error: error.message, docNo: order.docNo, results },
        { status: 500 },
      )
    }
    const result = data as IngestResult
    results.push(result)
    if (result.status === 'applied') applied++
  }

  if (applied > 0) revalidatePath('/revenue', 'layout')

  // `outcome` is the portal's one word for what it did — applied / duplicate /
  // stale / held / skipped — which the ERP's outbox records beside its own
  // `sent` (`portal_outcome`, read from `outcome ?? result`). Its page shows
  // it so a held month is never mistaken for a paid one. A backfill batch that
  // did not all end the same way says `mixed`; `results` carries each one.
  const outcome = results.every(r => r.status === results[0].status) ? results[0].status : 'mixed'

  return NextResponse.json({ ok: true, outcome, received: parsed.orders.length, applied, results })
}

export async function GET() {
  return NextResponse.json({ error: 'POST a sales-order delivery here; GET /api/erp/v1/health to test the secret' }, { status: 405 })
}
