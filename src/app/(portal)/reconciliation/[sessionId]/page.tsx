// One bank-month reconciliation session: matched pairs, unmatched statement
// lines vs unmatched book lines (manual pairing — 对不上就问我), ignored rows.

import Link from 'next/link'
import dayjs from 'dayjs'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import ReconReview, { type ReviewBookLine, type ReviewStatementLine } from './_components/ReconReview'

export const dynamic = 'force-dynamic'

const r2 = (n: number) => Math.round(n * 100) / 100

export default async function ReconSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  await requireRole(['finance', 'principal'])
  const { sessionId } = await params
  const supabase = (await createClient()) as unknown as SupabaseClient

  const { data: session } = await supabase
    .from('bank_recon_sessions')
    .select('id, bank_account_id, period_month, source_filename, status, statement_opening, statement_closing')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session) notFound()

  const [{ data: bank }, { data: lines }] = await Promise.all([
    supabase
      .from('bank_accounts')
      .select('bank_name, gl_account_code')
      .eq('id', session.bank_account_id)
      .maybeSingle(),
    supabase
      .from('bank_recon_lines')
      .select('id, txn_date, description, amount, matched_journal_line_id, match_kind')
      .eq('session_id', sessionId)
      .order('txn_date'),
  ])
  if (!bank?.gl_account_code) notFound()

  const statementLines: ReviewStatementLine[] = ((lines ?? []) as Array<{
    id: string
    txn_date: string
    description: string | null
    amount: number
    matched_journal_line_id: string | null
    match_kind: string | null
  }>).map(l => ({
    id: l.id,
    date: l.txn_date,
    description: l.description ?? '',
    amount: Number(l.amount),
    matchedJournalLineId: l.matched_journal_line_id,
    matchKind: l.match_kind,
  }))

  // Book lines in the statement window on this bank's GL code — backward
  // buffer only; future-month entries never belong to this statement.
  const from = dayjs(session.period_month).subtract(10, 'day').format('YYYY-MM-DD')
  const to = dayjs(session.period_month).endOf('month').format('YYYY-MM-DD')
  const [{ data: bookRaw }, { data: claimedRows }] = await Promise.all([
    supabase
      .from('journal_lines')
      .select('id, debit, credit, description, journal_entries!inner(entry_no, transaction_date, description, is_reversed)')
      .eq('account_code', bank.gl_account_code)
      .gte('journal_entries.transaction_date', from)
      .lte('journal_entries.transaction_date', to)
      .eq('journal_entries.is_reversed', false),
    supabase
      .from('bank_recon_lines')
      .select('matched_journal_line_id')
      .not('matched_journal_line_id', 'is', null),
  ])
  const claimed = new Set(
    ((claimedRows ?? []) as Array<{ matched_journal_line_id: string }>).map(c => c.matched_journal_line_id),
  )
  const matchedHere = new Set(statementLines.map(l => l.matchedJournalLineId).filter(Boolean) as string[])

  const allBook = ((bookRaw ?? []) as unknown as Array<{
    id: string
    debit: number | null
    credit: number | null
    description: string | null
    journal_entries: { entry_no: string | null; transaction_date: string; description: string | null }
  }>).map(l => ({
    id: l.id,
    date: l.journal_entries.transaction_date,
    entryNo: l.journal_entries.entry_no ?? '—',
    description: `${l.journal_entries.description ?? ''}${l.description ? ` · ${l.description}` : ''}`.trim(),
    amount: r2(Number(l.debit ?? 0) - Number(l.credit ?? 0)),
  })).filter(l => l.amount !== 0)

  // For the matched table we need info on lines matched HERE; for the
  // unmatched book side we exclude anything claimed by ANY session.
  const bookInfoById = new Map(allBook.map(b => [b.id, b]))
  const unmatchedBook: ReviewBookLine[] = allBook.filter(b => !claimed.has(b.id))

  // Matched journal lines might sit outside the window (rare) — fetch missing.
  const missingIds = [...matchedHere].filter(id => !bookInfoById.has(id))
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

  return (
    <div>
      <Link
        href="/reconciliation"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Bank Reconciliation
      </Link>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · RECONCILIATION · {dayjs(session.period_month).format('MMMM YYYY').toUpperCase()}
          </div>
          <h1 className="page-title">{bank.bank_name}</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            {session.source_filename ?? ''} · statement vs GL {bank.gl_account_code} · amounts must
            equal to match; name and date guide the pairing.
          </p>
        </div>
      </div>

      <ReconReview
        statementLines={statementLines}
        unmatchedBook={unmatchedBook}
        bookInfo={Object.fromEntries(bookInfoById)}
        statementOpening={session.statement_opening != null ? Number(session.statement_opening) : null}
        statementClosing={session.statement_closing != null ? Number(session.statement_closing) : null}
      />
    </div>
  )
}
