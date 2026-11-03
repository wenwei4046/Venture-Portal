import type { SupabaseClient } from '@supabase/supabase-js'
import { requireActionOn } from '@/lib/auth'
import { adminClient } from '@/lib/supabase/admin'
import { MARKETING_POOL } from '@/lib/marketing/pool'
import { monthlyCashFlowFile, monthlyFileAsk, monthlyPnlFile } from '../../../reports/_lib/monthly-files'

// Marketing's own pool's Excel and PDF (2026-10-28 — the user: "Excel/PDF 也给"): the very files Finance takes for
// Marketing, Marketing's segment named in code. Read through the service role once Marketing pool · Export is held —
// the ledger opens to the treasury only.
export async function GET(req: Request) {
  await requireActionOn('/marketing/pool', 'marketing_pool', 'export')
  const url = new URL(req.url)
  const ask = { ...monthlyFileAsk(url), segment: MARKETING_POOL.segment }
  const reader = adminClient() as unknown as SupabaseClient
  return url.searchParams.get('view') === 'pnl' ? monthlyPnlFile(reader, ask) : monthlyCashFlowFile(reader, ask)
}
