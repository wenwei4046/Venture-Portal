import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { optionListsFromRow, type OptionLists } from '@/lib/marketing/options'
import { visitFromRow, type Visit } from '@/lib/marketing/space'
import { taskFromRow, type MktTaskPage } from '@/lib/marketing/task'

// The Marketing app's reads on the person's own move (2026-11-28): a task opened, a teammate's space visited — from the
// browser, on the person's own session, as the chat's thread and the shell's counts are read (chat-read.ts,
// useMktShell). Never a Server Action fired on its own (speed.md). Null when it cannot be read.

const db = () => createClient() as unknown as SupabaseClient

/** A task by its id or Track ID, as its desktop page reads it (`mkt_project`); null when it is not there. */
export async function readTaskNow(key: string): Promise<MktTaskPage | null> {
  try {
    const { data, error } = await db().rpc('mkt_project', { p_key: key })
    return error ? null : taskFromRow(data)
  } catch {
    return null
  }
}

/** The shared option lists a task's choice may name (③d-2). */
export async function readOptionListsNow(): Promise<OptionLists | null> {
  try {
    const { data, error } = await db().rpc('mkt_option_lists')
    return error ? null : optionListsFromRow(data)
  } catch {
    return null
  }
}

/** A teammate's space for a visit (`mkt_space_of`); null for anybody off the roster or without a login. */
export async function readVisitNow(staff: string): Promise<Visit | null> {
  try {
    const { data, error } = await db().rpc('mkt_space_of', { p_staff: staff })
    return error ? null : visitFromRow(data)
  } catch {
    return null
  }
}
