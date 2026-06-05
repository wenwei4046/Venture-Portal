'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import Link from 'next/link'
import { recordLoanRepaymentReceived } from '../../fund-out/actions'

interface LoanOption {
  id: string
  label: string
  outstanding: number
}

interface Props {
  loans: LoanOption[]
  bankAccounts: { id: string; bank_name: string; account_number: string; current_balance: number }[]
}

export default function LoanRepaymentReceivedForm({ loans, bankAccounts }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const now = new Date()
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const [loanId, setLoanId] = useState('')
  const [principal, setPrincipal] = useState('0.00')
  const [interest, setInterest] = useState('0.00')
  const [penalty, setPenalty] = useState('0.00')
  const [paymentDate, setPaymentDate] = useState(todayIso)
  const formRef = useRef<HTMLFormElement>(null)

  const total =
    (parseFloat(principal) || 0) + (parseFloat(interest) || 0) + (parseFloat(penalty) || 0)
  const selected = loans.find((l) => l.id === loanId) ?? null

  useEffect(() => {
    if (error && formRef.current) {
      formRef.current.classList.remove('shake-once')
      void formRef.current.offsetWidth
      formRef.current.classList.add('shake-once')
    }
  }, [error])

  async function handleSubmit(formData: FormData) {
    setError(null)
    if (!loanId) return setError('请选择要收款的贷款')
    if (total <= 0) return setError('请填本金 / 利息 / 罚息至少一项')
    if (selected && parseFloat(principal) > selected.outstanding + 0.005) {
      return setError(`本金 ${principal} 超过该贷款尚欠 ${selected.outstanding.toFixed(2)}`)
    }
    formData.set('loan_id', loanId)
    formData.set('payment_date', paymentDate)
    formData.set('repayment_principal', principal)
    formData.set('repayment_interest', interest)
    formData.set('repayment_penalty', penalty)
    // bank_account_id + notes come from the rendered fields
    startTransition(async () => {
      try {
        await recordLoanRepaymentReceived(formData)
      } catch (err) {
        if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) throw err
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  return (
    <form ref={formRef} action={handleSubmit} className="bg-surface border border-hairline rounded-md p-8 max-w-2xl">
      <div className="mb-6 border border-accent-border rounded-md bg-accent-bg p-4">
        <div className="font-serif italic text-accent text-sm">收到 Loan 还款 · Loan repayment received</div>
        <p className="font-serif text-sm text-graphite mt-1">
          记录 subsidiary 还回来的贷款。本金 / 利息 / 罚息可分开填(各按对应科目入账)。
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
        <div className="sm:col-span-2">
          <label htmlFor="loan" className="block text-sm font-sans font-medium text-graphite mb-1.5">
            贷款 · Loan <span className="text-danger">*</span>
          </label>
          <select
            id="loan"
            value={loanId}
            onChange={(e) => setLoanId(e.target.value)}
            required
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
          >
            <option value="">选择贷款…</option>
            {loans.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
          {selected ? (
            <p className="font-serif italic text-muted text-xs mt-1.5">尚欠本金 RM {selected.outstanding.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="payment_date" className="block text-sm font-sans font-medium text-graphite mb-1.5">
            收款日期 · Payment date <span className="text-danger">*</span>
          </label>
          <input
            id="payment_date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink font-mono focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label htmlFor="bank_account_id" className="block text-sm font-sans font-medium text-graphite mb-1.5">
            收进账户 · Into account
          </label>
          <select
            id="bank_account_id" name="bank_account_id" defaultValue={bankAccounts.find((b) => true)?.id ?? ''}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
          >
            {bankAccounts.length === 0 ? <option value="">No active bank accounts</option> : null}
            {bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>{b.bank_name} — {b.account_number}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <AmountField id="principal" label="本金 · Principal" value={principal} onChange={setPrincipal} />
        <AmountField id="interest" label="利息 · Interest" value={interest} onChange={setInterest} />
        <AmountField id="penalty" label="罚息 · Penalty" value={penalty} onChange={setPenalty} />
      </div>

      <div className="mb-6 flex items-baseline justify-between border-t border-hairline pt-3">
        <span className="font-serif italic text-graphite text-sm">合计收款 · Total received</span>
        <span className="font-mono tabular font-semibold text-ink text-lg">RM {total.toFixed(2)}</span>
      </div>

      <div className="mb-6">
        <label htmlFor="notes" className="block text-sm font-sans font-medium text-graphite mb-1.5">
          备注 · Notes <span className="text-muted font-normal">(optional)</span>
        </label>
        <input
          id="notes" name="notes" type="text"
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
          placeholder="For Finance reference"
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
          {isPending ? '记录中…' : '记录还款 · Record repayment'}
        </button>
        <Link href="/payments" className="text-sm text-graphite hover:text-ink font-sans transition-colors">Cancel</Link>
      </div>
    </form>
  )
}

function AmountField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-sans font-medium text-graphite mb-1.5">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted font-mono">RM</span>
        <input
          id={id} type="number" step="0.01" min="0" value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full pl-10 pr-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border"
        />
      </div>
    </div>
  )
}
