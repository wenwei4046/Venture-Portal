import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient } from '@/lib/supabase/admin'
import { parseErpProductBatch } from '@/lib/erp-sync/products'
import { acceptedSecrets, providedSecret, secretMatchesAny } from '@/lib/erp-sync/auth'
import { storedFeedSecret } from '@/lib/erp-sync/feed-secret'

/**
 * POST /api/erp/v1/products — the SKU master + Combo Pricing receiver.
 *
 * THE SECOND POST ROUTE HANDLER, under the SAME narrow exception the first one
 * documents (`../sales-orders/route.ts`): the caller is the ERP's database,
 * which cannot call a Server Action and has no session. Every condition of that
 * exception is met here too — a static shared secret compared in constant time
 * and failing closed when unset, the service-role client used for ONE thing
 * (calling the single ingest RPC that owns every write), the path excluded from
 * the session middleware, and every delivery logged.
 *
 * It is a SEPARATE endpoint from the sales-order feed rather than a new field
 * on it, because the two have different cadences and different failure
 * meanings: an order is pushed within seconds of a save and each one matters on
 * its own, while the catalogue moves rarely and is delivered whole. Folding
 * them together would make one queue whose head-of-line block is a 2,300-row
 * catalogue.
 *
 * ANSWERS 2xx FOR EVERY DELIVERY IT CHOSE NOT TO APPLY, for the same reason the
 * sales-order receiver does: the ERP's drainer keys on the HTTP status and
 * retries a non-2xx forever, so a refusal would wedge the queue. Non-2xx is
 * reserved for what a retry can fix (500) or what a human must (401/422/503).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// erp_products / erp_sofa_combos / the RPC postdate database.types.ts —
// untyped-client convention, as with the sales-order receiver. adminClient()
// builds the service-role client on first call, never at import.
function client(): SupabaseClient {
  return adminClient() as unknown as SupabaseClient
}

export async function POST(request: Request) {
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
  const parsed = parseErpProductBatch(body)
  if (!parsed.ok) {
    await sb.from('erp_sync_events').insert({
      doc_no: 'catalogue',
      status: 'rejected',
      message: parsed.error,
      payload: body as Record<string, unknown>,
    })
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 422 })
  }

  const { batch } = parsed

  // How many rows the ERP sent vs how many the portal could read. A row without
  // a code (or a combo without a base model) is dropped rather than failing the
  // batch — but the counts travel, so "applied" can never quietly mean "applied
  // almost none of it".
  const sentProducts = Array.isArray((body as Record<string, unknown>).products)
    ? ((body as Record<string, unknown>).products as unknown[]).length
    : 0
  const sentCombos = Array.isArray((body as Record<string, unknown>).combos)
    ? ((body as Record<string, unknown>).combos as unknown[]).length
    : 0
  const unreadable = (sentProducts - batch.products.length) + (sentCombos - batch.combos.length)

  const { data, error } = await sb.rpc('ingest_erp_products', { p_batch: batch })
  if (error) {
    await sb.from('erp_sync_events').insert({
      doc_no: 'catalogue',
      status: 'error',
      message: error.message,
      snapshot_at: batch.snapshotAt,
      payload: { snapshotAt: batch.snapshotAt, full: batch.full, products: sentProducts, combos: sentCombos },
    })
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const result = data as Record<string, unknown>

  await sb.from('erp_sync_events').insert({
    doc_no: 'catalogue',
    status: 'applied',
    message: `${result.products ?? 0} products, ${result.combos ?? 0} combos`
      + (batch.full ? ` (full: retired ${result.retiredProducts ?? 0} / ${result.retiredCombos ?? 0})` : '')
      + (unreadable > 0 ? ` — ${unreadable} row(s) unreadable and skipped` : ''),
    snapshot_at: batch.snapshotAt,
  })

  // The Product List reads the mirror, and so does every cost the drill-downs
  // show. A catalogue delivery changes both.
  revalidatePath('/revenue', 'layout')

  return NextResponse.json({ ok: true, outcome: 'applied', unreadable, ...result })
}

export async function GET() {
  return NextResponse.json(
    { error: 'POST a SKU-master delivery here; GET /api/erp/v1/health to test the secret' },
    { status: 405 },
  )
}
