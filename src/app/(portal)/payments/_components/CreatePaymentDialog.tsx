'use client'

import { useEffect, useMemo, useState } from 'react'
import { DateField } from '@/components/finv/DateField'
import { DialogButton, DialogForm, Field, FinDialog, Hint, Input } from '@/components/finv/Dialog'
import { FilesField } from '@/components/finv/FilesField'
import { PartyInput } from '@/components/finv/PartyInput'
import { fileSize, filesProblem, money, neededSentence, num, poolName, shortDay } from '@/components/finv/form-words'
import fm from '@/components/finv/form.module.css'
import { Select } from '@/components/hrv/select'
import { flash } from '@/components/hrv/toast'
import { typeLabel, type AccountType } from '@/lib/coa'
import { buildRepaymentSourceRows, type RepaymentRole } from '@/lib/repayment-source-rows'
import { stageInto } from '@/lib/storage/stage'
import { billBackAnswers, openSplits, type RequestVoucherStart } from '@/lib/payment-requests/model'
import { createPaymentFromDialog, type DialogPaymentResult } from '../actions'
import { openCreatePayment } from '../create-actions'
import type { CreatePaymentOptions } from '../_lib/create-payment-options'
import c from './create.module.css'

// Create payment (2026-10-14, the Finance revamp v2 — D07 / D08 of
// `.design/fin-r2/handoff`): the prototype's dialog, *Save draft* and *Submit
// for approval*. The user: 样子照设计，功能全留. Redrawn 2026-10-22 ("split pool
// 这个按钮我不想要，我想maintain之前的add description/line, attachment 就default
// 要有" → "每行一个，GL override 拿掉"): wider, Pay to beside the date and the
// bank above the voucher's description; then its lines — each its own words
// (the books' line), pool, category and amount, + Add line, their total the
// voucher's amount — and the files, always there. A loan repayment (the deal,
// its principal / interest / penalty, a line each), an internal transfer, the
// method and notes open from the small buttons under them. The voucher is the
// form page's (createPaymentVoucherInner, every rule); the dialog stays on
// Payments and says what it made. Payment request's Create PV (2026-10-29)
// opens this same window filled in from the staff requests it pays — "generate
// 的pv 是和我原本普通开pv 的样子一样" — and saves through its own action.

const METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
  { value: 'netting', label: 'Netting / offset' },
]
/** The order a payment's categories are offered in — what a payment mostly posts to first. */
const TYPE_ORDER: AccountType[] = ['expense', 'cost', 'asset', 'fixed_asset', 'liability', 'equity', 'revenue', 'other_income']
const ROLE_LABEL: Record<RepaymentRole, string> = { principal: 'Principal', interest: 'Interest', penalty: 'Penalty' }

interface Line {
  /** The line's own words — what it is for. */
  description: string
  pool: string
  account: string
  amount: string
  role?: RepaymentRole
  autoAccount?: boolean
  /** The staff request it pays (Create PV from Payment request): its bill backs take this line's category. */
  requestId?: string
}

// The words are the kit's (components/finv/form-words), kept importable from here.
export { neededSentence, poolName }

/**
 * What the voucher page fills in for a payment begun elsewhere (2026-10-16 —
 * the Finance phone app's Invoice: a paid invoice's *Refund*, Billing's
 * *Add non-billable expense*): its title, and who is paid, how much, for what.
 * Every field stays the reader's to change.
 */
export interface PaymentPreset {
  title?: string
  payee?: string
  companyId?: string | null
  amount?: number
  description?: string
  /**
   * Payments › Payment request's Create PV (2026-10-29, PR ②): the staff requests it pays — a line per item on the
   * requester's department's pool (the category Finance's), the account under Pay to, the notes, the receipts it
   * carries over, and the shares Finance said Yes to bill back.
   */
  requests?: RequestVoucherStart
}

/** A dialog's lines: a line per item of the requests it pays, else Venture's, on the amount a payment begun elsewhere brings. */
const firstLines = (preset: PaymentPreset | null): Line[] =>
  preset?.requests && preset.requests.lines.length > 0
    ? preset.requests.lines.map((l) => ({ description: l.description, pool: l.pool, account: '', amount: l.amount.toFixed(2), requestId: l.requestId }))
    : [{ description: '', pool: 'venture_pool', account: '', amount: preset?.amount ? preset.amount.toFixed(2) : '' }]

export default function CreatePaymentDialog({
  open,
  onClose,
  prefix,
  today,
  initial = null,
  preset = null,
  create = createPaymentFromDialog,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  /** "HV-PV-202610" — the line under the title. */
  prefix: string
  /** The office's today. */
  today: string
  /** The lists, when the page read them already (`/payments?new=1`). */
  initial?: CreatePaymentOptions | null
  /** A payment begun elsewhere — what it starts from (each opening starts from it again). */
  preset?: PaymentPreset | null
  /** What saves it: the dialog's own, or Payment request's (the requests tied to the voucher it makes). */
  create?: (fd: FormData) => Promise<DialogPaymentResult>
  /** Saved: the voucher it made (the caller refreshes what it shows). */
  onSaved?: (voucher: { id: string; voucherNo: string }) => void
}) {
  const [opts, setOpts] = useState<CreatePaymentOptions | null>(initial)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [payee, setPayee] = useState(preset?.payee ?? '')
  const [companyId, setCompanyId] = useState(preset?.companyId ?? '')
  const [bankId, setBankId] = useState(initial?.banks[0]?.id ?? '')
  const [desc, setDesc] = useState(preset?.description ?? '')
  const [date, setDate] = useState(today)
  const [lines, setLines] = useState<Line[]>(() => firstLines(preset))
  // What the small buttons open.
  const [repay, setRepay] = useState(false)
  const [transfer, setTransfer] = useState(false)
  const [showMethod, setShowMethod] = useState(false)
  const [showNotes, setShowNotes] = useState(!!preset?.requests?.notes)
  const [dealId, setDealId] = useState('')
  const [principal, setPrincipal] = useState('0.00')
  const [interest, setInterest] = useState('0.00')
  const [penalty, setPenalty] = useState('0.00')
  const [method, setMethod] = useState('bank_transfer')
  const [files, setFiles] = useState<File[]>([])
  const [notes, setNotes] = useState(preset?.requests?.notes ?? '')
  // Each split's Bill back?, answered here with the voucher — nothing chosen until it is picked.
  const [answers, setAnswers] = useState<Record<string, boolean>>({})
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
    setPayee(preset?.payee ?? '')
    setCompanyId(preset?.companyId ?? '')
    setBankId(opts?.banks[0]?.id ?? '')
    setDesc(preset?.description ?? '')
    setDate(today)
    setLines(firstLines(preset))
    setRepay(false)
    setTransfer(false)
    setShowMethod(false)
    setShowNotes(!!preset?.requests?.notes)
    setDealId('')
    setPrincipal('0.00')
    setInterest('0.00')
    setPenalty('0.00')
    setMethod('bank_transfer')
    setFiles([])
    setNotes(preset?.requests?.notes ?? '')
    setAnswers({})
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
  const lineSum = Math.round(lines.reduce((s, l) => s + num(l.amount), 0) * 100) / 100
  const total = repay ? repaySum : lineSum

  // A repayment's lines follow its principal / interest / penalty (lib/repayment-source-rows): each its
  // own account by default, a hand-picked account kept through later edits, and its words.
  useEffect(() => {
    if (!repay || !deal) return
    setLines((prev) =>
      buildRepaymentSourceRows(
        prev.map((l) => ({ role: l.role, pool: l.pool, amount: l.amount, account_code: l.account, autoAccount: l.autoAccount, description: l.description })),
        { principal: num(principal), interest: num(interest), penalty: num(penalty) },
        deal.account_code,
        hasAccount,
      ).map((r) => ({ description: r.description ?? '', role: r.role, pool: r.pool, account: r.account_code, amount: r.amount, autoAccount: r.autoAccount })),
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

  const toggleRepay = () => {
    if (repay) {
      const first = lines[0]
      setLines([{ description: '', pool: first?.pool || 'venture_pool', account: first?.account ?? '', amount: repaySum > 0 ? repaySum.toFixed(2) : '' }])
      setDealId('')
      setPrincipal('0.00')
      setInterest('0.00')
      setPenalty('0.00')
      setRepay(false)
      return
    }
    setLines([])
    setRepay(true)
  }
  const setLine = (i: number, patch: Partial<Line>) => setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  // ── What is still missing ──
  const need: string[] = []
  if (repay && !dealId) need.push('the loan it repays')
  if (!payee.trim()) need.push('Pay to')
  if (!(total > 0)) need.push('an amount')
  if (!repay && lines.length === 1) {
    if (!lines[0].account) need.push('a category')
    if (!lines[0].pool) need.push('a pool')
  } else if (lines.length === 0 || lines.some((l) => !l.pool || !l.account || !(num(l.amount) > 0))) need.push('each line’s pool, category, amount')
  if (method !== 'netting' && !bankId) need.push('a bank')
  if (!desc.trim()) need.push('a description')
  // The requests' splits: each answered Bill back? Yes or No; a Yes is invoiced at the category of its request's lines.
  const splits = preset?.requests ? openSplits(preset.requests.splits) : []
  if (splits.some((s) => answers[s.shareId] === undefined)) need.push('each split’s Bill back')
  const billBack = preset?.requests ? billBackAnswers(preset.requests.splits, answers, lines) : []
  const offBy = repay && total > 0 && lines.length > 0 ? Math.round((total - lineSum) * 100) / 100 : 0
  const problem =
    neededSentence(need) ??
    (Math.abs(offBy) > 0.005 ? `The lines add up to RM ${money(lineSum)} — the amount is RM ${money(total)}.` : null) ??
    filesProblem(files) ??
    (billBack.some((b) => b.billBack && !b.category) ? 'Keep a line of each request billed back — its invoice takes that line’s category.' : null)
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
    fd.set('source_rows_count', String(lines.length))
    lines.forEach((r, i) => {
      fd.set(`source_rows[${i}][pool]`, r.pool)
      fd.set(`source_rows[${i}][amount]`, num(r.amount).toFixed(2))
      fd.set(`source_rows[${i}][account_code]`, r.account)
      if (r.description.trim()) fd.set(`source_rows[${i}][description]`, r.description.trim())
    })
    fd.set('source_pool', lines[0]?.pool ?? '')
    if (repay && dealId) {
      fd.set('fund_source_id', dealId)
      fd.set('repayment_principal', num(principal).toFixed(2))
      fd.set('repayment_interest', num(interest).toFixed(2))
      fd.set('repayment_penalty', num(penalty).toFixed(2))
    }
    fd.set('attachment_count', String(files.length))
    if (submit) fd.set('submit', '1')
    if (preset?.requests) {
      fd.set('payment_request_ids', JSON.stringify(preset.requests.requestIds))
      fd.set('payment_request_bill', JSON.stringify(billBack))
    }
    try {
      // Each file sent ahead, the save carrying only its line (2026-10-23 — no longer 4 MB for them all).
      for (const [i, f] of files.entries()) await stageInto(fd, `attachment_${i}`, f)
      const res = await create(fd)
      if (!res.ok) {
        setError(res.reason)
        return
      }
      onClose()
      reset()
      flash(res.note ?? (res.submitted ? `${res.voucherNo} submitted — waiting for Principal` : `${res.voucherNo} saved as draft`))
      onSaved?.({ id: res.id, voucherNo: res.voucherNo })
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
    <FinDialog open={open} onClose={close} title={preset?.title ?? 'Create payment'} sub={`New payment voucher · ${prefix}`} locked={busy !== null} tall wide>
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

        <div className={fm.pair}>
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
            {preset?.requests?.payInto ? <Hint>{preset.requests.payInto}</Hint> : null}
          </Field>
          <Field label="Payment date">
            <DateField value={date} onChange={setDate} today={today} label="Payment date" />
          </Field>
        </div>

        <div className={fm.pair}>
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
        </div>

        <Field label="Description" htmlFor="cp-desc">
          <Input id="cp-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What is this for?" />
        </Field>

        <Field label="Lines">
          <div className={fm.lines}>
            {lines.map((l, i) => (
              <div key={i} className={fm.lineWrap}>
                <div className={c.wordsLine} data-repay={repay ? 'true' : undefined}>
                  {repay && l.role ? <span className={c.role}>{ROLE_LABEL[l.role]}</span> : null}
                  <input
                    className={`${fm.lineText} ${c.words}`}
                    value={l.description}
                    onChange={(e) => setLine(i, { description: e.target.value })}
                    placeholder="What this line is for"
                    aria-label={`Line ${i + 1} description`}
                  />
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
              </div>
            ))}
            <div className={fm.linesFoot}>
              {repay ? (
                <span />
              ) : (
                <button type="button" className={fm.addLine} onClick={() => setLines((prev) => [...prev, { description: '', pool: '', account: '', amount: '' }])}>
                  + Add line
                </button>
              )}
              <span className={fm.linesTotal} data-off={Math.abs(offBy) > 0.005 ? 'true' : undefined}>
                RM {money(total)}
              </span>
            </div>
          </div>
        </Field>

        {preset?.requests && preset.requests.splits.length > 0 ? (
          <Field label="Bill back">
            <div className={c.splits}>
              {preset.requests.splits.map((s) => (
                <div key={s.shareId} className={c.split}>
                  <span className={c.splitText}>
                    <span className={c.splitWho}>
                      {s.who} · RM {money(s.amount)}
                    </span>
                    <span className={c.splitSub}>{s.requestNo}</span>
                  </span>
                  {s.invoiceNo ? (
                    <span className={c.splitDone}>{s.invoiceNo} · drafted</span>
                  ) : (
                    <span className={fm.more} role="group" aria-label={`Bill back ${s.who}?`}>
                      <button type="button" className={fm.moreBtn} aria-pressed={answers[s.shareId] === true} onClick={() => setAnswers((a) => ({ ...a, [s.shareId]: true }))}>
                        Yes
                      </button>
                      <button type="button" className={fm.moreBtn} aria-pressed={answers[s.shareId] === false} onClick={() => setAnswers((a) => ({ ...a, [s.shareId]: false }))}>
                        No
                      </button>
                    </span>
                  )}
                </div>
              ))}
            </div>
            <Hint>
              Yes drafts an invoice to them — a draft in Invoice until you issue it. No: {preset.requests.department} pays it.
            </Hint>
          </Field>
        ) : null}

        <Field label="Attachments">
          {preset?.requests && preset.requests.files.length > 0 ? (
            <div className={fm.files}>
              {preset.requests.files.map((f) => (
                <div key={f.id} className={fm.file}>
                  <span className={fm.fileName} title={f.name}>
                    {f.name}
                  </span>
                  <span className={fm.fileSize}>{f.size ? fileSize(f.size) : ''}</span>
                  <span className={c.carried}>From the request</span>
                </div>
              ))}
            </div>
          ) : null}
          <FilesField files={files} onChange={setFiles} />
        </Field>

        {showNotes ? (
          <Field label="Notes" htmlFor="cp-notes">
            <Input id="cp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="For Finance only" />
          </Field>
        ) : null}

        <div className={fm.more} role="group" aria-label="More">
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
          <button type="button" className={fm.moreBtn} aria-pressed={showNotes} onClick={() => setShowNotes((v) => !v)}>
            Notes
          </button>
        </div>

        {loadError ? <Hint danger>{loadError}</Hint> : error ? <Hint danger>{error}</Hint> : problem ? <Hint>{problem}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}
