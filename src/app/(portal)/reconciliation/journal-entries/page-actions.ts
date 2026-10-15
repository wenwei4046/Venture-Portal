'use server'

import { requireAnyActionOn, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { actionsOnPage, opensPage } from '@/lib/page-tabs'
import { journalRecordModel, type JournalRecordModel } from '@/lib/fin-app/journal-model'
import { extraReportSegments, primedRegistryRows } from '@/lib/dept-registry'
import { readJournalVoucher, readJvAccounts, readJvPrefill, type JvAccount } from './_lib/jv-read'

/**
 * A journal voucher as the Finance phone app's record screen opens it
 * (2026-10-15, part 5c): on a phone that screen IS the voucher's page, so it
 * reads what `/reconciliation/journal-entries/[id]` reads, behind its gates —
 * Reconciliation, the page's tabs — and says what this reader may do with it
 * (that page's boxes). Answered in words.
 */
export async function openJournalVoucher(id: string): Promise<{ ok: true; record: JournalRecordModel } | { ok: false; reason: string }> {
  const user = await requirePermission('reconciliation')
  if (!opensPage(user.tabs, '/reconciliation/journal-entries/[id]')) return { ok: false, reason: 'Journal Entries is not open to you.' }
  const acting = user.closed?.length ? { ...user, actions: actionsOnPage(user.actions ?? {}, user.closed, '/reconciliation/journal-entries/[id]') } : user
  const supabase = await createClient()
  const read = await readJournalVoucher(supabase, id)
  if (!read) return { ok: false, reason: 'This voucher is not there any more.' }
  return { ok: true, record: journalRecordModel(read, { create: canDo(acting, 'reconciliation', 'create'), edit: canDo(acting, 'reconciliation', 'edit') }, extraReportSegments(primedRegistryRows())) }
}

/**
 * The voucher sheet's lists, read when it opens (as Create payment's): the active accounts and — a copy, or a
 * voucher being edited — that voucher's words and lines. For whoever may raise or change one here.
 */
export async function openJournalSheet(from: string | null): Promise<
  | { ok: true; accounts: JvAccount[]; prefill: Awaited<ReturnType<typeof readJvPrefill>> | null }
  | { ok: false; reason: string }
> {
  await requireAnyActionOn('/reconciliation/journal-entries', ['reconciliation', 'create'], ['reconciliation', 'edit'])
  const supabase = await createClient()
  try {
    const [accounts, prefill] = await Promise.all([readJvAccounts(supabase), from ? readJvPrefill(supabase, from) : Promise.resolve(undefined)])
    return { ok: true, accounts, prefill: prefill ?? null }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'The accounts could not be read.' }
  }
}
