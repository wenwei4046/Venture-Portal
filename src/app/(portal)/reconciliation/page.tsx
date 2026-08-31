// Bank Reconciliation (rebuilt 2026-08-08): upload a statement (Excel/CSV now,
// PDF once the user sends a layout sample) → auto-match against the bank's GL
// lines (amount → name → date) → review/manual-match on the session page.
// One saved session per bank per month.

import Link from 'next/link'
import dayjs from 'dayjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import UploadStatementForm from './_components/UploadStatementForm'
import SessionRowActions from './_components/SessionRowActions'
import LedgerRow from '@/components/LedgerRow'

export const dynamic = 'force-dynamic'

export default async function ReconciliationPage() {
  await requireRole(['principal', 'finance'])
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
      supabase.from('bank_recon_lines').select('session_id, match_kind'),
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

  const countsBySession = new Map<string, { total: number; matched: number; ignored: number }>()
  for (const l of (lineRows ?? []) as Array<{
    session_id: string
    match_kind: string | null
  }>) {
    const c = countsBySession.get(l.session_id) ?? { total: 0, matched: 0, ignored: 0 }
    c.total++
    if (l.match_kind === 'auto' || l.match_kind === 'manual') c.matched++
    else if (l.match_kind === 'ignored') c.ignored++
    countsBySession.set(l.session_id, c)
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · BANK RECONCILIATION
          </div>
          <h1 className="page-title">Bank Reconciliation</h1>
        </div>
        <Link
          href="/reconciliation/journal"
          className="text-sm text-accent hover:text-accent-hover font-serif italic"
        >
          General Ledger →
        </Link>
      </div>

      {/* ── Bank vs GL comparison ── */}
      <section className="mb-12">
        <h2 className="font-serif text-2xl text-ink mb-3">Bank vs GL Balance</h2>
        <div className="overflow-x-auto">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Bank</th>
                <th className="m-hide">Account</th>
                <th className="num m-hide">Cache balance</th>
                <th className="num m-hide">GL balance</th>
                <th className="num">Difference</th>
                <th className="lt-toggle" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {banks.map(b => {
                const gl = b.gl_account_code ? (glMap.get(b.gl_account_code) ?? 0) : 0
                const diff = Math.round((Number(b.current_balance) - gl) * 100) / 100
                return (
                  <LedgerRow key={b.id}>
                    <td className="font-serif text-[15px] text-ink">{b.bank_name}</td>
                    <td className="font-mono text-[12px] text-graphite m-hide" data-label="Account">{b.account_number ?? '—'}</td>
                    <td className="num m-hide" data-label="Cache balance">{formatMoney(Number(b.current_balance))}</td>
                    <td className="num m-hide" data-label="GL balance">{formatMoney(gl)}</td>
                    <td className={`num font-semibold ${diff === 0 ? 'text-ledger' : 'text-danger'}`}>
                      {diff === 0 ? '✓ 0.00' : formatMoney(diff)}
                    </td>
                  </LedgerRow>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Upload statement ── */}
      <section className="mb-12">
        <h2 className="font-serif text-2xl text-ink mb-1">Upload statement</h2>
        <p className="font-serif italic text-muted text-sm mb-4 max-w-3xl">
          Excel / CSV from online banking works now; auto-matching pairs by amount first,
          then payee/description, date last. Whatever can&apos;t be paired waits for you on the
          review page. PDF needs your bank&apos;s layout — send a sample statement to Claude and
          it will be added.
        </p>
        <UploadStatementForm
          banks={banks.map(b => ({ id: b.id, label: `${b.bank_name}${b.account_number ? ` — ${b.account_number}` : ''}` }))}
          defaultMonth={dayjs().subtract(1, 'month').format('YYYY-MM')}
        />
      </section>

      {/* ── Saved monthly reconciliations ── */}
      <section className="mb-12">
        <h2 className="font-serif text-2xl text-ink mb-3">Monthly reconciliations</h2>
        {(sessions ?? []).length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-8 text-center">
            <p className="font-serif italic text-muted text-base">
              No reconciliations yet — upload a statement above.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Bank</th>
                  <th>Month</th>
                  <th className="m-hide">File</th>
                  <th className="num m-hide">Matched</th>
                  <th className="num">Open items</th>
                  <th className="m-hide">Status</th>
                  <th className="right m-hide">Actions</th>
                  <th className="lt-toggle" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {((sessions ?? []) as Array<{
                  id: string
                  bank_account_id: string
                  period_month: string
                  source_filename: string | null
                  status: string
                }>).map(s => {
                  const c = countsBySession.get(s.id) ?? { total: 0, matched: 0, ignored: 0 }
                  const open = c.total - c.matched - c.ignored
                  return (
                    <LedgerRow key={s.id}>
                      <td className="font-serif text-[15px] text-ink">
                        {bankById.get(s.bank_account_id)?.bank_name ?? '—'}
                      </td>
                      <td className="font-mono text-[12px] text-graphite">
                        {dayjs(s.period_month).format('MMM YYYY')}
                      </td>
                      <td className="font-mono text-[11px] text-muted max-w-[200px] truncate m-hide" data-label="File">
                        {s.source_filename ?? '—'}
                      </td>
                      <td className="num m-hide" data-label="Matched">
                        {c.matched} / {c.total}
                      </td>
                      <td className={`num font-semibold ${open === 0 ? 'text-ledger' : 'text-alert'}`}>
                        {open === 0 ? '✓ 0' : open}
                      </td>
                      <td className="m-hide" data-label="Status">
                        <em className={`font-serif text-sm ${s.status === 'done' ? 'text-ledger' : 'text-alert'}`}>
                          {s.status}
                        </em>
                      </td>
                      <td className="text-right m-hide">
                        <Link
                          href={`/reconciliation/${s.id}`}
                          className="text-sm text-accent hover:text-accent-hover font-serif italic mr-3"
                        >
                          Open →
                        </Link>
                        <Link
                          href={`/reconciliation/${s.id}/report`}
                          className="text-sm text-accent hover:text-accent-hover font-serif italic mr-3"
                        >
                          Report
                        </Link>
                        <SessionRowActions sessionId={s.id} status={s.status as 'open' | 'done'} />
                      </td>
                    </LedgerRow>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
