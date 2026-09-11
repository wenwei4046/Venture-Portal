import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const headers = { 'Cache-Control': 'no-store' }

/** Machine endpoint: its exact path bypasses session redirects in middleware.
 * No user cookie, query token or ERP secret can authorize a queue sweep.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.trim() !== secret || secret.length < 32) {
    return NextResponse.json({ error: 'Queue scheduler is not configured' }, { status: 503, headers })
  }
  const provided = Buffer.from(request.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
  }
  try {
    const { data, error } = await (adminClient() as unknown as SupabaseClient).rpc('member_process_all_queues')
    if (error || !data || !['complete', 'partial', 'skipped'].includes(data.status)) {
      // Log codes only. Never echo SQL errors, credentials or private rows.
      console.error('Member queue worker failed', error?.code ?? 'invalid_result')
      return NextResponse.json({ error: 'Queue processing failed' }, { status: 500, headers })
    }
    const result = {
      status: data.status, runId: data.runId ?? null,
      departmentsProcessed: data.departmentsProcessed, newReservations: data.newReservations, failures: data.failures,
    }
    return NextResponse.json(result, { status: data.status === 'partial' ? 500 : 200, headers })
  } catch {
    console.error('Member queue worker service unavailable')
    return NextResponse.json({ error: 'Queue service unavailable' }, { status: 503, headers })
  }
}
