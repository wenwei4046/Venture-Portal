'use client'

import { useEffect, useState } from 'react'
import { DateField } from '@/components/finv/DateField'
import { DialogButton, DialogForm, Field, FinDialog, Hint, Input } from '@/components/finv/Dialog'
import { neededSentence, num } from '@/components/finv/form-words'
import fm from '@/components/finv/form.module.css'
import { Select } from '@/components/hrv/select'
import { flash } from '@/components/hrv/toast'
import { typeLabel, type AccountType } from '@/lib/coa'
import { withCode } from '@/lib/fund-hub'
import { createLoanFromDialog, openCreateLoan } from '../actions'
import type { NewLoanOptions } from '../_lib/new-loan-options'

// Create fund out (2026-10-15, the Finance revamp v2 — D12, the prototype's
// `fund-form`): To, Amount RM, Description, From bank, Date; *Cancel* and
// *Submit for approval*. A fund out here is a loan to a company — the
// system's only kind, so the design's Type is not asked — and the loan page's
// every rule stays (createLoanFromDialog runs the form page's createLoan): its
// rate is the quarter's base plus a premium, it is booked to a balance-sheet
// account, and its term, funding source and interest switches open from the
// small buttons. Nothing moves until the Principal approves it.

/** Where a disbursement may be booked, the receivables first. */
const TYPE_ORDER: AccountType[] = ['asset', 'fixed_asset', 'liability', 'equity']

export default function CreateFundOutDialog({ open, onClose, onSaved, today }: { open: boolean; onClose: () => void; onSaved: (message: string) => void; today: string }) {
  const [opts, setOpts] = useState<NewLoanOptions | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [companyId, setCompanyId] = useState('')
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [bankId, setBankId] = useState('')
  const [date, setDate] = useState(today)
  const [premium, setPremium] = useState('')
  const [account, setAccount] = useState('')
  const [showTerm, setShowTerm] = useState(false)
  const [showSource, setShowSource] = useState(false)
  const [showInterest, setShowInterest] = useState(false)
  const [months, setMonths] = useState('')
  const [firstDue, setFirstDue] = useState('')
  const [source, setSource] = useState('')
  const [compound, setCompound] = useState(false)
  const [minPay, setMinPay] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The lists are read when the dialog opens — never with every visit to the hub.
  useEffect(() => {
    if (!open || opts) return
    let live = true
    setLoadError(null)
    openCreateLoan().then(
      (res) => {
        if (!live) return
        if (res.ok) {
          setOpts(res.options)
          setBankId((b) => b || res.options.banks[0]?.id || '')
        } else setLoadError(res.reason)
      },
      () => live && setLoadError('The lists could not be read. Close and try again.'),
    )
    return () => {
      live = false
    }
  }, [open, opts])

  const reset = () => {
    setCompanyId('')
    setAmount('')
    setDesc('')
    setBankId(opts?.banks[0]?.id ?? '')
    setDate(today)
    setPremium('')
    setAccount('')
    setShowTerm(false)
    setShowSource(false)
    setShowInterest(false)
    setMonths('')
    setFirstDue('')
    setSource('')
    setCompound(false)
    setMinPay(false)
    setError(null)
  }
  const close = () => {
    if (busy) return
    onClose()
    reset()
  }

  const base = opts?.baseRate?.rate ?? 0
  const effective = base + num(premium) / 100
  const term = months.trim() === '' ? null : Number(months)
  const need: string[] = []
  if (!companyId) need.push('To')
  if (!(num(amount) > 0)) need.push('an amount')
  if (!account) need.push('an account')
  const problem =
    neededSentence(need, true) ??
    (term !== null && !(Number.isInteger(term) && term >= 1 && term <= 120)
      ? 'The term is 1 to 120 months — or leave it blank for no fixed term.'
      : firstDue && firstDue < date
        ? 'The first repayment is on or after the day the loan starts.'
        : null)
  const ok = problem === null && !!opts && !loadError

  const save = async () => {
    if (!ok || busy) return
    setBusy(true)
    setError(null)
    // The form page's names, so createLoan reads exactly what it always did.
    const fd = new FormData()
    fd.set('company_id', companyId)
    fd.set('principal', num(amount).toFixed(2))
    fd.set('loan_start_date', date)
    fd.set('custom_rate_percent', String(num(premium)))
    fd.set('tenure_months', months.trim())
    fd.set('repayment_start_date', firstDue)
    fd.set('funding_source', source.trim())
    fd.set('disbursement_account_code', account)
    if (bankId) fd.set('bank_account_id', bankId)
    fd.set('repayment_terms', desc.trim())
    if (compound) fd.set('compound_interest', 'on')
    if (minPay) fd.set('min_pay_interest', 'on')
    try {
      const res = await createLoanFromDialog(fd)
      if (!res.ok) {
        setError(res.reason)
        return
      }
      const co = opts?.companies.find((c) => c.id === companyId)
      onClose()
      reset()
      onSaved(`Loan to ${co ? co.name : 'the company'} submitted — waiting for approval`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The loan could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const accounts = opts?.bsAccounts ?? []
  return (
    <FinDialog open={open} onClose={close} title="Create fund out" sub="Needs Principal approval before it is disbursed" locked={busy}>
      <DialogForm
        buttons={
          <>
            <DialogButton disabled={busy} onClick={close}>
              Cancel
            </DialogButton>
            <DialogButton kind="primary" off={!ok} disabled={busy} onClick={save}>
              Submit for approval
            </DialogButton>
          </>
        }
      >
        <Field label="To" htmlFor="fo-to">
          <Select id="fo-to" round={12} className={fm.select} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">{opts ? 'Choose a company' : '…'}</option>
            {(opts?.companies ?? []).map((c) => (
              <option key={c.id} value={c.id} data-search={c.short_code}>
                {withCode(c.name, c.short_code)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount RM" htmlFor="fo-amount">
          <Input id="fo-amount" mono align="right" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="Description" htmlFor="fo-desc">
          <Input id="fo-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What is this for?" />
        </Field>
        <Field label="From bank" htmlFor="fo-bank">
          <Select id="fo-bank" round={12} className={fm.select} value={bankId} onChange={(e) => setBankId(e.target.value)}>
            {!opts || opts.banks.length === 0 ? <option value="">{opts ? 'No active bank account' : '…'}</option> : null}
            {(opts?.banks ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {`${b.bank_name} — ${b.account_number}`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date">
          <DateField value={date} onChange={setDate} today={today} label="Date" />
        </Field>
        <Field label="Custom premium % /mo" htmlFor="fo-premium">
          <Input id="fo-premium" mono align="right" inputMode="decimal" value={premium} onChange={(e) => setPremium(e.target.value)} placeholder="0.000" />
        </Field>
        {opts?.baseRate ? (
          <Hint>
            {`Base ${(base * 100).toFixed(3)}% (${opts.baseRate.quarter}) + ${num(premium).toFixed(3)}% = ${(effective * 100).toFixed(3)}% /mo, locked for the loan’s life.`}
          </Hint>
        ) : null}
        <Field label="Account" htmlFor="fo-account">
          <Select id="fo-account" round={12} className={fm.select} value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">Choose an account</option>
            {TYPE_ORDER.map((t) => {
              const of = accounts.filter((a) => a.account_type === t)
              return of.length === 0 ? null : (
                <optgroup key={t} label={typeLabel(t)}>
                  {of.map((a) => (
                    <option key={a.code} value={a.code} data-search={a.code}>
                      {`${a.code} · ${a.name}`}
                    </option>
                  ))}
                </optgroup>
              )
            })}
          </Select>
        </Field>

        {showTerm ? (
          <div className={fm.duo}>
            <Field label="Term · months" htmlFor="fo-months">
              <Input id="fo-months" mono align="right" inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} placeholder="No fixed term" />
            </Field>
            <Field label="First repayment">
              <DateField value={firstDue} onChange={setFirstDue} today={today} label="First repayment" emptyText="The month after" onClear={() => setFirstDue('')} />
            </Field>
          </div>
        ) : null}
        {showSource ? (
          <Field label="Funding source" htmlFor="fo-source">
            <Input id="fo-source" value={source} onChange={(e) => setSource(e.target.value)} maxLength={60} placeholder="e.g. HC-58k / 2990" />
          </Field>
        ) : null}
        {showInterest ? (
          <div className={fm.checks}>
            <label className={fm.check}>
              <input type="checkbox" checked={compound} onChange={(e) => setCompound(e.target.checked)} />
              <span className={fm.checkName}>Compound interest</span>
            </label>
            <label className={fm.check}>
              <input type="checkbox" checked={minPay} onChange={(e) => setMinPay(e.target.checked)} />
              <span className={fm.checkName}>Minimum pay interest</span>
            </label>
          </div>
        ) : null}

        <div className={fm.more} role="group" aria-label="More">
          <button type="button" className={fm.moreBtn} aria-pressed={showTerm} onClick={() => setShowTerm((v) => !v)}>
            Term
          </button>
          <button type="button" className={fm.moreBtn} aria-pressed={showSource} onClick={() => setShowSource((v) => !v)}>
            Funding source
          </button>
          <button type="button" className={fm.moreBtn} aria-pressed={showInterest} onClick={() => setShowInterest((v) => !v)}>
            Interest
          </button>
        </div>

        {loadError ? <Hint danger>{loadError}</Hint> : error ? <Hint danger>{error}</Hint> : problem ? <Hint>{problem}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}
