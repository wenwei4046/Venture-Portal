'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn } from '@/lib/auth'
import { officeToday } from '@/lib/office-time'
import { monthEndOf, planIisMonth, type IisMonthRow } from '@/lib/iis'
import { iisLiveFrom, loadIisBook } from '@/lib/iis-data'

// Interest in suspense — the month-end run (2026-11-13, mig 20261113140000; the user's method, memory
// iis-method-decided): from Fund OUT's or Fund IN's head (Treasury · Approve), a month's entries, one a deal — what
// still goes into suspense by the month's end, and the interest received / paid that month taken out to 5027 / 6000.
// It posts only what is new, so running a month twice adds nothing. Every answer is in words.

export interface IisMonthPreview {
  ym: string
  date: string
  rows: IisMonthRow[]
}

type Answer<T> = ({ ok: true } & T) | { ok: false; reason: string }

// Treasury · View reads the deals; Treasury · Approve posts the month (Amend terms' cell) — asked in each action.
async function plan(ym: string): Promise<Answer<{ preview: IisMonthPreview; supabase: SupabaseClient }>> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) return { ok: false, reason: 'Pick a month.' }
  const supabase = (await createClient()) as unknown as SupabaseClient
  const today = officeToday()
  try {
    const live = await iisLiveFrom(supabase)
    if (!live) return { ok: false, reason: 'Interest in suspense is not live yet.' }
    if (ym < live.slice(0, 7)) return { ok: false, reason: `Interest in suspense starts from ${live.slice(0, 7)}.` }
    if (ym > today.slice(0, 7)) return { ok: false, reason: 'That month has not begun yet.' }
    const book = await loadIisBook(supabase, today)
    const end = monthEndOf(ym)
    return { ok: true, supabase, preview: { ym, date: end < today ? end : today, rows: planIisMonth(book, ym, today) } }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'The month could not be worked out.' }
  }
}

/** What the month's run would post — nothing is written. */
export async function previewIisMonth(ym: string): Promise<Answer<{ preview: IisMonthPreview }>> {
  await requireActionOn(['/fund-out', '/fund-in'], 'treasury', 'view')
  await requireActionOn(['/fund-out', '/fund-in'], 'treasury', 'approve')
  const p = await plan(ym)
  return p.ok ? { ok: true, preview: p.preview } : p
}

/** Posts the month's run: one journal voucher a deal. */
export async function postIisMonth(ym: string): Promise<Answer<{ posted: number }>> {
  await requireActionOn(['/fund-out', '/fund-in'], 'treasury', 'view')
  await requireActionOn(['/fund-out', '/fund-in'], 'treasury', 'approve')
  const p = await plan(ym)
  if (!p.ok) return p
  const { preview, supabase } = p
  if (preview.rows.length === 0) return { ok: false, reason: `Nothing new to post for ${ym}.` }
  const rows = preview.rows.map((r) => ({
    kind: r.kind,
    id: r.id,
    month: ym,
    date: preview.date,
    description: `Interest in suspense ${ym} · ${r.label}`,
    reference_type: 'iis_month',
    accrual: r.accrual,
    recognition: r.recognition,
    lines: r.lines,
  }))
  const { error } = await supabase.rpc('iis_post' as never, { p_rows: rows } as never)
  if (error) return { ok: false, reason: `The month could not be posted: ${error.message}` }
  revalidatePath('/fund-out')
  revalidatePath('/fund-in')
  return { ok: true, posted: rows.length }
}
