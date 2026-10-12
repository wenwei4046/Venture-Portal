import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient } from '@/lib/supabase/admin'
import { parseAttendanceDelivery } from '@/lib/erp-sync/attendance'
import { acceptedSecrets, providedSecret, secretMatchesAny } from '@/lib/erp-sync/auth'
import { storedFeedSecret } from '@/lib/erp-sync/feed-secret'

/**
 * POST /api/erp/v1/sales-attending — the Sales Attending receiver (contract §10,
 * 2026-10-12).
 *
 * THE ERP'S THIRD ENDPOINT, under the SAME narrow exception the first one
 * documents (`../sales-orders/route.ts`) — a second endpoint of an existing
 * feed is not a second exception: the caller is the ERP, which cannot call a
 * Server Action and has no session. Every condition of that exception is met
 * here too — a static shared secret compared in constant time and failing
 * closed when unset, the service-role client used for ONE thing (calling the
 * single ingest RPC that owns every write), the path excluded from the session
 * middleware, and every delivery logged.
 *
 * What comes in: every ERP project (a brand's booth at a fair) of one company
 * from `since` on, with the salespeople its "Sales Attending" lists. That is a
 * seller's brand week now (user 2026-10-12): the booth whose Fair result earns
 * points that weekend, and the fair a claim is for — the portal guesses one
 * only for a weekend the ERP lists them nowhere.
 *
 * A separate endpoint from the orders and the catalogue for the catalogue's
 * reason: a roster is sent whole, rarely, and means something different when
 * it fails.
 *
 * Non-2xx only for what a human or a retry must fix: 401 wrong key, 422 a
 * delivery the portal cannot read (with the reason), 500 a database fault,
 * 503 no key configured yet. An older snapshot than the one held answers 200
 * `stale` and changes nothing.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The Sales Attending tables postdate database.types.ts — untyped-client
// convention, as with the other receivers. adminClient() builds the
// service-role client on first call, never at import.
function client(): SupabaseClient {
  return adminClient() as unknown as SupabaseClient
}

const DOC = 'sales-attending'

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
  const parsed = parseAttendanceDelivery(body)
  if (!parsed.ok) {
    await sb.from('erp_sync_events').insert({ doc_no: DOC, status: 'rejected', message: parsed.error })
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 422 })
  }

  const { delivery, counts } = parsed
  const { data, error } = await sb.rpc('ingest_erp_sales_attending', { p_batch: delivery })
  if (error) {
    await sb.from('erp_sync_events').insert({
      doc_no: DOC,
      status: 'error',
      message: error.message,
      snapshot_at: delivery.snapshotAt,
      payload: { companyId: delivery.companyId, since: delivery.since, booths: counts.booths },
    })
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const result = (data ?? {}) as Record<string, unknown>
  const stale = result.outcome === 'stale'
  const unmatched = Array.isArray(result.unmatched) ? (result.unmatched as unknown[]).filter(n => typeof n === 'string') : []
  await sb.from('erp_sync_events').insert({
    doc_no: DOC,
    status: stale ? 'stale' : 'applied',
    message: stale
      ? `an older snapshot than the one held (${String(result.kept ?? '')}) — nothing changed`
      : `${counts.booths} booth(s), ${counts.attendees} listed from ${delivery.since}` +
        (Number(result.retired) > 0 ? `, ${String(result.retired)} gone` : '') +
        (counts.unreadable > 0 ? ` — ${counts.unreadable} unreadable and skipped` : ''),
    warnings: unmatched.length ? [`Listed in the ERP but not known to the portal: ${unmatched.join(', ')}`] : [],
    snapshot_at: delivery.snapshotAt,
    payload: { companyId: delivery.companyId, since: delivery.since, result },
  })

  // HR's Brand weeks grid reads the mirror when its tab opens; the member app reads it live.
  if (!stale) revalidatePath('/member-admin')

  return NextResponse.json({ ok: true, outcome: stale ? 'stale' : 'applied', unreadable: counts.unreadable, ...result })
}

export async function GET() {
  return NextResponse.json(
    { error: 'POST a Sales Attending delivery here; GET /api/erp/v1/health to test the secret' },
    { status: 405 },
  )
}
