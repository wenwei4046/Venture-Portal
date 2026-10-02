'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { recordLoanRepaymentReceived } from '../../fund-out/actions'
import {
  dealFormClass,
  DealCards,
  DealCard,
  DealRow,
  DealLabel,
  DealMore,
  DealPreview,
  type DealPreviewRow,
} from '@/components/treasury/DealFormShell'
import DealPicker, { OwedCell, dealDate, dealMoney, dealRate } from '@/components/treasury/DealPicker'
import { bankShort } from '@/lib/deal-preview'

// 收到 Loan 还款 (2026-10-02): the same four-card shell as New loan / New fund
// source, with the loan chosen in two steps instead of one 26-row <select>.
// Everything this form submits is unchanged — loan_id, payment_date,
// bank_account_id, the three amounts, interest_account_code, notes.

export interface LoanOption {
  id: string
  /** The one-line form, kept for anything that still wants a single string. */
  label: string
  outstanding: number
  /** Borrower's full name — the party button, and the preview headline. */
  borrower: string
  principal: number
  /** Monthly rate in percent (0.5 = 0.5%/mo). */
  ratePct: number
  /** Disbursement date, YYYY-MM-DD. */
  date: string | null
  /** Funding-source remark — what tells two loans to one borrower apart. */
  source: string | null
  /** Installments: how many the loan runs for and how many are still owed
   *  (2026-10-02, user: "可以看到 installment 欠多少 total 多少期?"). Null or
   *  absent for a loan with no fixed term. */
  periods?: { total: number; remaining: number } | null
  /** Borrower's Interest-in-Suspense leaf (3060 family), when one exists. */
  suspenseCode?: string | null
  suspenseName?: string | null
  suspenseBalance?: number
}

interface Props {
  loans: LoanOption[]
  bankAccounts: { id: string; bank_name: string; account_number: string; current_balance: number }[]
}

const inputCls =
  'w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border'

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
  const [bankId, setBankId] = useState(bankAccounts[0]?.id ?? '')
  const formRef = useRef<HTMLFormElement>(null)

  const p = parseFloat(principal) || 0
  const i = parseFloat(interest) || 0
  const pen = parseFloat(penalty) || 0
  const total = p + i + pen
  const selected = loans.find((l) => l.id === loanId) ?? null
  const bank = bankAccounts.find((b) => b.id === bankId) ?? null

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
    if (selected && p > selected.outstanding + 0.005) {
      return setError(`本金 ${principal} 超过该贷款尚欠 ${selected.outstanding.toFixed(2)}`)
    }
    formData.set('loan_id', loanId)
    formData.set('payment_date', paymentDate)
    formData.set('repayment_principal', principal)
    formData.set('repayment_interest', interest)
    formData.set('repayment_penalty', penalty)
    // bank_account_id + interest_account_code + notes come from the rendered fields
    startTransition(async () => {
      try {
        await recordLoanRepaymentReceived(formData)
      } catch (err) {
        if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) throw err
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  const offersSuspense = i > 0 && !!selected?.suspenseCode
  const rows: DealPreviewRow[] = [
    { label: '本金', value: `RM ${dealMoney(p)}` },
    { label: '利息', value: `RM ${dealMoney(i)}` },
    ...(pen > 0 ? [{ label: '罚息', value: `RM ${dealMoney(pen)}` } as DealPreviewRow] : []),
    'sep',
    { label: '合计收款', value: `RM ${dealMoney(total)}`, big: true },
    'sep',
    {
      label: '还后尚欠',
      value: selected ? `RM ${dealMoney(Math.max(0, selected.outstanding - p))}` : '—',
      sub: selected ? `现在欠 ${dealMoney(selected.outstanding)}` : undefined,
    },
    { label: '收款日期', value: paymentDate ? dealDate(paymentDate) : '还没定' },
  ]

  return (
    <form ref={formRef} action={handleSubmit} className={dealFormClass}>
      <DealCards>
        <DealCard n={1} title="哪一笔贷款" en="Loan">
          <DealPicker<LoanOption & { party: string }>
            items={loans.map((l) => ({ ...l, party: l.borrower }))}
            value={loanId}
            onChange={setLoanId}
            partyLabel="谁还钱"
            dealLabel="还哪一笔"
            emptyHint="先在上面点一家公司。"
            columns={[
              { label: '借出日期', width: '1.15fr', cell: (l) => dealDate(l.date) },
              { label: '本金', width: '1.1fr', align: 'right', cell: (l) => dealMoney(l.principal) },
              { label: '月息', width: '0.65fr', align: 'right', cell: (l) => dealRate(l.ratePct), dim: (l) => l.ratePct <= 0 },
              // The same two columns, in the same words, as the fund-in picker.
              { label: '期数', width: '0.7fr', align: 'right', cell: (l) => (l.periods ? `${l.periods.total} 期` : '—'), dim: (l) => !l.periods },
              {
                label: '还剩',
                width: '0.8fr',
                align: 'right',
                cell: (l) => (l.periods ? `${l.periods.remaining} / ${l.periods.total}` : '—'),
                dim: (l) => !l.periods,
              },
              {
                label: '尚欠',
                width: '1.15fr',
                align: 'right',
                cell: (l) => <OwedCell principal={l.principal} outstanding={l.outstanding} />,
              },
              { label: '资金来源', width: '1fr', cell: (l) => l.source || '—', dim: (l) => !l.source },
            ]}
          />
        </DealCard>

        <DealCard n={2} title="还了多少" en="Amounts">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <AmountField id="principal" label="本金 · Principal" value={principal} onChange={setPrincipal} />
            <AmountField id="interest" label="利息 · Interest" value={interest} onChange={setInterest} />
            <AmountField id="penalty" label="罚息 · Penalty" value={penalty} onChange={setPenalty} />
          </div>

          {/* Where the interest lands. Only shown when interest is being recorded
              AND this borrower has an Interest-in-Suspense leaf — otherwise the
              only sensible answer is income and the choice is noise. */}
          {offersSuspense ? (
            <div className="mt-4">
              <DealLabel
                htmlFor="interest_account_code"
                hint="这笔贷款的全期利息已经预先拆到挂账科目里,所以默认冲挂账 —— 再记一次收入会重复。只有当这笔利息不在挂账内(额外收的),才选利息收入。"
              >
                利息入账科目 · Interest credited to
              </DealLabel>
              <select
                id="interest_account_code"
                name="interest_account_code"
                defaultValue={selected!.suspenseCode!}
                className={inputCls}
              >
                <option value={selected!.suspenseCode!}>
                  {selected!.suspenseCode} · {selected!.suspenseName} — 冲利息挂账(余 RM{' '}
                  {dealMoney(selected!.suspenseBalance ?? 0)})
                </option>
                <option value="5027">5027 · Interest Income - Loans — 直接确认为收入</option>
              </select>
            </div>
          ) : null}
        </DealCard>

        <DealCard n={3} title="收到哪里" en="Receipt">
          <DealRow>
            <div>
              <DealLabel htmlFor="payment_date" required>
                收款日期 · Payment date
              </DealLabel>
              <input
                id="payment_date"
                type="date"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <DealLabel htmlFor="bank_account_id">收进账户 · Into account</DealLabel>
              <select
                id="bank_account_id"
                name="bank_account_id"
                value={bankId}
                onChange={(e) => setBankId(e.target.value)}
                className={inputCls}
              >
                {bankAccounts.length === 0 ? <option value="">No active bank accounts</option> : null}
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bank_name} — {b.account_number}
                  </option>
                ))}
              </select>
            </div>
          </DealRow>
        </DealCard>

        <DealCard n={4} title="备注" en="Notes">
          <DealMore summary="加备注 · Notes (optional)">
            <input id="notes" name="notes" type="text" className={inputCls} placeholder="For Finance reference" />
          </DealMore>
        </DealCard>
      </DealCards>

      <DealPreview
        who={selected ? selected.borrower : '未选贷款'}
        since={selected?.date ? dealDate(selected.date) : null}
        rows={rows}
        gl={
          <>
            入账 <strong>{bank ? bankShort(bank.bank_name, bank.account_number) : '—'}</strong>
            <br />
            本金冲这笔贷款 · 利息{offersSuspense ? '默认冲利息挂账' : '记利息收入'}
          </>
        }
        note="收到的钱即时入账,不需要审批。"
        error={error}
        submitLabel="记录还款 · Record repayment"
        pending={isPending}
        cancelHref="/receipts"
      />
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
