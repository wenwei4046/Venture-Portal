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
// 2026-10-09: a field of the page's Repayment settings panel (the handoff).
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
      className="fin-field span-3"
    >
      <input type="hidden" name="loan_id" value={loanId} />
      <label htmlFor="funding-source">Funding source</label>
      <div className="fin-field-row">
        <input id="funding-source" name="funding_source" type="text" maxLength={60} defaultValue={current} placeholder="e.g. WL-KING / HC-58k / 2990" />
        <button type="submit" className="btn-sec" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && !isPending ? <span className="fin-saved">Saved ✓</span> : null}
      </div>
      {error ? <p className="fin-error">{error}</p> : null}
    </form>
  )
}
