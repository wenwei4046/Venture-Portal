// Company Statement (user 2026-08-06): 每家往来对象一行 — 我还要还多少 / 我还
// 要收多少, 本金和利息分开两栏, 点开像银行 statement 看每笔 outstanding 和几时
// 还完. 要收 = loans lent out; 要还 = fund sources taken in. Data comes from
// lib/counterparty-statement-data — the SAME builder the xlsx/pdf export uses,
// so screen and file always agree; maths tie to Loan Monitor / Repayment
// Schedule.

import { officeTime } from '@/lib/office-time'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, requirePage } from '@/lib/auth'
import { fetchCounterpartyStatement } from '@/lib/counterparty-statement-data'
import StatementView from './_components/StatementView'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import { StatCard, StatCards } from '@/components/sheet/StatCard'

export const dynamic = 'force-dynamic'

export default async function CompanyStatementPage() {
  await requirePage('/reports/company-statement')
  await requirePermission('reports')
  // Untyped client — database.types.ts predates repayment_start_month (same
  // convention as lib/loan-monitor's caller).
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { rows, totals } = await fetchCounterpartyStatement(supabase)

  // On the sheet (2026-10-09, the user's Claude Design handoff): three cards
  // over the statement — to collect, to repay, and which way the net goes.
  const toCollect = Math.round((totals.collectPrincipal + totals.collectInterest) * 100) / 100
  const toRepay = Math.round((totals.repayPrincipal + totals.repayInterest) * 100) / 100
  const net = Math.round((toCollect - toRepay) * 100) / 100

  return (
    <div>
      <div className="page-head">
        <div className="min-w-0">
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · AS AT {officeTime().format('D MMM YYYY').toUpperCase()}
          </div>
          <h1 className="page-title">Company Statement</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <a href="/reports/company-statement/export?format=xlsx" className="btn-quiet-sheet">
            Export Excel
          </a>
          <a href="/reports/company-statement/export?format=pdf" className="btn-quiet-sheet">
            Export PDF
          </a>
        </div>
      </div>

      <StatCards label="Company statement">
        <StatCard
          label="To collect"
          value={formatMoney(toCollect)}
          icon="inbox"
          tone="ledger"
          note={`Principal ${formatMoneyBare(totals.collectPrincipal)} · Interest ${formatMoneyBare(totals.collectInterest)}`}
        />
        <StatCard
          label="To repay"
          value={formatMoney(toRepay)}
          icon="send"
          tone="danger"
          note={`Principal ${formatMoneyBare(totals.repayPrincipal)} · Interest ${formatMoneyBare(totals.repayInterest)}`}
        />
        <StatCard
          label="Net"
          value={`${net >= 0 ? 'Collect' : 'Repay'} ${formatMoney(Math.abs(net))}`}
          icon="swap"
          tone="primary"
          note={`${rows.length} ${rows.length === 1 ? 'counterparty' : 'counterparties'}`}
        />
      </StatCards>

      <StatementView rows={rows} totals={totals} />
    </div>
  )
}
