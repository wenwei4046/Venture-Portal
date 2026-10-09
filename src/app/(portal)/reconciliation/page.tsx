// Bank Reconciliation (rebuilt 2026-08-08): upload a statement (Excel/CSV now,
// PDF once the user sends a layout sample) → auto-match against the bank's GL
// lines (amount → name → date) → review/manual-match on the session page.
// One saved session per bank per month.

import Link from 'next/link'
import dayjs from 'dayjs'
import { officeTime } from '@/lib/office-time'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { fetchAllRows } from '@/lib/paginate'
import UploadStatementForm from './_components/UploadStatementForm'
import SessionRowActions from './_components/SessionRowActions'
import LedgerRow from '@/components/LedgerRow'
import { formatMoneyBare } from '@/lib/utils'
import { StatCard, StatCards } from '@/components/sheet/StatCard'

export const dynamic = 'force-dynamic'

export default async function ReconciliationPage({ searchParams }: { searchParams: Promise<{ upload?: string }> }) {
  await requirePermission('reconciliation')
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

  // On the sheet (2026-10-09, the user's Claude Design handoff): Upload
  // statement in the head opens the form under the cards; each bank against
  // the GL is a card; the sessions read their status as chips.
  const { upload } = await searchParams
  const showUpload = upload === '1'
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
          <Link href={showUpload ? '/reconciliation' : '/reconciliation?upload=1'} className={showUpload ? 'btn-quiet-sheet' : 'btn-pri-sheet'}>
            {showUpload ? 'Close upload' : 'Upload statement'}
          </Link>
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

      {showUpload ? (
        <section className="mb-10">
          <div className="sect-head">
            <h2>Upload statement</h2>
            <span className="rule" aria-hidden />
            <span className="count">EXCEL / CSV</span>
          </div>
          <p className="text-xs text-graphite mb-3 max-w-3xl">
            Excel / CSV from online banking. Auto-matching pairs by amount first, then payee / description, date last; whatever
            cannot be paired waits on the review page. A PDF needs your bank&apos;s layout first.
          </p>
          <div>
            <UploadStatementForm
              banks={banks.map((b) => ({ id: b.id, label: `${b.bank_name}${b.account_number ? ` — ${b.account_number}` : ''}` }))}
              defaultMonth={officeTime().subtract(1, 'month').format('YYYY-MM')}
            />
          </div>
        </section>
      ) : null}

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
          <div className="table-frame">
            <div className="table-frame-scroll">
              <table className="ledger-table [&_td.num]:whitespace-nowrap">
                <thead>
                  <tr>
                    <th>Bank</th>
                    <th>Month</th>
                    <th className="m-hide">File</th>
                    <th className="right m-hide">Cleared</th>
                    <th className="right">Open items</th>
                    <th className="m-hide">Status</th>
                    <th className="right m-hide">Actions</th>
                    <th className="lt-toggle" aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {sessionList.map((s) => {
                    const c = countsBySession.get(s.id) ?? { total: 0, cleared: 0 }
                    const open = c.total - c.cleared
                    return (
                      <LedgerRow key={s.id}>
                        <td className="font-medium">{bankById.get(s.bank_account_id)?.bank_name ?? '—'}</td>
                        <td className="whitespace-nowrap">{dayjs(s.period_month).format('MMM YYYY')}</td>
                        <td className="font-mono text-[11.5px] max-w-[220px] truncate m-hide" data-label="File">
                          {s.source_filename ?? '—'}
                        </td>
                        <td className="num m-hide" data-label="Cleared">
                          {c.cleared} / {c.total}
                        </td>
                        <td className="num">
                          <span className={open === 0 ? 'text-ledger' : 'text-alert'}>{open === 0 ? '✓ 0' : open}</span>
                        </td>
                        <td className="m-hide" data-label="Status">
                          <span className={`chip ${s.status === 'done' ? 'ledger' : 'alert'}`}>
                            <span className="dot" />
                            {s.status}
                          </span>
                        </td>
                        <td className="m-hide" data-label="Actions">
                          <div className="flex items-center justify-end gap-2">
                            <Link href={`/reconciliation/${s.id}`} className={s.status === 'open' ? 'btn-pri-sheet' : 'btn-quiet-sheet'}>
                              {s.status === 'open' ? 'Continue' : 'Open'}
                            </Link>
                            <Link href={`/reconciliation/${s.id}/report`} className="btn-quiet-sheet">
                              Report
                            </Link>
                            <SessionRowActions sessionId={s.id} status={s.status as 'open' | 'done'} />
                          </div>
                        </td>
                      </LedgerRow>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
