// One bank-month reconciliation session: matched pairs, unmatched statement
// lines vs unmatched book lines (manual pairing — 对不上就问我), ignored rows.

import Link from 'next/link'
import dayjs from 'dayjs'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/paginate'
import { windowStart } from '@/lib/recon-report'
import ReconReview, { type ReviewBookLine, type ReviewStatementLine } from './_components/ReconReview'

export const dynamic = 'force-dynamic'

const r2 = (n: number) => Math.round(n * 100) / 100

export default async function ReconSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  await requirePage('/reconciliation/[sessionId]')
  await requirePermission('reconciliation')
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
      .select('id, txn_date, description, amount, match_kind')
      .eq('session_id', sessionId)
      .order('txn_date'),
  ])
  if (!bank?.gl_account_code) notFound()

  const lineIds = ((lines ?? []) as Array<{ id: string }>).map(l => l.id)
  const [{ data: matchRows }, { data: contraRows }] = await Promise.all([
    lineIds.length > 0
      ? supabase
          .from('bank_recon_matches')
          .select('statement_line_id, journal_line_id, match_group')
          .in('statement_line_id', lineIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from('bank_recon_matches')
      .select('journal_line_id, match_group')
      .eq('session_id', sessionId)
      .is('statement_line_id', null),
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
  for (const m of (matchRows ?? []) as Array<{
    statement_line_id: string
    journal_line_id: string | null
    match_group: string
  }>) {
    const g = groupMap.get(m.match_group) ?? { statementLineIds: new Set<string>(), journalLineIds: [] }
    g.statementLineIds.add(m.statement_line_id)
    if (m.journal_line_id) g.journalLineIds.push(m.journal_line_id)
    groupMap.set(m.match_group, g)
  }
  const allGroups = [...groupMap.entries()].map(([id, g]) => ({
    id,
    statementLineIds: [...g.statementLineIds],
    journalLineIds: g.journalLineIds,
  }))
  const groups = allGroups.filter(g => g.journalLineIds.length > 0)
  const statementContraGroups = allGroups
    .filter(g => g.journalLineIds.length === 0)
    .map(g => ({ id: g.id, statementLineIds: g.statementLineIds }))

  const statementLines: ReviewStatementLine[] = ((lines ?? []) as Array<{
    id: string
    txn_date: string
    description: string | null
    amount: number
    match_kind: string | null
  }>).map(l => ({
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
  // both of these grow without bound (Trial Balance regression class).
  const [bookRaw, claimedRows] = await Promise.all([
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
    fetchAllRows((lo, hi) =>
      supabase.from('bank_recon_matches').select('journal_line_id').order('id').range(lo, hi),
    ),
  ])
  const claimed = new Set(
    (claimedRows as Array<{ journal_line_id: string | null }>)
      .map(c => c.journal_line_id)
      .filter(Boolean),
  )
  const matchedHere = new Set([
    ...groups.flatMap(g => g.journalLineIds),
    ...contraGroups.flatMap(g => g.journalLineIds),
  ])

  // GL balance on this bank code at month-end — shown next to the statement
  // closing so 银行数 vs GL 数 read apart at a glance (user 2026-08-08).
  const glAll = await fetchAllRows((lo, hi) =>
    supabase
      .from('journal_lines')
      .select('debit, credit, journal_entries!inner(transaction_date, is_reversed)')
      .eq('account_code', bank.gl_account_code)
      .lte('journal_entries.transaction_date', to)
      .eq('journal_entries.is_reversed', false)
      .order('id')
      .range(lo, hi),
  )
  const glClosing = r2(
    (glAll as unknown as Array<{ debit: number | null; credit: number | null }>).reduce(
      (s, l) => s + Number(l.debit ?? 0) - Number(l.credit ?? 0),
      0,
    ),
  )

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
  const internalEntries = new Set(
    [...flip.entries()].filter(([, e]) => e.dr && e.cr).map(([id]) => id),
  )

  const allBook = bookRows
    .filter(l => !internalEntries.has(l.entry_id))
    .map(l => ({
      id: l.id,
      date: l.journal_entries.transaction_date,
      entryNo: l.journal_entries.entry_no ?? '—',
      description: `${l.journal_entries.description ?? ''}${l.description ? ` · ${l.description}` : ''}`.trim(),
      amount: r2(Number(l.debit ?? 0) - Number(l.credit ?? 0)),
    }))
    .filter(l => l.amount !== 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.entryNo.localeCompare(b.entryNo))

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
            {session.source_filename ?? ''} · statement vs GL {bank.gl_account_code}
          </p>
        </div>
        <Link
          href={`/reconciliation/${sessionId}/report`}
          className="text-sm text-accent hover:text-accent-hover font-serif italic"
        >
          Reconciliation Report →
        </Link>
      </div>

      <ReconReview
        sessionId={sessionId}
        periodMonth={session.period_month}
        statementLines={statementLines}
        groups={groups}
        contraGroups={contraGroups}
        statementContraGroups={statementContraGroups}
        unmatchedBook={unmatchedBook}
        bookInfo={Object.fromEntries(bookInfoById)}
        statementOpening={session.statement_opening != null ? Number(session.statement_opening) : null}
        statementClosing={session.statement_closing != null ? Number(session.statement_closing) : null}
        glClosing={glClosing}
      />
    </div>
  )
}
