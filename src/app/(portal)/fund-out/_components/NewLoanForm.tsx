'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import Link from 'next/link'
import { createLoan } from '../actions'
import type { Company } from '@/types'
import type { BsAccountOption } from '@/lib/loan-disbursement'
import AccountPicker from '@/components/AccountPicker'
import type { AccountType } from '@/lib/coa'

interface Props {
  companies: Company[]
  baseRate: { rate: number; quarter: string }
  bsAccounts: BsAccountOption[]
  banks: { id: string; bank_name: string; account_number: string; current_balance: number; is_primary: boolean }[]
}

export default function NewLoanForm({ companies, baseRate, bsAccounts, banks }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [companyId, setCompanyId] = useState<string>('')
  const [customRate, setCustomRate] = useState<string>('0.000')
  const [startDate, setStartDate] = useState<string>(
    () => new Date().toISOString().slice(0, 10)
  )
  const [disbursementAccountCode, setDisbursementAccountCode] = useState<string>('')
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (error && formRef.current) {
      formRef.current.classList.remove('shake-once')
      void formRef.current.offsetWidth
      formRef.current.classList.add('shake-once')
      const el = formRef.current
      const handler = () => el.classList.remove('shake-once')
      el.addEventListener('animationend', handler, { once: true })
      return () => el.removeEventListener('animationend', handler)
    }
  }, [error])

  const selectedCompany = companies.find((c) => c.id === companyId)
  const customRateDecimal = parseFloat(customRate || '0') / 100
  const effectiveRate = baseRate.rate + customRateDecimal

  async function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      try {
        const result = await createLoan(formData)
        if (result?.error) setError(result.error)
      } catch (err) {
        // Only NEXT_REDIRECT is expected to throw past the action — let it bubble.
        if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) {
          throw err
        }
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="bg-surface border border-hairline rounded-md p-4 sm:p-8 max-w-3xl"
    >
      {/* ───────── Company ───────── */}
      <div className="mb-6">
        <label
          htmlFor="company_id"
          className="block text-sm font-sans font-medium text-graphite mb-1.5"
        >
          Borrower
        </label>
        <select
          id="company_id"
          name="company_id"
          required
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
        >
          <option value="">Select a subsidiary…</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.short_code})
            </option>
          ))}
        </select>
      </div>

      {/* ───────── Rate panel ───────── */}
      {selectedCompany ? (
        <div className="mb-6 p-4 bg-paper border border-hairline rounded-md">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs text-muted uppercase tracking-wide font-sans mb-1">
                Base rate
              </div>
              <div className="font-mono tabular font-medium text-ink">
                {(baseRate.rate * 100).toFixed(3)}%
              </div>
              <div className="text-xs text-muted font-mono">{baseRate.quarter}</div>
            </div>
            <div>
              <div className="text-xs text-muted uppercase tracking-wide font-sans mb-1">
                Interest rate (custom)
              </div>
              <div className="relative max-w-[140px]">
                <input
                  type="number"
                  name="custom_rate_percent"
                  step="0.001"
                  min="0"
                  max="99.999"
                  value={customRate}
                  onChange={(e) => setCustomRate(e.target.value)}
                  className="w-full px-3 py-1.5 pr-14 bg-surface border border-hairline rounded-md text-sm font-mono tabular font-medium text-ink focus:outline-none focus:border-accent-border"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted font-mono">
                  % /mo
                </span>
              </div>
              <div className="text-xs text-muted italic font-serif mt-1">
                Additional monthly rate
              </div>
            </div>
            <div>
              <div className="text-xs text-accent uppercase tracking-wide font-sans mb-1">
                Locked effective rate
              </div>
              <div className="font-serif text-xl text-ink">
                {(effectiveRate * 100).toFixed(3)}
                <span className="text-graphite text-base">% /mo</span>
              </div>
              <div className="text-xs text-muted italic font-serif">
                Immutable after submission
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ───────── Principal + Tenure ───────── */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="principal"
            className="block text-sm font-sans font-medium text-graphite mb-1.5"
          >
            Principal amount
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted font-mono">
              RM
            </span>
            <input
              id="principal"
              name="principal"
              type="number"
              step="0.01"
              min="0.01"
              max="100000000"
              required
              className="w-full pl-10 pr-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular font-medium text-ink focus:outline-none focus:border-accent-border"
              placeholder="100000.00"
            />
          </div>
          <p className="font-serif italic text-muted text-xs mt-1.5">
            Loan principal in MYR (ceiling RM 100M)
          </p>
        </div>

        <div>
          <label
            htmlFor="tenure_months"
            className="block text-sm font-sans font-medium text-graphite mb-1.5"
          >
            Tenure <span className="text-muted font-normal">(optional)</span>
          </label>
          <div className="relative">
            <input
              id="tenure_months"
              name="tenure_months"
              type="number"
              step="1"
              min="1"
              max="12"
              className="w-full px-3 py-2 pr-16 bg-paper border border-hairline rounded-md text-sm font-mono tabular font-medium text-ink placeholder:font-sans focus:outline-none focus:border-accent-border"
              placeholder="留空 = 无固定期限"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted font-mono">
              months
            </span>
          </div>
          <p className="font-serif italic text-muted text-xs mt-1.5">
            留空 = 无固定期限，只按月滚利息。1–12 months if scheduled.
          </p>
        </div>
      </div>

      {/* ───────── Loan start date ───────── */}
      <div className="mb-6">
        <label
          htmlFor="loan_start_date"
          className="block text-sm font-sans font-medium text-graphite mb-1.5"
        >
          Loan start date <span className="text-danger">*</span>
        </label>
        <input
          id="loan_start_date"
          name="loan_start_date"
          type="date"
          required
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full sm:max-w-xs px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border"
        />
        <p className="font-serif italic text-muted text-xs mt-1.5">
          利息从这天开始算。Contractual start date — interest accrues from here.
          Defaults to today; back- or future-date as needed. Maturity = start date + tenure.
        </p>
      </div>

      {/* ───────── Disbursement account (Balance Sheet) ───────── */}
      <div className="mb-6">
        <label
          htmlFor="disbursement_account_code"
          className="block text-sm font-sans font-medium text-graphite mb-1.5"
        >
          Disbursement account <span className="text-danger">*</span>
        </label>
        <AccountPicker
          accounts={bsAccounts.map((a) => ({
            code: a.code,
            name: a.name,
            type: a.account_type as AccountType,
            parent_code: a.parent_code,
            is_active: true,
          }))}
          value={disbursementAccountCode}
          onChange={setDisbursementAccountCode}
          name="disbursement_account_code"
          typeFilter={['asset', 'fixed_asset', 'liability', 'equity']}
          placeholder="Select a balance-sheet account…"
          required
        />
        <p className="font-serif italic text-muted text-xs mt-1.5">
          Used to classify the disbursement on the Balance Sheet — pick the
          receivable / asset account for the borrowing party.
        </p>
      </div>

      {/* ───────── Disbursement bank ───────── */}
      <div className="mb-6">
        <label
          htmlFor="bank_account_id"
          className="block text-sm font-sans font-medium text-graphite mb-1.5"
        >
          Pay from bank
        </label>
        <select
          id="bank_account_id"
          name="bank_account_id"
          defaultValue={banks.find((b) => b.is_primary)?.id ?? ''}
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
        >
          {banks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.bank_name} — {b.account_number} (RM {b.current_balance.toFixed(2)})
            </option>
          ))}
        </select>
        <p className="font-serif italic text-muted text-xs mt-1.5">
          Debited when Principal approves the disbursement. Balance is checked at approval, not now.
        </p>
      </div>

      {/* ───────── Repayment terms ───────── */}
      <div className="mb-6">
        <label
          htmlFor="repayment_terms"
          className="block text-sm font-sans font-medium text-graphite mb-1.5"
        >
          Repayment terms{' '}
          <span className="text-muted font-normal">(optional)</span>
        </label>
        <textarea
          id="repayment_terms"
          name="repayment_terms"
          rows={3}
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
          placeholder="e.g., Interest monthly, principal bullet at 12 months. Or reference a signed term sheet."
        />
      </div>

      {/* ───────── 资金来源 · Funding source ───────── */}
      <div className="mb-6">
        <label
          htmlFor="funding_source"
          className="block text-sm font-sans font-medium text-graphite mb-1.5"
        >
          资金来源 · Funding source{' '}
          <span className="text-muted font-normal">(optional)</span>
        </label>
        <input
          id="funding_source"
          name="funding_source"
          type="text"
          maxLength={60}
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
          placeholder="e.g. WL-KING / HC-58k / 2990"
        />
        <p className="font-serif italic text-muted text-xs mt-1.5">
          这笔放款的钱从哪里来。会以 SC 徽章显示在放款列表和还款时间表上。
        </p>
      </div>

      {/* ───────── 利滚利 · Compound interest (settable at creation) ───────── */}
      <div className="mb-6">
        <label className="flex items-center gap-2">
          <input
            id="compound_interest"
            name="compound_interest"
            type="checkbox"
            className="h-4 w-4 accent-[var(--accent)]"
          />
          <span className="text-sm font-sans font-medium text-graphite">利滚利 · Compound interest</span>
        </label>
        <p className="font-serif italic text-muted text-xs mt-1.5">
          勾选后未收利息每月并入本金继续生息（利滚利）。不勾则为单利按月计。
        </p>
      </div>

      {/* ───────── 最低还息 · Minimum pay interest (2026-09-04) ───────── */}
      <div className="mb-6">
        <label className="flex items-center gap-2">
          <input
            id="min_pay_interest"
            name="min_pay_interest"
            type="checkbox"
            className="h-4 w-4 accent-[var(--accent)]"
          />
          <span className="text-sm font-sans font-medium text-graphite">最低还息 · Minimum pay interest</span>
        </label>
        <p className="font-serif italic text-muted text-xs mt-1.5">
          勾选后代表约定「本金可以慢慢还，但每月利息一定要还」。Repayment schedule
          会追踪当月利息收齐了没有，statement 上也会注明。
        </p>
      </div>

      {/* ───────── Interest preview ───────── */}
      {selectedCompany ? (
        <div className="mb-6 font-serif italic text-graphite text-sm">
          At a typical <em>RM 100,000</em> principal, monthly interest would be{' '}
          <span className="font-mono not-italic text-ink tabular">
            RM {(100000 * effectiveRate).toLocaleString('en-MY', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
      ) : null}

      {/* ───────── Error ───────── */}
      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 mb-6 text-sm font-sans">
          {error}
        </div>
      ) : null}

      {/* ───────── Actions ───────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 pt-4 border-t border-hairline">
        <button
          type="submit"
          disabled={isPending || !companyId}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Submitting…' : 'Submit for approval'}
        </button>
        <Link
          href="/fund-out"
          className="text-sm text-graphite hover:text-ink font-sans transition-colors text-center sm:text-left"
        >
          Cancel
        </Link>
        <span className="text-xs text-muted italic font-serif sm:ml-auto">
          Principal must approve before disbursement
        </span>
      </div>
    </form>
  )
}
