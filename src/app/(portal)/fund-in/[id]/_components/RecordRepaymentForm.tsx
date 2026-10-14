'use client'

import { useState, useTransition } from 'react'
import { officeToday } from '@/lib/office-time'
import { createPaymentVoucher } from '../../../payments/actions'
import { DEFAULT_REPAYMENT_POOL } from '@/lib/repayment-source-rows'
import { fundSourceRepaymentForm, repaymentTotal } from '@/lib/fund-source-repayment'
import { bankShort } from '@/lib/deal-preview'

// Record repayment, on the fund source's own page (2026-10-02).
//
// Fund OUT has had this from the start: a loan's page carries a form, and a
// repayment is keyed in right there. Fund IN had a blue box instead — "go to
// Payments → Create payment and select Loan repayment" — so repaying a lender
// meant leaving the page, ticking a checkbox halfway down a long form and
// finding the same loan again in a 26-row list (user: "loan repayment 和 fund
// out 的 loan repayment 按钮不一样").
//
// This is the same entry on both sides. It files the SAME voucher Create
// payment does in loan-repayment mode — same action, same fields, the source
// rows built by the same helper (principal on the lender's own account,
// interest on 6000, penalty on 9096) — with the loan already known. Money
// going OUT still needs the Principal: the voucher is saved as a draft and the
// user lands on it to send it for approval, exactly as from Create payment.

interface Props {
  fundSourceId: string
  /** The lender, in full — the voucher's payee. */
  lender: string
  lenderCompanyId: string | null
  /** GL account the source is owed on; the principal row's default. */
  accountCode: string | null
  outstanding: number
  /** This month's instalment, to start from. */
  monthlyPrincipal: number
  monthlyInterest: number
  bankAccounts: { id: string; bank_name: string; account_number: string; current_balance: number }[]
  pools: { value: string; label: string }[]
  /** Active chart-of-accounts codes among the three defaults. */
  activeAccounts: string[]
}

const money = (n: number) => n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const inputCls =
  'w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border'

export default function RecordRepaymentForm({
  fundSourceId,
  lender,
  lenderCompanyId,
  accountCode,
  outstanding,
  monthlyPrincipal,
  monthlyInterest,
  bankAccounts,
  pools,
  activeAccounts,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // The office's today. Built from this machine's own calendar it was UTC's
  // whenever the server drew the page — yesterday until 08:00.
  const todayIso = officeToday()
  const [principal, setPrincipal] = useState(Math.min(monthlyPrincipal, outstanding).toFixed(2))
  const [interest, setInterest] = useState(monthlyInterest.toFixed(2))
  const [penalty, setPenalty] = useState('0.00')
  const [paymentDate, setPaymentDate] = useState(todayIso)
  const [bankId, setBankId] = useState(bankAccounts[0]?.id ?? '')
  const [pool, setPool] = useState(DEFAULT_REPAYMENT_POOL)

  const p = parseFloat(principal) || 0
  const total = repaymentTotal(principal, interest, penalty)
  const bank = bankAccounts.find((b) => b.id === bankId) ?? null

  function handleSubmit(formData: FormData) {
    setError(null)
    // The same FormData Create payment sends in loan-repayment mode (`lib/fund-source-repayment`, the phone app's too).
    const built = fundSourceRepaymentForm(
      { fundSourceId, lender, lenderCompanyId, accountCode, outstanding, activeAccounts, principal, interest, penalty, paymentDate, bankId, pool },
      formData,
    )
    if (!built.ok) return setError(built.reason)

    startTransition(async () => {
      try {
        const result = await createPaymentVoucher(built.formData)
        if (result?.error) setError(result.error)
      } catch (err) {
        if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) throw err
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  return (
    <form action={handleSubmit} className="bg-surface border border-hairline rounded-md p-6 max-w-3xl">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <AmountField id="repay_principal" label="本金 · Principal" value={principal} onChange={setPrincipal} />
        <AmountField id="repay_interest" label="利息 · Interest" value={interest} onChange={setInterest} />
        <AmountField id="repay_penalty" label="罚息 · Penalty" value={penalty} onChange={setPenalty} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div>
          <label htmlFor="repay_date" className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Payment date
          </label>
          <input
            id="repay_date"
            name="payment_date"
            type="date"
            required
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            className={`${inputCls} font-mono`}
          />
        </div>
        <div>
          <label htmlFor="repay_bank" className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Pay from account
          </label>
          <select
            id="repay_bank"
            name="bank_account_id"
            required
            value={bankId}
            onChange={(e) => setBankId(e.target.value)}
            className={inputCls}
          >
            {bankAccounts.length === 0 ? <option value="">No active bank accounts</option> : null}
            {bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {bankShort(b.bank_name, b.account_number)} (bal: RM {money(Number(b.current_balance))})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="repay_pool" className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Deduct from pool
          </label>
          <select id="repay_pool" value={pool} onChange={(e) => setPool(e.target.value)} className={inputCls}>
            {pools.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-4">
        <label htmlFor="repay_description" className="block text-sm font-sans font-medium text-graphite mb-1.5">
          Description <span className="text-muted font-normal">(optional)</span>
        </label>
        <input
          id="repay_description"
          name="description"
          type="text"
          className={inputCls}
          placeholder={`Loan repayment — ${lender}`}
        />
      </div>

      <div className="mb-4 flex items-baseline justify-between border-t border-hairline pt-3">
        <span className="font-serif italic text-graphite text-sm">
          合计还款 · Total{bank ? <span className="text-muted"> · 从 {bankShort(bank.bank_name, bank.account_number)}</span> : null}
        </span>
        <span className="font-mono tabular font-semibold text-ink text-lg">RM {money(total)}</span>
      </div>

      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 mb-4 text-sm font-sans">{error}</div>
      ) : null}

      <div className="flex items-center gap-4 flex-wrap">
        <button
          type="submit"
          disabled={isPending || total <= 0}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Recording…' : 'Record repayment'}
        </button>
        <span className="text-xs text-muted italic font-serif">
          会生成一张 draft PV 并带你过去送批 —— Principal 批准后钱才会动。还后尚欠 RM{' '}
          {money(Math.max(0, outstanding - p))}。
        </span>
      </div>
    </form>
  )
}

function AmountField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-sans font-medium text-graphite mb-1.5">
        {label}
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted font-mono">RM</span>
        <input
          id={id}
          type="number"
          step="0.01"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full pl-10 pr-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border"
        />
      </div>
    </div>
  )
}
