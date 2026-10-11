import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient } from '@/lib/supabase/admin'
import { flushPush } from '@/lib/push/outbox'
import { sweepHiringLeftovers } from '@/lib/hiring/leftovers'

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
    const db = adminClient() as unknown as SupabaseClient
    const { data, error } = await db.rpc('member_process_all_queues')
    // Replacements HR scheduled whose day has come (mig 20261010170000). Each
    // refusal is written on its own request for HR to read; only the call
    // itself failing is this sweep's failure.
    const due = await db.rpc('member_run_due_replacements')
    if (due.error) console.error('Member replacement sweep failed', due.error.code ?? 'unknown')
    // Phone notifications a write left unsent (mig 20261011180000) — through the outbox's own secret, not the service role.
    await flushPush()
    // Hiring's leftovers (mig 20261011210000; the user: every hour, even when nobody touches Hiring): files no
    // record names, over a day old, a bounded batch through the Storage API. Counts only — the names are people's files.
    const leftovers = await sweepHiringLeftovers(db)
    if (!leftovers) console.error('Hiring leftover sweep failed')
    else if (leftovers.listed) console.info('Hiring leftovers deleted', leftovers.deleted, 'of', leftovers.listed)
    if (error || !data || !['complete', 'partial', 'skipped'].includes(data.status)) {
      // Log codes only. Never echo SQL errors, credentials or private rows.
      console.error('Member queue worker failed', error?.code ?? 'invalid_result')
      return NextResponse.json({ error: 'Queue processing failed' }, { status: 500, headers })
    }
    const result = {
      status: data.status, runId: data.runId ?? null,
      departmentsProcessed: data.departmentsProcessed, newReservations: data.newReservations, failures: data.failures,
      replacements: due.error ? null : { ran: Number(due.data?.ran) || 0, failed: Number(due.data?.failed) || 0 },
      hiringLeftovers: leftovers,
    }
    return NextResponse.json(result, { status: data.status === 'partial' || due.error ? 500 : 200, headers })
  } catch {
    console.error('Member queue worker service unavailable')
    return NextResponse.json({ error: 'Queue service unavailable' }, { status: 503, headers })
  }
}
