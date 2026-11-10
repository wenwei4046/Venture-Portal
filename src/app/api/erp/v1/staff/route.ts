import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient } from '@/lib/supabase/admin'
import { parseStaffDelivery } from '@/lib/erp-sync/staff'
import { acceptedSecrets, providedSecret, secretMatchesAny } from '@/lib/erp-sync/auth'
import { storedFeedSecret } from '@/lib/erp-sync/feed-secret'

/**
 * POST /api/erp/v1/staff — the ERP's staff list (contract §13, 2026-11-10).
 *
 * THE ERP'S FOURTH ENDPOINT, under the SAME narrow exception the first one documents (`../sales-orders/route.ts`) — a
 * further endpoint of an existing feed is not a new exception: the caller is the ERP, which cannot call a Server Action
 * and has no session. Every condition of that exception holds here too — a static shared secret compared in constant
 * time and failing closed when unset, the service-role client used for ONE thing (calling the single ingest RPC that
 * owns every write), and every delivery logged.
 *
 * What comes in: one ERP company's whole staff list — code, name, email, job, branch, active, the day they left. Lead
 * View's Team reads it beside People (Lead View v3 § 4): who is a Lead Executive, which outlet a branch is, and whose
 * access stops because the ERP marks them inactive.
 *
 * Non-2xx only for what a human or a retry must fix: 401 wrong key, 422 a delivery the portal cannot read (with the
 * reason), 500 a database fault, 503 no key configured yet. An older snapshot than the one held answers 200 `stale`.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function client(): SupabaseClient {
  return adminClient() as unknown as SupabaseClient
}

const DOC = 'staff'

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
  const parsed = parseStaffDelivery(body)
  if (!parsed.ok) {
    await sb.from('erp_sync_events').insert({ doc_no: DOC, status: 'rejected', message: parsed.error })
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 422 })
  }

  const { delivery, counts } = parsed
  const { data, error } = await sb.rpc('ingest_erp_staff', { p_batch: delivery })
  if (error) {
    await sb.from('erp_sync_events').insert({
      doc_no: DOC, status: 'error', message: error.message, snapshot_at: delivery.snapshotAt,
      payload: { companyId: delivery.companyId, staff: counts.staff },
    })
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const result = (data ?? {}) as Record<string, unknown>
  const stale = result.outcome === 'stale'
  await sb.from('erp_sync_events').insert({
    doc_no: DOC,
    status: stale ? 'stale' : 'applied',
    message: stale
      ? `an older snapshot than the one held (${String(result.kept ?? '')}) — nothing changed`
      : `${counts.staff} staff, ${counts.inactive} inactive` +
        (Number(result.retired) > 0 ? `, ${String(result.retired)} gone` : '') +
        (counts.unreadable > 0 ? ` — ${counts.unreadable} unreadable and skipped` : ''),
    snapshot_at: delivery.snapshotAt,
    payload: { companyId: delivery.companyId, result },
  })

  // Settings › Team reads the list when it opens.
  if (!stale) revalidatePath('/leads/settings')

  return NextResponse.json({ ok: true, outcome: stale ? 'stale' : 'applied', unreadable: counts.unreadable, ...result })
}

export async function GET() {
  return NextResponse.json(
    { error: 'POST a staff delivery here; GET /api/erp/v1/health to test the secret' },
    { status: 405 },
  )
}
