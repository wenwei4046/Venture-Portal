'use client'

import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { mktNoticesFromRow, mktShellFromRow, type MktNotice, type MktShellData } from '@/lib/marketing/shell'

/**
 * The sidebar's counts and subsidiaries (`mkt_shell()`), read on the person's own session from the browser: when the
 * shell mounts, after each page it opens, and when the window comes back into view. Never a Server Action fired by a
 * navigation (speed.md). Null until the first answer — the rows draw without their counts meanwhile.
 */
export function useMktShell(pathname: string): { data: MktShellData | null; reload: () => void } {
  const [data, setData] = useState<MktShellData | null>(null)
  const read = useCallback(async () => {
    try {
      const db = createClient() as unknown as SupabaseClient
      const { data: row, error } = await db.rpc('mkt_shell')
      if (!error) setData(mktShellFromRow(row))
    } catch {
      // The sidebar keeps what it drew.
    }
  }, [])
  useEffect(() => {
    void read()
  }, [read, pathname])
  useEffect(() => {
    const back = () => {
      if (document.visibilityState === 'visible') void read()
    }
    // A page that changed what the shell counts (an accepted quotation's notice, 2026-11-12) asks it to read again.
    const again = () => void read()
    document.addEventListener('visibilitychange', back)
    window.addEventListener('mkt:shell-reload', again)
    return () => {
      document.removeEventListener('visibilitychange', back)
      window.removeEventListener('mkt:shell-reload', again)
    }
  }, [read])
  return { data, reload: () => void read() }
}

export interface QuoteState { status: string; tasks: number | null }

/** Whether each accepted quotation the bell names has its work assigned yet (`mkt_quote_states`, mig 20261113100000) —
 * read with the bell's list; nothing for anybody but Marketing's managers. */
export async function readQuoteStates(ids: string[]): Promise<Record<string, QuoteState>> {
  try {
    const db = createClient() as unknown as SupabaseClient
    const { data, error } = await db.rpc('mkt_quote_states', { p_ids: ids })
    if (error || !data || typeof data !== 'object') return {}
    const out: Record<string, QuoteState> = {}
    for (const [id, v] of Object.entries(data as Record<string, { status?: unknown; tasks?: unknown }>)) {
      out[id] = { status: String(v?.status ?? ''), tasks: typeof v?.tasks === 'number' ? v.tasks : null }
    }
    return out
  } catch {
    return {}
  }
}

/** The bell's list (`mkt_notices()`), read when the panel opens. */
export async function readMktNotices(): Promise<MktNotice[] | null> {
  try {
    const db = createClient() as unknown as SupabaseClient
    const { data, error } = await db.rpc('mkt_notices', { p_limit: 30 })
    return error ? null : mktNoticesFromRow(data)
  } catch {
    return null
  }
}
