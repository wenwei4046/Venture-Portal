'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { officeToday } from '@/lib/office-time'
import Link from 'next/link'
import { createPaymentVoucher } from '../actions'
import { ACCOUNT_TYPES, type AccountType } from '@/lib/coa'
import { stageInto } from '@/lib/storage/stage'
import { filesProblem } from '@/components/finv/form-words'
import { buildRepaymentSourceRows, type RepaymentRole } from '@/lib/repayment-source-rows'
import AccountPicker from '@/components/AccountPicker'
import {
  dealFormClass,
  DealCards,
  DealCard,
  DealRow,
  DealLabel,
  DealToggle,
  DealMore,
  DealPreview,
  type DealPreviewRow,
} from '@/components/treasury/DealFormShell'
import DealPicker, { OwedCell, dealDate, dealMoney, dealRate } from '@/components/treasury/DealPicker'
import { bankShort } from '@/lib/deal-preview'
import { PAYMENT_POOL_OPTIONS as POOL_OPTIONS, paymentPoolOptions } from '@/lib/payment-pools'

// 2026-10-02 — Create payment / Create receipt in the deal-form shell.
//
// This was one 768px column of a dozen sections: the pool split sat below the
// fold, and nothing said what the voucher would do until it was saved. It is
// now the four cards New loan / New fund source use (who → amount & bank →
// pools & accounts → description), with the navy panel on the right keeping
// the total, the bank, each pool's share and the account in view while typing.
//
// Only the arrangement moved. Every field keeps its name, the hidden inputs
// are the same ones, and handleSubmit serialises exactly what it did before —
// so createPaymentVoucher receives an identical FormData.

interface InvoicePreset {
  id: string
  invoice_no: string | null
  // Item 5: company_id is null for invoices billed to non-subsidiary parties
  // (director / dept_pool / freetext). The form falls back to free-text payee.
  company_id: string | null
  company_name: string
  total_amount: number
  period_month: string
  billing_mode: string
  target_pool: string
  /** Mig 225 polymorphism: drives whether settlement runs through a bank
   *  (subsidiary) or through netting against the paying party's internal
   *  pool ledger (dept_pool / director / freetext). */
  billable_to_type: 'subsidiary' | 'director' | 'dept_pool' | 'freetext' | null
}

interface PayableFundSource {
  id: string
  label: string
  source_type: string
  from_company_id: string | null
  from_director_id: string | null
  original_amount: number
  cost_rate: number
  lock_in_months: number | null
  outstanding: number
  monthly_payment: number
  monthly_principal: number
  monthly_interest: number
  total_periods: number
  periods_paid: number
  remaining_periods: number
  /** GL account the source is owed on (4054 / 4058 …) — the principal row's default. */
  account_code?: string | null
  /** Full lender name + kind + the day the money came in — the picker's party
   *  button and its date column. */
  lender?: string
  lender_kind?: string
  effective_date?: string | null
}

interface Account {
  code: string
  name: string
  type: AccountType
  parent_code: string | null
  is_active: boolean
}

interface Props {
  companies: { id: string; name: string; short_code: string }[]
  bankAccounts: { id: string; bank_name: string; account_number: string; current_balance: number }[]
  accounts: Account[]
  invoicePreset?: InvoicePreset | null
  nonBillablePreset?: boolean
  /** Refund flow (2026-08-24): pay money BACK against a paid invoice.
   *  Prefills payee/amount/description; Finance still picks pool + GL
   *  account and the PV walks the normal approval path. */
  refundPreset?: {
    invoice_no: string | null
    company_name: string
    company_id: string | null
    amount: number
  } | null
  payableFundSources?: PayableFundSource[]
  /** Entry-point split (2026-06-12): '/payments/new' = pay-only (debit),
   *  '?mode=receipt' = receive-only (credit). Locks the direction and hides
   *  the toggle; undefined keeps the legacy toggle (invoice preset path). */
  lockedDirection?: 'debit' | 'credit'
  /** Path to return to after saving, when the caller wants the user back. */
  returnTo?: string | null
  /** Pools of departments added after the core five (IT, Revenue Department…),
   *  from the dept registry. The list below is a literal, and a literal list
   *  of pools silently leaves every later department out. */
  extraPools?: { value: string; label: string }[]
}

const TYPE_BADGE: Record<AccountType, { label: string; className: string }> = {
  equity:       { label: 'BS · Equity',       className: 'text-info' },
  fixed_asset:  { label: 'BS · Fixed Asset',  className: 'text-info' },
  asset:        { label: 'BS · Asset',        className: 'text-info' },
  liability:    { label: 'BS · Liability',    className: 'text-info' },
  revenue:      { label: 'P&L · Revenue',     className: 'text-ledger' },
  cost:         { label: 'P&L · Cost',        className: 'text-danger' },
  other_income: { label: 'P&L · Other Inc.',  className: 'text-ledger' },
  expense:      { label: 'P&L · Expense',     className: 'text-danger' },
}


const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
  { value: 'netting', label: 'Netting / offset' },
]

interface SourceRow {
  pool: string
  amount: string
  account_code: string
  override_account_type?: AccountType | ''
  override_gl_account_code?: string
  override_reason?: string
  /** Loan-repayment mode: which split component this row carries, and
   *  whether its account is still the default we filled in (client-only —
   *  neither field is submitted). */
  role?: RepaymentRole
  autoAccount?: boolean
}

export default function NewPaymentForm({ companies, bankAccounts, accounts, invoicePreset, nonBillablePreset, refundPreset, payableFundSources = [], lockedDirection, returnTo = null, extraPools = [] }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const isInvoicePay = !!invoicePreset
  const isNonBillable = !!nonBillablePreset && !isInvoicePay
  const isRefund = !!refundPreset && !isInvoicePay
  const [direction, setDirection] = useState<'debit' | 'credit'>(
    isInvoicePay ? 'credit' : lockedDirection ?? 'debit',
  )
  // Internal transfer: a pure bank-to-bank cash move (e.g. HL → Alliance to
  // stage payroll). Tick this so the voucher is booked as voucher_type=
  // internal_transfer — it does NOT consume any dept/venture pool (no expense
  // yet; the cost is recognised later when the money is actually spent), and the
  // GL posts ONE segment-tagged entry per source row so each segment's bank
  // cash slice moves correctly instead of lumping into Venture/corporate.
  const [isInternalTransfer, setIsInternalTransfer] = useState(false)
  // Inter-billing: invoice issued to an internal dept pool (or director /
  // freetext non-cash counterparty) settles without touching a bank — the
  // money moves between pool ledgers, not banks. Default payment_method to
  // 'netting' for those so the bank field skips the required guard and the
  // JE branch below routes the Cr 3030 against the paying dept's pool
  // equity instead of Dr Bank.
  const isInterBilling =
    isInvoicePay && invoicePreset!.billable_to_type !== null && invoicePreset!.billable_to_type !== 'subsidiary'
  const [paymentMethod, setPaymentMethod] = useState<string>(
    isInterBilling ? 'netting' : 'bank_transfer',
  )
  const [accountCode, setAccountCode] = useState('')
  const [sourceRows, setSourceRows] = useState<SourceRow[]>(
    isNonBillable
      ? [{ pool: 'venture_pool', amount: '', account_code: '' }]
      : [{ pool: '', amount: '', account_code: '' }]
  )
  const [amount, setAmount] = useState(
    isInvoicePay ? invoicePreset!.total_amount.toFixed(2) : isRefund ? refundPreset!.amount.toFixed(2) : '',
  )
  // Payment date — defaults to the OFFICE's today, user can backdate. The
  // browser-local date this used to read was the server's (UTC) while the
  // page was drawn there, so before 08:00 it opened on yesterday.
  const todayIso = officeToday()
  const [paymentDate, setPaymentDate] = useState(todayIso)
  // Controlled payee fields so loan-repayment mode can auto-fill them
  const [payeeName, setPayeeName] = useState(
    isInvoicePay ? invoicePreset!.company_name : isRefund ? refundPreset!.company_name : '',
  )
  const [payeeCompanyId, setPayeeCompanyId] = useState(
    isInvoicePay ? (invoicePreset!.company_id ?? '') : isRefund ? (refundPreset!.company_id ?? '') : '',
  )
  // Loan repayment mode — HV repaying a fund source (subsidiary savings / director loan)
  const [isLoanRepayment, setIsLoanRepayment] = useState(false)
  const [fundSourceId, setFundSourceId] = useState<string>('')
  const [repayPrincipal, setRepayPrincipal] = useState('0.00')
  const [repayInterest, setRepayInterest] = useState('0.00')
  const [repayPenalty, setRepayPenalty] = useState('0.00')
  const repaymentSum =
    (parseFloat(repayPrincipal) || 0) +
    (parseFloat(repayInterest) || 0) +
    (parseFloat(repayPenalty) || 0)
  // In loan repayment mode, the voucher amount IS the repayment split sum — no separate mismatch possible.
  const repaymentSumMismatch = false
  // Phase 7 Step 10: pre-select Venture Pool when Credit (common case).
  const [targetPool, setTargetPool] = useState(
    isInvoicePay ? invoicePreset!.target_pool : direction === 'credit' ? 'venture_pool' : ''
  )
  const [files, setFiles] = useState<File[]>([])
  // Controlled so the preview can name the bank; it still submits as
  // bank_account_id from the same <select>.
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id ?? '')
  const poolOptions = paymentPoolOptions(extraPools)
  const accountList = accounts.filter((a) => a.is_active)
  const accountByCode = new Map(accountList.map((a) => [a.code, a]))
  const formRef = useRef<HTMLFormElement>(null)

  const totalAmount = parseFloat(amount) || 0
  const sourceSum = sourceRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  const sourceSumMismatch =
    direction === 'debit' && totalAmount > 0 && Math.abs(sourceSum - totalAmount) > 0.005

  // Auto-fill the first row's amount when there's exactly one row and the user
  // hasn't touched it yet — the common single-source case.
  useEffect(() => {
    if (direction !== 'debit') return
    if (sourceRows.length !== 1) return
    if (sourceRows[0].amount !== '') return
    if (!totalAmount) return
    setSourceRows([{ pool: sourceRows[0].pool, amount: totalAmount.toFixed(2), account_code: sourceRows[0].account_code }])
  }, [totalAmount, direction, sourceRows])

  // When a fund source is picked, auto-fill payee + monthly principal/interest
  // split (user can override). Payee = the company/director HV owes money to.
  const selectedFundSource = payableFundSources.find((fs) => fs.id === fundSourceId) ?? null
  useEffect(() => {
    if (!isLoanRepayment || !selectedFundSource) return
    const company = companies.find((c) => c.id === selectedFundSource.from_company_id)
    if (company) {
      setPayeeName(company.name)
      setPayeeCompanyId(company.id)
    } else if (selectedFundSource.from_director_id) {
      setPayeeName('Director')
      setPayeeCompanyId('')
    } else {
      // Outsource / unlinked lenders (e.g. Kingsley, source_type='outsource'
      // with neither company nor director row): the payee field is HIDDEN in
      // loan-repayment mode, so an empty fallback made Create un-passable
      // ("Payee name is required", 2026-08-24). Take the lender's name off
      // the option label ("Kingsley · RM 100,000.00 @ …").
      const name = (selectedFundSource.lender ?? selectedFundSource.label.split(' · ')[0])?.trim()
      if (name) {
        setPayeeName(name)
        setPayeeCompanyId('')
      }
    }
    setRepayPrincipal((prev) => (prev === '0.00' || prev === '' ? selectedFundSource.monthly_principal.toFixed(2) : prev))
    setRepayInterest((prev) => (prev === '0.00' || prev === '' ? selectedFundSource.monthly_interest.toFixed(2) : prev))
  }, [isLoanRepayment, selectedFundSource, companies])

  // Loan repayment mode: amount = sum of split.
  useEffect(() => {
    if (!isLoanRepayment) return
    setAmount(repaymentSum.toFixed(2))
  }, [isLoanRepayment, repaymentSum])

  // Loan repayment mode: the source rows FOLLOW the split — one row per
  // component with its account filled in (principal → the fund source's own
  // account, interest → 6000, penalty → 9096; lib/repayment-source-rows).
  // Before this the account was typed by hand on each row and twice went to
  // the wrong place (2026-09-18: Kingsley's principal to 1010, the directors'
  // interest to 5027 income). Finance can still change a row's account or
  // pool — a hand-picked account survives later edits to the split.
  useEffect(() => {
    if (!isLoanRepayment || !selectedFundSource) return
    const split = {
      principal: parseFloat(repayPrincipal) || 0,
      interest: parseFloat(repayInterest) || 0,
      penalty: parseFloat(repayPenalty) || 0,
    }
    const active = new Set(accounts.filter((a) => a.is_active).map((a) => a.code))
    setSourceRows((prev) => buildRepaymentSourceRows(prev, split, selectedFundSource.account_code, (c) => active.has(c)))
  }, [isLoanRepayment, selectedFundSource, repayPrincipal, repayInterest, repayPenalty, accounts])

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

  async function handleSubmit(formData: FormData) {
    setError(null)

    // Client-side sum check before submit (debit only)
    if (direction === 'debit') {
      if (sourceRows.some(r => !r.pool)) {
        setError('Every source row needs a pool selected.')
        return
      }
      if (sourceSumMismatch) {
        setError(
          `Source rows sum RM ${sourceSum.toFixed(2)} — voucher total is RM ${totalAmount.toFixed(2)}. Adjust to match before submitting.`
        )
        return
      }
    }

    // Loan repayment validation (HV → fund source)
    if (isLoanRepayment) {
      if (!fundSourceId) {
        setError('Select a loan (fund source) before submitting as a loan repayment.')
        return
      }
      if (repaymentSumMismatch) {
        setError(
          `Repayment split sums RM ${repaymentSum.toFixed(2)} — voucher total is RM ${totalAmount.toFixed(2)}. Principal + interest + penalty must match.`
        )
        return
      }
      formData.set('fund_source_id', fundSourceId)
      formData.set('repayment_principal', repayPrincipal)
      formData.set('repayment_interest', repayInterest)
      formData.set('repayment_penalty', repayPenalty)
    }

    // Serialize multi-source rows into FormData
    formData.delete('source_pool') // replaced by source_rows for debit
    if (direction === 'debit') {
      formData.set('source_rows_count', String(sourceRows.length))
      for (let i = 0; i < sourceRows.length; i++) {
        const r = sourceRows[i]
        formData.set(`source_rows[${i}][pool]`, r.pool)
        formData.set(`source_rows[${i}][amount]`, r.amount)
        formData.set(`source_rows[${i}][account_code]`, r.account_code)
        // Per-row BS/PL + GL override (mig 218). All-or-none guard at DB level.
        if (r.override_account_type && r.override_gl_account_code && r.override_reason?.trim()) {
          formData.set(`source_rows[${i}][override_account_type]`, r.override_account_type)
          formData.set(`source_rows[${i}][override_gl_account_code]`, r.override_gl_account_code)
          formData.set(`source_rows[${i}][override_reason]`, r.override_reason.trim())
        } else if (r.override_account_type || r.override_gl_account_code || r.override_reason) {
          setError(`Source row ${i + 1}: override requires account type, GL account, AND reason — fill all three or clear all.`)
          return
        }
      }
      // Back-compat: write source_pool = first row's pool (Step 16 drops this)
      formData.set('source_pool', sourceRows[0]?.pool ?? '')
    }

    // Guard: each attachment is sent ahead of the save (2026-10-24, lib/storage/stage.ts), up to 100 MB a file —
    // no longer the Server Action body's 4 MB for them all.
    const tooBig = filesProblem(files)
    if (tooBig) {
      setError(tooBig)
      return
    }
    formData.set('attachment_count', String(files.length))

    startTransition(async () => {
      try {
        for (const [i, f] of files.entries()) await stageInto(formData, `attachment_${i}`, f)
        const result = await createPaymentVoucher(formData)
        if (result?.error) setError(result.error)
      } catch (err) {
        if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) throw err
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  const inputCls =
    'w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border'
  const isDebit = direction === 'debit'
  const bank = bankAccounts.find((b) => b.id === bankAccountId) ?? null
  const bankLine =
    paymentMethod === 'netting' ? '冲账 · 不动银行' : bank ? bankShort(bank.bank_name, bank.account_number) : '—'
  const poolName = (key: string) => poolOptions.find((p) => p.value === key)?.label ?? (key || '未选')
  const creditAccount = accountByCode.get(accountCode) ?? null
  const isProfitAndLoss = (t: AccountType) => t === 'revenue' || t === 'cost' || t === 'other_income' || t === 'expense'

  // What the navy panel says this voucher will do.
  const previewRows: DealPreviewRow[] = [
    { label: '金额', value: `RM ${dealMoney(totalAmount)}`, big: true },
    { label: isDebit ? '从银行' : '进银行', value: bankLine },
    { label: '日期', value: paymentDate ? dealDate(paymentDate) : '还没定' },
    'sep',
  ]
  if (isDebit) {
    for (const r of sourceRows) {
      const acct = accountByCode.get(r.account_code)
      previewRows.push({
        label: poolName(r.pool),
        value: `− ${dealMoney(parseFloat(r.amount) || 0)}`,
        sub: acct ? `${acct.code} ${acct.name}` : '未选科目',
      })
    }
    if (sourceRows.length > 1 || sourceSumMismatch) {
      previewRows.push({
        label: '各池合计',
        value: dealMoney(sourceSum),
        sub: sourceSumMismatch ? `跟总额差 ${dealMoney(totalAmount - sourceSum)}` : '✓ 跟总额对上',
      })
    }
  } else {
    previewRows.push({ label: '进池', value: poolName(targetPool) })
    if (!isInvoicePay) {
      previewRows.push({
        label: '科目',
        value: creditAccount ? creditAccount.code : '未选',
        sub: creditAccount?.name,
      })
    }
  }

  const previewGl = isInvoicePay ? (
    <>
      {isInterBilling ? 'Dr 9050 Inter-billing Expense / Cr 应收' : 'Dr 银行 / Cr 应收'}
      <br />
      {isInterBilling ? '部门间冲账,不动银行。' : '收入在开票时已经确认,这里只冲应收。'}
    </>
  ) : isDebit ? (
    isInternalTransfer ? (
      <>内部转账 · 银行之间搬钱,<strong>不扣部门池</strong></>
    ) : isLoanRepayment ? (
      <>本金冲出借人的账 · 利息记 6000 · 罚息记 9096</>
    ) : (
      <>Dr 各行的科目 / Cr <strong>{bankLine}</strong></>
    )
  ) : creditAccount ? (
    isProfitAndLoss(creditAccount.type) ? (
      <>
        这笔算<strong>损益</strong> · {TYPE_BADGE[creditAccount.type].label}
        <br />会出现在 P&amp;L 上。
      </>
    ) : (
      <>
        这笔记在<strong>资产负债表</strong> · {TYPE_BADGE[creditAccount.type].label}
        <br />不算收入。
      </>
    )
  ) : (
    <>选了科目才知道这笔算收入,还是记在资产负债表。</>
  )

  return (
    <form ref={formRef} action={handleSubmit} className={dealFormClass}>
      <DealCards>
        {/* Set by a caller that wants the user back where they were — Billing
            sends /billing so a settle does not strand them in Payments. */}
        {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
        {/* Direction: locked per entry point (Create payment = debit, Receipt =
            credit, settle-invoice = credit). The toggle only survives on legacy
            paths with no lock — it sits in card ①. */}
        {isInvoicePay ? (
          <input type="hidden" name="direction" value="credit" />
        ) : lockedDirection ? (
          <input type="hidden" name="direction" value={lockedDirection} />
        ) : null}
        {/* voucher_type: billing_payment when settling; internal_transfer when
            this debit is a pure bank-to-bank move; else derived from direction */}
        <input
          type="hidden"
          name="voucher_type"
          value={
            isInvoicePay
              ? 'billing_payment'
              : direction === 'debit'
                ? (isInternalTransfer ? 'internal_transfer' : 'expense')
                : 'receive_payment'
          }
        />
        {isInvoicePay ? <input type="hidden" name="invoice_id" value={invoicePreset!.id} /> : null}
        {/* Hidden reference fields (no longer type-driven) */}
        <input type="hidden" name="reference_type" value="" />
        <input type="hidden" name="reference_id" value="" />

        {isInvoicePay ? (
          <div className="border border-accent-border rounded-md bg-accent-bg p-4">
            <div className="font-serif italic text-accent text-sm mb-1">Settling invoice</div>
            <div className="font-mono text-sm text-ink mb-1">{invoicePreset!.invoice_no}</div>
            <div className="font-serif text-sm text-graphite">
              {invoicePreset!.company_name} paid RM {invoicePreset!.total_amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })}
            </div>
          </div>
        ) : null}

        {isRefund ? (
          <div className="border border-accent-border rounded-md bg-accent-bg p-4">
            <div className="font-serif italic text-accent text-sm mb-1">退款 · Refund against paid invoice</div>
            <div className="font-mono text-sm text-ink mb-1">{refundPreset!.invoice_no ?? '—'}</div>
            <div className="font-serif text-sm text-graphite">
              {refundPreset!.company_name} · 已收 RM{' '}
              {refundPreset!.amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })} — 金额可改成部分退款。
              来源 pool 选当初收款进的部门池,GL 科目选原本入账的收入/3030,审批走正常 PV 流程。
            </div>
          </div>
        ) : null}

        {/* ───────── ① who ───────── */}
        <DealCard n={1} title={isDebit ? '付给谁' : '收谁的钱'} en={isDebit ? 'Payee' : 'Payer'}>
          {!isInvoicePay && !lockedDirection ? (
            <div className="mb-4">
              <label className="block text-sm font-sans font-medium text-graphite mb-2">Direction</label>
              <div className="flex gap-0 border border-hairline rounded-md overflow-hidden w-fit">
                <button
                  type="button"
                  onClick={() => { setDirection('debit'); setTargetPool('') }}
                  className={direction === 'debit'
                    ? 'px-5 py-2 bg-accent-bg text-accent font-serif italic text-sm'
                    : 'px-5 py-2 text-graphite font-sans text-sm hover:bg-surface-2'}
                >
                  Debit (pay out)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDirection('credit')
                    if (!targetPool) setTargetPool('venture_pool')
                  }}
                  className={direction === 'credit'
                    ? 'px-5 py-2 bg-accent-bg text-accent font-serif italic text-sm border-l border-hairline'
                    : 'px-5 py-2 text-graphite font-sans text-sm hover:bg-surface-2 border-l border-hairline'}
                >
                  Credit (receive)
                </button>
              </div>
              <input type="hidden" name="direction" value={direction} />
            </div>
          ) : null}

          {/* The two things a standalone payment can be instead of an expense.
              Neither checkbox carries a name: they only steer voucher_type and
              the repayment fields, exactly as before. */}
          {!isInvoicePay && isDebit ? (
            <DealRow className="mb-4">
              <DealToggle
                id="is_internal_transfer"
                name=""
                label="内部转账"
                sub="Internal transfer · bank → bank"
                hint="用于「发薪转账到 Alliance」等银行间搬钱:不会扣部门池(钱还是各部门的,只是换了银行),按 segment 分开记账。来源科目选目标银行,每行 pool = 该笔归属的部门/Venture。等真正发出去再记花费。"
                checked={isInternalTransfer}
                onChange={setIsInternalTransfer}
              />
              {payableFundSources.length > 0 ? (
                <DealToggle
                  id="is_loan_repayment"
                  name=""
                  label="这是还贷款"
                  sub="This voucher is a loan repayment"
                  hint="HV 把借来的钱还给出借人(子公司 / 董事)。选了贷款之后,收款人和每月本金、利息会自动带出;批准执行时系统会自动写入这笔贷款的还款记录。"
                  checked={isLoanRepayment}
                  onChange={setIsLoanRepayment}
                />
              ) : null}
            </DealRow>
          ) : null}

          {/* ── Payee ── (in loan-repayment mode it is the lender, auto-filled) */}
          {isLoanRepayment ? (
            <>
              <input type="hidden" name="payee_company_id" value={payeeCompanyId} />
              <input type="hidden" name="payee_name" value={payeeName} />
              <DealPicker
                items={payableFundSources.map((fs) => ({
                  ...fs,
                  party: fs.lender ?? fs.label.split(' · ')[0] ?? '—',
                  partyTag: fs.lender_kind ?? null,
                  date: fs.effective_date ?? null,
                  principal: fs.original_amount,
                }))}
                value={fundSourceId}
                onChange={(id) => {
                  setFundSourceId(id)
                  // Reset split so useEffect repopulates from the new source
                  setRepayPrincipal('0.00')
                  setRepayInterest('0.00')
                }}
                partyLabel="还给谁"
                dealLabel="还哪一笔"
                emptyHint="先在上面点一个出借人。"
                columns={[
                  { label: '借入日期', width: '1.15fr', cell: (fs) => dealDate(fs.date) },
                  { label: '本金', width: '1.1fr', align: 'right', cell: (fs) => dealMoney(fs.principal) },
                  { label: '月息', width: '0.65fr', align: 'right', cell: (fs) => dealRate(fs.cost_rate * 100), dim: (fs) => fs.cost_rate <= 0 },
                  { label: '期数', width: '0.7fr', align: 'right', cell: (fs) => (fs.lock_in_months ? `${fs.total_periods} 期` : '—'), dim: (fs) => !fs.lock_in_months },
                  { label: '还剩', width: '0.8fr', align: 'right', cell: (fs) => (fs.lock_in_months ? `${fs.remaining_periods} / ${fs.total_periods}` : '—'), dim: (fs) => !fs.lock_in_months },
                  { label: '尚欠', width: '1.15fr', align: 'right', cell: (fs) => <OwedCell principal={fs.principal} outstanding={fs.outstanding} /> },
                ]}
              />
              {selectedFundSource ? (
                <p className="font-serif italic text-muted text-xs mt-3">
                  Monthly payment RM {selectedFundSource.monthly_payment.toFixed(2)} ·
                  outstanding principal RM {selectedFundSource.outstanding.toFixed(2)} ·
                  {selectedFundSource.remaining_periods} month
                  {selectedFundSource.remaining_periods === 1 ? '' : 's'} remaining
                </p>
              ) : null}
            </>
          ) : (
            <DealRow>
              <div>
                <DealLabel htmlFor="payee_company_id" hint="Name auto-fills from company if left blank.">
                  Company
                </DealLabel>
                <select
                  id="payee_company_id"
                  name="payee_company_id"
                  value={payeeCompanyId}
                  onChange={(e) => {
                    setPayeeCompanyId(e.target.value)
                    const co = companies.find((c) => c.id === e.target.value)
                    if (co && !payeeName) setPayeeName(co.name)
                  }}
                  className={inputCls}
                >
                  <option value="">Select company…</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.short_code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="payee_name" className="block text-sm font-sans font-medium text-graphite mb-1.5">
                  {direction === 'debit' ? 'Pay to' : 'Received from'}
                  <span className="text-muted font-normal ml-1">(auto from company)</span>
                </label>
                <input
                  id="payee_name"
                  name="payee_name"
                  type="text"
                  value={payeeName}
                  onChange={(e) => setPayeeName(e.target.value)}
                  className={inputCls}
                  placeholder={direction === 'debit' ? 'Recipient name' : 'Payer name'}
                />
              </div>
            </DealRow>
          )}
        </DealCard>

        {/* ───────── ② amount & bank ───────── */}
        <DealCard n={2} title="金额与银行" en="Amount & bank">
          <DealRow>
            {isLoanRepayment ? (
              <div>
                <input type="hidden" name="amount" value={amount} />
                <div className="text-xs text-muted uppercase tracking-wide font-sans">Repayment total</div>
                <div className="statement-amount text-ink">RM {repaymentSum.toFixed(2)}</div>
                <div className="text-xs text-muted font-mono mt-1">auto from split below</div>
              </div>
            ) : (
              <div>
                <DealLabel htmlFor="amount" required>
                  Amount
                </DealLabel>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted font-mono">RM</span>
                  <input
                    id="amount"
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    readOnly={isInvoicePay}
                    className="w-full pl-10 pr-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular font-medium text-ink focus:outline-none focus:border-accent-border read-only:bg-surface-2 read-only:cursor-not-allowed"
                    placeholder="0.00"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="bank_account_id" className="block text-sm font-sans font-medium text-graphite mb-1.5">
                {direction === 'debit' ? 'Pay from account' : 'Receive into account'}
                {paymentMethod !== 'netting' ? <span className="text-danger"> *</span> : null}
              </label>
              <select
                id="bank_account_id"
                name="bank_account_id"
                required={paymentMethod !== 'netting'}
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                className={inputCls}
              >
                {bankAccounts.length === 0 ? <option value="">No active bank accounts</option> : null}
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bank_name} — {b.account_number} (bal: RM {Number(b.current_balance).toLocaleString('en-MY', { minimumFractionDigits: 2 })})
                  </option>
                ))}
              </select>
              {paymentMethod === 'netting' ? (
                <p className="font-serif italic text-muted text-xs mt-1.5">
                  Netting voucher — no real money moves, so bank is optional.
                </p>
              ) : null}
            </div>
          </DealRow>

          {/* ── The repayment split (loan-repayment mode) ── */}
          {isLoanRepayment ? (
            <div className="mt-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-sans text-graphite mb-1">Principal</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={repayPrincipal}
                    onChange={(e) => setRepayPrincipal(e.target.value)}
                    className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border"
                  />
                </div>
                <div>
                  <label className="block text-xs font-sans text-graphite mb-1">Interest</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={repayInterest}
                    onChange={(e) => setRepayInterest(e.target.value)}
                    className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border"
                  />
                </div>
                <div>
                  <label className="block text-xs font-sans text-graphite mb-1">Penalty</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={repayPenalty}
                    onChange={(e) => setRepayPenalty(e.target.value)}
                    className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border"
                  />
                </div>
              </div>
              {totalAmount > 0 ? (
                <p className={`font-mono italic text-xs mt-2 ${repaymentSumMismatch ? 'text-danger' : 'text-ledger'}`}>
                  {repaymentSumMismatch
                    ? `Split sum RM ${repaymentSum.toFixed(2)} ≠ voucher total RM ${totalAmount.toFixed(2)}`
                    : `Split sum RM ${repaymentSum.toFixed(2)} matches voucher total ✓`}
                </p>
              ) : null}
            </div>
          ) : null}

          <DealRow className="mt-4">
            <div>
              <DealLabel
                htmlFor="payment_date"
                required
                hint="Defaults to today and cannot be left blank. Set the actual date the money moved if backdating."
              >
                Payment date
              </DealLabel>
              <input
                id="payment_date"
                name="payment_date"
                type="date"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <DealLabel htmlFor="payment_method">Payment method</DealLabel>
              <select
                id="payment_method"
                name="payment_method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className={inputCls}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </DealRow>
        </DealCard>

        {/* ───────── ③ pools & accounts ───────── */}
        <DealCard
          n={3}
          title={isDebit ? '哪个池出 · 记哪个科目' : '进哪个池 · 记哪个科目'}
          en="Pools & accounts"
        >
          {/* ── Source pools (Debit, multi-row) / Target pool (Credit, single) ── */}
          {direction === 'debit' ? (
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <label className="block text-sm font-sans font-medium text-graphite">
                  Deduct from pools <span className="text-danger">*</span>
                </label>
                <span className="flex items-baseline gap-4">
                  <Link
                    href="/settings?tab=accounts"
                    target="_blank"
                    className="text-xs text-muted hover:text-accent font-serif italic"
                  >
                    Manage accounts →
                  </Link>
                  <button
                    type="button"
                    onClick={() => setSourceRows([...sourceRows, { pool: '', amount: '', account_code: '' }])}
                    className="text-xs text-accent hover:text-accent-hover font-serif italic"
                  >
                    + Add source
                  </button>
                </span>
              </div>
              {isLoanRepayment ? (
                <p className="font-serif italic text-muted text-xs mb-2">
                  这几行跟着上面的本金 / 利息 / 罚息走 —— 本金记出借人自己的账,利息记 6000,罚息记 9096。
                  哪一行不一样,直接改那一行的科目。
                </p>
              ) : null}
          {/* Column headers for ≥2 rows */}
          {sourceRows.length > 1 ? (
            <div className="flex gap-2 items-center text-xs uppercase tracking-wide text-muted font-sans mb-1.5 px-0.5">
              <div className="flex-1">Pool</div>
              <div className="flex-1">Account</div>
              <div className="w-40">Amount</div>
              <div className="w-6"></div>
            </div>
          ) : null}
          <div className="space-y-3">
            {sourceRows.map((row, i) => {
              const acct = accountByCode.get(row.account_code)
              const derivedType = acct?.type ?? null
              const derivedGl = acct?.code ?? null
              const hasOverride = !!row.override_account_type
              const effType = (row.override_account_type || derivedType) as AccountType | null
              const effGl = row.override_gl_account_code || derivedGl
              const effGlName = effGl ? accountByCode.get(effGl)?.name : null
              const overrideGlOptions = row.override_account_type
                ? accountList.filter((g) => g.type === row.override_account_type)
                : []
              return (
              <div key={i} className="border border-hairline rounded-md p-3 bg-surface">
                <div className="flex gap-2 items-start">
                <select
                  value={row.pool}
                  onChange={(e) => {
                    const next = [...sourceRows]
                    next[i] = { ...next[i], pool: e.target.value }
                    setSourceRows(next)
                  }}
                  required
                  className="flex-1 px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
                >
                  <option value="">Select pool…</option>
                  {poolOptions.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <div className="flex-1">
                  <AccountPicker
                    accounts={accountList}
                    value={row.account_code}
                    onChange={(code) => {
                      const next = [...sourceRows]
                      // A hand-picked account is kept through later split edits.
                      next[i] = { ...next[i], account_code: code, autoAccount: false }
                      setSourceRows(next)
                    }}
                    name={`source_rows[${i}][account_code_display]`}
                    placeholder={accountList.length === 0 ? 'No accounts — create one' : 'Select account…'}
                    required
                  />
                  {row.role ? (
                    <p className="font-mono text-[10px] text-muted mt-1">
                      {row.role === 'principal' ? '本金 principal' : row.role === 'interest' ? '利息 interest' : '罚金 penalty'}
                      {row.autoAccount && row.account_code ? ' · 账户自动带出' : ''}
                    </p>
                  ) : null}
                </div>
                <div className="relative w-40">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted font-mono">RM</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={row.amount}
                    onChange={(e) => {
                      const next = [...sourceRows]
                      next[i] = { ...next[i], amount: e.target.value }
                      setSourceRows(next)
                    }}
                    className="w-full pl-10 pr-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border"
                    placeholder="0.00"
                  />
                </div>
                {sourceRows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setSourceRows(sourceRows.filter((_, j) => j !== i))}
                    className="px-2 py-2 text-muted hover:text-danger text-lg font-mono"
                    title="Remove this source"
                  >
                    ×
                  </button>
                ) : (
                  <div className="w-6" />
                )}
                </div>
                {/* BS/PL preview + override (mig 218 / Option B) */}
                {row.account_code ? (
                  <div className="mt-2 flex items-baseline justify-between gap-3">
                    <div className="text-xs font-mono">
                      {effType ? (
                        <span className={TYPE_BADGE[effType].className}>
                          → {TYPE_BADGE[effType].label} · {effGl ?? '—'}
                          {effGlName ? <span className="text-muted ml-1">({effGlName})</span> : null}
                          {hasOverride ? (
                            <span className="ml-2 text-alert font-serif italic">overridden</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-danger italic font-serif">
                          Account not found — pick again
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...sourceRows]
                        if (hasOverride) {
                          next[i] = { ...next[i], override_account_type: '', override_gl_account_code: '', override_reason: '' }
                        } else {
                          next[i] = { ...next[i], override_account_type: derivedType ?? 'expense', override_gl_account_code: derivedGl ?? '', override_reason: '' }
                        }
                        setSourceRows(next)
                      }}
                      className="text-xs text-graphite hover:text-accent font-serif italic"
                    >
                      {hasOverride ? 'Clear override' : 'Override'}
                    </button>
                  </div>
                ) : null}
                {hasOverride ? (
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 border border-alert/40 bg-alert/5 rounded">
                    <select
                      value={row.override_account_type}
                      onChange={(e) => {
                        const next = [...sourceRows]
                        next[i] = { ...next[i], override_account_type: e.target.value as AccountType, override_gl_account_code: '' }
                        setSourceRows(next)
                      }}
                      className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
                    >
                      {ACCOUNT_TYPES.map((t) => (
                        <option key={t} value={t}>{TYPE_BADGE[t].label}</option>
                      ))}
                    </select>
                    <select
                      value={row.override_gl_account_code ?? ''}
                      onChange={(e) => {
                        const next = [...sourceRows]
                        next[i] = { ...next[i], override_gl_account_code: e.target.value }
                        setSourceRows(next)
                      }}
                      className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
                    >
                      <option value="">Select GL…</option>
                      {overrideGlOptions.map((g) => (
                        <option key={g.code} value={g.code}>{g.code} — {g.name}</option>
                      ))}
                    </select>
                    <textarea
                      value={row.override_reason ?? ''}
                      onChange={(e) => {
                        const next = [...sourceRows]
                        next[i] = { ...next[i], override_reason: e.target.value }
                        setSourceRows(next)
                      }}
                      placeholder="Reason for override (required — auditor will see this)"
                      rows={2}
                      className="sm:col-span-2 px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
                    />
                  </div>
                ) : null}
              </div>
              )
            })}
          </div>
          {totalAmount > 0 ? (
            <p className={`font-mono italic text-xs mt-2 ${sourceSumMismatch ? 'text-danger' : 'text-ledger'}`}>
              {sourceSumMismatch
                ? `Sum RM ${sourceSum.toFixed(2)} · voucher total RM ${totalAmount.toFixed(2)} · mismatch RM ${(totalAmount - sourceSum).toFixed(2)}`
                : `Sum RM ${sourceSum.toFixed(2)} matches voucher total ✓`}
            </p>
          ) : (
            <p className="font-serif italic text-muted text-xs mt-2">
              Each row: which pool pays, what category, and how much. Row amounts must sum to the voucher total.
            </p>
          )}
              <input type="hidden" name="target_pool" value="" />
            </div>
          ) : isInvoicePay ? (
            // Settling an invoice: pool is fixed by the invoice's billing_mode
            // (poolForBillingMode in payments/new/page.tsx). Render as
            // read-only so Finance can see it but can't accidentally divert
            // the payment to the wrong pool. The hidden input still submits
            // the correct value so the server action receives target_pool.
            <div>
              <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
                Receive into pool
              </label>
              <div className="px-3 py-2 bg-surface border border-hairline rounded-md text-sm text-ink font-serif italic flex items-center gap-2">
                <span>{poolOptions.find((p) => p.value === targetPool)?.label ?? targetPool}</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-graphite border border-hairline rounded px-1.5 py-0.5 not-italic">
                  from invoice
                </span>
              </div>
              <p className="font-serif italic text-muted text-xs mt-1.5">
                Auto-set from the invoice&apos;s billing mode. To land the
                payment in a different pool, void this voucher and re-issue the
                invoice under the correct billing mode.
              </p>
              <input type="hidden" name="target_pool" value={targetPool} />
              <input type="hidden" name="source_pool" value="" />
            </div>
          ) : (
            <DealRow>
              <div>
                <DealLabel htmlFor="target_pool" required hint="Which pool should this incoming payment be recorded under?">
                  Receive into pool
                </DealLabel>
                <select
                  id="target_pool"
                  name="target_pool"
                  value={targetPool}
                  onChange={(e) => setTargetPool(e.target.value)}
                  required
                  className={inputCls}
                >
                  <option value="">Select pool…</option>
                  {poolOptions.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <input type="hidden" name="source_pool" value="" />
              </div>
              {/* Settling an invoice is purely Dr Bank / Cr AR — revenue was already
                  recognised at invoice issue, so that path never reaches here. */}
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <label className="block text-sm font-sans font-medium text-graphite">
                    Account <span className="text-danger">*</span>
                  </label>
                  <Link
                    href="/settings?tab=accounts"
                    target="_blank"
                    className="text-xs text-accent hover:text-accent-hover font-serif italic"
                  >
                    Manage in Settings →
                  </Link>
                </div>
                {accountList.length === 0 ? (
                  <p className="font-serif italic text-muted text-sm py-2 px-3 bg-surface border border-hairline rounded-md">
                    No accounts yet — create one in Settings to start.
                  </p>
                ) : (
                  <AccountPicker
                    accounts={accountList}
                    value={accountCode}
                    onChange={setAccountCode}
                    name="account_code"
                    placeholder="Select account…"
                    required
                  />
                )}
              </div>
            </DealRow>
          )}
        </DealCard>

        {/* ───────── ④ description ───────── */}
        <DealCard n={4} title="说明与附件" en="Description">
          <div className="mb-4">
            <DealLabel htmlFor="description" required>
              Description
            </DealLabel>
            <textarea
              id="description"
              name="description"
              rows={3}
              required
              defaultValue={
                isInvoicePay
                  ? `Settle invoice ${invoicePreset!.invoice_no} — ${invoicePreset!.company_name}`
                  : isRefund
                    ? `Refund invoice ${refundPreset!.invoice_no ?? ''} — ${refundPreset!.company_name}`
                    : ''
              }
              className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
              placeholder="What is this payment for? Include reference numbers, invoice numbers, etc."
            />
          </div>

          {/* ── Attachments ── */}
      <div className="mb-6">
        <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
          Attachments <span className="text-muted font-normal">(optional)</span>
        </label>
        <div className="border border-hairline rounded-md bg-paper p-4">
          <input
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
            onChange={(e) => {
              const selected = Array.from(e.target.files ?? [])
              setFiles((prev) => [...prev, ...selected])
            }}
            className="text-sm text-ink file:mr-4 file:py-2 file:px-4 file:rounded-md file:border file:border-hairline file:text-sm file:font-serif file:italic file:text-accent file:bg-accent-bg file:cursor-pointer hover:file:bg-surface-2"
          />
          <p className="font-serif italic text-muted text-xs mt-2">
            Attach transfer slip, invoice, receipt, or approval code. Optional for all payments.
          </p>
          {files.length > 0 ? (
            <div className="mt-3 space-y-1">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs text-ink truncate max-w-[300px]">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    className="text-xs text-muted hover:text-danger ml-2"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <p className="font-mono text-xs text-muted mt-1">{files.length} file{files.length === 1 ? '' : 's'} selected</p>
            </div>
          ) : null}
        </div>
      </div>

          <DealMore summary="内部备注 · Internal notes (optional)">
            <input
              id="notes"
              name="notes"
              type="text"
              className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
              placeholder="For Finance team reference only"
            />
          </DealMore>
        </DealCard>
      </DealCards>

      <DealPreview
        who={payeeName ? `${isDebit ? '付给' : '收自'} ${payeeName}` : isDebit ? '未填收款人' : '未填付款人'}
        rows={previewRows}
        gl={previewGl}
        note={
          isDebit
            ? '先存成 draft,下一步才送批;Principal 批准后钱才会动。'
            : '收到的钱即时入账,不需要审批。'
        }
        error={error}
        submitLabel={isDebit ? 'Create voucher (draft)' : 'Create receipt'}
        pending={isPending}
        disabled={sourceSumMismatch || repaymentSumMismatch}
        cancelHref={returnTo ?? (isInvoicePay || isRefund ? '/billing' : isDebit ? '/payments' : '/receipts')}
      />
    </form>
  )
}
