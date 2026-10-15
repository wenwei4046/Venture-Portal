import type { createClient } from '@/lib/supabase/server'
import { fetchAllRows, fetchAllRowsAsWritten } from '@/lib/paginate'
import type { AccountOption } from '@/components/AccountPicker'
import type { AccountType } from '@/lib/coa'

// The journal vouchers, read (2026-10-15 — moved out of the list page, the
// voucher's page and the new-voucher page word for word, so the Finance phone
// app's Journal Entries reads the same): the list of manual vouchers and the
// payroll accruals with their line counts, one voucher with its lines and its
// accounts' names, and the active accounts a voucher may post to.

type Client = Awaited<ReturnType<typeof createClient>>

export interface JournalListRow {
  id: string
  entry_no: string
  transaction_date: string
  description: string
  segment: string | null
  total_amount: number
  lineCount: number
  auto: boolean
}

/** Every manual voucher and payroll accrual not reversed, newest first, each with its number of lines; null when the read failed. */
export async function readJournalList(supabase: Client): Promise<JournalListRow[] | null> {
  // Manual journal vouchers + the auto payroll accrual JVs (user 2026-08-07:
  // "为什么我看没有的" — the auto ones must show HERE where Finance reviews
  // salary JVs; they render read-only with an AUTO badge). Reversed vouchers
  // stay hidden.
  //
  // Every one of them, and every line (2026-10-08): both reads are whole
  // history, and PostgREST stops an unranged read at 1000 rows without a word.
  // The lines had passed it (1,887 on 2026-10-08), so every voucher whose
  // lines fell past the first 1000 showed too few — or "0 lines". The list
  // keeps its own order while it fits (fetchAllRowsAsWritten: two vouchers of
  // one date and moment tie); the counts only need every line. A failed read
  // still shows none, as before.
  const entries = await fetchAllRowsAsWritten((page) => {
    const q = supabase
      .from('journal_entries')
      .select('*')
      .in('reference_type', ['manual_jv', 'payroll_accrual'])
      .eq('is_reversed', false)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
    return page ? q.order('id', { ascending: true }).range(page.from, page.to) : q
  }).catch(() => null)
  if (!entries) return null

  // Line COUNTS only — the previous `chart_of_accounts!inner` embed errored
  // silently, so every row showed "0 lines". Filtered through the JE join
  // instead of .in('entry_id', ids) — a long id list in the URL 400s once
  // the JV history grows (the 2026-08-13 Ledger failure class).
  const allLines = await fetchAllRows((lo, hi) =>
    supabase
      .from('journal_lines')
      .select('entry_id, journal_entries!inner(reference_type, is_reversed)')
      .in('journal_entries.reference_type', ['manual_jv', 'payroll_accrual'])
      .eq('journal_entries.is_reversed', false)
      .order('id', { ascending: true })
      .range(lo, hi),
  ).catch(() => null)

  const lineCounts = new Map<string, number>()
  for (const line of allLines ?? []) {
    lineCounts.set(line.entry_id, (lineCounts.get(line.entry_id) ?? 0) + 1)
  }

  return entries.map((e) => ({
    id: e.id,
    entry_no: e.entry_no ?? '',
    transaction_date: e.transaction_date,
    description: e.description,
    segment: (e.segment as string | null) ?? null,
    total_amount: Number(e.total_amount),
    lineCount: lineCounts.get(e.id) ?? 0,
    auto: e.reference_type === 'payroll_accrual',
  }))
}

export interface JournalVoucherRead {
  entry: {
    id: string
    entry_no: string | null
    transaction_date: string
    description: string | null
    segment: string | null
    reference_type: string
    total_amount: number | string | null
  }
  lines: Array<{ account_code: string; debit: number | null; credit: number | null; description: string | null }>
  nameOf: Map<string, string>
}

/** One manual voucher or payroll accrual, its lines and its accounts' names; null when it is neither (or not there). */
export async function readJournalVoucher(supabase: Client, id: string): Promise<JournalVoucherRead | null> {
  const [{ data: entry }, { data: lineRows }] = await Promise.all([
    supabase
      .from('journal_entries')
      .select('id, entry_no, transaction_date, description, segment, reference_type, total_amount, is_reversed')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('journal_lines').select('account_code, debit, credit, description').eq('entry_id', id).order('created_at'),
  ])
  if (!entry || !['manual_jv', 'payroll_accrual'].includes(entry.reference_type as string)) return null

  const lines = (lineRows ?? []) as JournalVoucherRead['lines']
  const codes = Array.from(new Set(lines.map((l) => l.account_code)))
  const { data: acctRows } = codes.length
    ? await supabase.from('chart_of_accounts').select('code, name').in('code', codes)
    : { data: [] as Array<{ code: string; name: string }> }
  const nameOf = new Map(((acctRows ?? []) as Array<{ code: string; name: string }>).map((a) => [a.code, a.name]))
  return { entry: entry as JournalVoucherRead['entry'], lines, nameOf }
}

export type JvAccount = AccountOption

/** The active accounts, as the voucher form's picker takes them (it hides the header accounts itself). */
export async function readJvAccounts(supabase: Client): Promise<JvAccount[]> {
  const { data: acctRows } = await supabase.from('chart_of_accounts').select('code, name, type, parent_code').eq('is_active', true).order('code')
  // Full rows for AccountPicker — it hides header accounts itself and gives
  // type-ahead search (user 2026-06-12: JV 录科目要能打字快速找到).
  return (acctRows ?? []).map((r) => ({
    code: r.code,
    name: r.name,
    type: r.type as AccountType,
    parent_code: (r as { parent_code: string | null }).parent_code ?? null,
    is_active: true,
  }))
}

/** A voucher to copy (?from=<entry id>): its words and lines, nothing posted — a manual voucher or a payroll accrual only. */
export async function readJvPrefill(supabase: Client, from: string) {
  const [{ data: src }, { data: srcLines }] = await Promise.all([
    supabase.from('journal_entries').select('id, description, segment, reference_type').eq('id', from).maybeSingle(),
    supabase.from('journal_lines').select('account_code, debit, credit, description').eq('entry_id', from).order('created_at'),
  ])
  if (!src || !['manual_jv', 'payroll_accrual'].includes(src.reference_type as string)) return undefined
  return {
    description: src.description ?? '',
    segment: (src.segment as string) ?? 'unallocated',
    lines: (srcLines ?? []).map((l) => ({
      account_code: l.account_code,
      debit: l.debit != null ? Number(l.debit) : null,
      credit: l.credit != null ? Number(l.credit) : null,
      description: l.description,
    })),
  }
}
