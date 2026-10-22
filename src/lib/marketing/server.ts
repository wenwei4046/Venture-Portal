import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { boardFromRow, type MktBoard } from './board'
import { mktNoticesFromRow, type MktNotice } from './shell'

// Marketing's reads on the page's own session (the DEFINER functions of mig 20261023214100 ask Marketing · View
// themselves). A refusal throws — the page's error boundary answers it.

const client = async () => (await createClient()) as unknown as SupabaseClient

/** The board: open projects and those of the last 60 days — and, given a window, those with a stage due in it. */
export async function readBoard(range?: { from: string; to: string }): Promise<MktBoard> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_board', range ? { p_from: range.from, p_to: range.to } : {})
  if (error) throw new Error(error.message)
  return boardFromRow(data)
}

/** The viewer's own Marketing notices, newest first. */
export async function readNotices(limit = 30): Promise<MktNotice[]> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_notices', { p_limit: limit })
  if (error) throw new Error(error.message)
  return mktNoticesFromRow(data)
}
