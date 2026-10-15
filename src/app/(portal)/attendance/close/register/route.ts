import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePage, requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { closeMonthOf, registerCsv } from '@/lib/attendance/close'
import { registerOf } from '@/lib/attendance/engine'
import { otHoursOf } from '@/lib/attendance/payroll'
import { loadBoard, loadRequests } from '@/lib/attendance/server'
import { officeToday } from '@/lib/office-time'

// Month close › Outputs › Statutory register (2026-10-15, the Attendance handoff): the month's register as a CSV —
// the one frozen on close (`att_register`, mig 20261015040000), or, while the month is open or before that reader
// exists, as reckoned now from the same facts. Read-only; Attendance · View on the Month close page.

export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<Response> {
  await requirePage('/attendance/close')
  await requirePermission('attendance')
  const month = closeMonthOf(officeToday(), new URL(req.url).searchParams.get('m'))
  const supabase = (await createClient()) as unknown as SupabaseClient
  const frozen = await supabase.rpc('att_register', { p_month: month })
  let rows: Array<Record<string, unknown>> | null = !frozen.error && Array.isArray(frozen.data) ? (frozen.data as Array<Record<string, unknown>>) : null
  if (!rows) {
    const [board, requests] = await Promise.all([loadBoard(month), loadRequests()])
    if (!board.ok) return new Response(board.reason, { status: 403 })
    const { config, month: facts } = board.data
    const ctx = { config, month: facts, today: config.today, now: config.now }
    rows = registerOf(ctx, requests.ok ? otHoursOf(ctx, requests.data) : undefined)
  }
  const name = `Register_${month.slice(0, 7)}.csv`
  return new Response(registerCsv(rows), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' },
  })
}
