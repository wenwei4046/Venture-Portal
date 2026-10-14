'use client'

import { useEffect, useState } from 'react'
import { DateField } from '@/components/finv/DateField'
import { DialogButton, DialogForm, Field, FinDialog, Hint, Input } from '@/components/finv/Dialog'
import { neededSentence, num } from '@/components/finv/form-words'
import fm from '@/components/finv/form.module.css'
import { Select } from '@/components/hrv/select'
import { typeLabel, type AccountType } from '@/lib/coa'
import { withCode } from '@/lib/fund-hub'
import { createFundSourceFromDialog, openRecordFundIn } from '../actions'
import type { NewSourceOptions } from '../_lib/new-source-options'

// Record fund in (2026-10-15, the Finance revamp v2 — D12, the prototype's
// `fund-form`): From, Type, Amount RM, Description, Into bank, Date; *Cancel*
// and *Submit for approval*. Type is the system's — a subsidiary's deposit, a
// director's loan, a department pool's transfer, an outsider's — and From asks
// what that type names (a company, a department, a name in words). The form
// page's every rule stays (createFundSourceFromDialog runs createFundSource):
// its rate is asked, and the account, its term and its interest switches open
// from the small buttons. It is booked when the Principal approves it, as the
// form page's always was — so it is submitted, not "received".

type SourceType = 'subsidiary' | 'director_loan' | 'department_pool' | 'outsource'
/** The types a fund source is recorded as (createFundSource's; a director's saving is not made here). */
const TYPES: Array<{ value: SourceType; label: string }> = [
  { value: 'subsidiary', label: 'Subsidiary' },
  { value: 'director_loan', label: 'Director loan' },
  { value: 'department_pool', label: 'Dept pool' },
  { value: 'outsource', label: 'Outsource' },
]
const ACCOUNT_TYPES: AccountType[] = ['liability', 'equity']

export default function RecordFundInDialog({ open, onClose, onSaved, today }: { open: boolean; onClose: () => void; onSaved: (message: string) => void; today: string }) {
  const [opts, setOpts] = useState<NewSourceOptions | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [type, setType] = useState<SourceType>('subsidiary')
  const [fromId, setFromId] = useState('')
  const [fromName, setFromName] = useState('')
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [bankId, setBankId] = useState('')
  const [date, setDate] = useState(today)
  const [rate, setRate] = useState('')
  const [showAccount, setShowAccount] = useState(false)
  const [showTerm, setShowTerm] = useState(false)
  const [showInterest, setShowInterest] = useState(false)
  const [account, setAccount] = useState('')
  const [months, setMonths] = useState('')
  const [firstDue, setFirstDue] = useState('')
  const [compound, setCompound] = useState(false)
  const [minPay, setMinPay] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The lists are read when the dialog opens — never with every visit to the hub.
  useEffect(() => {
    if (!open || opts) return
    let live = true
    setLoadError(null)
    openRecordFundIn().then(
      (res) => {
        if (!live) return
        setOpts(res)
        setBankId((b) => b || res.banks[0]?.id || '')
      },
      () => live && setLoadError('The lists could not be read. Close and try again.'),
    )
    return () => {
      live = false
    }
  }, [open, opts])

  const reset = () => {
    setType('subsidiary')
    setFromId('')
    setFromName('')
    setAmount('')
    setDesc('')
    setBankId(opts?.banks[0]?.id ?? '')
    setDate(today)
    setRate('')
    setShowAccount(false)
    setShowTerm(false)
    setShowInterest(false)
    setAccount('')
    setMonths('')
    setFirstDue('')
    setCompound(false)
    setMinPay(false)
    setError(null)
  }
  const close = () => {
    if (busy) return
    onClose()
    reset()
  }
  const pickType = (t: SourceType) => {
    setType(t)
    setFromId('')
    setFromName('')
  }

  const named = type === 'director_loan' || type === 'outsource'
  const term = months.trim() === '' ? null : Number(months)
  const rateN = rate.trim() === '' ? NaN : Number(rate)
  const need: string[] = []
  if (named ? !fromName.trim() : !fromId) need.push('From')
  if (!(num(amount) > 0)) need.push('an amount')
  if (!Number.isFinite(rateN)) need.push('a rate')
  const problem =
    neededSentence(need, true) ??
    (rateN < 0 || rateN >= 100
      ? 'The rate is from 0 to under 100% a month.'
      : date > today
        ? 'The date cannot be in the future — interest runs from the day it came in.'
        : term !== null && !(Number.isInteger(term) && term >= 1)
          ? 'The term is a whole number of months — or leave it blank for no fixed term.'
          : firstDue && firstDue < date
            ? 'The first repayment is on or after the day it came in.'
            : null)
  const ok = problem === null && !!opts && !loadError

  const partyName = () =>
    named
      ? fromName.trim()
      : type === 'subsidiary'
        ? (opts?.companies.find((c) => c.id === fromId)?.name ?? 'the company')
        : (opts?.departments.find((d) => d.id === fromId)?.name ?? 'the department')

  const save = async () => {
    if (!ok || busy) return
    setBusy(true)
    setError(null)
    // The form page's names, so createFundSource reads exactly what it always did.
    const fd = new FormData()
    fd.set('source_type', type)
    fd.set('from_id', named ? '' : fromId)
    fd.set('from_freetext_name', named ? fromName.trim() : '')
    fd.set('amount', num(amount).toFixed(2))
    fd.set('cost_rate_percent', String(rateN))
    fd.set('lock_in_months', months.trim())
    fd.set('effective_date', date)
    fd.set('repayment_date', firstDue)
    if (desc.trim()) fd.set('notes', desc.trim())
    fd.set('account_code', account)
    if (bankId) fd.set('bank_account_id', bankId)
    if (compound) fd.set('compound_interest', 'on')
    if (minPay) fd.set('min_pay_interest', 'on')
    try {
      const res = await createFundSourceFromDialog(fd)
      if (!res.ok) {
        setError(res.reason)
        return
      }
      const who = partyName()
      onClose()
      reset()
      onSaved(`Fund source from ${who} submitted — waiting for approval`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The fund source could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const accounts = opts?.accounts ?? []
  return (
    <FinDialog open={open} onClose={close} title="Record fund in" sub="Needs Principal approval before it is booked" locked={busy}>
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
        <Field label="From" htmlFor="fi-from">
          {named ? (
            <Input id="fi-from" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder={type === 'director_loan' ? 'The director’s name' : 'Who lent it'} />
          ) : (
            <Select id="fi-from" round={12} className={fm.select} value={fromId} onChange={(e) => setFromId(e.target.value)}>
              <option value="">{!opts ? '…' : type === 'subsidiary' ? 'Choose a company' : 'Choose a department'}</option>
              {type === 'subsidiary'
                ? (opts?.companies ?? []).map((c) => (
                    <option key={c.id} value={c.id} data-search={c.short_code}>
                      {withCode(c.name, c.short_code)}
                    </option>
                  ))
                : (opts?.departments ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
            </Select>
          )}
        </Field>
        <Field label="Type" htmlFor="fi-type">
          <Select id="fi-type" round={12} className={fm.select} value={type} onChange={(e) => pickType(e.target.value as SourceType)}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount RM" htmlFor="fi-amount">
          <Input id="fi-amount" mono align="right" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="Description" htmlFor="fi-desc">
          <Input id="fi-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What is this for?" />
        </Field>
        <Field label="Into bank" htmlFor="fi-bank">
          <Select id="fi-bank" round={12} className={fm.select} value={bankId} onChange={(e) => setBankId(e.target.value)}>
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
        <Field label="Rate % /mo" htmlFor="fi-rate">
          <Input id="fi-rate" mono align="right" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0.000" />
        </Field>

        {showAccount ? (
          <Field label="Account" htmlFor="fi-account">
            <Select id="fi-account" round={12} className={fm.select} value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="">Fund Sources Payable (the default)</option>
              {ACCOUNT_TYPES.map((t) => {
                const of = accounts.filter((a) => a.type === t)
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
        ) : null}
        {showTerm ? (
          <div className={fm.duo}>
            <Field label="Term · months" htmlFor="fi-months">
              <Input id="fi-months" mono align="right" inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} placeholder="No fixed term" />
            </Field>
            <Field label="First repayment">
              <DateField value={firstDue} onChange={setFirstDue} today={today} label="First repayment" emptyText="The month after" onClear={() => setFirstDue('')} />
            </Field>
          </div>
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
          <button type="button" className={fm.moreBtn} aria-pressed={showAccount} onClick={() => setShowAccount((v) => !v)}>
            Account
          </button>
          <button type="button" className={fm.moreBtn} aria-pressed={showTerm} onClick={() => setShowTerm((v) => !v)}>
            Term
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
