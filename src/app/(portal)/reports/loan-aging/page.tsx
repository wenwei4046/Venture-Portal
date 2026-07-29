// Loan Aging (user request 2026-07-24): overdue repayment buckets for BOTH
// directions — 应收 Fund OUT loans and 应付 Fund IN sources — plus a not-aged
// section for compounding / no-fixed-term positions below each table.

import dayjs from 'dayjs'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchLoanAgingData, agingSideRows, AGING_COLUMNS } from '@/lib/loan-aging-data'
import MonthlyMatrix from '../_components/MonthlyMatrix'

export const dynamic = 'force-dynamic'

export default async function LoanAgingPage() {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const data = await fetchLoanAgingData(supabase)
  const asOfLabel = dayjs(`${data.asOfYM}-01`).format('MMMM YYYY')

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>III.</em> REPORTS · LOAN AGING · AS OF {asOfLabel.toUpperCase()}
          </div>
          <h1 className="page-title">Loan Aging</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            按还款排程逐期对账:该收/该还而未清的期数,按逾期月数分桶 · flat amortisation ·
            付款按最旧一期先冲(FIFO)
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/reports/loan-aging/export?format=xlsx"
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            Excel
          </a>
          <a
            href="/reports/loan-aging/export?format=pdf"
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            PDF
          </a>
        </div>
      </div>

      <section className="mb-12">
        <div className="sect-head">
          <h2>应收 · To collect — Fund OUT loans</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            {data.collect.aged.length} WITH DUES · {data.collect.noTerm.length} NOT AGED
          </span>
        </div>
        {data.collect.aged.length === 0 && data.collect.noTerm.length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-8 text-center">
            <p className="font-serif italic text-ledger text-sm">All loans fully on track — nothing due.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <MonthlyMatrix columns={AGING_COLUMNS} rows={agingSideRows('To collect', data.collect)} />
          </div>
        )}
      </section>

      <section className="mb-12">
        <div className="sect-head">
          <h2>应付 · To repay — Fund IN sources</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            {data.repay.aged.length} WITH DUES · {data.repay.noTerm.length} NOT AGED
          </span>
        </div>
        {data.repay.aged.length === 0 && data.repay.noTerm.length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-8 text-center">
            <p className="font-serif italic text-ledger text-sm">Nothing scheduled to repay — all clear.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <MonthlyMatrix columns={AGING_COLUMNS} rows={agingSideRows('To repay', data.repay)} />
          </div>
        )}
      </section>

      <p className="font-serif italic text-muted text-xs max-w-3xl">
        「Not aged」区 = 利滚利/无固定期限的挂账 — 没有到期日,只显示余额(记在 Total due 栏),不进逾期桶。
        本月才放款/收款的,首期下个月才到期,不会出现在这里。
      </p>
    </div>
  )
}
