'use server'

import { revalidatePath } from 'next/cache'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn } from '@/lib/auth'
import { pushSoon } from '@/lib/push/outbox'
import { renewalRefusal } from '@/lib/contract-renewal'
import type { AcknowledgeOutcome } from './probation-actions'

/**
 * A contract's reminder acknowledged (2026-10-24 — the user: "need 30 days and 15 days before remind, 2 reminder"):
 * HR view's bell, the person's page or the HR app, for the end it stands at now — the database says who and when
 * (`contract_acknowledge`, mig 20261025046500, which asks the person page's box too). Renewing it is Renew, below;
 * making them permanent is the card's own edit; ending their employment is Deactivate. Answers in words: production
 * hands a thrown message to the browser only as a digest.
 */
export async function acknowledgeContract(id: string): Promise<AcknowledgeOutcome> {
  await requireActionOn('/team/people/[id]', 'team', 'edit')
  // The function postdates database.types.ts.
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc('contract_acknowledge', { p_staff: id })
  if (error) {
    const own = (error.code === '42501' || error.code === '22023') && error.message
    return { ok: false, reason: own ? error.message : 'Could not acknowledge. Please try again.' }
  }
  const answer = (data ?? {}) as { endsOn?: unknown; ackName?: unknown; ackAt?: unknown }
  revalidatePath('/team', 'layout')
  return { ok: true, endsOn: String(answer.endsOn ?? ''), ackName: String(answer.ackName ?? ''), ackAt: String(answer.ackAt ?? '') }
}

export type RenewOutcome = { ok: true; endsOn: string } | { ok: false; reason: string }

/** The new contract, already in the bucket (lib/documentation/upload.ts), and the letter type it is filed as. */
export interface RenewalLetter {
  typeId: string
  path: string
  fileName: string
  contentType: string | null
  size: number
}

const MOVED = 'Their contract changed since this page was opened — reload it.'

/**
 * Renew a contract (2026-10-24 — the user: "当它已经 expired 之后，到时候按一下 renew，就可以再选一次是几个月，对不对？同时要
 * attach 一个新的 contract"): the new contract's first day and period over the one the page read — so two renewals
 * never stack unseen — then the new contract filed to their Data center record as the Data center's Upload files a
 * letter (`hr_letter_file`: it arrived, and it is sent to them). Should the filing be refused the contract is put back
 * as it was: a renewal never stands without its contract. lib/contract-renewal.ts holds the rules; the database counts
 * the new end from the new first day (`contract_start`, mig 20261025052000). People · Edit on the person's page, and
 * Documentation · Create for the letter — the cell the database asks again.
 */
export async function renewContract(input: { staffId: string; start: string; months: number; endsWas: string; letter: RenewalLetter }): Promise<RenewOutcome> {
  await requireActionOn('/team/people/[id]', 'team', 'edit')
  await requireActionOn('/team/people/[id]', 'documentation', 'create')
  // contract_start and hr_letter_file postdate database.types.ts.
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data: row } = await supabase
    .from('hr_staff_costs')
    .select('status, employment_status, hire_date, contract_start, contract_months, contract_end')
    .eq('id', input.staffId)
    .maybeSingle()
  const now = row as {
    status: string | null
    employment_status: string | null
    hire_date: string | null
    contract_start: string | null
    contract_months: number | null
    contract_end: string | null
  } | null
  if (!now || now.status !== 'active' || now.employment_status !== 'contract') {
    return { ok: false, reason: 'They are not on a contract any more — reload the page.' }
  }
  if (now.contract_end !== input.endsWas || now.contract_months === null) return { ok: false, reason: MOVED }
  const refused = renewalRefusal({ startsOn: now.contract_start ?? now.hire_date, months: now.contract_months, endsOn: now.contract_end }, input.start, input.months)
  if (refused) return { ok: false, reason: refused }

  const { data: renewed, error } = await supabase
    .from('hr_staff_costs')
    .update({ contract_start: input.start, contract_months: input.months })
    .eq('id', input.staffId)
    .eq('employment_status', 'contract')
    .eq('contract_months', now.contract_months)
    .eq('contract_end', now.contract_end)
    .select('contract_end')
  if (error) return { ok: false, reason: `Could not renew it: ${error.message}` }
  const endsOn = (renewed as Array<{ contract_end: string | null }> | null)?.[0]?.contract_end
  if (!endsOn) return { ok: false, reason: MOVED }

  const filed = await supabase.rpc('hr_letter_file', {
    p_staff: input.staffId,
    p_type: input.letter.typeId,
    p_path: input.letter.path,
    p_file_name: input.letter.fileName,
    p_content_type: input.letter.contentType,
    p_size: input.letter.size,
  })
  if (filed.error) {
    // Put back as it was — written only over the renewal just made, so nothing changed since is undone.
    await supabase
      .from('hr_staff_costs')
      .update({ contract_start: now.contract_start, contract_months: now.contract_months })
      .eq('id', input.staffId)
      .eq('contract_start', input.start)
      .eq('contract_months', input.months)
    return { ok: false, reason: `Not renewed — the new contract could not be filed: ${letterRefusal(filed.error)}` }
  }

  revalidatePath('/team', 'layout')
  // The contract is a letter on their Data center record, and reaches the Revenue app as a memo.
  revalidatePath('/team/documentation')
  revalidatePath('/member', 'layout')
  // …and its person is told, on their phone too (mig 20261012210000).
  pushSoon()
  return { ok: true, endsOn }
}

function letterRefusal(error: PostgrestError): string {
  if (error.code === '42501') return 'filing a letter needs Documentation · Create.'
  if ((error.code === '22023' || error.code === 'P0001') && error.message) return error.message
  if (error.code === 'VIEW_AS' && error.message) return error.message
  return 'please try again.'
}
