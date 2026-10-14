import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { firstOfMonth } from './engine'
import type { AttConfig, AttLedger, AttMonth, AttRequest } from './types'

/**
 * HR › Attendance's readers (2026-10-15): each is one of the module's own
 * functions (mig 20261015030200), which asks Attendance · View itself. A
 * refusal comes back as words, never a throw — the page still draws.
 */
export type Read<T> = { ok: true; data: T } | { ok: false; reason: string }

const NO_VIEW = 'Attendance needs Attendance · View.'

async function rpc<T>(fn: string, args: Record<string, unknown> | undefined, what: string): Promise<Read<T>> {
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc(fn, args)
  if (error) return { ok: false, reason: error.code === '42501' ? NO_VIEW : `${what} could not be read. Please try again.` }
  return { ok: true, data: data as T }
}

const num = (v: unknown) => (v == null ? null : Number(v))

/** Settings and the people they apply to. */
export async function loadConfig(): Promise<Read<AttConfig>> {
  const r = await rpc<AttConfig>('att_config', undefined, 'Attendance')
  if (!r.ok) return r
  const c = r.data
  return {
    ok: true,
    data: {
      ...c,
      otRates: c.otRates.map(x => ({ ...x, multiplier: Number(x.multiplier), minimum: Number(x.minimum) })),
      leaveTypes: c.leaveTypes.map(t => ({ ...t, groups: (t.groups ?? []).map(g => ({ ...g, base: Number(g.base), steps: (g.steps ?? []).map(s => ({ yrs: Number(s.yrs), days: Number(s.days) })) })) })),
    },
  }
}

/** One month's facts (any day of it). */
export async function loadMonth(day: string): Promise<Read<AttMonth>> {
  return rpc<AttMonth>('att_month', { p_month: firstOfMonth(day) }, 'The month')
}

export async function loadRequests(): Promise<Read<AttRequest[]>> {
  const r = await rpc<AttRequest[]>('att_requests_list', undefined, 'The requests')
  if (!r.ok) return r
  return { ok: true, data: r.data.map(x => ({ ...x, days: num(x.days), hours: num(x.hours) })) }
}

export async function loadLedger(year: number): Promise<Read<AttLedger>> {
  const r = await rpc<AttLedger>('att_ledger', { p_year: year }, 'The leave ledger')
  if (!r.ok) return r
  return {
    ok: true,
    data: { ...r.data, entries: r.data.entries.map(e => ({ ...e, days: Number(e.days) })), leave: r.data.leave.map(l => ({ ...l, days: num(l.days) })) },
  }
}

/** Settings + a month, read together. */
export async function loadBoard(day: string): Promise<Read<{ config: AttConfig; month: AttMonth }>> {
  const [config, month] = await Promise.all([loadConfig(), loadMonth(day)])
  if (!config.ok) return config
  if (!month.ok) return month
  return { ok: true, data: { config: config.data, month: month.data } }
}
