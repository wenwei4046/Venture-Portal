import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient } from '@/lib/supabase/admin'
import { parseCatalogueDelivery } from '@/lib/erp-sync/catalogue'
import { acceptedSecrets, providedSecret, secretMatchesAny } from '@/lib/erp-sync/auth'
import { storedFeedSecret } from '@/lib/erp-sync/feed-secret'

/**
 * POST /api/erp/v1/products — the catalogue receiver (contract §9, v2).
 *
 * THE SECOND POST ROUTE HANDLER, under the SAME narrow exception the first one
 * documents (`../sales-orders/route.ts`): the caller is the ERP, which cannot
 * call a Server Action and has no session. Every condition of that exception is
 * met here too — a static shared secret compared in constant time and failing
 * closed when unset, the service-role client used for ONE thing (calling the
 * single ingest RPC that owns every write), the path excluded from the session
 * middleware, and every delivery logged.
 *
 * ITEMS ONLY (user 2026-09-24): the SKU master, the Modular models and their
 * allowed options, the Maintenance pools, specials, fabrics and combos — what
 * EXISTS over there. No price and no cost ever crosses; the portal's prices
 * are its own, typed on the Product List, and a delivery never touches them.
 *
 * A separate endpoint from the sales-order feed because the two have different
 * cadences and failure meanings: an order is pushed within seconds of a save and
 * each one matters on its own, while the catalogue moves rarely and is sent
 * whole. Folding them together would make one queue whose head-of-line block
 * is a 4,000-row catalogue.
 *
 * Non-2xx only for what a human or a retry must fix: 401 wrong key, 422 a
 * delivery the portal cannot read (with the reason), 500 a database fault,
 * 503 no key configured yet.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The catalogue tables postdate database.types.ts — untyped-client convention,
// as with the sales-order receiver. adminClient() builds the service-role
// client on first call, never at import.
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
  const parsed = parseCatalogueDelivery(body)
  if (!parsed.ok) {
    await sb.from('erp_sync_events').insert({
      doc_no: 'catalogue',
      status: 'rejected',
      message: parsed.error,
    })
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 422 })
  }

  const { delivery, counts } = parsed
  const { data, error } = await sb.rpc('ingest_erp_catalogue', { p_batch: delivery })
  if (error) {
    await sb.from('erp_sync_events').insert({
      doc_no: 'catalogue',
      status: 'error',
      message: error.message,
      snapshot_at: delivery.snapshotAt,
      payload: { full: delivery.full, companyId: delivery.companyId, sent: counts.sent },
    })
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const result = (data ?? {}) as Record<string, unknown>
  const parts = Object.entries(counts.sent).map(([section, n]) => `${n} ${section}`)
  await sb.from('erp_sync_events').insert({
    doc_no: 'catalogue',
    status: 'applied',
    message:
      `${parts.join(', ')}${delivery.full ? ' (full)' : ''}` +
      (counts.unreadable > 0 ? ` — ${counts.unreadable} row(s) unreadable and skipped` : ''),
    snapshot_at: delivery.snapshotAt,
    payload: { companyId: delivery.companyId, full: delivery.full, result },
  })

  // The Product List reads the mirror, and so does the member calculator.
  revalidatePath('/revenue', 'layout')

  return NextResponse.json({ ok: true, outcome: 'applied', unreadable: counts.unreadable, ...result })
}

export async function GET() {
  return NextResponse.json(
    { error: 'POST a catalogue delivery here; GET /api/erp/v1/health to test the secret' },
    { status: 405 },
  )
}
