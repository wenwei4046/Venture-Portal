'use client'

import { useEffect, useState } from 'react'
import { DateField } from '@/components/finv/DateField'
import { DialogButton, DialogForm, Field, FinDialog, Hint, Input } from '@/components/finv/Dialog'
import { money, neededSentence, num, shortDay } from '@/components/finv/form-words'
import fm from '@/components/finv/form.module.css'
import { Select } from '@/components/hrv/select'
import { flash } from '@/components/hrv/toast'
import { recordLoanRepaymentFromDialog } from '../../fund-out/actions'
import { openLoanRepayment } from '../actions'
import type { ReceivableLoans } from '../../payments/_lib/receivable-loans'

// Loan repayment received (2026-10-14, the Finance revamp v2 — D09, the
// prototype's `or-form` for a loan): the dialog's shape — Received from,
// Description, Into bank, Amount RM, Received date, *Cancel* / *Save receipt* —
// with the system's own way of receiving one: the LOAN it repays (a borrower
// may owe on several), its principal / interest / penalty, and — where the
// borrower's interest sits in suspense — which account the interest clears.
// Recorded on the loan (Fund OUT), each part its own repayment, as the form
// page's (`?mode=loan_repayment`); it shows in Receipt's list as received.

export default function LoanRepaymentDialog({ open, onClose, today }: { open: boolean; onClose: () => void; today: string }) {
  const [opts, setOpts] = useState<ReceivableLoans | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loanId, setLoanId] = useState('')
  const [desc, setDesc] = useState('')
  const [principal, setPrincipal] = useState('0.00')
  const [interest, setInterest] = useState('0.00')
  const [penalty, setPenalty] = useState('0.00')
  const [interestAccount, setInterestAccount] = useState('')
  const [bankId, setBankId] = useState('')
  const [date, setDate] = useState(today)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || opts) return
    let live = true
    setLoadError(null)
    openLoanRepayment().then(
      (res) => {
        if (!live) return
        if (res.ok) {
          setOpts(res.options)
          setBankId((b) => b || res.options.banks[0]?.id || '')
        } else setLoadError(res.reason)
      },
      () => live && setLoadError('The loans could not be read. Close and try again.'),
    )
    return () => {
      live = false
    }
  }, [open, opts])

  const reset = () => {
    setLoanId('')
    setDesc('')
    setPrincipal('0.00')
    setInterest('0.00')
    setPenalty('0.00')
    setInterestAccount('')
    setBankId(opts?.banks[0]?.id ?? '')
    setDate(today)
    setError(null)
  }
  const close = () => {
    if (busy) return
    onClose()
    reset()
  }

  const loan = (opts?.loans ?? []).find((l) => l.id === loanId) ?? null
  const p = num(principal)
  const total = Math.round((p + num(interest) + num(penalty)) * 100) / 100
  // The borrower's interest in suspense is cleared by default (booking it as income again would count it twice).
  const offersSuspense = num(interest) > 0 && !!loan?.suspenseCode
  const pickLoan = (id: string) => {
    setLoanId(id)
    const l = (opts?.loans ?? []).find((x) => x.id === id)
    setInterestAccount(l?.suspenseCode ?? '')
  }

  const need: string[] = []
  if (!loanId) need.push('the loan it repays')
  if (!(total > 0)) need.push('an amount')
  const problem =
    neededSentence(need, true) ??
    (loan && p > loan.outstanding + 0.005 ? `The principal RM ${money(p)} is more than the loan still owes (RM ${money(loan.outstanding)}).` : null)
  const ok = problem === null && !!opts

  const save = async () => {
    if (!ok || busy || !loan) return
    setBusy(true)
    setError(null)
    const fd = new FormData()
    fd.set('loan_id', loanId)
    fd.set('payment_date', date)
    if (bankId) fd.set('bank_account_id', bankId)
    fd.set('repayment_principal', num(principal).toFixed(2))
    fd.set('repayment_interest', num(interest).toFixed(2))
    fd.set('repayment_penalty', num(penalty).toFixed(2))
    if (offersSuspense && interestAccount) fd.set('interest_account_code', interestAccount)
    if (desc.trim()) fd.set('notes', desc.trim())
    try {
      const res = await recordLoanRepaymentFromDialog(fd)
      if (!res.ok) {
        setError(res.reason)
        return
      }
      const who = loan.borrower
      onClose()
      reset()
      flash(`${who} · RM ${money(res.total)} received — bank and GL updated`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The repayment could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FinDialog open={open} onClose={close} title="Loan repayment received" sub="Recorded on the loan · Fund OUT" locked={busy} tall>
      <DialogForm
        buttons={
          <>
            <DialogButton disabled={busy} onClick={close}>
              Cancel
            </DialogButton>
            <DialogButton kind="primary" off={!ok} disabled={busy} onClick={save}>
              Save receipt
            </DialogButton>
          </>
        }
      >
        <Field label="Received from" htmlFor="lr-loan">
          <Select id="lr-loan" round={12} className={fm.select} value={loanId} onChange={(e) => pickLoan(e.target.value)}>
            <option value="">{opts ? (opts.loans.length > 0 ? 'Choose the loan' : 'No loan is owed') : '…'}</option>
            {(opts?.loans ?? []).map((l) => (
              <option key={l.id} value={l.id} data-search={l.label}>
                {`${l.borrower} · RM ${money(l.principal)} · ${shortDay(l.date)}${l.source ? ` · SC ${l.source}` : ''}`}
              </option>
            ))}
          </Select>
          {loan ? (
            <Hint>
              Owed RM {money(loan.outstanding)}
              {loan.periods ? ` · ${loan.periods.remaining} of ${loan.periods.total} left` : ''}
              {loan.ratePct > 0 ? ` · ${loan.ratePct}%/mo` : ''}
            </Hint>
          ) : null}
        </Field>
        <Field label="Description" htmlFor="lr-desc">
          <Input id="lr-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What was received?" />
        </Field>
        <div className={fm.trio}>
          <Field label="Principal RM" htmlFor="lr-principal">
            <Input id="lr-principal" mono align="right" inputMode="decimal" value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Interest RM" htmlFor="lr-interest">
            <Input id="lr-interest" mono align="right" inputMode="decimal" value={interest} onChange={(e) => setInterest(e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Penalty RM" htmlFor="lr-penalty">
            <Input id="lr-penalty" mono align="right" inputMode="decimal" value={penalty} onChange={(e) => setPenalty(e.target.value)} placeholder="0.00" />
          </Field>
        </div>
        {offersSuspense && loan ? (
          <Field label="Interest credited to" htmlFor="lr-interest-account">
            <Select id="lr-interest-account" round={12} className={fm.select} value={interestAccount} onChange={(e) => setInterestAccount(e.target.value)}>
              <option value={loan.suspenseCode!}>{`${loan.suspenseCode} · ${loan.suspenseName ?? 'Interest in suspense'} — RM ${money(loan.suspenseBalance ?? 0)} held`}</option>
              <option value="5027">5027 · Interest Income - Loans</option>
            </Select>
          </Field>
        ) : null}
        <Field label="Into bank" htmlFor="lr-bank">
          <Select id="lr-bank" round={12} className={fm.select} value={bankId} onChange={(e) => setBankId(e.target.value)}>
            {!opts || opts.banks.length === 0 ? <option value="">{opts ? 'No active bank account' : '…'}</option> : null}
            {(opts?.banks ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {`${b.bank_name} — ${b.account_number}`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount RM" htmlFor="lr-amount">
          <Input id="lr-amount" mono align="right" value={money(total)} readOnly className={fm.fixed} />
        </Field>
        <Field label="Received date">
          <DateField value={date} onChange={setDate} today={today} label="Received date" />
        </Field>

        {loadError ? <Hint danger>{loadError}</Hint> : error ? <Hint danger>{error}</Hint> : problem ? <Hint>{problem}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}
