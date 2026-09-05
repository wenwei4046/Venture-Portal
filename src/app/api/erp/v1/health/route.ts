import { NextResponse } from 'next/server'
import { providedSecret, secretConfigured, secretMatches } from '@/lib/erp-sync/auth'

/**
 * GET /api/erp/v1/health — lets the ERP team prove the secret and the route
 * before wiring a single trigger. Answers nothing useful without the secret.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const secret = process.env.ERP_SYNC_SECRET
  if (!secretConfigured(secret)) {
    return NextResponse.json({ ok: false, error: 'erp sync not configured' }, { status: 503 })
  }
  if (!secretMatches(providedSecret(request.headers), secret)) {
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
