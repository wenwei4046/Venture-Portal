'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import { CLAIM_PAYMENT_METHODS } from '@/lib/claim-requests'
import { raiseClaimVoucher } from '../actions'

interface Props {
  claimId: string
  claimant: string
  banks: { id: string; bank_name: string; current_balance: number }[]
}

/** One claim's voucher: the bank it is paid from and how, then the Principal's queue. */
export default function RaiseClaimVoucherForm({ claimId, claimant, banks }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [bankId, setBankId] = useState('')
  const [method, setMethod] = useState<string>('bank_transfer')
  const [problem, setProblem] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setProblem(null)
    startTransition(async () => {
      const result = await raiseClaimVoucher({ claimId, bankId, method })
      if (!result.ok) {
        setProblem(result.reason)
        return
      }
      router.refresh()
    })
  }

  const field =
    'min-w-0 px-2 py-1.5 bg-surface border border-hairline rounded-control text-xs focus:outline-none focus:border-accent-border'

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center justify-end gap-2">
      <select
        value={bankId}
        onChange={e => setBankId(e.target.value)}
        required
        aria-label={`Bank to pay ${claimant} from`}
        className={`${field} max-w-[220px]`}
      >
        <option value="">— Pay from —</option>
        {banks.map(b => (
          <option key={b.id} value={b.id}>
            {b.bank_name} ({formatMoney(b.current_balance)})
          </option>
        ))}
      </select>
      <select
        value={method}
        onChange={e => setMethod(e.target.value)}
        aria-label={`How ${claimant} is paid`}
        className={field}
      >
        {CLAIM_PAYMENT_METHODS.map(m => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending || !bankId}
        className="bg-accent hover:bg-accent-hover text-ink text-xs font-medium px-3 py-1.5 rounded-control transition-colors disabled:opacity-50 whitespace-nowrap"
      >
        {pending ? 'Raising…' : 'Raise voucher'}
      </button>
      {problem ? (
        <span role="alert" className="basis-full text-right text-xs text-danger">
          {problem}
        </span>
      ) : null}
    </form>
  )
}
