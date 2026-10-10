// Bank Reconciliation (rebuilt 2026-08-08): upload a statement (Excel/CSV now,
// PDF once the user sends a layout sample) → auto-match against the bank's GL
// lines (amount → name → date) → review/manual-match on the session page.
// One saved session per bank per month.

import Link from 'next/link'
import { officeTime } from '@/lib/office-time'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { fetchAllRows } from '@/lib/paginate'
import UploadStatementButton from './_components/UploadStatementButton'
import ReconSessionsTable from './_components/ReconSessionsTable'
import { formatMoneyBare } from '@/lib/utils'
import { StatCard, StatCards } from '@/components/sheet/StatCard'

export const dynamic = 'force-dynamic'

export default async function ReconciliationPage({ searchParams }: { searchParams: Promise<{ upload?: string }> }) {
  const user = await requirePermission('reconciliation')
  const supabase = (await createClient()) as unknown as SupabaseClient

  const [{ data: bankAccounts }, { data: glBalances }, { data: sessions }, { data: lineRows }] =
    await Promise.all([
      supabase
        .from('bank_accounts')
        .select('id, bank_name, account_number, current_balance, gl_account_code, is_primary')
        .eq('status', 'active')
        .order('is_primary', { ascending: false }),
      supabase.from('trial_balance').select('account_code, balance'),
      supabase
        .from('bank_recon_sessions')
        .select('id, bank_account_id, period_month, source_filename, status, created_at')
        .order('period_month', { ascending: false }),
      // Every statement line of every session (2026-10-08): each upload adds
      // a month's worth, and past PostgREST's 1000-row cap the counts below
      // would silently come up short. Only counted, so the pages' order will
      // do; a failed read still counts nothing, as before.
      fetchAllRows((lo, hi) =>
        supabase.from('bank_recon_lines').select('session_id, match_kind').order('id').range(lo, hi),
      ).then((data) => ({ data }), () => ({ data: null })),
    ])

  const banks = (bankAccounts ?? []) as Array<{
    id: string
    bank_name: string
    account_number: string | null
    current_balance: number
    gl_account_code: string | null
    is_primary: boolean
  }>
  const glMap = new Map(
    ((glBalances ?? []) as Array<{ account_code: string; balance: number }>).map(g => [
      g.account_code,
      Number(g.balance),
    ]),
  )
  const bankById = new Map(banks.map(b => [b.id, b]))

  // Cleared = matched to the books, contra'd against other statement lines
  // (a bank charge the bank waived — mig 20260928010000), or ignored. Only
  // what is none of those is still open, the way the review page counts it.
  const countsBySession = new Map<string, { total: number; cleared: number }>()
  for (const l of (lineRows ?? []) as Array<{
    session_id: string
    match_kind: string | null
  }>) {
    const c = countsBySession.get(l.session_id) ?? { total: 0, cleared: 0 }
    c.total++
    if (l.match_kind != null) c.cleared++
    countsBySession.set(l.session_id, c)
  }

  // On the sheet (2026-10-09, the user's Claude Design handoff): each bank
  // against the GL is a card; the sessions read their status as chips.
  // 2026-10-10 — Upload statement opens a modal (an old ?upload=1 link opens
  // it at once); the sessions are a sheet table.
  const { upload } = await searchParams
  const sessionList = (sessions ?? []) as Array<{
    id: string
    bank_account_id: string
    period_month: string
    source_filename: string | null
    status: string
  }>

  return (
    <div>
      <div className="page-head">
        <div className="min-w-0">
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · BANK RECONCILIATION
          </div>
          <h1 className="page-title">Bank Reconciliation</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link href="/reconciliation/journal" className="btn-quiet-sheet">
            General Ledger
          </Link>
          <UploadStatementButton
            banks={banks.map((b) => ({ id: b.id, label: `${b.bank_name}${b.account_number ? ` — ${b.account_number}` : ''}` }))}
            defaultMonth={officeTime().subtract(1, 'month').format('YYYY-MM')}
            defaultOpen={upload === '1'}
          />
        </div>
      </div>

      <StatCards label="Bank against the general ledger">
        {banks.map((b) => {
          const gl = b.gl_account_code ? (glMap.get(b.gl_account_code) ?? 0) : 0
          const diff = Math.round((Number(b.current_balance) - gl) * 100) / 100
          return (
            <StatCard
              key={b.id}
              label={`${b.bank_name} · bank vs GL`}
              value={diff === 0 ? '✓ Ties to GL' : formatMoney(diff)}
              icon="bank"
              tone={diff === 0 ? 'ledger' : 'danger'}
              title={b.account_number ?? undefined}
              note={`Cache ${formatMoneyBare(Number(b.current_balance))} · GL ${formatMoneyBare(gl)}`}
            />
          )
        })}
      </StatCards>

      {/* ── Saved monthly reconciliations ── */}
      <section className="mb-10">
        <div className="sect-head">
          <h2>Monthly reconciliations</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            {sessionList.length} {sessionList.length === 1 ? 'SESSION' : 'SESSIONS'}
          </span>
        </div>
        {sessionList.length === 0 ? (
          <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
            <p className="text-sm">No reconciliations yet — upload a statement.</p>
          </div>
        ) : (
          <ReconSessionsTable
            canSetDefault={canDo(user, 'reconciliation', 'create')}
            rows={sessionList.map((s) => {
              const c = countsBySession.get(s.id) ?? { total: 0, cleared: 0 }
              return {
                id: s.id,
                bank: bankById.get(s.bank_account_id)?.bank_name ?? '—',
                periodMonth: s.period_month,
                file: s.source_filename,
                cleared: c.cleared,
                total: c.total,
                status: s.status,
              }
            })}
          />
        )}
      </section>
    </div>
  )
}
