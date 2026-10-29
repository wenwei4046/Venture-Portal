'use client'

import { useEffect, useMemo, useState } from 'react'
import { DateField } from '@/components/finv/DateField'
import { DialogButton, DialogForm, Field, FinDialog, Hint, Input } from '@/components/finv/Dialog'
import { money, poolName } from '@/components/finv/form-words'
import fm from '@/components/finv/form.module.css'
import { Select } from '@/components/hrv/select'
import { flash } from '@/components/hrv/toast'
import { typeLabel, type AccountType } from '@/lib/coa'
import { plural } from '@/lib/fin-app/page-model'
import { bulkGroups, type PaymentRequest } from '@/lib/payment-requests/model'
import { createPaymentForRequests, submitPaymentsTogether } from '../../actions'
import { openCreatePayment } from '../../create-actions'
import type { CreatePaymentOptions } from '../../_lib/create-payment-options'
import c from '../../_components/create.module.css'
import {
  BULK_METHODS,
  NO_EDITS,
  bulkTotal,
  bulkVouchers,
  carriedNote,
  lineKeys,
  runWords,
  voucherForm,
  voucherProblem,
  voucherTotal,
  withEdits,
  type BulkEdits,
  type BulkLine,
  type BulkMade,
  type BulkRefused,
} from '../_lib/bulk-pv'
import b from './bulk.module.css'

// Create payments (2026-10-29, PR ④ of docs/module-spec-payment-requests.md — the mockup's 多选 → 一次开几张 PV): the
// ticked requests of several payees, a PV each. The bank, the date and the method once; One PV a person (each payee's
// open requests together — "自动合成"); then a block a PV — its description, its lines (the category Finance's), each
// split's Bill back? and the receipts it carries; Save N drafts, or Submit N for approval — sent together, one batch
// for the Principal. Each voucher is the one Create PV makes (createPaymentForRequests), one after the other; one
// refused is said and the rest go on.

/** The order a payment's categories are offered in — what a payment mostly posts to first (as Create payment). */
const TYPE_ORDER: AccountType[] = ['expense', 'cost', 'asset', 'fixed_asset', 'liability', 'equity', 'revenue', 'other_income']

/** What the window starts from: each payee's open requests read again (the ones not ticked too), and what was ticked. */
export interface CreatePaymentsStart {
  groups: PaymentRequest[][]
  ticked: string[]
  /** Invoice · Create: a split may be billed back. */
  canBillBack: boolean
}

export default function CreatePaymentsDialog({
  open,
  start,
  prefix,
  today,
  initial = null,
  onClose,
  onDone,
}: {
  open: boolean
  start: CreatePaymentsStart
  /** "HV-PV-202610" — the line under the title. */
  prefix: string
  today: string
  /** The lists, when the page read them already. */
  initial?: CreatePaymentOptions | null
  onClose: () => void
  /** Something was made — the page lists it now. */
  onDone: () => void
}) {
  const [opts, setOpts] = useState<CreatePaymentOptions | null>(initial)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [bankId, setBankId] = useState(initial?.banks[0]?.id ?? '')
  const [date, setDate] = useState(today)
  const [method, setMethod] = useState<string>(BULK_METHODS[0].value)
  const [combine, setCombine] = useState(true)
  const [edits, setEdits] = useState<BulkEdits>(NO_EDITS)
  const [busy, setBusy] = useState<{ submit: boolean; at: number; of: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ReturnType<typeof runWords> | null>(null)

  // The lists, asked for once the window opens (unless the page brought them).
  useEffect(() => {
    if (!open || opts) return
    let live = true
    setLoadError(null)
    openCreatePayment().then(
      (res) => {
        if (!live) return
        if (res.ok) {
          setOpts(res.options)
          setBankId((id) => id || res.options.banks[0]?.id || '')
        } else setLoadError(res.reason)
      },
      () => live && setLoadError('The lists could not be read. Close and try again.'),
    )
    return () => {
      live = false
    }
  }, [open, opts])

  const ticked = useMemo(() => new Set(start.ticked), [start])
  const groups = useMemo(
    () => (combine ? start.groups : bulkGroups(start.groups.flat().filter((r) => ticked.has(r.id)), [], false)),
    [start, combine, ticked],
  )
  const blocks = useMemo(() => bulkVouchers(groups, ticked).map((v) => withEdits(v, edits)), [groups, ticked, edits])
  const requests = blocks.reduce((n, v) => n + v.requests, 0)
  const n = blocks.length
  const problems = blocks.map((v) => voucherProblem(v, start.canBillBack))
  const firstProblem = problems.findIndex((p) => p !== null)
  const problem = !bankId
    ? 'Pick the bank to pay from.'
    : firstProblem >= 0
      ? `${blocks[firstProblem].start.payee}: ${problems[firstProblem]}`
      : null
  const ok = !!opts && n > 0 && problem === null

  const setLine = (key: string, patch: Partial<BulkLine>) => setEdits((e) => ({ ...e, lines: { ...e.lines, [key]: { ...e.lines[key], ...patch } } }))
  const setAnswer = (shareId: string, yes: boolean) => setEdits((e) => ({ ...e, answers: { ...e.answers, [shareId]: yes } }))
  const setDescription = (key: string, text: string) => setEdits((e) => ({ ...e, descriptions: { ...e.descriptions, [key]: text } }))

  const close = () => {
    if (busy) return
    onClose()
  }
  // Once something was made, closing the window shows it on the page.
  const finish = () => {
    onClose()
    onDone()
  }

  const run = async (submit: boolean) => {
    if (!ok || busy) return
    setError(null)
    const shared = { bankId, date, method }
    const made: BulkMade[] = []
    const refused: BulkRefused[] = []
    for (const [i, v] of blocks.entries()) {
      setBusy({ submit, at: i + 1, of: blocks.length })
      try {
        const res = await createPaymentForRequests(voucherForm(v, shared))
        if (res.ok) {
          const note = carriedNote(res.note, res.voucherNo)
          made.push({ key: v.key, payee: v.start.payee, id: res.id, voucherNo: res.voucherNo, ...(note ? { note } : {}) })
        } else refused.push({ key: v.key, payee: v.start.payee, reason: res.reason })
      } catch {
        refused.push({ key: v.key, payee: v.start.payee, reason: 'It could not be saved. Try again.' })
      }
    }
    let sent: string[] = []
    let notSent: Array<{ id: string; reason: string }> = []
    if (submit && made.length > 0) {
      setBusy({ submit, at: blocks.length + 1, of: blocks.length })
      try {
        const res = await submitPaymentsTogether(made.map((m) => m.id))
        if (res.ok) {
          sent = res.submitted
          notSent = res.failed
        } else notSent = made.map((m) => ({ id: m.id, reason: res.reason }))
      } catch {
        notSent = made.map((m) => ({ id: m.id, reason: 'It was not sent — submit it from Payment voucher.' }))
      }
    }
    setBusy(null)
    const words = runWords({ made, refused, submit, sent, notSent })
    if (words.clean) {
      flash(words.flash)
      finish()
      return
    }
    // Nothing made: the window stays as it was, the refusals said; else what was made is listed for reading.
    if (made.length === 0) {
      setError(words.lines.map((l) => l.text).join(' · '))
      return
    }
    setResult(words)
  }

  const poolOptions = (opts?.pools ?? []).map((p) => (
    <option key={p.value} value={p.value}>
      {poolName(p.label)}
    </option>
  ))
  const accountOptions = TYPE_ORDER.map((t) => {
    const of = (opts?.accounts ?? []).filter((a) => a.type === t)
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

  const saving = busy && !busy.submit ? `Saving ${busy.at} of ${busy.of}…` : null
  const submitting = busy?.submit ? (busy.at > busy.of ? 'Sending them together…' : `Making ${busy.at} of ${busy.of}…`) : null

  return (
    <FinDialog
      open={open}
      onClose={result ? finish : close}
      title="Create payments"
      sub={`${plural(requests, 'request', 'requests')} → ${plural(n, 'payment voucher', 'payment vouchers')} · ${prefix}`}
      locked={busy !== null}
      tall
      wide
    >
      {result ? (
        <DialogForm
          buttons={
            <DialogButton kind="primary" onClick={finish}>
              Done
            </DialogButton>
          }
        >
          <div className={b.result}>
            {result.lines.map((l, i) => (
              <p key={i} className={b.resultLine} data-bad={l.bad ? 'true' : undefined}>
                {l.text}
              </p>
            ))}
          </div>
          <Hint>Each one made is on Payment voucher; a request not made is still here to try again.</Hint>
        </DialogForm>
      ) : (
        <DialogForm
          buttons={
            <>
              <DialogButton off={!ok} disabled={busy !== null} onClick={() => void run(false)}>
                {saving ?? `Save ${plural(n, 'draft', 'drafts')}`}
              </DialogButton>
              <DialogButton kind="primary" off={!ok} disabled={busy !== null} onClick={() => void run(true)}>
                {submitting ?? `Submit ${n} for approval`}
              </DialogButton>
            </>
          }
        >
          <div className={fm.trio}>
            <Field label="From bank" htmlFor="cps-bank">
              <Select id="cps-bank" round={12} className={fm.select} value={bankId} onChange={(e) => setBankId(e.target.value)}>
                {!opts || opts.banks.length === 0 ? <option value="">{opts ? 'No active bank account' : '…'}</option> : null}
                {(opts?.banks ?? []).map((x) => (
                  <option key={x.id} value={x.id}>
                    {`${x.bank_name} — ${x.account_number}`}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Payment date">
              <DateField value={date} onChange={setDate} today={today} label="Payment date" />
            </Field>
            <Field label="Method" htmlFor="cps-method">
              <Select id="cps-method" round={12} className={fm.select} value={method} onChange={(e) => setMethod(e.target.value)}>
                {BULK_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <label className={b.combine}>
            <input type="checkbox" checked={combine} onChange={(e) => setCombine(e.target.checked)} disabled={busy !== null} />
            One PV a person — the same person’s requests go together
          </label>

          {blocks.map((v, i) => {
            const keys = lineKeys(v)
            return (
              <section key={v.key} className={b.block} aria-label={`PV ${i + 1} · ${v.start.payee}`}>
                <div className={b.head}>
                  <span className={b.num}>{i + 1}</span>
                  <span className={b.payee}>{v.start.payee}</span>
                  <span className={b.kind}>{v.kind === 'claim' ? 'Claim' : 'Direct pay'}</span>
                  <span className={b.sub}>
                    {[v.start.payInto.replace(/^Pay into /, ''), plural(v.requests, 'request', 'requests')].filter(Boolean).join(' · ')}
                  </span>
                  <span className={b.amt}>RM {money(voucherTotal(v))}</span>
                </div>
                {v.added.length > 0 ? (
                  <Hint>
                    With {v.added.join(', ')} — the same payee’s {v.added.length === 1 ? 'other request' : 'other requests'} with no PV yet.
                  </Hint>
                ) : null}

                <Field label="Description" htmlFor={`cps-desc-${i}`}>
                  <Input id={`cps-desc-${i}`} value={v.description} onChange={(e) => setDescription(v.key, e.target.value)} placeholder="What is this for?" />
                </Field>

                <div className={fm.lines}>
                  {v.lines.map((l, j) => (
                    <div key={keys[j]} className={fm.lineWrap}>
                      <div className={c.wordsLine}>
                        <input
                          className={`${fm.lineText} ${c.words}`}
                          value={l.description}
                          onChange={(e) => setLine(keys[j], { description: e.target.value })}
                          placeholder="What this line is for"
                          aria-label={`PV ${i + 1} line ${j + 1} description`}
                        />
                        <Select round={12} className={fm.lineSelect} value={l.pool} onChange={(e) => setLine(keys[j], { pool: e.target.value })} aria-label={`PV ${i + 1} line ${j + 1} pool`}>
                          <option value="">Pool</option>
                          {poolOptions}
                        </Select>
                        <Select round={12} className={fm.lineSelect} value={l.account} onChange={(e) => setLine(keys[j], { account: e.target.value })} aria-label={`PV ${i + 1} line ${j + 1} category`}>
                          <option value="">Category</option>
                          {accountOptions}
                        </Select>
                        <input
                          className={fm.lineAmount}
                          inputMode="decimal"
                          value={l.amount}
                          onChange={(e) => setLine(keys[j], { amount: e.target.value })}
                          placeholder="0.00"
                          aria-label={`PV ${i + 1} line ${j + 1} amount`}
                        />
                        <span />
                      </div>
                    </div>
                  ))}
                </div>

                {v.start.splits.length > 0 ? (
                  <>
                    <div className={c.splits}>
                      {v.start.splits.map((s) => (
                        <div key={s.shareId} className={c.split}>
                          <span className={c.splitText}>
                            <span className={c.splitWho}>
                              Bill back {s.who} · RM {money(s.amount)}?
                            </span>
                            <span className={c.splitSub}>{s.requestNo}</span>
                          </span>
                          {s.invoiceNo ? (
                            <span className={c.splitDone}>{s.invoiceNo} · drafted</span>
                          ) : (
                            <span className={fm.more} role="group" aria-label={`Bill back ${s.who}?`}>
                              <button
                                type="button"
                                className={fm.moreBtn}
                                aria-pressed={v.answers[s.shareId] === true}
                                disabled={!start.canBillBack}
                                title={start.canBillBack ? undefined : 'Billing back needs Invoice · Create'}
                                onClick={() => setAnswer(s.shareId, true)}
                              >
                                Yes
                              </button>
                              <button type="button" className={fm.moreBtn} aria-pressed={v.answers[s.shareId] === false} onClick={() => setAnswer(s.shareId, false)}>
                                No
                              </button>
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    <Hint>Yes drafts an invoice to them — a draft in Invoice until you issue it. No: {v.start.department} pays it.</Hint>
                  </>
                ) : null}

                <p className={b.carried}>
                  {v.start.files.length === 0 ? 'No receipts to carry over' : `${plural(v.start.files.length, 'receipt', 'receipts')} carried over`}
                </p>
                {problems[i] ? <Hint>{problems[i]}</Hint> : null}
              </section>
            )
          })}

          <div className={b.total}>
            <span>{plural(n, 'PV', 'PVs')} · total</span>
            <span className={b.totalValue}>RM {money(bulkTotal(blocks))}</span>
          </div>

          {loadError ? (
            <Hint danger>{loadError}</Hint>
          ) : error ? (
            <Hint danger>{error}</Hint>
          ) : problem ? (
            <Hint>{problem}</Hint>
          ) : (
            <Hint>Submitted together, they reach the Principal as one batch — approve all at once, or one by one.</Hint>
          )}
        </DialogForm>
      )}
    </FinDialog>
  )
}
