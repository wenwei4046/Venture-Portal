// Company Statement (user 2026-08-06): 每家往来对象一行 — 我还要还多少 / 我还
// 要收多少, 本金和利息分开两栏, 点开像银行 statement 看每笔 outstanding 和几时
// 还完. 要收 = loans lent out; 要还 = fund sources taken in. Data comes from
// lib/counterparty-statement-data — the SAME builder the xlsx/pdf export uses,
// so screen and file always agree; maths tie to Loan Monitor / Repayment
// Schedule.

import dayjs from 'dayjs'
import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchCounterpartyStatement } from '@/lib/counterparty-statement-data'
import StatementView from './_components/StatementView'

export const dynamic = 'force-dynamic'

export default async function CompanyStatementPage() {
  await requireRole(['finance', 'principal'])
  // Untyped client — database.types.ts predates repayment_start_month (same
  // convention as lib/loan-monitor's caller).
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { rows, totals } = await fetchCounterpartyStatement(supabase)

  return (
    <div>
      <Link
        href="/reports"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Reports
      </Link>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · AS AT {dayjs().format('D MMM YYYY').toUpperCase()}
          </div>
          <h1 className="page-title">Company Statement</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/reports/company-statement/export?format=xlsx"
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            Export Excel
          </Link>
          <Link
            href="/reports/company-statement/export?format=pdf"
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            Export PDF
          </Link>
        </div>
      </div>

      <p className="font-serif italic text-muted text-sm mb-6 max-w-3xl">
        每家往来对象一行：我还要收（借出去的 loans）对 我还要还（收进来的 fund
        sources）。利息 — 定了期数的按剩余期数算到还完（原额 × 月息 × 剩余期）；
        利滚利显示到今天已滚未付；没定期限的不入总数，只按月息做参考。几时还完 —
        按时还的显示合约到期月，落后的按每月补一期推算。点一行展开明细。
      </p>

      <StatementView rows={rows} totals={totals} />
    </div>
  )
}
