'use client'

import { useEffect, useMemo, useState } from 'react'
import { DateField } from '@/components/finv/DateField'
import { DialogButton, DialogForm, Field, FinDialog, Hint, Input } from '@/components/finv/Dialog'
import { FilesField } from '@/components/finv/FilesField'
import { PartyInput } from '@/components/finv/PartyInput'
import { FILES_CAP, fileSize, money, neededSentence, num, poolName, shortDay } from '@/components/finv/form-words'
import fm from '@/components/finv/form.module.css'
import { Select } from '@/components/hrv/select'
import { flash } from '@/components/hrv/toast'
import { typeLabel, type AccountType } from '@/lib/coa'
import { buildRepaymentSourceRows, type RepaymentRole } from '@/lib/repayment-source-rows'
import { createPaymentFromDialog } from '../actions'
import { openCreatePayment } from '../create-actions'
import type { CreatePaymentOptions } from '../_lib/create-payment-options'
import c from './create.module.css'

// Create payment (2026-10-14, the Finance revamp v2 — D07 / D08 of
// `.design/fin-r2/handoff`): the prototype's 520px dialog — Pay to, Category,
// Pool, From bank, Amount RM, Description, Payment date (the calendar), *Save
// draft* and *Submit for approval*. The user: 样子照设计，功能全留 — so what
// today's form also does opens from the small buttons under the fields: a
// split across pools, a loan repayment (the deal, its principal / interest /
// penalty, a line each), an internal transfer, the method, files, notes, a
// line's GL override. The
// voucher is the form page's (createPaymentVoucherInner, every rule); the
// dialog stays on Payments and says what it made.

const METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
  { value: 'netting', label: 'Netting / offset' },
]
/** The order a payment's categories are offered in — what a payment mostly posts to first. */
const TYPE_ORDER: AccountType[] = ['expense', 'cost', 'asset', 'fixed_asset', 'liability', 'equity', 'revenue', 'other_income']
const ROLE_LABEL: Record<RepaymentRole, string> = { principal: 'Principal', interest: 'Interest', penalty: 'Penalty' }
/** A line's override (mig 218): the account type and GL it posts to instead, and why — the form page's labels. */
const OVERRIDE_TYPES: Array<{ value: AccountType; label: string }> = [
  { value: 'equity', label: 'BS · Equity' },
  { value: 'fixed_asset', label: 'BS · Fixed Asset' },
  { value: 'asset', label: 'BS · Asset' },
  { value: 'liability', label: 'BS · Liability' },
  { value: 'revenue', label: 'P&L · Revenue' },
  { value: 'cost', label: 'P&L · Cost' },
  { value: 'other_income', label: 'P&L · Other Inc.' },
  { value: 'expense', label: 'P&L · Expense' },
]

interface Override {
  type: AccountType | ''
  gl: string
  reason: string
}
const NO_OVERRIDE: Override = { type: '', gl: '', reason: '' }

interface Line {
  pool: string
  account: string
  amount: string
  role?: RepaymentRole
  autoAccount?: boolean
  ov?: Override
}

// The words are the kit's (components/finv/form-words), kept importable from here.
export { neededSentence, poolName }

export default function CreatePaymentDialog({
  open,
  onClose,
  prefix,
  today,
  initial = null,
}: {
  open: boolean
  onClose: () => void
  /** "HV-PV-202610" — the line under the title. */
  prefix: string
  /** The office's today. */
  today: string
  /** The lists, when the page read them already (`/payments?new=1`). */
  initial?: CreatePaymentOptions | null
}) {
  const [opts, setOpts] = useState<CreatePaymentOptions | null>(initial)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [payee, setPayee] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [account, setAccount] = useState('')
  const [pool, setPool] = useState('venture_pool')
  const [bankId, setBankId] = useState(initial?.banks[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [date, setDate] = useState(today)
  // What the small buttons open.
  const [split, setSplit] = useState(false)
  const [repay, setRepay] = useState(false)
  const [transfer, setTransfer] = useState(false)
  const [showMethod, setShowMethod] = useState(false)
  const [showFiles, setShowFiles] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [lines, setLines] = useState<Line[]>([])
  const [dealId, setDealId] = useState('')
  const [principal, setPrincipal] = useState('0.00')
  const [interest, setInterest] = useState('0.00')
  const [penalty, setPenalty] = useState('0.00')
  const [method, setMethod] = useState('bank_transfer')
  const [files, setFiles] = useState<File[]>([])
  const [notes, setNotes] = useState('')
  const [override, setOverride] = useState(false)
  const [singleOv, setSingleOv] = useState<Override>(NO_OVERRIDE)
  const [busy, setBusy] = useState<'draft' | 'submit' | null>(null)
  const [error, setError] = useState<string | null>(null)

  // The lists, asked for once the dialog opens (unless the page brought them).
  useEffect(() => {
    if (!open || opts) return
    let live = true
    setLoadError(null)
    openCreatePayment().then(
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
    setPayee('')
    setCompanyId('')
    setAccount('')
    setPool('venture_pool')
    setBankId(opts?.banks[0]?.id ?? '')
    setAmount('')
    setDesc('')
    setDate(today)
    setSplit(false)
    setRepay(false)
    setTransfer(false)
    setShowMethod(false)
    setShowFiles(false)
    setShowNotes(false)
    setLines([])
    setDealId('')
    setPrincipal('0.00')
    setInterest('0.00')
    setPenalty('0.00')
    setMethod('bank_transfer')
    setFiles([])
    setNotes('')
    setOverride(false)
    setSingleOv(NO_OVERRIDE)
    setError(null)
  }
  const close = () => {
    if (busy) return
    onClose()
    reset()
  }

  const accounts = useMemo(() => opts?.accounts ?? [], [opts])
  const hasAccount = useMemo(() => {
    const codes = new Set(accounts.map((a) => a.code))
    return (code: string) => codes.has(code)
  }, [accounts])
  const deal = (opts?.fundSources ?? []).find((f) => f.id === dealId) ?? null
  const repaySum = Math.round((num(principal) + num(interest) + num(penalty)) * 100) / 100
  const total = repay ? repaySum : num(amount)
  const useLines = split || repay

  // A repayment's lines follow its principal / interest / penalty (lib/repayment-source-rows): each its
  // own account by default, a hand-picked account kept through later edits.
  useEffect(() => {
    if (!repay || !deal) return
    setLines((prev) =>
      buildRepaymentSourceRows(
        prev.map((l) => ({ role: l.role, pool: l.pool, amount: l.amount, account_code: l.account, autoAccount: l.autoAccount })),
        { principal: num(principal), interest: num(interest), penalty: num(penalty) },
        deal.account_code,
        hasAccount,
      ).map((r) => ({ role: r.role, pool: r.pool, account: r.account_code, amount: r.amount, autoAccount: r.autoAccount, ov: prev.find((p) => p.role === r.role)?.ov })),
    )
  }, [repay, deal, principal, interest, penalty, hasAccount])

  const pickDeal = (id: string) => {
    setDealId(id)
    const fs = (opts?.fundSources ?? []).find((f) => f.id === id)
    if (!fs) return
    // The payee is the lender — a company by its name, a director as "Director", else the lender's own name.
    const company = (opts?.companies ?? []).find((co) => co.id === fs.from_company_id)
    if (company) {
      setPayee(company.name)
      setCompanyId(company.id)
    } else if (fs.from_director_id) {
      setPayee('Director')
      setCompanyId('')
    } else {
      const name = (fs.lender ?? fs.label.split(' · ')[0])?.trim()
      if (name) {
        setPayee(name)
        setCompanyId('')
      }
    }
    setPrincipal(fs.monthly_principal.toFixed(2))
    setInterest(fs.monthly_interest.toFixed(2))
  }

  const toggleSplit = () => {
    if (repay) return
    if (split) {
      const first = lines[0]
      if (first) {
        setPool(first.pool || 'venture_pool')
        setAccount(first.account)
        setSingleOv(first.ov ?? NO_OVERRIDE)
      }
      setLines([])
      setSplit(false)
      return
    }
    setLines([
      { pool, account, amount: num(amount) > 0 ? num(amount).toFixed(2) : '', ov: override ? singleOv : undefined },
      { pool: '', account: '', amount: '', ov: override ? NO_OVERRIDE : undefined },
    ])
    setSplit(true)
  }
  const toggleRepay = () => {
    if (repay) {
      const first = lines[0]
      if (first) {
        setPool(first.pool || 'venture_pool')
        setAccount(first.account)
      }
      setAmount(repaySum > 0 ? repaySum.toFixed(2) : amount)
      setLines([])
      setDealId('')
      setPrincipal('0.00')
      setInterest('0.00')
      setPenalty('0.00')
      setRepay(false)
      return
    }
    setSplit(false)
    setLines([])
    setRepay(true)
  }
  const setLine = (i: number, patch: Partial<Line>) => setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const typeOf = (code: string) => accounts.find((a) => a.code === code)?.type ?? ''
  // On: each line (or the one) starts from its own account — the form page's Override; off: none is sent.
  const toggleOverride = () => {
    if (override) {
      setOverride(false)
      setSingleOv(NO_OVERRIDE)
      setLines((prev) => prev.map((l) => ({ ...l, ov: undefined })))
      return
    }
    setOverride(true)
    setSingleOv({ type: typeOf(account) || 'expense', gl: account, reason: '' })
    setLines((prev) => prev.map((l) => ({ ...l, ov: { type: typeOf(l.account) || 'expense', gl: l.account, reason: '' } })))
  }

  // ── What is still missing ──
  const lineSum = Math.round(lines.reduce((s, l) => s + num(l.amount), 0) * 100) / 100
  const need: string[] = []
  if (repay && !dealId) need.push('the loan it repays')
  if (!payee.trim()) need.push('Pay to')
  if (!(total > 0)) need.push('an amount')
  if (useLines) {
    if (lines.length === 0 || lines.some((l) => !l.pool || !l.account || !(num(l.amount) > 0))) need.push('each line’s pool, category, amount')
  } else {
    if (!account) need.push('a category')
    if (!pool) need.push('a pool')
  }
  if (method !== 'netting' && !bankId) need.push('a bank')
  if (!desc.trim()) need.push('a description')
  const overrides = override ? (useLines ? lines.map((l) => l.ov ?? NO_OVERRIDE) : [singleOv]) : []
  const overrideOpen = overrides.some((o) => !o.type || !o.gl || !o.reason.trim())
  const filesBytes = files.reduce((n, f) => n + f.size, 0)
  const offBy = useLines && total > 0 && lines.length > 0 ? Math.round((total - lineSum) * 100) / 100 : 0
  const problem =
    neededSentence(need) ??
    (Math.abs(offBy) > 0.005 ? `The lines add up to RM ${money(lineSum)} — the amount is RM ${money(total)}.` : null) ??
    (overrideOpen ? 'An override needs its type, its GL account and a reason.' : null) ??
    (filesBytes > FILES_CAP ? `The files come to ${fileSize(filesBytes)} — under 4 MB goes in one save. Compress them or add some later.` : null)
  const ok = problem === null && !!opts

  const save = async (submit: boolean) => {
    if (!ok || busy || !opts) return
    setBusy(submit ? 'submit' : 'draft')
    setError(null)
    const fd = new FormData()
    fd.set('direction', 'debit')
    fd.set('voucher_type', transfer ? 'internal_transfer' : 'expense')
    fd.set('reference_type', '')
    fd.set('reference_id', '')
    fd.set('payee_name', payee.trim())
    fd.set('payee_company_id', companyId)
    if (bankId) fd.set('bank_account_id', bankId)
    fd.set('amount', total.toFixed(2))
    fd.set('payment_date', date)
    fd.set('payment_method', method)
    fd.set('description', desc.trim())
    if (notes.trim()) fd.set('notes', notes.trim())
    fd.set('target_pool', '')
    const rows: Line[] = useLines ? lines : [{ pool, account, amount: total.toFixed(2), ov: override ? singleOv : undefined }]
    fd.set('source_rows_count', String(rows.length))
    rows.forEach((r, i) => {
      fd.set(`source_rows[${i}][pool]`, r.pool)
      fd.set(`source_rows[${i}][amount]`, num(r.amount).toFixed(2))
      fd.set(`source_rows[${i}][account_code]`, r.account)
      if (override && r.ov && r.ov.type && r.ov.gl && r.ov.reason.trim()) {
        fd.set(`source_rows[${i}][override_account_type]`, r.ov.type)
        fd.set(`source_rows[${i}][override_gl_account_code]`, r.ov.gl)
        fd.set(`source_rows[${i}][override_reason]`, r.ov.reason.trim())
      }
    })
    fd.set('source_pool', rows[0]?.pool ?? '')
    if (repay && dealId) {
      fd.set('fund_source_id', dealId)
      fd.set('repayment_principal', num(principal).toFixed(2))
      fd.set('repayment_interest', num(interest).toFixed(2))
      fd.set('repayment_penalty', num(penalty).toFixed(2))
    }
    files.forEach((f, i) => fd.append(`attachment_${i}`, f))
    fd.set('attachment_count', String(files.length))
    if (submit) fd.set('submit', '1')
    try {
      const res = await createPaymentFromDialog(fd)
      if (!res.ok) {
        setError(res.reason)
        return
      }
      onClose()
      reset()
      flash(res.note ?? (res.submitted ? `${res.voucherNo} submitted — waiting for Principal` : `${res.voucherNo} saved as draft`))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The voucher could not be saved.')
    } finally {
      setBusy(null)
    }
  }

  const poolOptions = (opts?.pools ?? []).map((p) => (
    <option key={p.value} value={p.value}>
      {poolName(p.label)}
    </option>
  ))
  const accountOptions = TYPE_ORDER.map((t) => {
    const of = accounts.filter((a) => a.type === t)
    return of.length === 0 ? null : (
      <optgroup key={t} label={typeLabel(t)}>
        {of.map((a) => (
          <option key={a.code} value={a.code} data-search={a.code}>
            {a.name}
          </option>
        ))}
      </optgroup>
    )
  })

  return (
    <FinDialog open={open} onClose={close} title="Create payment" sub={`New payment voucher · ${prefix}`} locked={busy !== null}>
      <DialogForm
        buttons={
          <>
            <DialogButton off={!ok} disabled={busy !== null} onClick={() => save(false)}>
              Save draft
            </DialogButton>
            <DialogButton kind="primary" off={!ok} disabled={busy !== null} onClick={() => save(true)}>
              Submit for approval
            </DialogButton>
          </>
        }
      >
        {repay ? (
          <>
            <Field label="Repay" htmlFor="cp-deal">
              <Select id="cp-deal" round={12} className={fm.select} value={dealId} onChange={(e) => pickDeal(e.target.value)}>
                <option value="">Choose the loan</option>
                {(opts?.fundSources ?? []).map((f) => (
                  <option key={f.id} value={f.id} data-search={f.label}>
                    {`${f.lender ?? f.label.split(' · ')[0]} · RM ${money(f.original_amount)} · ${shortDay(f.effective_date)}`}
                  </option>
                ))}
              </Select>
              {deal ? (
                <Hint>
                  Monthly payment RM {money(deal.monthly_payment)} · outstanding principal RM {money(deal.outstanding)} · {deal.remaining_periods}{' '}
                  {deal.remaining_periods === 1 ? 'month' : 'months'} remaining
                </Hint>
              ) : null}
            </Field>
            <div className={fm.trio}>
              <Field label="Principal RM" htmlFor="cp-principal">
                <Input id="cp-principal" mono align="right" inputMode="decimal" value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="0.00" />
              </Field>
              <Field label="Interest RM" htmlFor="cp-interest">
                <Input id="cp-interest" mono align="right" inputMode="decimal" value={interest} onChange={(e) => setInterest(e.target.value)} placeholder="0.00" />
              </Field>
              <Field label="Penalty RM" htmlFor="cp-penalty">
                <Input id="cp-penalty" mono align="right" inputMode="decimal" value={penalty} onChange={(e) => setPenalty(e.target.value)} placeholder="0.00" />
              </Field>
            </div>
          </>
        ) : null}

        <Field label="Pay to" htmlFor="cp-payee">
          <PartyInput
            id="cp-payee"
            placeholder="Payee name"
            value={payee}
            readOnly={repay}
            companies={opts?.companies ?? []}
            companyId={companyId}
            onChange={(name, id) => {
              setPayee(name)
              setCompanyId(id)
            }}
          />
        </Field>

        {useLines ? (
          <Field label={repay ? 'Lines' : 'Split across pools'}>
            <div className={fm.lines}>
              {lines.map((l, i) => (
                <div key={i} className={fm.lineWrap}>
                <div className={c.line} data-repay={repay ? 'true' : undefined}>
                  {repay && l.role ? <span className={c.role}>{ROLE_LABEL[l.role]}</span> : null}
                  <Select round={12} className={fm.lineSelect} value={l.pool} onChange={(e) => setLine(i, { pool: e.target.value })} aria-label={`Line ${i + 1} pool`}>
                    <option value="">Pool</option>
                    {poolOptions}
                  </Select>
                  <Select
                    round={12}
                    className={fm.lineSelect}
                    value={l.account}
                    onChange={(e) => setLine(i, { account: e.target.value, autoAccount: false })}
                    aria-label={`Line ${i + 1} category`}
                  >
                    <option value="">Category</option>
                    {accountOptions}
                  </Select>
                  <input
                    className={fm.lineAmount}
                    inputMode="decimal"
                    value={l.amount}
                    readOnly={repay}
                    onChange={(e) => setLine(i, { amount: e.target.value })}
                    placeholder="0.00"
                    aria-label={`Line ${i + 1} amount`}
                  />
                  {repay ? null : lines.length > 1 ? (
                    <button type="button" className={fm.remove} onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1}`}>
                      ×
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
                {override ? <OverrideRow value={l.ov ?? NO_OVERRIDE} onChange={(ov) => setLine(i, { ov })} accounts={accounts} label={`Line ${i + 1} override`} /> : null}
                </div>
              ))}
              <div className={fm.linesFoot}>
                {repay ? <span /> : (
                  <button type="button" className={fm.addLine} onClick={() => setLines((prev) => [...prev, { pool: '', account: '', amount: '' }])}>
                    + Add line
                  </button>
                )}
                <span className={fm.linesTotal} data-off={Math.abs(offBy) > 0.005 ? 'true' : undefined}>
                  RM {money(lineSum)}
                </span>
              </div>
            </div>
          </Field>
        ) : (
          <>
            <Field label="Category" htmlFor="cp-account">
              <Select id="cp-account" round={12} className={fm.select} value={account} onChange={(e) => setAccount(e.target.value)}>
                <option value="">Choose a category</option>
                {accountOptions}
              </Select>
            </Field>
            <Field label="Pool" htmlFor="cp-pool">
              <Select id="cp-pool" round={12} className={fm.select} value={pool} onChange={(e) => setPool(e.target.value)}>
                {opts ? null : <option value="venture_pool">Venture</option>}
                {poolOptions}
              </Select>
            </Field>
            {override ? (
              <Field label="GL override">
                <div className={fm.lines}>
                  <OverrideRow value={singleOv} onChange={setSingleOv} accounts={accounts} label="Override" />
                </div>
              </Field>
            ) : null}
          </>
        )}

        <Field label="From bank" htmlFor="cp-bank">
          <Select id="cp-bank" round={12} className={fm.select} value={bankId} onChange={(e) => setBankId(e.target.value)}>
            {method === 'netting' || !opts || opts.banks.length === 0 ? <option value="">{method === 'netting' ? 'No bank — netting' : opts ? 'No active bank account' : '…'}</option> : null}
            {(opts?.banks ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {`${b.bank_name} — ${b.account_number}`}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Amount RM" htmlFor="cp-amount">
          {repay ? (
            <Input id="cp-amount" mono align="right" value={money(repaySum)} readOnly className={fm.fixed} />
          ) : (
            <Input id="cp-amount" mono align="right" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          )}
        </Field>

        <Field label="Description" htmlFor="cp-desc">
          <Input id="cp-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What is this for?" />
        </Field>

        <Field label="Payment date">
          <DateField value={date} onChange={setDate} today={today} label="Payment date" />
        </Field>

        {showMethod ? (
          <Field label="Method" htmlFor="cp-method">
            <Select
              id="cp-method"
              round={12}
              className={fm.select}
              value={method}
              onChange={(e) => {
                setMethod(e.target.value)
                if (e.target.value !== 'netting' && !bankId) setBankId(opts?.banks[0]?.id ?? '')
              }}
            >
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {showFiles ? (
          <Field label="Attachments">
            <FilesField files={files} onChange={setFiles} />
          </Field>
        ) : null}

        {showNotes ? (
          <Field label="Notes" htmlFor="cp-notes">
            <Input id="cp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="For Finance only" />
          </Field>
        ) : null}

        <div className={fm.more} role="group" aria-label="More">
          <button type="button" className={fm.moreBtn} aria-pressed={split} onClick={toggleSplit} disabled={repay}>
            Split pools
          </button>
          {(opts?.fundSources.length ?? 0) > 0 ? (
            <button type="button" className={fm.moreBtn} aria-pressed={repay} onClick={toggleRepay}>
              Loan repayment
            </button>
          ) : null}
          <button type="button" className={fm.moreBtn} aria-pressed={transfer} onClick={() => setTransfer((t) => !t)} title="A move between HV's own banks: no pool pays for it">
            Internal transfer
          </button>
          <button type="button" className={fm.moreBtn} aria-pressed={showMethod} onClick={() => setShowMethod((v) => !v)}>
            Method
          </button>
          <button type="button" className={fm.moreBtn} aria-pressed={showFiles} onClick={() => setShowFiles((v) => !v)}>
            Attachments
          </button>
          <button type="button" className={fm.moreBtn} aria-pressed={showNotes} onClick={() => setShowNotes((v) => !v)}>
            Notes
          </button>
          <button type="button" className={fm.moreBtn} aria-pressed={override} onClick={toggleOverride} title="Post a line to another account type and GL, with the reason the auditors will read">
            GL override
          </button>
        </div>

        {loadError ? <Hint danger>{loadError}</Hint> : error ? <Hint danger>{error}</Hint> : problem ? <Hint>{problem}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}

/** A line's override: the type and the GL it posts to instead (the GLs of that type), and the reason. */
function OverrideRow({
  value,
  onChange,
  accounts,
  label,
}: {
  value: Override
  onChange: (o: Override) => void
  accounts: CreatePaymentOptions['accounts']
  label: string
}) {
  return (
    <div className={c.override}>
      <Select round={12} className={fm.lineSelect} value={value.type} onChange={(e) => onChange({ ...value, type: e.target.value as AccountType, gl: '' })} aria-label={`${label} type`}>
        <option value="">Type</option>
        {OVERRIDE_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>
      <Select round={12} className={fm.lineSelect} value={value.gl} onChange={(e) => onChange({ ...value, gl: e.target.value })} aria-label={`${label} GL account`}>
        <option value="">GL account</option>
        {accounts
          .filter((a) => a.type === value.type)
          .map((a) => (
            <option key={a.code} value={a.code} data-search={a.code}>
              {`${a.code} · ${a.name}`}
            </option>
          ))}
      </Select>
      <input className={fm.lineText} value={value.reason} onChange={(e) => onChange({ ...value, reason: e.target.value })} placeholder="Reason" aria-label={`${label} reason`} />
    </div>
  )
}
