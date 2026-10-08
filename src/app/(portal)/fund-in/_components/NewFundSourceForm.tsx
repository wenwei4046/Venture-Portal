'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import dayjs from 'dayjs'
import { officeToday } from '@/lib/office-time'
import { createFundSource } from '../actions'
import type { Company, FundSourceType } from '@/types'
import { expectedFullRepaymentDate } from '@/lib/fund-source-dates'
import { formatMoney } from '@/lib/utils'
import { bankShort, dealPreviewFigures, numberOrNull } from '@/lib/deal-preview'
import AccountPicker, { type AccountOption } from '@/components/AccountPicker'
import {
  DealCard,
  DealCards,
  DealHint,
  DealLabel,
  DealMore,
  DealPreview,
  DealRow,
  DealToggle,
  dealFormClass,
  type DealPreviewRow,
} from '@/components/treasury/DealFormShell'

interface Department {
  id: string
  name: string
}

interface Props {
  companies: Company[]
  departments: Department[]
  /** Liability / equity accounts the fund-in can be tagged with (mig 247). */
  liabilityAccounts: AccountOption[]
  /** Active HV banks — which one receives the deposit (primary listed first). */
  banks: { id: string; bank_name: string; account_number: string; is_primary: boolean }[]
}

const SOURCE_TYPES: { value: FundSourceType; label: string; hint: string }[] = [
  { value: 'subsidiary', label: 'Subsidiary', hint: 'Loan from a subsidiary company' },
  { value: 'director_loan', label: 'Director Loan', hint: 'Personal loan from a director (free text)' },
  { value: 'department_pool', label: 'Dept Pool', hint: 'Idle funds from a department pool' },
  { value: 'outsource', label: 'Outsource', hint: 'External party — bank, vendor, individual investor (free text)' },
]

const CTL =
  'w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border'
const CTL_MONO = `${CTL} font-mono tabular font-medium`

// Layout 2026-09-22 (see DealFormShell): ① source → ② amount & terms → ③
// accounting → ④ notes, live preview on the right — the same shell as New
// loan so a mirrored pair (Liang in / The Cont out) keys in the same way.
// Field names are unchanged; createFundSource reads what it always did.
export default function NewFundSourceForm({ companies, departments, liabilityAccounts, banks }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [sourceType, setSourceType] = useState<FundSourceType>('subsidiary')
  const [accountCode, setAccountCode] = useState<string>('')
  const formRef = useRef<HTMLFormElement>(null)

  // Default to 无固定期限 (blank): interest accrues from the effective date,
  // terms can be set later via the edit form (2026-06-12).
  const [repaymentDate, setRepaymentDate] = useState<string>('')
  const [lockIn, setLockIn] = useState<string>('')
  const [amount, setAmount] = useState<string>('')
  const [rate, setRate] = useState<string>('')
  const [compound, setCompound] = useState(false)
  const [minPay, setMinPay] = useState(false)
  const [fromLabel, setFromLabel] = useState<string>('')
  const today = officeToday()
  const [effectiveDate, setEffectiveDate] = useState<string>(today)
  const [bankId, setBankId] = useState<string>(() => banks.find((b) => b.is_primary)?.id ?? banks[0]?.id ?? '')

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

  // Determine which "from" input to show based on source type
  const needsCompanySelect = sourceType === 'subsidiary'
  const needsFreetextInput = sourceType === 'director_loan' || sourceType === 'outsource'
  const needsDeptSelect = sourceType === 'department_pool'

  function pickSourceType(t: FundSourceType) {
    setSourceType(t)
    setFromLabel('')
  }

  // ── Live preview ──
  const months = numberOrNull(lockIn)
  const n = months != null && months >= 1 ? Math.floor(months) : null
  const fig = dealPreviewFigures({
    principal: numberOrNull(amount) ?? 0,
    monthlyRate: (numberOrNull(rate) ?? 0) / 100,
    months: n,
    compounding: compound,
  })
  const fullyRepaid = repaymentDate && n ? expectedFullRepaymentDate(repaymentDate, n) : null
  const bank = banks.find((b) => b.id === bankId)
  const glAccount = liabilityAccounts.find((a) => a.code === accountCode)
  const previewRows: DealPreviewRow[] = [
    { label: '本金', value: formatMoney(numberOrNull(amount) ?? 0) },
    { label: '利率', value: `${(numberOrNull(rate) ?? 0).toFixed(3)}% /mo` },
    'sep',
    { label: '每月本金', value: fig.principalPerMonth == null ? '— · 无固定期限' : formatMoney(fig.principalPerMonth) },
    { label: compound ? '首月利息' : '每月利息', value: formatMoney(fig.interestPerMonth) },
    { label: '每月合计', value: formatMoney(fig.totalPerMonth), big: true },
    'sep',
    { label: '首期', value: repaymentDate ? dayjs(repaymentDate).format('D MMM YYYY') : '还没定' },
    {
      label: '还清约',
      value: fullyRepaid
        ? `${dayjs(fullyRepaid).format('D MMM YYYY')} · ${n} 期`
        : n
          ? `${n} 期 · 首期未定`
          : '无固定期限 · 只按月滚利息',
    },
    {
      label: '全程利息',
      value: fig.totalInterest == null ? (compound ? '视还款情况（利滚利）' : '— · 按月计') : formatMoney(fig.totalInterest),
    },
  ]
  const previewNotes = [
    compound ? '利滚利：未付利息每月并入本金。' : null,
    minPay ? '最低还息：每月利息一定要付，schedule 会追踪。' : null,
    'Rate locks at save · Principal must approve before money moves.',
  ].filter(Boolean)

  async function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      try {
        await createFundSource(formData)
      } catch (err) {
        if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) {
          throw err
        }
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  const typeHint = SOURCE_TYPES.find((t) => t.value === sourceType)?.hint ?? ''

  return (
    <form ref={formRef} action={handleSubmit} className={dealFormClass}>
      <DealCards>
        {/* ───────── ① 谁借给 HV ───────── */}
        <DealCard n={1} title="谁借给 HV" en="Source">
          <DealRow split="2-1">
            <div>
              <span className="block text-sm font-sans font-medium text-graphite mb-1.5">
                Source type
                <DealHint text={typeHint} />
              </span>
              <div className="flex flex-wrap gap-0 border border-hairline rounded-md overflow-hidden w-fit">
                {SOURCE_TYPES.map((t, i) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => pickSourceType(t.value)}
                    className={
                      sourceType === t.value
                        ? 'px-4 py-2 bg-accent-bg text-accent font-serif italic text-sm'
                        : `px-4 py-2 text-graphite font-sans text-sm hover:bg-surface-2${i > 0 ? ' border-l border-hairline' : ''}`
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <input type="hidden" name="source_type" value={sourceType} />
            </div>
            <div>
              <DealLabel
                htmlFor="effective_date"
                required
                hint="钱进来当天 = 利息从这天开始算。Day HV receives the capital — interest accrues from here."
              >
                Effective date
              </DealLabel>
              <input
                id="effective_date"
                name="effective_date"
                type="date"
                required
                value={effectiveDate}
                max={today}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className={CTL_MONO}
              />
            </div>
          </DealRow>
          <DealRow split="2-1" className="mt-3">
            {needsCompanySelect ? (
              <div>
                <DealLabel htmlFor="from_id" required hint="The subsidiary lending money to HV">
                  Subsidiary
                </DealLabel>
                <select
                  id="from_id"
                  name="from_id"
                  required
                  className={CTL}
                  onChange={(e) => setFromLabel(companies.find((c) => c.id === e.target.value)?.name ?? '')}
                >
                  <option value="">Select a subsidiary…</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.short_code})
                    </option>
                  ))}
                </select>
              </div>
            ) : needsFreetextInput ? (
              <div>
                <DealLabel
                  htmlFor="from_freetext_name"
                  required
                  hint={
                    sourceType === 'director_loan'
                      ? 'Free text — the director extending a personal loan to HV'
                      : 'Free text — external party lending to HV (bank, vendor, individual)'
                  }
                >
                  {sourceType === 'director_loan' ? 'Director name' : 'Outsource party name'}
                </DealLabel>
                <input
                  id="from_freetext_name"
                  name="from_freetext_name"
                  type="text"
                  required
                  maxLength={120}
                  className={`${CTL} placeholder:text-muted`}
                  placeholder={sourceType === 'director_loan' ? 'e.g., Tan Wei Liang' : 'e.g., Maybank, ABC Holdings, John Smith'}
                  onChange={(e) => setFromLabel(e.target.value)}
                />
              </div>
            ) : needsDeptSelect ? (
              <div>
                <DealLabel htmlFor="from_id" required hint="Transfer idle funds from this department pool into Venture Pool">
                  Department
                </DealLabel>
                <select
                  id="from_id"
                  name="from_id"
                  required
                  className={CTL}
                  onChange={(e) => setFromLabel(departments.find((d) => d.id === e.target.value)?.name ?? '')}
                >
                  <option value="">Select a department…</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </DealRow>
        </DealCard>

        {/* ───────── ② 金额与条件 ───────── */}
        <DealCard n={2} title="金额与条件" en="Amount & terms">
          <DealRow>
            <div>
              <DealLabel htmlFor="amount" required hint="Principal amount in MYR">
                Amount
              </DealLabel>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted font-mono">
                  RM
                </span>
                <input
                  id="amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={`${CTL_MONO} pl-10`}
                  placeholder="100000.00"
                />
              </div>
            </div>
            <div>
              <DealLabel
                htmlFor="cost_rate_percent"
                required
                hint="Monthly interest rate. Enter 0 if interest-free. Fixed rate × original principal × months."
              >
                Interest rate
              </DealLabel>
              <div className="relative">
                <input
                  id="cost_rate_percent"
                  name="cost_rate_percent"
                  type="number"
                  step="0.001"
                  min="0"
                  max="99.999"
                  required
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  className={`${CTL_MONO} pr-14`}
                  placeholder="2.000"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted font-mono">
                  % /mo
                </span>
              </div>
            </div>
          </DealRow>
          <DealRow className="mt-3">
            <div>
              <DealLabel
                htmlFor="lock_in_months"
                optional
                hint="留空 = 无固定期限，只按月滚利息。Total repayment = (Principal + Interest) ÷ months"
              >
                Repayment period
              </DealLabel>
              <div className="relative">
                <input
                  id="lock_in_months"
                  name="lock_in_months"
                  type="number"
                  step="1"
                  min="1"
                  max="120"
                  value={lockIn}
                  onChange={(e) => setLockIn(e.target.value)}
                  placeholder="留空 = 无固定期限"
                  className={`${CTL_MONO} pr-16 placeholder:text-muted placeholder:font-sans placeholder:font-normal placeholder:not-italic`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted font-mono">
                  months
                </span>
              </div>
            </div>
            <div>
              <DealLabel
                htmlFor="repayment_date"
                optional
                hint="还没定就留空 — 利息照算。First installment date; leave blank if not decided yet. Must be on or after the effective date."
              >
                Expected repayment date
              </DealLabel>
              <input
                id="repayment_date"
                name="repayment_date"
                type="date"
                value={repaymentDate}
                onChange={(e) => setRepaymentDate(e.target.value)}
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
              hint="勾选后未付利息每月并入本金继续生息（利滚利）。不勾则为单利按月计。"
              checked={compound}
              onChange={setCompound}
            />
            <DealToggle
              id="min_pay_interest"
              name="min_pay_interest"
              label="最低还息"
              sub="Minimum pay interest"
              hint="勾选后代表约定「本金可以慢慢还，但每月利息一定要付」。Repayment schedule 会追踪当月利息付齐了没有，statement 上也会注明。"
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
                htmlFor="account_code"
                optional
                hint='Tracks who HV owes individually on the Balance Sheet. Leave blank to fall back to the umbrella "4000 Fund Sources Payable". Pick a child sub-account (e.g. "4001 — Lim Wei Siang") for a per-party balance.'
              >
                Amount due to (BS account)
              </DealLabel>
              <AccountPicker
                id="account_code"
                accounts={liabilityAccounts}
                value={accountCode}
                onChange={setAccountCode}
                name="account_code"
                typeFilter={['liability', 'equity']}
                placeholder="Pick the payable sub-account…"
              />
            </div>
            <div>
              <DealLabel
                htmlFor="bank_account_id"
                hint="Which HV account the money lands in. Applied when Principal approves — that bank's balance and its GL cash account are the ones that move."
              >
                Receive into bank
              </DealLabel>
              <select
                id="bank_account_id"
                name="bank_account_id"
                value={bankId}
                onChange={(e) => setBankId(e.target.value)}
                disabled={isPending}
                className={`${CTL} disabled:opacity-60`}
              >
                {banks.length === 0 ? (
                  <option value="">No active banks</option>
                ) : (
                  banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bank_name} — {b.account_number}
                      {b.is_primary ? ' (primary)' : ''}
                    </option>
                  ))
                )}
              </select>
            </div>
          </DealRow>
        </DealCard>

        {/* ───────── ④ 备注 ───────── */}
        <DealCard n={4} title="备注" en="Notes">
          <DealMore summary="Notes（选填）">
            <textarea
              id="notes"
              name="notes"
              rows={3}
              className={`${CTL} placeholder:text-muted`}
              placeholder="Context, reference to email, approval reference, etc."
            />
          </DealMore>
        </DealCard>
      </DealCards>

      <DealPreview
        who={
          fromLabel ? (
            <>借自 {fromLabel}</>
          ) : (
            <span className="deal-side-muted">
              {needsCompanySelect ? '未选 Subsidiary' : needsDeptSelect ? '未选 Department' : '未填对方名字'}
            </span>
          )
        }
        since={effectiveDate || null}
        rows={previewRows}
        gl={
          <>
            入账 <b>{bank ? bankShort(bank.bank_name, bank.account_number) : '—'}</b>
            <br />
            Dr Bank / Cr <b>{glAccount ? `${glAccount.code} ${glAccount.name}` : '4000 Fund Sources Payable'}</b>
          </>
        }
        note={previewNotes.join(' ')}
        error={error}
        pending={isPending}
        cancelHref="/fund-in"
      />
    </form>
  )
}
