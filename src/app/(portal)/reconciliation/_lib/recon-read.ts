import dayjs from 'dayjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/paginate'
import { windowStart } from '@/lib/recon-report'
import type { ReviewBookLine, ReviewMatchGroup, ReviewStatementLine } from '../[sessionId]/_components/ReconReview'

// What Bank Reconciliation reads (2026-10-15, lifted out of its two pages so
// the Finance phone app reads the very same): each active bank against its GL
// account and every saved month with how much of it is cleared; and one month's
// session as its review page reads it — the statement lines, the match groups
// (and the contra sets on either side), the book lines still on no statement,
// and the GL's month-end balance.

const r2 = (n: number) => Math.round(n * 100) / 100

export interface ReconBank {
  id: string
  bank_name: string
  account_number: string | null
  current_balance: number
  gl_account_code: string | null
  is_primary: boolean
  /** The GL balance on its account code (the trial balance's); 0 without a code. */
  gl: number
}

export interface ReconSessionRow {
  id: string
  bankId: string
  bank: string
  /** First day of the statement month (YYYY-MM-DD). */
  periodMonth: string
  file: string | null
  status: string
  /** Cleared = matched, contra'd or ignored — the review page's count. */
  cleared: number
  total: number
}

export async function readReconHub(supabase: SupabaseClient): Promise<{ banks: ReconBank[]; sessions: ReconSessionRow[] }> {
  const [{ data: bankAccounts }, { data: glBalances }, { data: sessions }, { data: lineRows }] = await Promise.all([
    supabase.from('bank_accounts').select('id, bank_name, account_number, current_balance, gl_account_code, is_primary').eq('status', 'active').order('is_primary', { ascending: false }),
    supabase.from('trial_balance').select('account_code, balance'),
    supabase.from('bank_recon_sessions').select('id, bank_account_id, period_month, source_filename, status, created_at').order('period_month', { ascending: false }),
    // Every statement line of every session (2026-10-08): each upload adds
    // a month's worth, and past PostgREST's 1000-row cap the counts below
    // would silently come up short. Only counted, so the pages' order will
    // do; a failed read still counts nothing, as before.
    fetchAllRows((lo, hi) => supabase.from('bank_recon_lines').select('session_id, match_kind').order('id').range(lo, hi)).then(
      (data) => ({ data }),
      () => ({ data: null }),
    ),
  ])

  const glMap = new Map(((glBalances ?? []) as Array<{ account_code: string; balance: number }>).map((g) => [g.account_code, Number(g.balance)]))
  const banks: ReconBank[] = ((bankAccounts ?? []) as Array<Omit<ReconBank, 'gl'>>).map((b) => ({
    ...b,
    current_balance: Number(b.current_balance),
    gl: b.gl_account_code ? (glMap.get(b.gl_account_code) ?? 0) : 0,
  }))
  const bankById = new Map(banks.map((b) => [b.id, b]))

  // Cleared = matched to the books, contra'd against other statement lines
  // (a bank charge the bank waived — mig 20260928010000), or ignored. Only
  // what is none of those is still open, the way the review page counts it.
  const countsBySession = new Map<string, { total: number; cleared: number }>()
  for (const l of (lineRows ?? []) as Array<{ session_id: string; match_kind: string | null }>) {
    const c = countsBySession.get(l.session_id) ?? { total: 0, cleared: 0 }
    c.total++
    if (l.match_kind != null) c.cleared++
    countsBySession.set(l.session_id, c)
  }

  const rows: ReconSessionRow[] = ((sessions ?? []) as Array<{ id: string; bank_account_id: string; period_month: string; source_filename: string | null; status: string }>).map((s) => {
    const c = countsBySession.get(s.id) ?? { total: 0, cleared: 0 }
    return {
      id: s.id,
      bankId: s.bank_account_id,
      bank: bankById.get(s.bank_account_id)?.bank_name ?? '—',
      periodMonth: s.period_month,
      file: s.source_filename,
      status: s.status,
      cleared: c.cleared,
      total: c.total,
    }
  })
  return { banks, sessions: rows }
}

export interface ReconSessionRead {
  session: {
    id: string
    bank_account_id: string
    period_month: string
    source_filename: string | null
    status: string
    statement_opening: number | null
    statement_closing: number | null
  }
  bank: { bank_name: string; gl_account_code: string }
  statementLines: ReviewStatementLine[]
  /** N statement lines ↔ M journal lines, totals equal. */
  groups: ReviewMatchGroup[]
  /** Book-only Dr/Cr sets that never hit the bank (Σ = 0). */
  contraGroups: Array<{ id: string; journalLineIds: string[] }>
  /** Statement-only sets that cancel each other (Σ = 0). */
  statementContraGroups: Array<{ id: string; statementLineIds: string[] }>
  unmatchedBook: ReviewBookLine[]
  bookInfo: Record<string, ReviewBookLine>
  /** GL balance on the bank's account code at the statement month-end. */
  glClosing: number
}

/** One month's session as its review page reads it; null when there is none (or its bank has no GL code). */
export async function readReconSession(supabase: SupabaseClient, sessionId: string): Promise<ReconSessionRead | null> {
  const { data: session } = await supabase
    .from('bank_recon_sessions')
    .select('id, bank_account_id, period_month, source_filename, status, statement_opening, statement_closing')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session) return null

  const [{ data: bank }, { data: lines }] = await Promise.all([
    supabase.from('bank_accounts').select('bank_name, gl_account_code').eq('id', session.bank_account_id).maybeSingle(),
    supabase.from('bank_recon_lines').select('id, txn_date, description, amount, match_kind').eq('session_id', sessionId).order('txn_date'),
  ])
  if (!bank?.gl_account_code) return null

  const lineIds = ((lines ?? []) as Array<{ id: string }>).map((l) => l.id)
  const [{ data: matchRows }, { data: contraRows }] = await Promise.all([
    lineIds.length > 0
      ? supabase.from('bank_recon_matches').select('statement_line_id, journal_line_id, match_group').in('statement_line_id', lineIds)
      : Promise.resolve({ data: [] }),
    supabase.from('bank_recon_matches').select('journal_line_id, match_group').eq('session_id', sessionId).is('statement_line_id', null),
  ])
  // Book-only contra groups (Dr/Cr pairs that never hit the bank).
  const contraMap = new Map<string, string[]>()
  for (const c of (contraRows ?? []) as Array<{ journal_line_id: string | null; match_group: string }>) {
    if (!c.journal_line_id) continue
    const list = contraMap.get(c.match_group) ?? []
    list.push(c.journal_line_id)
    contraMap.set(c.match_group, list)
  }
  const contraGroups = [...contraMap.entries()].map(([id, journalLineIds]) => ({ id, journalLineIds }))
  // Groups: N statement lines ↔ M journal lines with equal totals. A group
  // with no journal line at all is a statement-side contra (mig 20260928010000)
  // — the bank charged and waived, so it is shown on its own, not as a match.
  const groupMap = new Map<string, { statementLineIds: Set<string>; journalLineIds: string[] }>()
  for (const m of (matchRows ?? []) as Array<{ statement_line_id: string; journal_line_id: string | null; match_group: string }>) {
    const g = groupMap.get(m.match_group) ?? { statementLineIds: new Set<string>(), journalLineIds: [] }
    g.statementLineIds.add(m.statement_line_id)
    if (m.journal_line_id) g.journalLineIds.push(m.journal_line_id)
    groupMap.set(m.match_group, g)
  }
  const allGroups = [...groupMap.entries()].map(([id, g]) => ({ id, statementLineIds: [...g.statementLineIds], journalLineIds: g.journalLineIds }))
  const groups = allGroups.filter((g) => g.journalLineIds.length > 0)
  const statementContraGroups = allGroups.filter((g) => g.journalLineIds.length === 0).map((g) => ({ id: g.id, statementLineIds: g.statementLineIds }))

  const statementLines: ReviewStatementLine[] = ((lines ?? []) as Array<{ id: string; txn_date: string; description: string | null; amount: number; match_kind: string | null }>).map((l) => ({
    id: l.id,
    date: l.txn_date,
    description: l.description ?? '',
    amount: Number(l.amount),
    matchKind: l.match_kind,
  }))

  // Book lines on this bank's GL code: −10d buffer, extended back to the
  // bank's FIRST recon month so earlier months' unpresented lines stay
  // matchable (user 2026-08-11: June must show May's in-transit items — the
  // 20 May BIG MATRIX pair sat outside the old 10-day buffer). Anything
  // before the recon era stays out (旧系统已对完); future-month entries never
  // belong to this statement.
  const { data: firstSess } = await supabase
    .from('bank_recon_sessions')
    .select('period_month')
    .eq('bank_account_id', session.bank_account_id)
    .order('period_month', { ascending: true })
    .limit(1)
    .maybeSingle()
  const from = windowStart(session.period_month, firstSess?.period_month ?? null)
  const to = dayjs(session.period_month).endOf('month').format('YYYY-MM-DD')
  // Paged reads — PostgREST silently caps unranged selects at 1000 rows, and
  // both of these grow without bound (Trial Balance regression class). The GL's
  // month-end balance starts beside them.
  const [bookRaw, claimedRows, glAll] = await Promise.all([
    fetchAllRows((lo, hi) =>
      supabase
        .from('journal_lines')
        .select('id, entry_id, debit, credit, description, journal_entries!inner(entry_no, transaction_date, description, is_reversed)')
        .eq('account_code', bank.gl_account_code)
        .gte('journal_entries.transaction_date', from)
        .lte('journal_entries.transaction_date', to)
        .eq('journal_entries.is_reversed', false)
        .order('id')
        .range(lo, hi),
    ),
    fetchAllRows((lo, hi) => supabase.from('bank_recon_matches').select('journal_line_id').order('id').range(lo, hi)),
    // GL balance on this bank code at month-end — shown next to the statement
    // closing so 银行数 vs GL 数 read apart at a glance (user 2026-08-08).
    fetchAllRows((lo, hi) =>
      supabase
        .from('journal_lines')
        .select('debit, credit, journal_entries!inner(transaction_date, is_reversed)')
        .eq('account_code', bank.gl_account_code)
        .lte('journal_entries.transaction_date', to)
        .eq('journal_entries.is_reversed', false)
        .order('id')
        .range(lo, hi),
    ),
  ])
  const claimed = new Set((claimedRows as Array<{ journal_line_id: string | null }>).map((c) => c.journal_line_id).filter(Boolean))
  const matchedHere = new Set([...groups.flatMap((g) => g.journalLineIds), ...contraGroups.flatMap((g) => g.journalLineIds)])
  const glClosing = r2((glAll as unknown as Array<{ debit: number | null; credit: number | null }>).reduce((s, l) => s + Number(l.debit ?? 0) - Number(l.credit ?? 0), 0))

  const bookRows = bookRaw as unknown as Array<{
    id: string
    entry_id: string
    debit: number | null
    credit: number | null
    description: string | null
    journal_entries: { entry_no: string | null; transaction_date: string; description: string | null }
  }>
  // Internal flips (inter-billing dept transfers, same-bank staging): the JE
  // debits AND credits this bank code — no real bank transaction, keep out
  // (user 2026-08-08: "interbilling 的别出现哦").
  const flip = new Map<string, { dr: boolean; cr: boolean }>()
  for (const l of bookRows) {
    const e = flip.get(l.entry_id) ?? { dr: false, cr: false }
    if (Number(l.debit ?? 0) > 0) e.dr = true
    if (Number(l.credit ?? 0) > 0) e.cr = true
    flip.set(l.entry_id, e)
  }
  const internalEntries = new Set([...flip.entries()].filter(([, e]) => e.dr && e.cr).map(([id]) => id))

  const allBook = bookRows
    .filter((l) => !internalEntries.has(l.entry_id))
    .map((l) => ({
      id: l.id,
      date: l.journal_entries.transaction_date,
      entryNo: l.journal_entries.entry_no ?? '—',
      description: `${l.journal_entries.description ?? ''}${l.description ? ` · ${l.description}` : ''}`.trim(),
      amount: r2(Number(l.debit ?? 0) - Number(l.credit ?? 0)),
    }))
    .filter((l) => l.amount !== 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.entryNo.localeCompare(b.entryNo))

  // For the matched table we need info on lines matched HERE; for the
  // unmatched book side we exclude anything claimed by ANY session.
  const bookInfoById = new Map(allBook.map((b) => [b.id, b]))
  const unmatchedBook: ReviewBookLine[] = allBook.filter((b) => !claimed.has(b.id))

  // Matched journal lines might sit outside the window (rare) — fetch missing.
  const missingIds = [...matchedHere].filter((id) => !bookInfoById.has(id))
  if (missingIds.length > 0) {
    const { data: extra } = await supabase
      .from('journal_lines')
      .select('id, debit, credit, description, journal_entries!inner(entry_no, transaction_date, description)')
      .in('id', missingIds)
    for (const l of (extra ?? []) as unknown as Array<{
      id: string
      debit: number | null
      credit: number | null
      description: string | null
      journal_entries: { entry_no: string | null; transaction_date: string; description: string | null }
    }>) {
      bookInfoById.set(l.id, {
        id: l.id,
        date: l.journal_entries.transaction_date,
        entryNo: l.journal_entries.entry_no ?? '—',
        description: `${l.journal_entries.description ?? ''}${l.description ? ` · ${l.description}` : ''}`.trim(),
        amount: r2(Number(l.debit ?? 0) - Number(l.credit ?? 0)),
      })
    }
  }

  return {
    session: {
      id: session.id as string,
      bank_account_id: session.bank_account_id as string,
      period_month: session.period_month as string,
      source_filename: (session.source_filename as string | null) ?? null,
      status: session.status as string,
      statement_opening: session.statement_opening != null ? Number(session.statement_opening) : null,
      statement_closing: session.statement_closing != null ? Number(session.statement_closing) : null,
    },
    bank: { bank_name: bank.bank_name as string, gl_account_code: bank.gl_account_code as string },
    statementLines,
    groups,
    contraGroups,
    statementContraGroups,
    unmatchedBook,
    bookInfo: Object.fromEntries(bookInfoById),
    glClosing,
  }
}
