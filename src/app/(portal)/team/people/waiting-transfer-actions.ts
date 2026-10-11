'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireActionOn } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { sees } from '@/lib/sensitive'
import { accountDigits, nricDigits, transferErrorWords, transferRefusal, type TransferInput } from '@/lib/commission/waiting-transfer'

export type TransferOutcome = { ok: true; staffId: string; code: string | null } | { ok: false; reason: string }

/**
 * "Add to company" on the waiting list's employee form (2026-10-10, the HR
 * revamp): files the applicant as an employee of the sub-department they
 * applied to — fully commission based, NRIC and the first bank account
 * required — and takes them off the waiting list, in ONE transaction
 * (`member_transfer_waiting`, mig 20261010150000). SECURITY INVOKER: the
 * roster row is written under this session, so its row policies, People ›
 * Create and the roster's triggers answer as they do for Add Staff; the
 * waiting list's own functions ask `member_is_manager` again, and the
 * headcount limit is checked there under the capacity lock.
 *
 * The gate is both doors: People › Create (it files a person) and the member
 * back office (it closes a request). NRIC and the bank account are written,
 * so the title must tick both (2026-10-09, PR4).
 */
export async function transferFromWaitingList(input: TransferInput): Promise<TransferOutcome> {
  const user = await requireActionOn('/team/people', 'team', 'create')
  if (!user.permissions.includes('member_requests_manage')) {
    return { ok: false, reason: 'Transferring from the waiting list needs HR request management access.' }
  }
  if (!sees(user, 'nric') || !sees(user, 'bank')) {
    return { ok: false, reason: 'Transferring needs NRIC and Bank accounts ticked for your title — the form files both.' }
  }
  const refused = transferRefusal(input)
  if (refused) return { ok: false, reason: refused }

  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc('member_transfer_waiting', {
    p_request: input.requestId,
    p_name: input.name.trim(),
    p_title: input.titleId,
    p_reports_to: input.reportsTo || null,
    p_hire_date: input.hireDate,
    p_nric: nricDigits(input.nric),
    p_bank_name: input.bankName.trim(),
    p_bank_account_no: accountDigits(input.bankAccountNo),
    p_contact: input.contact.trim() || null,
    p_email: input.email.trim() || null,
  })
  if (error) return { ok: false, reason: transferErrorWords(error) }
  const answer = (data ?? {}) as { staffId?: unknown; code?: unknown }
  if (typeof answer.staffId !== 'string') return { ok: false, reason: 'The employee was added, but could not be read back. Reload the page.' }

  revalidatePath('/team', 'layout')
  revalidatePath('/revenue', 'layout')
  revalidatePath('/hr-costing')
  revalidatePath('/member-admin')
  revalidatePath('/member')
  return { ok: true, staffId: answer.staffId, code: typeof answer.code === 'string' ? answer.code : null }
}
