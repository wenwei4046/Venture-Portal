'use server'

// Bank reconciliation actions (rebuilt 2026-08-08, user: "upload pdf 或excel
// 后自动对账 · 存起来每月一份 · 金额，名字等等，日期其次 · 对不上就问我").
// Sessions live in bank_recon_sessions/_lines (mig 20260808000000); matching
// maths in lib/bank-recon. PDF parsing is per-bank-layout — until the user
// sends a sample statement, PDF uploads get a clear "send me the sample" error.

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import {
  autoMatch, csvToRows, parseStatementRows,
  type BookLine, type StatementLine,
} from '@/lib/bank-recon'
import { looksLikeHlb, parseHlbPdf, type PdfPageItems } from '@/lib/bank-recon-pdf'
import { fetchAllRows } from '@/lib/paginate'

const r2 = (n: number) => Math.round(n * 100) / 100

async function reconClient(): Promise<SupabaseClient> {
  // bank_recon_* postdate database.types.ts — untyped-client convention.
  return (await createClient()) as unknown as SupabaseClient
}

// The claimed set — every match row any session holds — is read whole, in
// 1000-row pages (2026-10-08): it grows with each statement (477 rows today)
// and an unranged read stops at PostgREST's 1000 rows without a word, so the
// lines past it would be offered for matching twice. Only ever a set, so the
// pages' `id` order will do; a failed read still claims nothing, as before.
const noneOnError = <T,>(read: Promise<T[]>) => read.then((data) => ({ data }), () => ({ data: null }))

/** Book lines on one bank's GL code around the statement month, excluding
 *  lines already claimed by ANY recon session. Signed: debit − credit. */
async function loadBookLines(
  supabase: SupabaseClient,
  glCode: string,
  periodMonth: string,
): Promise<BookLine[]> {
  // Backward buffer only (user 2026-08-08: "upload 6 月就不应该出现7月的
  // payment") — prior-month in-transit items may clear on this statement, but
  // future-month book entries never belong here.
  const from = dayjs(periodMonth).subtract(10, 'day').format('YYYY-MM-DD')
  const to = dayjs(periodMonth).endOf('month').format('YYYY-MM-DD')
  const [{ data: lines, error }, { data: claimed }] = await Promise.all([
    supabase
      .from('journal_lines')
      .select('id, entry_id, debit, credit, description, journal_entries!inner(transaction_date, description, is_reversed)')
      .eq('account_code', glCode)
      .gte('journal_entries.transaction_date', from)
      .lte('journal_entries.transaction_date', to)
      .eq('journal_entries.is_reversed', false),
    noneOnError(
      fetchAllRows((lo, hi) =>
        supabase.from('bank_recon_matches').select('journal_line_id').order('id').range(lo, hi),
      ),
    ),
  ])
  if (error) throw new Error(`Failed to load book lines: ${error.message}`)
  const claimedSet = new Set((claimed ?? []).map((c: { journal_line_id: string }) => c.journal_line_id))
  const raw = (lines ?? []) as unknown as Array<{
    id: string
    entry_id: string
    debit: number | null
    credit: number | null
    description: string | null
    journal_entries: { transaction_date: string; description: string | null }
  }>
  // Internal transfers (inter-billing dept flips, same-bank payroll staging)
  // debit AND credit the SAME bank code inside one JE — the bank never sees a
  // transaction, so those lines must not appear (user 2026-08-08:
  // "interbilling 的别出现哦…银行不会有transaction的").
  const internalEntries = internalFlipEntries(raw)
  return raw
    .filter(l => !claimedSet.has(l.id) && !internalEntries.has(l.entry_id))
    .map(l => ({
      key: l.id,
      date: l.journal_entries.transaction_date,
      description: `${l.journal_entries.description ?? ''} ${l.description ?? ''}`.trim(),
      amount: r2(Number(l.debit ?? 0) - Number(l.credit ?? 0)),
    }))
    .filter(l => l.amount !== 0)
}

/** Entry ids whose bank-code lines include BOTH a debit and a credit — pure
 *  internal flips with no real bank movement. */
function internalFlipEntries(
  rows: Array<{ entry_id: string; debit: number | null; credit: number | null }>,
): Set<string> {
  const byEntry = new Map<string, { hasDr: boolean; hasCr: boolean }>()
  for (const l of rows) {
    const e = byEntry.get(l.entry_id) ?? { hasDr: false, hasCr: false }
    if (Number(l.debit ?? 0) > 0) e.hasDr = true
    if (Number(l.credit ?? 0) > 0) e.hasCr = true
    byEntry.set(l.entry_id, e)
  }
  return new Set([...byEntry.entries()].filter(([, e]) => e.hasDr && e.hasCr).map(([id]) => id))
}

export async function uploadStatement(formData: FormData): Promise<{ error: string } | void> {
  const user = await requirePermission('reconciliation')
  const supabase = await reconClient()

  const bankAccountId = (formData.get('bank_account_id') as string) || ''
  const month = (formData.get('period_month') as string) || '' // YYYY-MM
  const file = formData.get('file') as File | null
  if (!bankAccountId) return { error: 'Pick a bank' }
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: 'Pick the statement month' }
  if (!file || file.size === 0) return { error: 'Pick a statement file' }
  const periodMonth = `${month}-01`

  const name = file.name.toLowerCase()
  let parsed: { lines: Array<{ date: string; description: string; amount: number }>; skipped: number }
  let statementOpening: number | null = null
  let statementClosing: number | null = null

  if (name.endsWith('.pdf')) {
    // Coordinate-based per-bank templates (HLB tuned on the user's real
    // Apr'26 statement, 47/47 lines, balance tie-out enforced inside).
    const buf = Buffer.from(await file.arrayBuffer())
    const { default: PDFParser } = await import('pdf2json')
    const data = await new Promise<{ Pages: Array<{ Texts: Array<{ x: number; y: number; R: Array<{ T: string }> }> }> }>(
      (resolve, reject) => {
        const parser = new PDFParser()
        parser.on('pdfParser_dataError', (e: { parserError?: Error }) =>
          reject(new Error(e.parserError?.message ?? 'PDF parse failed')),
        )
        parser.on('pdfParser_dataReady', resolve)
        parser.parseBuffer(buf)
      },
    ).catch((e: Error) => e)
    if (data instanceof Error) return { error: `Could not read the PDF: ${data.message}` }
    const pages: PdfPageItems[] = data.Pages.map(pg => ({
      items: pg.Texts.map(t => ({ x: t.x, y: t.y, text: decodeURIComponent(t.R[0]?.T ?? '') })),
    }))
    if (!looksLikeHlb(pages)) {
      return {
        error:
          'Only Hong Leong PDF statements have a template so far — send this bank\'s statement to Claude and its layout will be added. Excel/CSV works for any bank.',
      }
    }
    const pdfParsed = parseHlbPdf(pages)
    if ('error' in pdfParsed) return { error: pdfParsed.error }
    parsed = { lines: pdfParsed.lines, skipped: pdfParsed.skipped }
    statementOpening = pdfParsed.opening
    statementClosing = pdfParsed.closing
  } else if (name.endsWith('.csv') || name.endsWith('.txt')) {
    const p = parseStatementRows(csvToRows(await file.text()))
    if ('error' in p) return { error: p.error }
    parsed = p
  } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buf = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const p = parseStatementRows(
      XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) as unknown[][],
    )
    if ('error' in p) return { error: p.error }
    parsed = p
  } else {
    return { error: 'Unsupported file type — use .pdf, .xlsx or .csv' }
  }

  const { data: bank, error: bankErr } = await supabase
    .from('bank_accounts')
    .select('id, bank_name, gl_account_code')
    .eq('id', bankAccountId)
    .maybeSingle()
  if (bankErr || !bank) return { error: 'Bank not found' }
  if (!bank.gl_account_code) return { error: `${bank.bank_name} has no GL account code` }

  const { data: session, error: sessErr } = await supabase
    .from('bank_recon_sessions')
    .insert({
      bank_account_id: bankAccountId,
      period_month: periodMonth,
      source_filename: file.name,
      statement_opening: statementOpening,
      statement_closing: statementClosing,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (sessErr) {
    if (sessErr.code === '23505') {
      return { error: `${bank.bank_name} · ${month} already has a reconciliation — open it below, or delete it to re-upload.` }
    }
    return { error: `Failed to create session: ${sessErr.message}` }
  }

  const { data: insertedLines, error: linesErr } = await supabase
    .from('bank_recon_lines')
    .insert(
      parsed.lines.map(l => ({
        session_id: session.id,
        txn_date: l.date,
        description: l.description || null,
        amount: l.amount,
      })),
    )
    .select('id, txn_date, description, amount')
  if (linesErr) {
    await supabase.from('bank_recon_sessions').delete().eq('id', session.id)
    return { error: `Failed to save statement lines: ${linesErr.message}` }
  }

  // ── Auto-match (amount → name → date; leftovers wait for the user) ──
  const statementLines: StatementLine[] = (insertedLines ?? []).map(
    (l: { id: string; txn_date: string; description: string | null; amount: number }) => ({
      key: l.id,
      date: l.txn_date,
      description: l.description ?? '',
      amount: Number(l.amount),
    }),
  )
  const bookLines = await loadBookLines(supabase, bank.gl_account_code as string, periodMonth)
  const result = autoMatch(statementLines, bookLines)
  if (result.pairs.length > 0) {
    await supabase.from('bank_recon_matches').insert(
      result.pairs.map(p => ({
        statement_line_id: p.statementKey,
        journal_line_id: p.bookKey,
        match_group: p.statementKey, // auto pairs are their own group
      })),
    )
    await supabase
      .from('bank_recon_lines')
      .update({ match_kind: 'auto' })
      .in('id', result.pairs.map(p => p.statementKey))
  }

  revalidatePath('/reconciliation')
  redirect(`/reconciliation/${session.id}`)
}

/** Match N statement lines to M journal lines whose signed totals are EQUAL
 *  (user 2026-08-08: 一对多 "银行是收一笔，但是gl 记录是多笔" and 多对多
 *  "bank statement 可能是两笔加起来等于gl 的"). One match group is created;
 *  every statement line gets ≥1 row, every JE is claimed exactly once. */
export async function manualMatch(
  statementLineIds: string[],
  journalLineIds: string[],
): Promise<{ error?: string }> {
  await requirePermission('reconciliation')
  const supabase = await reconClient()

  const sIds = Array.from(new Set(statementLineIds.filter(Boolean)))
  const jIds = Array.from(new Set(journalLineIds.filter(Boolean)))
  if (sIds.length === 0) return { error: 'Pick at least one statement line' }
  if (jIds.length === 0) return { error: 'Pick at least one book line' }

  const [{ data: sLines }, { data: jls }, { data: claimed }] = await Promise.all([
    supabase.from('bank_recon_lines').select('id, amount, match_kind').in('id', sIds),
    supabase.from('journal_lines').select('id, debit, credit').in('id', jIds),
    noneOnError(
      fetchAllRows((lo, hi) =>
        supabase
          .from('bank_recon_matches')
          .select('journal_line_id, statement_line_id')
          .order('id')
          .range(lo, hi),
      ),
    ),
  ])
  if ((sLines ?? []).length !== sIds.length) return { error: 'Some statement lines were not found' }
  if ((jls ?? []).length !== jIds.length) return { error: 'Some journal lines were not found' }
  const alreadyMatchedS = new Set(
    ((claimed ?? []) as Array<{ statement_line_id: string }>).map(c => c.statement_line_id),
  )
  if (sIds.some(id => alreadyMatchedS.has(id))) {
    return { error: 'Some of those statement lines are already matched — unmatch them first' }
  }
  const claimedJ = new Set(
    ((claimed ?? []) as Array<{ journal_line_id: string | null }>)
      .map(c => c.journal_line_id)
      .filter(Boolean),
  )
  if (jIds.some(id => claimedJ.has(id))) {
    return { error: 'Some of those journal lines are already matched elsewhere' }
  }

  const stmtSum = r2(
    (sLines ?? []).reduce((s: number, l: { amount: number }) => s + Number(l.amount), 0),
  )
  const bookSum = r2(
    (jls ?? []).reduce(
      (s: number, jl: { debit: number | null; credit: number | null }) =>
        s + Number(jl.debit ?? 0) - Number(jl.credit ?? 0),
      0,
    ),
  )
  if (Math.abs(bookSum - stmtSum) > 0.005) {
    return {
      error: `Totals differ — statement Σ ${stmtSum.toFixed(2)} vs book Σ ${bookSum.toFixed(2)}. The two selections must sum to the same amount.`,
    }
  }

  // Build the group: pair 1:1 while both sides last, then leftovers.
  const groupId = crypto.randomUUID()
  const rows: Array<{ statement_line_id: string; journal_line_id: string | null; match_group: string }> = []
  const n = Math.max(sIds.length, jIds.length)
  for (let i = 0; i < n; i++) {
    rows.push({
      statement_line_id: sIds[Math.min(i, sIds.length - 1)],
      journal_line_id: i < jIds.length ? jIds[i] : null,
      match_group: groupId,
    })
  }

  const { error: insErr } = await supabase.from('bank_recon_matches').insert(rows)
  if (insErr) return { error: insErr.message }
  const { error } = await supabase
    .from('bank_recon_lines')
    .update({ match_kind: 'manual' })
    .in('id', sIds)
  if (error) return { error: error.message }
  revalidatePath('/reconciliation')
  return {}
}

/** Mark a set of BOOK lines as contra — Dr/Cr that never hit the bank (e.g.
 *  a fund-in and its pass-through loan-out booked through the bank code with
 *  no real transaction). The selection must sum to ZERO. */
export async function contraBookLines(
  sessionId: string,
  journalLineIds: string[],
): Promise<{ error?: string }> {
  await requirePermission('reconciliation')
  const supabase = await reconClient()

  const jIds = Array.from(new Set(journalLineIds.filter(Boolean)))
  if (jIds.length < 2) return { error: 'Pick at least two book lines that cancel out' }

  const [{ data: jls }, { data: claimed }] = await Promise.all([
    supabase.from('journal_lines').select('id, debit, credit').in('id', jIds),
    supabase.from('bank_recon_matches').select('journal_line_id').in('journal_line_id', jIds),
  ])
  if ((jls ?? []).length !== jIds.length) return { error: 'Some journal lines were not found' }
  if ((claimed ?? []).length > 0) return { error: 'Some of those lines are already matched/contra elsewhere' }
  const sum = r2(
    (jls ?? []).reduce(
      (s: number, jl: { debit: number | null; credit: number | null }) =>
        s + Number(jl.debit ?? 0) - Number(jl.credit ?? 0),
      0,
    ),
  )
  if (Math.abs(sum) > 0.005) {
    return { error: `Contra selection must sum to 0.00 — currently ${sum.toFixed(2)}` }
  }

  const groupId = crypto.randomUUID()
  const { error } = await supabase.from('bank_recon_matches').insert(
    jIds.map(id => ({
      statement_line_id: null,
      journal_line_id: id,
      match_group: groupId,
      session_id: sessionId,
    })),
  )
  if (error) return { error: error.message }
  revalidatePath('/reconciliation')
  return {}
}

/**
 * Statement-side contra: a set of STATEMENT lines that cancel each other and
 * never reach the books — the bank's own charge-and-waiver pairs (2026-09-28,
 * Aug'26: Service Charge 1.60 then Rebates-Fees 1.60 the next day). Mirror of
 * contraBookLines; the group is dissolved the same way.
 */
export async function contraStatementLines(
  sessionId: string,
  statementLineIds: string[],
): Promise<{ error?: string }> {
  await requirePermission('reconciliation')
  const supabase = await reconClient()

  const sIds = Array.from(new Set(statementLineIds.filter(Boolean)))
  if (sIds.length < 2) return { error: 'Pick at least two statement lines that cancel out' }

  const [{ data: sls }, { data: claimed }] = await Promise.all([
    supabase.from('bank_recon_lines').select('id, amount, session_id').in('id', sIds),
    supabase.from('bank_recon_matches').select('statement_line_id').in('statement_line_id', sIds),
  ])
  const rows = (sls ?? []) as Array<{ id: string; amount: number; session_id: string }>
  if (rows.length !== sIds.length) return { error: 'Some statement lines were not found' }
  if (rows.some(l => l.session_id !== sessionId)) {
    return { error: 'Those lines belong to another statement' }
  }
  if ((claimed ?? []).length > 0) {
    return { error: 'Some of those lines are already matched/contra elsewhere' }
  }
  const sum = r2(rows.reduce((s, l) => s + Number(l.amount), 0))
  if (Math.abs(sum) > 0.005) {
    return { error: `Contra selection must sum to 0.00 — currently ${sum.toFixed(2)}` }
  }

  const groupId = crypto.randomUUID()
  const { error } = await supabase.from('bank_recon_matches').insert(
    sIds.map(id => ({
      statement_line_id: id,
      journal_line_id: null,
      match_group: groupId,
      session_id: sessionId,
    })),
  )
  if (error) return { error: error.message }
  const { error: kindErr } = await supabase
    .from('bank_recon_lines')
    .update({ match_kind: 'contra' })
    .in('id', sIds)
  if (kindErr) return { error: kindErr.message }
  revalidatePath('/reconciliation')
  revalidatePath(`/reconciliation/${sessionId}`)
  return {}
}

/** Dissolve a whole match/contra group by its group id. */
export async function dissolveGroup(groupId: string): Promise<{ error?: string }> {
  await requirePermission('reconciliation')
  const supabase = await reconClient()
  const { data: members } = await supabase
    .from('bank_recon_matches')
    .select('statement_line_id')
    .eq('match_group', groupId)
  const memberIds = Array.from(
    new Set(
      ((members ?? []) as Array<{ statement_line_id: string | null }>)
        .map(m => m.statement_line_id)
        .filter(Boolean) as string[],
    ),
  )
  const { error: delErr } = await supabase
    .from('bank_recon_matches')
    .delete()
    .eq('match_group', groupId)
  if (delErr) return { error: delErr.message }
  if (memberIds.length > 0) {
    const { error } = await supabase
      .from('bank_recon_lines')
      .update({ match_kind: null })
      .in('id', memberIds)
    if (error) return { error: error.message }
  }
  revalidatePath('/reconciliation')
  return {}
}

/** Unmatch the WHOLE group containing this statement line. */
export async function unmatchLine(lineId: string): Promise<{ error?: string }> {
  await requirePermission('reconciliation')
  const supabase = await reconClient()
  const { data: groups } = await supabase
    .from('bank_recon_matches')
    .select('match_group')
    .eq('statement_line_id', lineId)
  const groupIds = Array.from(
    new Set(((groups ?? []) as Array<{ match_group: string }>).map(g => g.match_group)),
  )
  if (groupIds.length === 0) return {}
  const { data: members } = await supabase
    .from('bank_recon_matches')
    .select('statement_line_id')
    .in('match_group', groupIds)
  const memberIds = Array.from(
    new Set(((members ?? []) as Array<{ statement_line_id: string }>).map(m => m.statement_line_id)),
  )
  const { error: delErr } = await supabase
    .from('bank_recon_matches')
    .delete()
    .in('match_group', groupIds)
  if (delErr) return { error: delErr.message }
  const { error } = await supabase
    .from('bank_recon_lines')
    .update({ match_kind: null })
    .in('id', memberIds)
  if (error) return { error: error.message }
  revalidatePath('/reconciliation')
  return {}
}

export async function setLineIgnored(lineId: string, ignored: boolean): Promise<{ error?: string }> {
  await requirePermission('reconciliation')
  const supabase = await reconClient()
  if (ignored) {
    // An ignored line holds no matches.
    const { error: delErr } = await supabase
      .from('bank_recon_matches')
      .delete()
      .eq('statement_line_id', lineId)
    if (delErr) return { error: delErr.message }
  }
  const { error } = await supabase
    .from('bank_recon_lines')
    .update({ match_kind: ignored ? 'ignored' : null })
    .eq('id', lineId)
  if (error) return { error: error.message }
  revalidatePath('/reconciliation')
  return {}
}

export async function setSessionStatus(
  sessionId: string,
  status: 'open' | 'done',
): Promise<{ error?: string }> {
  await requirePermission('reconciliation')
  const supabase = await reconClient()
  const { error } = await supabase
    .from('bank_recon_sessions')
    .update({ status })
    .eq('id', sessionId)
  if (error) return { error: error.message }
  revalidatePath('/reconciliation')
  revalidatePath(`/reconciliation/${sessionId}`)
  return {}
}

export async function deleteSession(sessionId: string): Promise<{ error?: string }> {
  await requirePermission('reconciliation')
  const supabase = await reconClient()
  const { error } = await supabase.from('bank_recon_sessions').delete().eq('id', sessionId)
  if (error) return { error: error.message }
  revalidatePath('/reconciliation')
  return {}
}
