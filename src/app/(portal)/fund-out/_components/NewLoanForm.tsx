'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import dayjs from 'dayjs'
import { officeToday } from '@/lib/office-time'
import { createLoan } from '../actions'
import type { Company } from '@/types'
import type { BsAccountOption } from '@/lib/loan-disbursement'
import AccountPicker from '@/components/AccountPicker'
import type { AccountType } from '@/lib/coa'
import { formatMoney } from '@/lib/utils'
import { expectedFullRepaymentDate } from '@/lib/fund-source-dates'
import { bankShort, dealPreviewFigures, loanMaturity, numberOrNull } from '@/lib/deal-preview'
import {
  DealCard,
  DealCards,
  DealLabel,
  DealMore,
  DealPreview,
  DealRow,
  DealToggle,
  dealFormClass,
  type DealPreviewRow,
} from '@/components/treasury/DealFormShell'

interface Props {
  companies: Company[]
  baseRate: { rate: number; quarter: string }
  bsAccounts: BsAccountOption[]
  banks: { id: string; bank_name: string; account_number: string; current_balance: number; is_primary: boolean }[]
}

const CTL =
  'w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border'
const CTL_MONO = `${CTL} font-mono tabular font-medium`

// Layout 2026-09-22 (see DealFormShell): ① who → ② amount & terms → ③
// accounting → ④ notes, live preview on the right. Field names are unchanged
// so createLoan reads exactly what it always did.
export default function NewLoanForm({ companies, baseRate, bsAccounts, banks }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [companyId, setCompanyId] = useState<string>('')
  const [customRate, setCustomRate] = useState<string>('0.000')
  const [startDate, setStartDate] = useState<string>(
    // The office's today — toISOString's date is UTC's, yesterday until 08:00.
    () => officeToday()
  )
  const [principal, setPrincipal] = useState<string>('')
  const [tenure, setTenure] = useState<string>('')
  const [firstDue, setFirstDue] = useState<string>('')
  const [compound, setCompound] = useState(false)
  const [minPay, setMinPay] = useState(false)
  const [disbursementAccountCode, setDisbursementAccountCode] = useState<string>('')
  const [bankId, setBankId] = useState<string>(() => banks.find((b) => b.is_primary)?.id ?? banks[0]?.id ?? '')
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
  const effectiveRate = baseRate.rate + (Number.isFinite(customRateDecimal) ? customRateDecimal : 0)

  // ── Live preview ──
  const months = numberOrNull(tenure)
  const fig = dealPreviewFigures({
    principal: numberOrNull(principal) ?? 0,
    monthlyRate: effectiveRate,
    months,
    compounding: compound,
  })
  // With a first installment date the plan ends first + (n − 1) months, the
  // same way the fund-in side reads it; otherwise start + n (the maturity).
  const n = months != null && months >= 1 ? Math.floor(months) : null
  const planEnd = n ? (firstDue ? expectedFullRepaymentDate(firstDue, n) : loanMaturity(startDate, n)) : null
  const bank = banks.find((b) => b.id === bankId)
  const glAccount = bsAccounts.find((a) => a.code === disbursementAccountCode)
  const previewRows: DealPreviewRow[] = [
    { label: '本金', value: formatMoney(numberOrNull(principal) ?? 0) },
    {
      label: '利率',
      value: `${(effectiveRate * 100).toFixed(3)}% /mo`,
      sub: `base ${(baseRate.rate * 100).toFixed(3)} + ${(customRateDecimal * 100 || 0).toFixed(3)}`,
    },
    'sep',
    { label: '每月本金', value: fig.principalPerMonth == null ? '— · 无固定期限' : formatMoney(fig.principalPerMonth) },
    { label: compound ? '首月利息' : '每月利息', value: formatMoney(fig.interestPerMonth) },
    { label: '每月合计', value: formatMoney(fig.totalPerMonth), big: true },
    'sep',
    { label: '首期', value: firstDue ? dayjs(firstDue).format('D MMM YYYY') : '还没定 · 放款次月' },
    {
      label: '还清约',
      value: planEnd ? `${dayjs(planEnd).format('D MMM YYYY')} · ${n} 期` : '无固定期限 · 只按月滚利息',
    },
    {
      label: '全程利息',
      value: fig.totalInterest == null ? (compound ? '视还款情况（利滚利）' : '— · 按月计') : formatMoney(fig.totalInterest),
    },
  ]
  const previewNotes = [
    compound ? '利滚利：未收利息每月并入本金。' : null,
    minPay ? '最低还息：每月利息一定要收，schedule 会追踪。' : null,
    'Principal must approve before disbursement.',
  ].filter(Boolean)

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
    <form ref={formRef} action={handleSubmit} className={dealFormClass}>
      <DealCards>
        {/* ───────── ① 借给谁 ───────── */}
        <DealCard n={1} title="借给谁" en="Who">
          <DealRow split="2-1">
            <div>
              <DealLabel htmlFor="company_id" required>
                Borrower
              </DealLabel>
              <select
                id="company_id"
                name="company_id"
                required
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className={CTL}
              >
                <option value="">Select a subsidiary…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.short_code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <DealLabel
                htmlFor="loan_start_date"
                required
                hint="利息从这天开始算。Contractual start date — interest accrues from here. Defaults to today; back- or future-date as needed. 还清 = 首期 + 期数（没填首期就是 start date + 期数）。"
              >
                Loan start date
              </DealLabel>
              <input
                id="loan_start_date"
                name="loan_start_date"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={CTL_MONO}
              />
            </div>
          </DealRow>
          <DealRow split="2-1" className="mt-3">
            <div>
              <DealLabel
                htmlFor="funding_source"
                optional
                hint="这笔放款的钱从哪里来。会以 SC 徽章显示在放款列表和还款时间表上。"
              >
                资金来源 · Funding source
              </DealLabel>
              <input
                id="funding_source"
                name="funding_source"
                type="text"
                maxLength={60}
                className={`${CTL} placeholder:text-muted`}
                placeholder="e.g. WL-KING / HC-58k / 2990"
              />
            </div>
          </DealRow>
        </DealCard>

        {/* ───────── ② 金额与条件 ───────── */}
        <DealCard n={2} title="金额与条件" en="Amount & terms">
          <DealRow>
            <div>
              <DealLabel htmlFor="principal" required hint="Loan principal in MYR (ceiling RM 100M)">
                Principal amount
              </DealLabel>
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
                  value={principal}
                  onChange={(e) => setPrincipal(e.target.value)}
                  className={`${CTL_MONO} pl-10`}
                  placeholder="100000.00"
                />
              </div>
            </div>
            <div>
              <DealLabel
                htmlFor="custom_rate_percent"
                required
                hint="Base rate（当季批准的）+ 自订加码 = 锁定利率。Immutable after submission."
              >
                Interest rate
              </DealLabel>
              {/* Base + custom = effective, in one box */}
              <div className="grid grid-cols-[auto_auto_1fr] items-center gap-2.5 px-3 py-1.5 bg-paper border border-hairline rounded-md">
                <div className="font-mono tabular text-sm text-graphite whitespace-nowrap">
                  {(baseRate.rate * 100).toFixed(3)}%
                  <span className="block font-sans text-[10px] tracking-wide text-muted">BASE · {baseRate.quarter}</span>
                </div>
                <div className="text-muted">+</div>
                <div className="relative w-28">
                  <input
                    id="custom_rate_percent"
                    type="number"
                    name="custom_rate_percent"
                    step="0.001"
                    min="0"
                    max="99.999"
                    value={customRate}
                    onChange={(e) => setCustomRate(e.target.value)}
                    className="w-full px-2 py-1 pr-12 bg-surface border border-hairline rounded text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted font-mono">
                    % /mo
                  </span>
                </div>
                <div className="col-span-3 flex items-baseline justify-between border-t border-dashed border-hairline pt-1.5 mt-0.5">
                  <span className="font-sans text-[11px] uppercase tracking-wide text-accent">Locked effective</span>
                  <span className="font-serif text-lg text-ink">
                    {(effectiveRate * 100).toFixed(3)}
                    <span className="text-sm text-graphite"> % /mo</span>
                  </span>
                </div>
              </div>
            </div>
          </DealRow>
          <DealRow className="mt-3">
            <div>
              <DealLabel
                htmlFor="tenure_months"
                optional
                hint="留空 = 无固定期限，只按月滚利息。1–120 months if scheduled. Principal ÷ months each installment."
              >
                Repayment period
              </DealLabel>
              <div className="relative">
                <input
                  id="tenure_months"
                  name="tenure_months"
                  type="number"
                  step="1"
                  min="1"
                  max="120"
                  value={tenure}
                  onChange={(e) => setTenure(e.target.value)}
                  className={`${CTL_MONO} pr-16 placeholder:font-sans placeholder:font-normal`}
                  placeholder="留空 = 无固定期限"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted font-mono">
                  months
                </span>
              </div>
            </div>
            <div>
              <DealLabel
                htmlFor="repayment_start_date"
                optional
                hint="还没定就留空 — 默认放款次月起还，利息照算。First installment date; the schedule starts from its month. Must be on or after the loan start date."
              >
                Expected repayment date
              </DealLabel>
              <input
                id="repayment_start_date"
                name="repayment_start_date"
                type="date"
                value={firstDue}
                min={startDate || undefined}
                onChange={(e) => setFirstDue(e.target.value)}
                className={CTL_MONO}
              />
            </div>
          </DealRow>
          <DealRow className="mt-3">
            <DealToggle
              id="compound_interest"
              name="compound_interest"
              label="利滚利"
              sub="Compound interest"
              hint="勾选后未收利息每月并入本金继续生息（利滚利）。不勾则为单利按月计。"
              checked={compound}
              onChange={setCompound}
            />
            <DealToggle
              id="min_pay_interest"
              name="min_pay_interest"
              label="最低还息"
              sub="Minimum pay interest"
              hint="勾选后代表约定「本金可以慢慢还，但每月利息一定要还」。Repayment schedule 会追踪当月利息收齐了没有，statement 上也会注明。"
              checked={minPay}
              onChange={setMinPay}
            />
          </DealRow>
        </DealCard>

        {/* ───────── ③ 账务 ───────── */}
        <DealCard n={3} title="账务" en="Accounting">
          <DealRow>
            <div>
              <DealLabel
                htmlFor="disbursement_account_code"
                required
                hint="Used to classify the disbursement on the Balance Sheet — pick the receivable / asset account for the borrowing party."
              >
                Disbursement account
              </DealLabel>
              <AccountPicker
                id="disbursement_account_code"
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
            </div>
            <div>
              <DealLabel
                htmlFor="bank_account_id"
                hint="Debited when Principal approves the disbursement. Balance is checked at approval, not now."
              >
                Pay from bank
              </DealLabel>
              <select
                id="bank_account_id"
                name="bank_account_id"
                value={bankId}
                onChange={(e) => setBankId(e.target.value)}
                className={CTL}
              >
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bank_name} — {b.account_number} (RM {b.current_balance.toFixed(2)})
                  </option>
                ))}
              </select>
            </div>
          </DealRow>
        </DealCard>

        {/* ───────── ④ 备注 ───────── */}
        <DealCard n={4} title="备注" en="Notes">
          <DealMore summary="Repayment terms（选填）">
            <textarea
              id="repayment_terms"
              name="repayment_terms"
              rows={3}
              className={`${CTL} placeholder:text-muted`}
              placeholder="e.g., Interest monthly, principal bullet at 12 months. Or reference a signed term sheet."
            />
          </DealMore>
        </DealCard>
      </DealCards>

      <DealPreview
        who={selectedCompany ? selectedCompany.name : <span className="deal-side-muted">未选 Borrower</span>}
        since={startDate || null}
        rows={previewRows}
        gl={
          <>
            出账 <b>{bank ? bankShort(bank.bank_name, bank.account_number) : '—'}</b>
            <br />
            Dr <b>{glAccount ? `${glAccount.code} ${glAccount.name}` : '（未选账户）'}</b> / Cr Bank
          </>
        }
        note={previewNotes.join(' ')}
        error={error}
        pending={isPending}
        disabled={!companyId}
        cancelHref="/fund-out"
      />
    </form>
  )
}
