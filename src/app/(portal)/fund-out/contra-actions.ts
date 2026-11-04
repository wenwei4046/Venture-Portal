'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn } from '@/lib/auth'
import type { ContraDeal, ContraLine, ContraOptions } from '@/lib/fund-contra'

// Fund contra (2026-11-04, mig 20261104230000): filed from Fund OUT's or Fund IN's hub (Treasury · Create), decided by
// the Principal in Approvals, undone whole from a deal's page (Treasury · Void, at once — the user: 有 Void 权限就直接撤回).
// Every answer is in words — production hides a thrown message behind a digest.

const money = (n: number) => `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const tagOf = (text: string | null | undefined) => (text ?? '').match(/\[[^\]]{1,24}\]/)?.[0] ?? ''

/** The deals the dialog offers: every active loan and every active fund source, with what each owes in principal. */
export async function openFundContra(): Promise<{ ok: true; options: ContraOptions } | { ok: false; reason: string }> {
  await requireActionOn(['/fund-out', '/fund-in'], 'treasury', 'create')
  const supabase = await createClient()
  const [loans, loanOut, sources, sourceOut, companies, departments] = await Promise.all([
    supabase.from('loans').select('id, company_id, principal, repayment_terms').eq('status', 'active'),
    supabase.from('loan_outstanding').select('loan_id, outstanding'),
    supabase.from('fund_sources').select('id, from_company_id, from_director_id, from_department_id, from_freetext_name, amount, notes').in('status', ['active', 'matured']),
    supabase.from('fund_source_outstanding').select('fund_source_id, outstanding'),
    supabase.from('companies').select('id, short_code, name'),
    supabase.from('departments').select('id, name'),
  ])
  const failed = [loans, loanOut, sources, sourceOut, companies].find((r) => r.error)
  if (failed?.error) return { ok: false, reason: `The deals could not be read: ${failed.error.message}` }
  const co = new Map((companies.data ?? []).map((c) => [c.id as string, (c.short_code ?? c.name ?? '') as string]))
  const dept = new Map((departments.data ?? []).map((d) => [d.id as string, d.name as string]))
  const lo = new Map((loanOut.data ?? []).map((o) => [o.loan_id as string, Number(o.outstanding)]))
  const so = new Map((sourceOut.data ?? []).map((o) => [o.fund_source_id as string, Number(o.outstanding)]))
  const byLabel = (a: ContraDeal, b: ContraDeal) => a.label.localeCompare(b.label)

  const loanDeals: ContraDeal[] = (loans.data ?? []).map((l) => {
    const tag = tagOf(l.repayment_terms as string | null)
    return {
      id: l.id as string,
      label: `${co.get(l.company_id as string) || 'Loan'}${tag ? ` ${tag}` : ''} · ${money(Number(l.principal))}`,
      outstanding: lo.get(l.id as string) ?? 0,
    }
  })
  const sourceDeals: ContraDeal[] = (sources.data ?? []).map((f) => {
    const party =
      (f.from_company_id ? co.get(f.from_company_id as string) : null) ||
      (f.from_department_id ? dept.get(f.from_department_id as string) : null) ||
      (f.from_freetext_name as string | null) ||
      // A director's name is not this page's to read (directors asks other cells than Treasury · Create).
      (f.from_director_id ? 'Director' : null) ||
      'Fund source'
    const tag = tagOf(f.notes as string | null)
    return { id: f.id as string, label: `${party}${tag ? ` ${tag}` : ''} · ${money(Number(f.amount))}`, outstanding: so.get(f.id as string) ?? 0 }
  })
  return { ok: true, options: { loans: loanDeals.sort(byLabel), sources: sourceDeals.sort(byLabel) } }
}

/** Files the contra for the Principal; nothing moves until it is approved. */
export async function fileFundContra(input: { date: string; notes: string; lines: ContraLine[] }): Promise<{ ok: true; message: string } | { ok: false; reason: string }> {
  await requireActionOn(['/fund-out', '/fund-in'], 'treasury', 'create')
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { error } = await supabase.rpc('file_fund_contra', {
    p_date: input.date,
    p_lines: input.lines.map((l) => ({ side: l.side, id: l.id, principal: l.principal, interest: l.interest })),
    p_notes: input.notes.trim() || null,
  })
  if (error) return { ok: false, reason: error.message }
  revalidatePath('/approvals')
  revalidatePath('/fund-out')
  revalidatePath('/fund-in')
  return { ok: true, message: 'Contra submitted — waiting for the Principal' }
}

/** Takes an approved contra back whole: a reversing entry, both sides' repayments gone, the Venture Pool countered. */
export async function undoFundContra(contraId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  await requireActionOn(['/fund-out/[id]', '/fund-in/[id]'], 'treasury', 'void')
  if (!contraId) return { ok: false, reason: 'Which contra? Open the deal again.' }
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { error } = await supabase.rpc('undo_fund_contra', { p_contra_id: contraId })
  if (error) return { ok: false, reason: `The contra was not undone: ${error.message}` }
  for (const p of ['/fund-out', '/fund-in', '/repayment-schedule', '/reports/company-statement', '/reports/loan-aging', '/venture-pool']) revalidatePath(p)
  revalidatePath('/fund-out/[id]', 'page')
  revalidatePath('/fund-in/[id]', 'page')
  return { ok: true }
}
