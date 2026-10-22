import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient } from '@/lib/supabase/admin'
import { flushPush } from '@/lib/push/outbox'
import { sweepHiringLeftovers } from '@/lib/hiring/leftovers'
import { sweepDataCenterBin } from '@/lib/documentation/drive-bin-sweep'
import { refreshAdStatuses } from '@/lib/member/crm-ad-names-meta'

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
    // The CRM's due notices (mig 20261014240000): visits tomorrow whose reminder has not gone, chats waiting past
    // 3 h · 6 h · 9 h — written once each, then sent by the flush below. A count only.
    const crmDue = await db.rpc('notify_crm_due')
    if (crmDue.error) console.error('CRM due notices failed', crmDue.error.code ?? 'unknown')
    else if (crmDue.data) console.info('CRM due notices written', crmDue.data)
    // Whether each CRM ad is still running (mig 20261022120000): Ads Manager's effective_status, kept for the
    // phone's Assignment tabs (Running | Paused). Best effort — a count only.
    const adStatuses = await refreshAdStatuses(db, process.env.META_SYSTEM_USER_TOKEN?.trim())
    if (adStatuses) console.info('CRM ad statuses kept', adStatuses)
    // Phone notifications a write left unsent (mig 20261011180000) — through the outbox's own secret, not the service role.
    await flushPush()
    // Hiring's leftovers (mig 20261011210000; the user: every hour, even when nobody touches Hiring): files no
    // record names, over a day old, a bounded batch through the Storage API — after the Talent Bank's Bin has let go
    // what waited there 30 days (mig 20261013061500). Counts only — the names are people's files.
    const leftovers = await sweepHiringLeftovers(db)
    if (!leftovers) console.error('Hiring leftover sweep failed')
    else {
      if (leftovers.expired === null) console.error('Talent Bank bin sweep failed')
      else if (leftovers.expired) console.info('Talent Bank bin let go', leftovers.expired, 'after 30 days')
      if (leftovers.listed) console.info('Hiring leftovers deleted', leftovers.deleted, 'of', leftovers.listed)
    }
    // The Data center's Bin (mig 20261013183000): what waited 30 days goes, and its files with it. Counts only.
    const dataCenterBin = await sweepDataCenterBin(db)
    if (!dataCenterBin) console.error('Data center bin sweep failed')
    else if (dataCenterBin.expired) console.info('Data center bin let go', dataCenterBin.expired, 'after 30 days; files deleted', dataCenterBin.deleted)
    // …and (2026-10-14) objects nobody recorded a day after they went up — an upload or a copy whose record never came.
    if (dataCenterBin?.orphans) console.info('Data center unrecorded objects removed', dataCenterBin.orphans)
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
      dataCenterBin,
    }
    return NextResponse.json(result, { status: data.status === 'partial' || due.error ? 500 : 200, headers })
  } catch {
    console.error('Member queue worker service unavailable')
    return NextResponse.json({ error: 'Queue service unavailable' }, { status: 503, headers })
  }
}
