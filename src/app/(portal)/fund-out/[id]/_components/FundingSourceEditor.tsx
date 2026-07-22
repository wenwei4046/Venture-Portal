'use client'

import { useState, useTransition } from 'react'
import { fundingSourceFromTerms } from '@/lib/utils'
import { setLoanFundingSource } from '../../actions'

interface Props {
  loanId: string
  repaymentTerms: string | null
}

// Finance self-service: edits ONLY the `· 资金来源: X` segment inside
// repayment_terms (via the set_loan_funding_source RPC). Rates/tenure/dates
// stay Principal-only in the Amend form.
export default function FundingSourceEditor({ loanId, repaymentTerms }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const current = fundingSourceFromTerms(repaymentTerms) ?? ''

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          setError(null)
          setSaved(false)
          const r = await setLoanFundingSource(fd)
          if (r?.error) setError(r.error)
          else setSaved(true)
        })
      }
      className="mt-4"
    >
      <input type="hidden" name="loan_id" value={loanId} />
      <div className="text-xs uppercase tracking-wide text-muted font-sans mb-1">
        资金来源 · Funding source
      </div>
      <div className="flex items-center gap-2">
        <input
          name="funding_source"
          type="text"
          maxLength={60}
          defaultValue={current}
          placeholder="e.g. WL-KING / HC-58k / 2990"
          className="w-64 px-3 py-1.5 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
        />
        <button
          type="submit"
          disabled={isPending}
          className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-md text-xs font-sans transition-colors disabled:opacity-50"
        >
          {isPending ? '保存中…' : '保存'}
        </button>
        {saved && !isPending ? (
          <span className="text-xs font-sans text-ledger">已保存 ✓</span>
        ) : null}
      </div>
      <p className="font-serif italic text-muted text-xs mt-1.5">
        这笔钱从哪里来 — 保存后放款列表会显示 SC 徽章。留空保存 = 移除徽章。只改这一格,不动其他条款。
      </p>
      {error ? (
        <p className="text-xs font-sans text-danger mt-1.5">{error}</p>
      ) : null}
    </form>
  )
}
