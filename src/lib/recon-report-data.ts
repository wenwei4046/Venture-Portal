// Bank Reconciliation Report — data layer. Fetches one session's world and
// hands it to the pure builder in lib/recon-report; the report page and both
// exports consume THIS so screen and file always agree (same convention as
// counterparty-statement-data).
//
// Every journal_lines / bank_recon_matches read pages through fetchAllRows —
// PostgREST silently caps unranged selects at 1000 rows (the 2026-06-16 Trial
// Balance regression class).

import dayjs from 'dayjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/paginate'
import {
  buildReconReport,
  type ReconReportModel,
  type ReportBookLine,
  type ReportStatementLine,
} from '@/lib/recon-report'

const r2 = (n: number) => Math.round(n * 100) / 100

export type ReconReportData = {
  sessionId: string
  bankName: string
  accountNumber: string | null
  glCode: string
  periodMonth: string
  status: string
  sourceFilename: string | null
  model: ReconReportModel
}

export async function fetchReconReport(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<ReconReportData | null> {
  const { data: session } = await supabase
    .from('bank_recon_sessions')
    .select('id, bank_account_id, period_month, source_filename, status, statement_opening, statement_closing')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session) return null

  const { data: bank } = await supabase
    .from('bank_accounts')
    .select('bank_name, account_number, gl_account_code')
    .eq('id', session.bank_account_id)
    .maybeSingle()
  if (!bank?.gl_account_code) return null

  const periodMonth = session.period_month as string
  const monthEnd = dayjs(periodMonth).endOf('month').format('YYYY-MM-DD')

  // All of this bank's sessions: the earliest is the recon baseline (pre-era
  // history is settled — never a reconciling item); months ≤ this one scope
  // the statement side; later months matter for the as-at rule.
  const { data: sessRows } = await supabase
    .from('bank_recon_sessions')
    .select('id, period_month')
    .eq('bank_account_id', session.bank_account_id)
  const allSessions = (sessRows ?? []) as Array<{ id: string; period_month: string }>
  const monthBySession = new Map(allSessions.map(s => [s.id, s.period_month]))
  const baseline = allSessions.map(s => s.period_month).sort()[0] ?? periodMonth
  const upToM = new Set(allSessions.filter(s => s.period_month <= periodMonth).map(s => s.id))

  // Statement lines across ALL of this bank's sessions — later months' claims
  // are what keep an earlier report's outstanding list stable.
  const stmtRows = await fetchAllRows((lo, hi) =>
    supabase
      .from('bank_recon_lines')
      .select('id, session_id, txn_date, description, amount, match_kind')
      .in('session_id', allSessions.map(s => s.id))
      .order('id')
      .range(lo, hi),
  ) as Array<{
    id: string
    session_id: string
    txn_date: string
    description: string | null
    amount: number
    match_kind: string | null
  }>
  const stmtSessionById = new Map(stmtRows.map(l => [l.id, l.session_id]))

  // Matches: small table, fetched whole (paginated) and filtered to this bank
  // in memory — journal lines live on exactly one GL code, so cross-bank
  // claims cannot exist; foreign rows just fall out.
  const matchRows = await fetchAllRows((lo, hi) =>
    supabase
      .from('bank_recon_matches')
      .select('statement_line_id, journal_line_id, session_id')
      .order('id')
      .range(lo, hi),
  ) as Array<{ statement_line_id: string | null; journal_line_id: string | null; session_id: string | null }>

  // journal_line_id is UNIQUE in bank_recon_matches — one claim per line.
  const claimedByMonth = new Map<string, string>()
  const contraIds = new Set<string>()
  for (const m of matchRows) {
    if (!m.journal_line_id) continue
    if (m.statement_line_id) {
      const sess = stmtSessionById.get(m.statement_line_id)
      const month = sess ? monthBySession.get(sess) : undefined
      if (month) claimedByMonth.set(m.journal_line_id, month)
    } else if (m.session_id && monthBySession.has(m.session_id)) {
      contraIds.add(m.journal_line_id)
    }
  }

  // Book lines in the recon era up to this month-end on this bank's GL code.
  const bookRaw = await fetchAllRows((lo, hi) =>
    supabase
      .from('journal_lines')
      .select('id, entry_id, debit, credit, description, journal_entries!inner(entry_no, transaction_date, description, is_reversed)')
      .eq('account_code', bank.gl_account_code as string)
      .gte('journal_entries.transaction_date', baseline)
      .lte('journal_entries.transaction_date', monthEnd)
      .eq('journal_entries.is_reversed', false)
      .order('id')
      .range(lo, hi),
  ) as unknown as Array<{
    id: string
    entry_id: string
    debit: number | null
    credit: number | null
    description: string | null
    journal_entries: { entry_no: string | null; transaction_date: string; description: string | null }
  }>

  // Internal flips (a JE that debits AND credits this bank code) have no real
  // bank movement — same exclusion as the matching page. An entry's lines
  // share one transaction_date, so the window never splits an entry.
  const flip = new Map<string, { dr: boolean; cr: boolean }>()
  for (const l of bookRaw) {
    const e = flip.get(l.entry_id) ?? { dr: false, cr: false }
    if (Number(l.debit ?? 0) > 0) e.dr = true
    if (Number(l.credit ?? 0) > 0) e.cr = true
    flip.set(l.entry_id, e)
  }
  const internalEntries = new Set([...flip.entries()].filter(([, e]) => e.dr && e.cr).map(([id]) => id))

  const bookLines: ReportBookLine[] = bookRaw
    .filter(l => !internalEntries.has(l.entry_id))
    .map(l => ({
      id: l.id,
      date: l.journal_entries.transaction_date,
      entryNo: l.journal_entries.entry_no ?? '—',
      description: `${l.journal_entries.description ?? ''}${l.description ? ` · ${l.description}` : ''}`.trim(),
      amount: r2(Number(l.debit ?? 0) - Number(l.credit ?? 0)),
      claimedByMonth: claimedByMonth.get(l.id) ?? null,
      contra: contraIds.has(l.id),
    }))
    .filter(l => l.amount !== 0)

  // GL balance on this code at month-end.
  const glRows = await fetchAllRows((lo, hi) =>
    supabase
      .from('journal_lines')
      .select('debit, credit, journal_entries!inner(transaction_date, is_reversed)')
      .eq('account_code', bank.gl_account_code as string)
      .lte('journal_entries.transaction_date', monthEnd)
      .eq('journal_entries.is_reversed', false)
      .order('id')
      .range(lo, hi),
  ) as unknown as Array<{ debit: number | null; credit: number | null }>
  const glClosing = r2(glRows.reduce((s, l) => s + Number(l.debit ?? 0) - Number(l.credit ?? 0), 0))

  const statementLines: ReportStatementLine[] = stmtRows
    .filter(l => upToM.has(l.session_id))
    .map(l => ({
      id: l.id,
      date: l.txn_date,
      description: l.description ?? '',
      amount: Number(l.amount),
      matchKind: (l.match_kind ?? null) as ReportStatementLine['matchKind'],
    }))

  const model = buildReconReport({
    periodMonth,
    statementOpening: session.statement_opening != null ? Number(session.statement_opening) : null,
    statementClosing: session.statement_closing != null ? Number(session.statement_closing) : null,
    glClosing,
    bookLines,
    statementLines,
  })

  return {
    sessionId,
    bankName: (bank.bank_name as string) ?? '—',
    accountNumber: (bank.account_number as string | null) ?? null,
    glCode: bank.gl_account_code as string,
    periodMonth,
    status: (session.status as string) ?? 'open',
    sourceFilename: (session.source_filename as string | null) ?? null,
    model,
  }
}
