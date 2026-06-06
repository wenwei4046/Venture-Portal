'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { amendLoan } from '../../actions'

interface Props {
  loanId: string
  ratePct: string
  tenureMonths: string
  disbursementDate: string
  repaymentTerms: string
  compound: boolean
}

export default function LoanAmendForm({
  loanId,
  ratePct,
  tenureMonths,
  disbursementDate,
  repaymentTerms,
  compound,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          setError(null)
          const r = await amendLoan(fd)
          if (r?.error) setError(r.error)
        })
      }
      className="bg-surface border border-hairline rounded-md p-8 max-w-2xl"
    >
      <input type="hidden" name="loan_id" value={loanId} />

      <div className="mb-6 border border-accent-border rounded-md bg-accent-bg p-4">
        <div className="font-serif italic text-accent text-sm">修改贷款条款 · Amend loan terms</div>
        <p className="font-serif text-sm text-graphite mt-1">
          你是最高审批人,改动会立即生效(系统记录修改时间)。只改你填的栏目。
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
        <div>
          <label htmlFor="effective_rate_percent" className="block text-sm font-sans font-medium text-graphite mb-1.5">
            利率 · Rate (%/月)
          </label>
          <input
            id="effective_rate_percent" name="effective_rate_percent" type="number" step="0.001" min="0"
            defaultValue={ratePct}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label htmlFor="tenure_months" className="block text-sm font-sans font-medium text-graphite mb-1.5">
            期数 · Tenure (月)
          </label>
          <input
            id="tenure_months" name="tenure_months" type="number" step="1" min="1" max="120"
            defaultValue={tenureMonths}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label htmlFor="disbursement_date" className="block text-sm font-sans font-medium text-graphite mb-1.5">
            放款/起算日 · Disbursement date
          </label>
          <input
            id="disbursement_date" name="disbursement_date" type="date"
            defaultValue={disbursementDate}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
          />
          <p className="font-serif italic text-muted text-xs mt-1.5">利滚利从这个月开始滚。</p>
        </div>
        <div className="flex items-center gap-2 pt-7">
          <input id="compound_interest" name="compound_interest" type="checkbox" defaultChecked={compound} className="h-4 w-4 accent-[var(--accent)]" />
          <label htmlFor="compound_interest" className="text-sm font-sans text-graphite">利滚利 · Compound interest</label>
        </div>
      </div>

      <div className="mb-6">
        <label htmlFor="repayment_terms" className="block text-sm font-sans font-medium text-graphite mb-1.5">
          还款条款 · Repayment terms (文字)
        </label>
        <textarea
          id="repayment_terms" name="repayment_terms" rows={2}
          defaultValue={repaymentTerms}
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
        />
        <p className="font-serif italic text-muted text-xs mt-1.5">
          含「未定」或「无还款方式」→ 系统会当作「无固定期限」(不计入本月应收)。保留 [LO#…] 标记方便追溯。
        </p>
      </div>

      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 mb-6 text-sm font-sans">{error}</div>
      ) : null}

      <div className="flex items-center gap-4 pt-4 border-t border-hairline">
        <button
          type="submit" disabled={isPending}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors disabled:opacity-50"
        >
          {isPending ? '保存中…' : '保存修改 · Save'}
        </button>
        <Link href={`/fund-out/${loanId}`} className="text-sm text-graphite hover:text-ink font-sans transition-colors">Cancel</Link>
      </div>
    </form>
  )
}
