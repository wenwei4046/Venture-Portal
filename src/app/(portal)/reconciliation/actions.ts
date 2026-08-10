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
import { requireRole } from '@/lib/auth'
import {
  autoMatch, csvToRows, parseStatementRows,
  type BookLine, type StatementLine,
} from '@/lib/bank-recon'

const r2 = (n: number) => Math.round(n * 100) / 100

async function reconClient(): Promise<SupabaseClient> {
  // bank_recon_* postdate database.types.ts — untyped-client convention.
  return (await createClient()) as unknown as SupabaseClient
}

/** Book lines on one bank's GL code around the statement month, excluding
 *  lines already claimed by ANY recon session. Signed: debit − credit. */
async function loadBookLines(
  supabase: SupabaseClient,
  glCode: string,
  periodMonth: string,
): Promise<BookLine[]> {
  const from = dayjs(periodMonth).subtract(10, 'day').format('YYYY-MM-DD')
  const to = dayjs(periodMonth).endOf('month').add(10, 'day').format('YYYY-MM-DD')
  const [{ data: lines, error }, { data: claimed }] = await Promise.all([
    supabase
      .from('journal_lines')
      .select('id, debit, credit, description, journal_entries!inner(transaction_date, description, is_reversed)')
      .eq('account_code', glCode)
      .gte('journal_entries.transaction_date', from)
      .lte('journal_entries.transaction_date', to)
      .eq('journal_entries.is_reversed', false),
    supabase.from('bank_recon_lines').select('matched_journal_line_id').not('matched_journal_line_id', 'is', null),
  ])
  if (error) throw new Error(`Failed to load book lines: ${error.message}`)
  const claimedSet = new Set((claimed ?? []).map((c: { matched_journal_line_id: string }) => c.matched_journal_line_id))
  return ((lines ?? []) as unknown as Array<{
    id: string
    debit: number | null
    credit: number | null
    description: string | null
    journal_entries: { transaction_date: string; description: string | null }
  }>)
    .filter(l => !claimedSet.has(l.id))
    .map(l => ({
      key: l.id,
      date: l.journal_entries.transaction_date,
      description: `${l.journal_entries.description ?? ''} ${l.description ?? ''}`.trim(),
      amount: r2(Number(l.debit ?? 0) - Number(l.credit ?? 0)),
    }))
    .filter(l => l.amount !== 0)
}

export async function uploadStatement(formData: FormData): Promise<{ error: string } | void> {
  const user = await requireRole(['finance', 'principal'])
  const supabase = await reconClient()

  const bankAccountId = (formData.get('bank_account_id') as string) || ''
  const month = (formData.get('period_month') as string) || '' // YYYY-MM
  const file = formData.get('file') as File | null
  if (!bankAccountId) return { error: 'Pick a bank' }
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: 'Pick the statement month' }
  if (!file || file.size === 0) return { error: 'Pick a statement file' }
  const periodMonth = `${month}-01`

  const name = file.name.toLowerCase()
  let rows: unknown[][]
  if (name.endsWith('.pdf')) {
    return {
      error:
        'PDF 解析还没配你银行的排版 — 把这份 statement 发给我（chat 里传给 Claude），我照它的格式加模板。先用网银 export 的 Excel/CSV 就能直接对。',
    }
  } else if (name.endsWith('.csv') || name.endsWith('.txt')) {
    rows = csvToRows(await file.text())
  } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buf = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) as unknown[][]
  } else {
    return { error: 'Unsupported file type — use .xlsx, .csv or .pdf' }
  }

  const parsed = parseStatementRows(rows)
  if ('error' in parsed) return { error: parsed.error }

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
  for (const pair of result.pairs) {
    await supabase
      .from('bank_recon_lines')
      .update({ matched_journal_line_id: pair.bookKey, match_kind: 'auto' })
      .eq('id', pair.statementKey)
  }

  revalidatePath('/reconciliation')
  redirect(`/reconciliation/${session.id}`)
}

export async function manualMatch(
  lineId: string,
  journalLineId: string,
): Promise<{ error?: string }> {
  await requireRole(['finance', 'principal'])
  const supabase = await reconClient()

  const [{ data: line }, { data: jl }] = await Promise.all([
    supabase.from('bank_recon_lines').select('id, amount').eq('id', lineId).maybeSingle(),
    supabase.from('journal_lines').select('id, debit, credit').eq('id', journalLineId).maybeSingle(),
  ])
  if (!line) return { error: 'Statement line not found' }
  if (!jl) return { error: 'Journal line not found' }
  const bookAmount = r2(Number(jl.debit ?? 0) - Number(jl.credit ?? 0))
  if (Math.abs(bookAmount - Number(line.amount)) > 0.005) {
    return {
      error: `Amounts differ — statement ${Number(line.amount).toFixed(2)} vs book ${bookAmount.toFixed(2)}. Only equal amounts can be matched.`,
    }
  }
  const { data: claimed } = await supabase
    .from('bank_recon_lines')
    .select('id')
    .eq('matched_journal_line_id', journalLineId)
    .limit(1)
  if ((claimed ?? []).length > 0) return { error: 'That journal line is already matched to another statement line' }

  const { error } = await supabase
    .from('bank_recon_lines')
    .update({ matched_journal_line_id: journalLineId, match_kind: 'manual' })
    .eq('id', lineId)
  if (error) return { error: error.message }
  revalidatePath('/reconciliation')
  return {}
}

export async function unmatchLine(lineId: string): Promise<{ error?: string }> {
  await requireRole(['finance', 'principal'])
  const supabase = await reconClient()
  const { error } = await supabase
    .from('bank_recon_lines')
    .update({ matched_journal_line_id: null, match_kind: null })
    .eq('id', lineId)
  if (error) return { error: error.message }
  revalidatePath('/reconciliation')
  return {}
}

export async function setLineIgnored(lineId: string, ignored: boolean): Promise<{ error?: string }> {
  await requireRole(['finance', 'principal'])
  const supabase = await reconClient()
  const { error } = await supabase
    .from('bank_recon_lines')
    .update(
      ignored
        ? { matched_journal_line_id: null, match_kind: 'ignored' }
        : { match_kind: null },
    )
    .eq('id', lineId)
  if (error) return { error: error.message }
  revalidatePath('/reconciliation')
  return {}
}

export async function setSessionStatus(
  sessionId: string,
  status: 'open' | 'done',
): Promise<{ error?: string }> {
  await requireRole(['finance', 'principal'])
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
  await requireRole(['finance', 'principal'])
  const supabase = await reconClient()
  const { error } = await supabase.from('bank_recon_sessions').delete().eq('id', sessionId)
  if (error) return { error: error.message }
  revalidatePath('/reconciliation')
  return {}
}
