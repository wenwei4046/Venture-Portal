'use client'

import { useState } from 'react'
import { DateField } from '@/components/finv/DateField'
import { DealMinPayFrom } from '@/components/finv/DealTermsParts'
import { DialogButton, DialogConfirm, DialogForm, Field, FinDialog, Hint, Input, TextArea } from '@/components/finv/Dialog'
import { money, neededSentence, num } from '@/components/finv/form-words'
import fm from '@/components/finv/form.module.css'
import { Select } from '@/components/hrv/select'
import { bankShort } from '@/lib/deal-preview'
import { NO_MIN_PAY_FROM, minPayFromMissing, minPayFromWords, minPayLaterMonths, type MinPayFrom } from '@/lib/min-pay'
import { DEFAULT_REPAYMENT_POOL } from '@/lib/repayment-source-rows'
import { fundSourceRepaymentForm, repaymentTotal } from '@/lib/fund-source-repayment'
import {
  cancelPendingLoan,
  recordRepaymentFromSheet,
  requestLoanCancel,
  setLoanFundingSource,
  setLoanMinPayInterest,
  setLoanRepaymentStart,
} from '@/app/(portal)/fund-out/actions'
import {
  requestFundSourceCancel,
  setFundSourceMinPayInterest,
  setFundSourceNotes,
  setFundSourceRepaymentStart,
  withdrawFundSource,
} from '@/app/(portal)/fund-in/actions'
import { createPaymentFromDialog } from '@/app/(portal)/payments/actions'
import type { SourceRepaymentOptions } from '@/app/(portal)/fund-in/[id]/_lib/source-page'

// A deal's windows in the Finance phone app (2026-10-15, M13–M14): what the
// loan's and the fund source's full pages do in their cards and panel, each a
// sheet — Record repayment (a loan's: one type, one amount, posted at once; a
// fund source's: the draft voucher Create payment files in loan-repayment
// mode), the repayment settings (funding source, repayment start), a fund
// source's notes, and Cancel / Withdraw / Request cancellation. Every write is
// the page's own Server Action, its gate unchanged.

type Answer = { error: string } | undefined

const PAYMENT_TYPES = [
  { value: 'interest', label: 'Interest' },
  { value: 'principal', label: 'Principal' },
  { value: 'penalty', label: 'Penalty' },
  { value: 'netting', label: 'Netting' },
] as const

/** A sheet's busy flag, its refusal, and a write answered `{ error }` (or thrown). */
function useWrite() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (work: () => Promise<string | null>): Promise<boolean> => {
    if (busy) return false
    setBusy(true)
    setError(null)
    try {
      const refused = await work()
      if (refused) {
        setError(refused)
        return false
      }
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through. Try again.')
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, setError, run }
}

const answered = (res: Answer) => res?.error ?? null

/** Record repayment on a loan — the loan page's form: posted at once to the primary bank and the journal. */
export function LoanRepaymentSheet({
  open,
  onClose,
  onDone,
  loanId,
  outstanding,
  today,
}: {
  open: boolean
  onClose: () => void
  onDone: (message: string) => void
  loanId: string
  outstanding: number
  today: string
}) {
  const w = useWrite()
  const [type, setType] = useState<string>('interest')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [notes, setNotes] = useState('')
  const reset = () => {
    setType('interest')
    setAmount('')
    setDate(today)
    setNotes('')
    w.setError(null)
  }
  const close = () => {
    if (w.busy) return
    onClose()
    reset()
  }
  const value = num(amount)
  const problem =
    !(value > 0)
      ? 'An amount is needed.'
      : type === 'principal' && value > outstanding + 0.005
        ? `A principal repayment is at most RM ${money(outstanding)} — what is still owed.`
        : date > today
          ? 'The payment date cannot be in the future.'
          : null
  const save = async () => {
    if (problem) return
    const fd = new FormData()
    fd.set('loan_id', loanId)
    fd.set('payment_type', type)
    fd.set('amount', value.toFixed(2))
    fd.set('payment_date', date)
    if (notes.trim()) fd.set('notes', notes.trim())
    const ok = await w.run(async () => {
      const res = await recordRepaymentFromSheet(fd)
      return res.ok ? null : res.reason
    })
    if (!ok) return
    const label = PAYMENT_TYPES.find((t) => t.value === type)?.label ?? type
    onClose()
    reset()
    onDone(`${label} repayment of RM ${money(value)} recorded`)
  }
  return (
    <FinDialog open={open} onClose={close} title="Record repayment" sub={`RM ${money(outstanding)} still owed`} locked={w.busy} tall>
      <DialogForm
        onSubmit={() => void save()}
        buttons={
          <>
            <DialogButton disabled={w.busy} onClick={close}>
              Cancel
            </DialogButton>
            <DialogButton kind="primary" off={!!problem} disabled={w.busy} onClick={() => void save()}>
              {w.busy ? 'Recording…' : 'Record repayment'}
            </DialogButton>
          </>
        }
      >
        <Field label="Type" htmlFor="lr-type">
          <Select id="lr-type" round={12} className={fm.select} value={type} onChange={(e) => setType(e.target.value)}>
            {PAYMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount RM" htmlFor="lr-amount">
          <Input id="lr-amount" mono align="right" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="Payment date">
          <DateField value={date} onChange={setDate} today={today} label="Payment date" />
        </Field>
        <Field label="Notes" htmlFor="lr-notes">
          <Input id="lr-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Bank transfer reference, statement period…" />
        </Field>
        {w.error ? <Hint danger>{w.error}</Hint> : problem && amount ? <Hint>{problem}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}

/**
 * Record repayment on a fund source — the page's form: the voucher Create payment files in loan-repayment mode,
 * saved as a draft (money going out waits for the Principal), then opened to send it for approval.
 */
export function SourceRepaymentSheet({
  open,
  onClose,
  onDone,
  sourceId,
  repay,
  today,
}: {
  open: boolean
  onClose: () => void
  onDone: (voucher: { id: string; voucherNo: string }) => void
  sourceId: string
  repay: SourceRepaymentOptions
  today: string
}) {
  const w = useWrite()
  const first = () => ({
    principal: Math.min(repay.monthlyPrincipal, repay.outstanding).toFixed(2),
    interest: repay.monthlyInterest.toFixed(2),
  })
  const [principal, setPrincipal] = useState(() => first().principal)
  const [interest, setInterest] = useState(() => first().interest)
  const [penalty, setPenalty] = useState('0.00')
  const [date, setDate] = useState(today)
  const [bankId, setBankId] = useState(repay.bankAccounts[0]?.id ?? '')
  const [pool, setPool] = useState(DEFAULT_REPAYMENT_POOL)
  const [desc, setDesc] = useState('')
  const reset = () => {
    setPrincipal(first().principal)
    setInterest(first().interest)
    setPenalty('0.00')
    setDate(today)
    setBankId(repay.bankAccounts[0]?.id ?? '')
    setPool(DEFAULT_REPAYMENT_POOL)
    setDesc('')
    w.setError(null)
  }
  const close = () => {
    if (w.busy) return
    onClose()
    reset()
  }
  const total = repaymentTotal(principal, interest, penalty)
  const save = async () => {
    const built = fundSourceRepaymentForm({
      fundSourceId: sourceId,
      lender: repay.lender,
      lenderCompanyId: repay.lenderCompanyId,
      accountCode: repay.accountCode,
      outstanding: repay.outstanding,
      activeAccounts: repay.activeAccounts,
      principal,
      interest,
      penalty,
      paymentDate: date,
      bankId,
      pool,
      description: desc,
    })
    if (!built.ok) {
      w.setError(built.reason)
      return
    }
    const made: { v: { id: string; voucherNo: string } | null } = { v: null }
    const ok = await w.run(async () => {
      const res = await createPaymentFromDialog(built.formData)
      if (!res.ok) return res.reason
      made.v = { id: res.id, voucherNo: res.voucherNo }
      return null
    })
    if (!ok || !made.v) return
    onClose()
    reset()
    onDone(made.v)
  }
  return (
    <FinDialog open={open} onClose={close} title="Record repayment" sub={`To ${repay.lender} · RM ${money(repay.outstanding)} still owed`} locked={w.busy} tall>
      <DialogForm
        onSubmit={() => void save()}
        buttons={
          <>
            <DialogButton disabled={w.busy} onClick={close}>
              Cancel
            </DialogButton>
            <DialogButton kind="primary" off={total <= 0} disabled={w.busy} onClick={() => void save()}>
              {w.busy ? 'Saving…' : 'Save draft'}
            </DialogButton>
          </>
        }
      >
        <div className={fm.trio}>
          <Field label="Principal" htmlFor="sr-principal">
            <Input id="sr-principal" mono align="right" inputMode="decimal" value={principal} onChange={(e) => setPrincipal(e.target.value)} />
          </Field>
          <Field label="Interest" htmlFor="sr-interest">
            <Input id="sr-interest" mono align="right" inputMode="decimal" value={interest} onChange={(e) => setInterest(e.target.value)} />
          </Field>
          <Field label="Penalty" htmlFor="sr-penalty">
            <Input id="sr-penalty" mono align="right" inputMode="decimal" value={penalty} onChange={(e) => setPenalty(e.target.value)} />
          </Field>
        </div>
        <Field label="Payment date">
          <DateField value={date} onChange={setDate} today={today} label="Payment date" />
        </Field>
        <Field label="Pay from" htmlFor="sr-bank">
          <Select id="sr-bank" round={12} className={fm.select} value={bankId} onChange={(e) => setBankId(e.target.value)}>
            {repay.bankAccounts.length === 0 ? <option value="">No active bank account</option> : null}
            {repay.bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {`${bankShort(b.bank_name, b.account_number)} · RM ${money(b.current_balance)}`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Deduct from pool" htmlFor="sr-pool">
          <Select id="sr-pool" round={12} className={fm.select} value={pool} onChange={(e) => setPool(e.target.value)}>
            {repay.pools.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Description" htmlFor="sr-desc">
          <Input id="sr-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={`Loan repayment — ${repay.lender}`} />
        </Field>
        <div className={fm.summary}>
          <div className={fm.summaryTotal}>
            <span className={fm.summaryTotalLabel}>Total</span>
            <span className={fm.summaryTotalValue}>RM {money(total)}</span>
          </div>
        </div>
        {w.error ? <Hint danger>{w.error}</Hint> : <Hint>Saved as a draft voucher — send it for approval from it; the money moves once the Principal approves.</Hint>}
      </DialogForm>
    </FinDialog>
  )
}

/** A loan's funding source (the `SC …` tag) — Finance's own; the rest of the terms are Amend terms'. */
export function FundingSourceSheet({ open, onClose, onDone, loanId, current }: { open: boolean; onClose: () => void; onDone: (message: string) => void; loanId: string; current: string | null }) {
  const w = useWrite()
  const [value, setValue] = useState(current ?? '')
  const close = () => {
    if (w.busy) return
    onClose()
    setValue(current ?? '')
    w.setError(null)
  }
  const save = async () => {
    const fd = new FormData()
    fd.set('loan_id', loanId)
    fd.set('funding_source', value)
    if (!(await w.run(async () => answered(await setLoanFundingSource(fd))))) return
    onClose()
    onDone(value.trim() ? `Funding source set to ${value.trim()}` : 'Funding source cleared')
  }
  return (
    <FinDialog open={open} onClose={close} title="Funding source" locked={w.busy}>
      <DialogForm
        onSubmit={() => void save()}
        buttons={
          <>
            <DialogButton disabled={w.busy} onClick={close}>
              Cancel
            </DialogButton>
            <DialogButton kind="primary" disabled={w.busy} onClick={() => void save()}>
              {w.busy ? 'Saving…' : 'Save'}
            </DialogButton>
          </>
        }
      >
        <Field label="Funding source" htmlFor="fs-value">
          <Input id="fs-value" value={value} maxLength={60} onChange={(e) => setValue(e.target.value)} placeholder="e.g. WL-KING / HC-58k / 2990" />
        </Field>
        {w.error ? <Hint danger>{w.error}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}

/** The repayment start — the first instalment's day, every later one on its day. */
export function RepaymentStartSheet({
  open,
  onClose,
  onDone,
  side,
  id,
  current,
  min,
  today,
}: {
  open: boolean
  onClose: () => void
  onDone: (message: string) => void
  side: 'out' | 'in'
  id: string
  /** YYYY-MM-DD, as set (none = the month after, on its day). */
  current: string | null
  /** The day the money moved: the repayment does not start before it. */
  min: string | null
  today: string
}) {
  const w = useWrite()
  const [value, setValue] = useState(current ?? '')
  const close = () => {
    if (w.busy) return
    onClose()
    setValue(current ?? '')
    w.setError(null)
  }
  const problem = !value ? 'Pick the day the first instalment falls due.' : min && value < min ? `It cannot start before ${min}.` : null
  const save = async () => {
    if (problem) {
      w.setError(problem)
      return
    }
    const ok = await w.run(async () => answered(side === 'out' ? await setLoanRepaymentStart(id, value) : await setFundSourceRepaymentStart(id, value)))
    if (!ok) return
    onClose()
    onDone('Repayment start saved')
  }
  return (
    // Tall, as a form's sheet is: the calendar opens below its field (a short sheet cut it off above).
    <FinDialog open={open} onClose={close} title="Repayment starts" locked={w.busy} tall>
      <DialogForm
        onSubmit={() => void save()}
        buttons={
          <>
            <DialogButton disabled={w.busy} onClick={close}>
              Cancel
            </DialogButton>
            <DialogButton kind="primary" off={!!problem} disabled={w.busy} onClick={() => void save()}>
              {w.busy ? 'Saving…' : 'Save'}
            </DialogButton>
          </>
        }
      >
        <Field label="First instalment">
          <DateField value={value} onChange={setValue} today={today} label="First instalment" emptyText="The month after, on its day" />
        </Field>
        {w.error ? <Hint danger>{w.error}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}

/**
 * Minimum pay interest turned on (2026-10-30 — the user's sample A, "手机 Fund app 的开关也一样会问"): from which month,
 * the first instalment or a later one picked under it. Turning it off stays the row's own button.
 */
export function MinPaySheet({
  open,
  onClose,
  onDone,
  side,
  id,
  firstDueYM,
  today,
}: {
  open: boolean
  onClose: () => void
  onDone: (message: string) => void
  side: 'out' | 'in'
  id: string
  /** The deal's first instalment, `YYYY-MM`. */
  firstDueYM: string | null
  today: string
}) {
  const w = useWrite()
  const [value, setValue] = useState<MinPayFrom>(NO_MIN_PAY_FROM)
  const laterMonths = firstDueYM ? minPayLaterMonths(firstDueYM, today.slice(0, 7)) : []
  const missing = minPayFromMissing(value, laterMonths)
  const close = () => {
    if (w.busy) return
    onClose()
    setValue(NO_MIN_PAY_FROM)
    w.setError(null)
  }
  const save = async () => {
    if (missing) {
      w.setError(neededSentence([missing]))
      return
    }
    const month = value.choice === 'later' ? value.month : null
    const ok = await w.run(async () =>
      answered(side === 'out' ? await setLoanMinPayInterest(id, true, month) : await setFundSourceMinPayInterest(id, true, month)),
    )
    if (!ok) return
    onClose()
    setValue(NO_MIN_PAY_FROM)
    onDone(`Minimum pay interest turned on — ${minPayFromWords(month ? `${month}-01` : null, firstDueYM)}`)
  }
  return (
    <FinDialog open={open} onClose={close} title="Minimum pay interest" locked={w.busy} tall>
      <DialogForm
        onSubmit={() => void save()}
        buttons={
          <>
            <DialogButton disabled={w.busy} onClick={close}>
              Cancel
            </DialogButton>
            <DialogButton kind="primary" off={!!missing} disabled={w.busy} onClick={() => void save()}>
              {w.busy ? 'Saving…' : 'Turn on'}
            </DialogButton>
          </>
        }
      >
        <Hint>Interest must be paid in full every month; the principal can be repaid gradually.</Hint>
        <DealMinPayFrom value={value} onChange={setValue} firstDueYM={firstDueYM} laterMonths={laterMonths} idPrefix="ms" label="From which month" />
        {w.error ? <Hint danger>{w.error}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}

/** A fund source's notes (Finance's own — 「借给: X」 is read by the Company Statement). */
export function NotesSheet({ open, onClose, onDone, sourceId, current }: { open: boolean; onClose: () => void; onDone: (message: string) => void; sourceId: string; current: string | null }) {
  const w = useWrite()
  const [value, setValue] = useState(current ?? '')
  const close = () => {
    if (w.busy) return
    onClose()
    setValue(current ?? '')
    w.setError(null)
  }
  const save = async () => {
    if (!(await w.run(async () => answered(await setFundSourceNotes(sourceId, value))))) return
    onClose()
    onDone('Notes saved')
  }
  return (
    <FinDialog open={open} onClose={close} title="Notes" locked={w.busy}>
      <DialogForm
        buttons={
          <>
            <DialogButton disabled={w.busy} onClick={close}>
              Cancel
            </DialogButton>
            <DialogButton kind="primary" disabled={w.busy} onClick={() => void save()}>
              {w.busy ? 'Saving…' : 'Save'}
            </DialogButton>
          </>
        }
      >
        <Field label="Notes" htmlFor="fn-notes">
          <TextArea id="fn-notes" rows={3} value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. HC deposit · lent to: 2990" />
        </Field>
        {w.error ? <Hint danger>{w.error}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}

/**
 * Cancel a loan still waiting (Withdraw a fund source), or Request the cancellation of an active one — the full
 * page's panel's two (`DealPageSteps`), their words the same: a loan's request says why.
 */
export function DealCancelSheet({
  ask,
  onClose,
  onDone,
  side,
  id,
  party,
  amount,
}: {
  ask: 'withdraw' | 'cancel' | null
  onClose: () => void
  onDone: (message: string, gone: boolean) => void
  side: 'out' | 'in'
  id: string
  party: string
  amount: number
}) {
  const w = useWrite()
  const [reason, setReason] = useState('')
  const out = side === 'out'
  const rm = `RM ${money(amount)}`
  const close = () => {
    if (w.busy) return
    onClose()
    setReason('')
    w.setError(null)
  }
  const confirm = async () => {
    if (!ask) return
    if (ask === 'cancel' && out && !reason.trim()) {
      w.setError('Say why it is cancelled — the Principal reads it.')
      return
    }
    const ok = await w.run(async () =>
      answered(
        ask === 'withdraw'
          ? out
            ? await cancelPendingLoan(id)
            : await withdrawFundSource(id)
          : out
            ? await requestLoanCancel(id, reason.trim())
            : await requestFundSourceCancel(id),
      ),
    )
    if (!ok) return
    const was = ask
    onClose()
    setReason('')
    if (was === 'withdraw') onDone(out ? `Loan to ${party} cancelled` : `Fund source from ${party} withdrawn`, true)
    else onDone('Cancellation requested — waiting for Principal approval', false)
  }
  return (
    <FinDialog
      open={ask !== null}
      onClose={close}
      locked={w.busy}
      title={ask === 'withdraw' ? (out ? `Cancel the loan to ${party}?` : `Withdraw the fund source from ${party}?`) : `Request the cancellation of ${out ? `the loan to ${party}` : `the fund source from ${party}`}?`}
    >
      <DialogConfirm
        text={
          ask === 'withdraw'
            ? out
              ? `It never went out — the ${rm} loan is cancelled and its approval request closes.`
              : `It was never booked — the ${rm} fund source is cancelled and its approval request closes.`
            : `The Principal decides it in Approvals; until then the ${out ? 'loan' : 'fund source'} stays active.`
        }
        confirmLabel={w.busy ? 'Working…' : ask === 'withdraw' ? (out ? 'Cancel loan' : 'Withdraw') : 'Request cancellation'}
        danger
        busy={w.busy}
        error={w.error}
        onCancel={close}
        onConfirm={() => void confirm()}
      >
        {ask === 'cancel' && out ? <Input aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Why — e.g. wrong borrower, agreement voided" /> : null}
      </DialogConfirm>
    </FinDialog>
  )
}
