// Bank Reconciliation (rebuilt 2026-08-08): upload a statement (Excel/CSV now,
// PDF once the user sends a layout sample) → auto-match against the bank's GL
// lines (amount → name → date) → review/manual-match on the session page.
// One saved session per bank per month.

import Link from 'next/link'
import { officeTime } from '@/lib/office-time'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { readReconHub } from './_lib/recon-read'
import UploadStatementButton from './_components/UploadStatementButton'
import ReconSessionsTable from './_components/ReconSessionsTable'
import { formatMoneyBare } from '@/lib/utils'
import { StatCard, StatCards } from '@/components/sheet/StatCard'

export const dynamic = 'force-dynamic'

export default async function ReconciliationPage({ searchParams }: { searchParams: Promise<{ upload?: string }> }) {
  await requirePage('/reconciliation')
  const user = await requirePermission('reconciliation')
  const supabase = (await createClient()) as unknown as SupabaseClient

  // Each bank against its GL and every saved month — as the Finance phone app reads them (`_lib/recon-read`).
  const { banks, sessions: sessionList } = await readReconHub(supabase)

  // On the sheet (2026-10-09, the user's Claude Design handoff): each bank
  // against the GL is a card; the sessions read their status as chips.
  // 2026-10-10 — Upload statement opens a modal (an old ?upload=1 link opens
  // it at once); the sessions are a sheet table.
  const { upload } = await searchParams

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
          const gl = b.gl
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
            rows={sessionList.map((s) => ({
              id: s.id,
              bank: s.bank,
              periodMonth: s.periodMonth,
              file: s.file,
              cleared: s.cleared,
              total: s.total,
              status: s.status,
            }))}
          />
        )}
      </section>
    </div>
  )
}
