'use client'

import { useEffect, useState } from 'react'
import { DateField, dayLabel } from '@/components/finv/DateField'
import { DialogButton, DialogForm, Field, FinDialog, Hint, Input } from '@/components/finv/Dialog'
import { DealMinPayFrom, DealPart, DealRepaymentType, DealSummary } from '@/components/finv/DealTermsParts'
import df from '@/components/finv/dealform.module.css'
import { neededSentence, num } from '@/components/finv/form-words'
import fm from '@/components/finv/form.module.css'
import { useFinSurface } from '@/components/finv/surface'
import { Select } from '@/components/hrv/select'
import { typeLabel, type AccountType } from '@/lib/coa'
import { withCode } from '@/lib/fund-hub'
import { NO_MIN_PAY_FROM, minPayChoiceWords, minPayFromField, minPayFromMissing, minPayLaterMonths, type MinPayFrom } from '@/lib/min-pay'
import { addYM, money, previewRows, readRepayment, repaymentSummary, repaymentWords, type RepaymentChoice } from '@/lib/repayment-type'
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
//
// On a desktop (2026-10-27, the user's mockup fund-forms-desktop-mockup.html —
// "照这个样稿做：分块 OK，Record fund in / Create fund out 用加宽的弹出窗口，连同
// Repayment type 一起"; "只针对 desktop 版的") the window is 1040px: Source,
// Money in, Interest and Repayment each a card — Type before From, the switches
// and the first repayment laid out, the term a Repayment type (a fixed amount a
// month, a number of months, or none — one is chosen) — the account folded to a
// line, and the summary with the schedule beside them. The phone's sheet keeps
// the form above.

type SourceType = 'subsidiary' | 'director_loan' | 'department_pool' | 'outsource'
/** The types a fund source is recorded as (createFundSource's; a director's saving is not made here). */
const TYPES: Array<{ value: SourceType; label: string }> = [
  { value: 'subsidiary', label: 'Subsidiary' },
  { value: 'director_loan', label: 'Director loan' },
  { value: 'department_pool', label: 'Dept pool' },
  { value: 'outsource', label: 'Outsource' },
]
const ACCOUNT_TYPES: AccountType[] = ['liability', 'equity']
const r2 = (n: number) => Math.round(n * 100) / 100

export default function RecordFundInDialog({ open, onClose, onSaved, today }: { open: boolean; onClose: () => void; onSaved: (message: string) => void; today: string }) {
  // The Finance phone app's sheet keeps its form; a desktop lays the deal out in parts.
  const desktop = useFinSurface() === null
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
  // Minimum pay interest's month (2026-10-30): none chosen until one is.
  const [minPayFrom, setMinPayFrom] = useState<MinPayFrom>(NO_MIN_PAY_FROM)
  // Repayment type (desktop): none chosen until one is.
  const [repay, setRepay] = useState<RepaymentChoice | null>(null)
  const [perMonth, setPerMonth] = useState('')
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
    setMinPayFrom(NO_MIN_PAY_FROM)
    setRepay(null)
    setPerMonth('')
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
  // Off, its month goes with it: ticked again, it is asked again.
  const pickMinPay = (on: boolean) => {
    setMinPay(on)
    if (!on) setMinPayFrom(NO_MIN_PAY_FROM)
  }

  const named = type === 'director_loan' || type === 'outsource'
  // The months box is the term on the phone, the Repayment type's months on a desktop.
  const monthsAsked = desktop ? repay === 'months' : true
  const term = !monthsAsked || months.trim() === '' ? null : Number(months)
  const rateN = rate.trim() === '' ? NaN : Number(rate)
  const amountN = num(amount)
  // What the Repayment type's box works out to on the amount.
  const read = desktop && (repay === 'amount' || repay === 'months') ? readRepayment(repay, repay === 'amount' ? perMonth : months, amountN) : null
  // The first repayment's month (the month after the money came in, unset), and the later months minimum pay may start in.
  const firstDueYM = firstDue ? firstDue.slice(0, 7) : addYM(date.slice(0, 7), 1)
  const laterMonths = minPayLaterMonths(firstDueYM, today.slice(0, 7))
  const minPayMissing = minPay ? minPayFromMissing(minPayFrom, laterMonths) : null
  const need: string[] = []
  if (named ? !fromName.trim() : !fromId) need.push('From')
  if (!(amountN > 0)) need.push('an amount')
  if (!Number.isFinite(rateN)) need.push('a rate')
  if (minPayMissing) need.push(minPayMissing)
  if (desktop && !repay) need.push('a repayment type')
  const problem =
    neededSentence(need, true) ??
    (rateN < 0 || rateN >= 100
      ? 'The rate is from 0 to under 100% a month.'
      : date > today
        ? 'The date cannot be in the future — interest runs from the day it came in.'
        : read && !read.ok
          ? read.wait
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
    // A desktop's Repayment type: the months, a fixed amount a month (its months worked out from it), or none.
    fd.set('lock_in_months', monthsAsked ? months.trim() : '')
    if (desktop && repay === 'amount') fd.set('principal_per_month', perMonth.replace(/[,\s]/g, ''))
    fd.set('effective_date', date)
    fd.set('repayment_date', firstDue)
    if (desc.trim()) fd.set('notes', desc.trim())
    fd.set('account_code', account)
    if (bankId) fd.set('bank_account_id', bankId)
    if (compound) fd.set('compound_interest', 'on')
    if (minPay) {
      fd.set('min_pay_interest', 'on')
      fd.set('min_pay_interest_from', minPayFromField(minPayFrom))
    }
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
  const fromField = (
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
  )
  const bankField = (
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
  )
  const accountField = (
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
  )
  const buttons = (
    <>
      {desktop ? (
        <span className={df.footNote} data-need={problem ? 'true' : undefined}>
          {problem ?? 'Ready — it goes to the Principal for approval.'}
        </span>
      ) : null}
      <DialogButton disabled={busy} onClick={close}>
        Cancel
      </DialogButton>
      <DialogButton kind="primary" off={!ok} disabled={busy} onClick={save}>
        Submit for approval
      </DialogButton>
    </>
  )

  if (desktop) {
    // What the terms make: from the first repayment's month (the month after the money came in, unset).
    const startYM = firstDueYM
    const interest = !compound && Number.isFinite(rateN) && amountN > 0 ? r2((amountN * rateN) / 100) : null
    const plan = read?.ok ? read.plan : null
    const schedule =
      repay && amountN > 0 && (repay === 'none' || plan)
        ? { ...previewRows({ choice: repay, plan, startYM, interest, interestBase: amountN, openFromYM: null }), empty: null }
        : { rows: [], foot: '', empty: !repay ? 'Choose a repayment type to see the schedule.' : !(amountN > 0) ? 'Fill in the amount to see the schedule.' : read && !read.ok ? read.wait : null }
    const bank = opts?.banks.find((b) => b.id === bankId)
    const chosenAccount = account ? accounts.find((a) => a.code === account) : null
    const who = named ? fromName.trim() : fromId ? partyName() : ''
    return (
      <FinDialog open={open} onClose={close} title="Record fund in" sub="Needs Principal approval before it is booked" locked={busy} xwide>
        <DialogForm buttons={buttons}>
          <div className={df.layout}>
            <div className={df.parts}>
              <DealPart no={1} title="Source" note="Who lends it, and as what.">
                <div className={df.pills} role="radiogroup" aria-label="Type">
                  {TYPES.map((t) => (
                    <button key={t.value} type="button" role="radio" aria-checked={type === t.value} className={df.pill} onClick={() => pickType(t.value)}>
                      {t.label}
                    </button>
                  ))}
                </div>
                {fromField}
              </DealPart>

              <DealPart no={2} title="Money in">
                <div className={df.pair}>
                  <Field label="Amount RM" htmlFor="fi-amount">
                    <Input id="fi-amount" mono align="right" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                  </Field>
                  <Field label="Date">
                    <DateField value={date} onChange={setDate} today={today} label="Date" />
                  </Field>
                </div>
                <div className={df.pair}>
                  {bankField}
                  <Field label="Description" htmlFor="fi-desc">
                    <Input id="fi-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What is this for?" />
                  </Field>
                </div>
              </DealPart>

              <DealPart no={3} title="Interest">
                <div className={df.pair}>
                  <Field label="Rate % /mo" htmlFor="fi-rate">
                    <Input id="fi-rate" mono align="right" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0.000" />
                  </Field>
                  <Field label="Interest a month">
                    <div className={df.fixed}>{interest == null ? '—' : money(interest)}</div>
                  </Field>
                </div>
                <div className={df.checks}>
                  <label className={df.check}>
                    <input type="checkbox" checked={compound} onChange={(e) => setCompound(e.target.checked)} />
                    <span>
                      Compound interest
                      <span className={df.checkNote}>Unpaid interest is added to what is owed and earns interest too.</span>
                    </span>
                  </label>
                  <label className={df.check}>
                    <input type="checkbox" checked={minPay} onChange={(e) => pickMinPay(e.target.checked)} />
                    <span>
                      Minimum pay interest
                      <span className={df.checkNote}>The principal may come slowly, but each month’s interest must be paid.</span>
                    </span>
                  </label>
                </div>
                {minPay ? <DealMinPayFrom value={minPayFrom} onChange={setMinPayFrom} firstDueYM={firstDueYM} laterMonths={laterMonths} idPrefix="fi" /> : null}
              </DealPart>

              <DealPart no={4} title="Repayment" note="When repaying starts, and how the principal is repaid.">
                <div className={df.pair}>
                  <Field label="First repayment">
                    <DateField value={firstDue} onChange={setFirstDue} today={today} label="First repayment" emptyText="The month after" onClear={() => setFirstDue('')} />
                  </Field>
                  <div />
                </div>
                <DealRepaymentType
                  choice={repay}
                  onChoice={setRepay}
                  amount={perMonth}
                  onAmount={setPerMonth}
                  months={months}
                  onMonths={setMonths}
                  worked={read ? (read.ok ? repaymentWords(repay as 'amount' | 'months', read.plan, amountN, startYM, null) : { wait: read.wait }) : null}
                  idPrefix="fi"
                />
              </DealPart>

              <div className={df.acct}>
                {showAccount ? (
                  accountField
                ) : (
                  <>
                    Booked to <b>4000 · Fund Sources Payable</b> — the default.
                    <button type="button" className={df.link} onClick={() => setShowAccount(true)}>
                      Change
                    </button>
                  </>
                )}
              </div>
              {loadError ? <Hint danger>{loadError}</Hint> : error ? <Hint danger>{error}</Hint> : null}
            </div>

            <DealSummary
              lines={[
                { key: 'From', value: who ? `${who} · ${TYPES.find((t) => t.value === type)?.label}` : 'Not chosen yet', todo: !who },
                { key: 'Amount', value: amountN > 0 ? `RM ${money(amountN)}` : '—', mono: true },
                { key: 'Into', value: bank ? `${bank.bank_name} — ${bank.account_number}` : '—' },
                { key: 'Date', value: dayLabel(date) },
                { key: 'Rate', value: Number.isFinite(rateN) ? `${rateN.toFixed(3)}% a month${interest != null ? ` · RM ${money(interest)}` : ''}` : '—' },
                {
                  key: 'Repayment',
                  value: !repay ? 'Not chosen yet' : repay === 'none' || plan ? repaymentSummary(repay, plan, startYM) : 'Not filled in yet',
                  todo: !repay || (repay !== 'none' && !plan),
                },
                ...(minPay
                  ? [{ key: 'Minimum pay', value: minPayChoiceWords(minPayFrom, firstDueYM, laterMonths) ?? 'Not chosen yet', todo: !!minPayMissing }]
                  : []),
                { key: 'Account', value: chosenAccount ? `${chosenAccount.code} · ${chosenAccount.name}` : '4000 · Fund Sources Payable' },
              ]}
              schedule={schedule}
              foot="Booked once the Principal approves it."
            />
          </div>
        </DialogForm>
      </FinDialog>
    )
  }

  return (
    <FinDialog open={open} onClose={close} title="Record fund in" sub="Needs Principal approval before it is booked" locked={busy}>
      <DialogForm buttons={buttons}>
        {fromField}
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
        {bankField}
        <Field label="Date">
          <DateField value={date} onChange={setDate} today={today} label="Date" />
        </Field>
        <Field label="Rate % /mo" htmlFor="fi-rate">
          <Input id="fi-rate" mono align="right" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0.000" />
        </Field>

        {showAccount ? accountField : null}
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
              <input type="checkbox" checked={minPay} onChange={(e) => pickMinPay(e.target.checked)} />
              <span className={fm.checkName}>Minimum pay interest</span>
            </label>
          </div>
        ) : null}
        {showInterest && minPay ? <DealMinPayFrom value={minPayFrom} onChange={setMinPayFrom} firstDueYM={firstDueYM} laterMonths={laterMonths} idPrefix="fi" /> : null}

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
