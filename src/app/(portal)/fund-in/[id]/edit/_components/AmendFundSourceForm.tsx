'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { amendFundSource } from '../../../actions'

interface Props {
  id: string
  fromLabel: string
  ratePct: string
  lockInMonths: string
  repaymentDate: string
  compound: boolean
  notes: string
}

export default function AmendFundSourceForm({
  id,
  fromLabel,
  ratePct,
  lockInMonths,
  repaymentDate,
  compound,
  notes,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          setError(null)
          const r = await amendFundSource(fd)
          if (r?.error) setError(r.error)
        })
      }
      className="bg-surface border border-hairline rounded-md p-8 max-w-2xl"
    >
      <input type="hidden" name="fund_source_id" value={id} />

      <div className="mb-6 border border-accent-border rounded-md bg-accent-bg p-4">
        <div className="font-serif italic text-accent text-sm">修改资金来源条款 · Amend fund source</div>
        <p className="font-serif text-sm text-graphite mt-1">
          来源:<span className="text-ink">{fromLabel}</span>。你是最高审批人,改动立即生效。只改你填的栏目。
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
        <div>
          <label htmlFor="cost_rate_percent" className="block text-sm font-sans font-medium text-graphite mb-1.5">
            利率 · Rate (%/月)
          </label>
          <input
            id="cost_rate_percent" name="cost_rate_percent" type="number" step="0.001" min="0"
            defaultValue={ratePct}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label htmlFor="lock_in_months" className="block text-sm font-sans font-medium text-graphite mb-1.5">
            期数 · Periods (月) <span className="text-muted font-normal">— 留空 = 无固定期限</span>
          </label>
          <input
            id="lock_in_months" name="lock_in_months" type="number" step="1" min="1" max="120"
            defaultValue={lockInMonths}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label htmlFor="repayment_date" className="block text-sm font-sans font-medium text-graphite mb-1.5">
            还款起始日 · Repayment start
          </label>
          <input
            id="repayment_date" name="repayment_date" type="date"
            defaultValue={repaymentDate}
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
        <label htmlFor="notes" className="block text-sm font-sans font-medium text-graphite mb-1.5">
          备注 · Notes
        </label>
        <textarea
          id="notes" name="notes" rows={2}
          defaultValue={notes}
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
        />
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
        <Link href={`/fund-in/${id}`} className="text-sm text-graphite hover:text-ink font-sans transition-colors">Cancel</Link>
      </div>
    </form>
  )
}
