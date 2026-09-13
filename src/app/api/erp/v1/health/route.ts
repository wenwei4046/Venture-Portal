import { NextResponse } from 'next/server'
import { acceptedSecrets, providedSecret, secretMatchesAny } from '@/lib/erp-sync/auth'
import { storedFeedSecret } from '@/lib/erp-sync/feed-secret'

/**
 * GET /api/erp/v1/health — what the ERP's "Test connection" button calls:
 * proves the key and the route before a single order is sent. Answers nothing
 * useful without the key.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const secrets = acceptedSecrets(process.env.ERP_SYNC_SECRET, await storedFeedSecret())
  if (secrets.length === 0) {
    return NextResponse.json({ ok: false, error: 'erp sync not configured' }, { status: 503 })
  }
  if (!secretMatchesAny(providedSecret(request.headers), secrets)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({
    ok: true,
    service: 'venture-portal',
    feed: 'sales-orders',
    version: 1,
    time: new Date().toISOString(),
  })
}
