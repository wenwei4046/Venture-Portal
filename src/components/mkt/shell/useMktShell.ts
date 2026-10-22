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
    document.addEventListener('visibilitychange', back)
    return () => document.removeEventListener('visibilitychange', back)
  }, [read])
  return { data, reload: () => void read() }
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
