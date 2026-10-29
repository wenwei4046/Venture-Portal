'use client'

import { useEffect, useRef, useState } from 'react'
import { DialogButton, DialogForm, Field, FinDialog, Hint, Input } from '@/components/finv/Dialog'
import { fileSize, money } from '@/components/finv/form-words'
import fm from '@/components/finv/form.module.css'
import df from '@/components/finv/dealform.module.css'
import { Select } from '@/components/hrv/select'
import { openNewRequest, saveRequest } from '@/lib/payment-requests/actions'
import {
  PR_ACCEPT,
  PR_LIMITS,
  draftOf,
  draftPayload,
  draftShared,
  draftTotal,
  emptyDraft,
  emptyItem,
  emptyShare,
  saveProblem,
  submitProblem,
  type PaymentRequest,
  type RequestContext,
  type RequestDraft,
} from '@/lib/payment-requests/model'
import { useRequestUploads } from './useRequestUploads'
import c from './claim.module.css'

// New request (2026-10-29, PR ② — the mockup's window, "他们的new request 要pop out 哦"): a pop-out window in three
// parts, nothing chosen until it is picked (the user, 2026-10-27) — What is it? (I paid — pay me back, into the salary
// account HR holds or another this time · Pay a supplier directly, its name, bank and account typed: no reading of
// invoices for now, "不要开key 先 … 暂时就让他们填"), What was it for? (items and their total; the receipts, required —
// each up the moment it is picked), Which pool pays? (the department's, or split with other departments and
// companies, the amounts typed by the requester). Save as draft keeps what was typed; Submit sends it to Finance. The
// same window fixes a draft or a request Finance sent back.

export default function NewRequestDialog({
  open,
  onClose,
  request = null,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  /** A draft, or a rejected request, to change; null for a new one. */
  request?: PaymentRequest | null
  onSaved: (saved: PaymentRequest, sent: boolean) => void
}) {
  const [ctx, setCtx] = useState<RequestContext | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState<RequestDraft>(() => (request ? draftOf(request) : emptyDraft()))
  const [removed, setRemoved] = useState<string[]>([])
  const [busy, setBusy] = useState<'draft' | 'submit' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const filed = (request?.files ?? []).filter((f) => !removed.includes(f.id))
  const uploads = useRequestUploads(filed.length)
  const input = useRef<HTMLInputElement>(null)

  // The lists — who sends it, the department's pool, HR's salary account — asked for once the window opens.
  useEffect(() => {
    if (!open || ctx) return
    let live = true
    setLoadError(null)
    openNewRequest().then(
      (res) => {
        if (!live) return
        if (res.ok) setCtx(res.data)
        else setLoadError(res.reason)
      },
      () => live && setLoadError('The window could not be opened. Close it and try again.'),
    )
    return () => {
      live = false
    }
  }, [open, ctx])

  // Each opening starts from the request it opens on (or a blank one) — once: a refresh of the page behind it while
  // the window is open leaves what is being typed as it is.
  const openedOn = useRef<string | null>(null)
  useEffect(() => {
    if (!open) {
      openedOn.current = null
      return
    }
    const key = request?.id ?? 'new'
    if (openedOn.current === key) return
    openedOn.current = key
    setDraft(request ? draftOf(request) : emptyDraft())
    setRemoved([])
    setError(null)
  }, [open, request])

  const set = (patch: Partial<RequestDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const setItem = (i: number, patch: Partial<RequestDraft['items'][number]>) =>
    setDraft((d) => ({ ...d, items: d.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) }))
  const setShare = (i: number, patch: Partial<RequestDraft['shares'][number]>) =>
    setDraft((d) => ({ ...d, shares: d.shares.map((x, j) => (j === i ? { ...x, ...patch } : x)) }))

  const close = () => {
    if (busy) return
    uploads.discard()
    onClose()
  }

  const total = draftTotal(draft)
  const shared = draftShared(draft)
  const fileCount = filed.length + uploads.uploads.length
  const waiting = uploads.busy ? 'Wait for the files to finish uploading.' : uploads.failed ? 'Take off the files that did not upload.' : null
  const sendProblem = waiting ?? submitProblem(draft, fileCount, ctx)
  const keepProblem = waiting ?? saveProblem(draft)

  const save = async (submit: boolean) => {
    if (busy || !ctx || (submit ? sendProblem : keepProblem)) return
    const payload = draftPayload(draft, uploads.uploads, removed)
    if (!payload) return
    setBusy(submit ? 'submit' : 'draft')
    setError(null)
    try {
      const res = await saveRequest(request?.id ?? null, payload, submit)
      if (!res.ok) {
        setError(res.reason)
        return
      }
      uploads.filed()
      onSaved(res.data, submit)
      onClose()
    } catch {
      setError('The request could not be saved. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  const salary = ctx?.salaryAccount ?? null
  const title = !request ? 'New request' : request.status === 'rejected' ? 'Fix and send again' : 'Edit request'
  const sub = ctx ? `${ctx.name} · ${ctx.departmentName}` : request?.requestNo ?? ' '
  const partyOptions = (party: string) => (party === 'company' ? ctx?.companies ?? [] : party === 'department' ? ctx?.departments ?? [] : [])
  const problem = loadError ?? error ?? (draft.kind ? sendProblem : null)

  return (
    <FinDialog open={open} onClose={close} title={title} sub={sub} locked={busy !== null} tall wide>
      <DialogForm
        onSubmit={() => void save(true)}
        buttons={
          <>
            <DialogButton onClick={close} disabled={busy !== null}>
              Cancel
            </DialogButton>
            <DialogButton off={!ctx || !!keepProblem} disabled={busy !== null} onClick={() => void save(false)}>
              {busy === 'draft' ? 'Saving…' : 'Save as draft'}
            </DialogButton>
            <DialogButton type="submit" kind="primary" off={!ctx || !!sendProblem} disabled={busy !== null}>
              {busy === 'submit' ? 'Sending…' : 'Submit'}
            </DialogButton>
          </>
        }
      >
        {request?.status === 'rejected' && request.rejectReason ? (
          <div className={c.reason} role="note">
            <span className={c.reasonBy}>Sent back by {request.rejectedByName ?? 'Finance'}</span>
            {request.rejectReason}
          </div>
        ) : null}

        {/* ── 1. What is it? ── */}
        <div className={df.typeLabel}>1 · What is it?</div>
        <div role="radiogroup" aria-label="What is it?">
          <div className={df.type} data-on={draft.kind === 'claim' ? 'true' : undefined}>
            <label className={df.typeHead}>
              <input type="radio" name="pr-kind" checked={draft.kind === 'claim'} onChange={() => set({ kind: 'claim', supplier: '' })} />
              <span>
                I paid — pay me back
                <span className={df.typeNote}>A claim: Finance pays it into your account.</span>
              </span>
            </label>
            {draft.kind === 'claim' ? (
              <div className={df.typeBody}>
                <div role="radiogroup" aria-label="Pay into">
                  <label className={c.option} data-off={!salary ? 'true' : undefined}>
                    <input type="radio" name="pr-into" checked={draft.salary === true} disabled={!salary} onChange={() => set({ salary: true, bank: '', accountNo: '' })} />
                    <span>
                      My salary account
                      <span className={df.typeNote}>{salary ? `${salary.bank} •••• ${salary.last4} — as HR has it` : ctx ? 'HR has no salary account for you' : '…'}</span>
                    </span>
                  </label>
                  <label className={c.option}>
                    <input type="radio" name="pr-into" checked={draft.salary === false} onChange={() => set({ salary: false })} />
                    <span>Another account this time</span>
                  </label>
                </div>
                {draft.salary === false ? (
                  <div className={fm.pair}>
                    <Field label="Bank" htmlFor="pr-bank">
                      <Input id="pr-bank" value={draft.bank} onChange={(e) => set({ bank: e.target.value })} placeholder="e.g. Maybank" maxLength={120} />
                    </Field>
                    <Field label="Account number" htmlFor="pr-acct">
                      <Input id="pr-acct" mono inputMode="numeric" value={draft.accountNo} onChange={(e) => set({ accountNo: e.target.value })} maxLength={40} />
                    </Field>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className={df.type} data-on={draft.kind === 'direct_pay' ? 'true' : undefined}>
            <label className={df.typeHead}>
              <input type="radio" name="pr-kind" checked={draft.kind === 'direct_pay'} onChange={() => set({ kind: 'direct_pay', salary: null })} />
              <span>
                Pay a supplier directly
                <span className={df.typeNote}>Finance pays the supplier; you have not paid.</span>
              </span>
            </label>
            {draft.kind === 'direct_pay' ? (
              <div className={df.typeBody}>
                <Field label="Supplier" htmlFor="pr-supplier">
                  <Input id="pr-supplier" value={draft.supplier} onChange={(e) => set({ supplier: e.target.value })} placeholder="The name on their invoice" maxLength={200} />
                </Field>
                <div className={fm.pair}>
                  <Field label="Bank" htmlFor="pr-sbank">
                    <Input id="pr-sbank" value={draft.bank} onChange={(e) => set({ bank: e.target.value })} placeholder="e.g. CIMB" maxLength={120} />
                  </Field>
                  <Field label="Account number" htmlFor="pr-sacct">
                    <Input id="pr-sacct" mono inputMode="numeric" value={draft.accountNo} onChange={(e) => set({ accountNo: e.target.value })} maxLength={40} />
                  </Field>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {draft.kind ? (
          <>
            {/* ── 2. What was it for? ── */}
            <div className={df.typeLabel}>2 · What was it for?</div>
            <div className={`${fm.lines} ${c.part}`}>
              {/* Each item's words are its Description — the PV line's words when Finance pays it (the user: "确定他们放的那个是description"). */}
              <div className={c.itemsHead} aria-hidden="true">
                <span>Description</span>
                <span>Amount (RM)</span>
                <span />
              </div>
              {draft.items.map((it, i) => (
                <div key={i} className={fm.lineWrap}>
                  <div className={fm.lineRow} data-shape="item">
                    <input
                      className={fm.lineText}
                      value={it.description}
                      onChange={(e) => setItem(i, { description: e.target.value })}
                      placeholder="e.g. Canva team plan · Oct"
                      maxLength={PR_LIMITS.words}
                      aria-label={`Item ${i + 1} description`}
                    />
                    <input
                      className={fm.lineAmount}
                      inputMode="decimal"
                      value={it.amount}
                      onChange={(e) => setItem(i, { amount: e.target.value })}
                      placeholder="0.00"
                      aria-label={`Item ${i + 1} amount`}
                    />
                    <button
                      type="button"
                      className={fm.remove}
                      disabled={draft.items.length === 1}
                      onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((_, j) => j !== i) }))}
                      aria-label={`Remove item ${i + 1}`}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
              <div className={fm.linesFoot}>
                <button
                  type="button"
                  className={fm.addLine}
                  disabled={draft.items.length >= PR_LIMITS.items}
                  onClick={() => setDraft((d) => ({ ...d, items: [...d.items, emptyItem()] }))}
                >
                  + Add another item
                </button>
                <span className={fm.linesTotal}>RM {money(total)}</span>
              </div>
            </div>

            <Field label="Receipts or invoices">
              {filed.length + uploads.items.length > 0 ? (
                <div className={fm.files}>
                  {filed.map((f) => (
                    <div key={f.id} className={fm.file}>
                      <span className={fm.fileName} title={f.name}>
                        {f.name}
                      </span>
                      <span className={fm.fileSize}>{f.size ? fileSize(f.size) : ''}</span>
                      <button type="button" className={fm.fileRemove} onClick={() => setRemoved((r) => [...r, f.id])}>
                        Remove
                      </button>
                    </div>
                  ))}
                  {uploads.items.map((f) => (
                    <div key={f.key} className={fm.file}>
                      <span className={fm.fileName} title={f.name}>
                        {f.name}
                      </span>
                      <span className={c.fileState} data-state={f.state}>
                        {f.state === 'uploading' ? 'Uploading…' : f.state === 'failed' ? f.error ?? 'Not uploaded' : fileSize(f.size)}
                      </span>
                      <button type="button" className={fm.fileRemove} onClick={() => uploads.remove(f.key)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <input
                ref={input}
                type="file"
                multiple
                hidden
                accept={PR_ACCEPT}
                onChange={(e) => {
                  uploads.add(Array.from(e.target.files ?? []))
                  e.target.value = ''
                }}
              />
              <button type="button" className={fm.addFiles} disabled={uploads.full} onClick={() => input.current?.click()}>
                + Add receipts
              </button>
            </Field>

            {/* ── 3. Which pool pays? ── */}
            <div className={df.typeLabel}>3 · Which pool pays?</div>
            <div role="radiogroup" aria-label="Which pool pays?">
              <div className={df.type} data-on={draft.split === false ? 'true' : undefined}>
                <label className={df.typeHead}>
                  <input type="radio" name="pr-split" checked={draft.split === false} onChange={() => set({ split: false })} />
                  <span>
                    {ctx ? `${ctx.departmentName} pays all of it` : 'My department pays all of it'}
                    <span className={df.typeNote}>From your department’s pool.</span>
                  </span>
                </label>
              </div>
              <div className={df.type} data-on={draft.split === true ? 'true' : undefined}>
                <label className={df.typeHead}>
                  <input
                    type="radio"
                    name="pr-split"
                    checked={draft.split === true}
                    onChange={() => setDraft((d) => ({ ...d, split: true, shares: d.shares.length ? d.shares : [emptyShare()] }))}
                  />
                  <span>
                    Split it
                    <span className={df.typeNote}>Part of it is another department’s or a company’s — Finance decides whether to bill it back.</span>
                  </span>
                </label>
                {draft.split ? (
                  <div className={df.typeBody}>
                    <div className={fm.lines}>
                      {draft.shares.map((s, i) => (
                        <div key={i} className={fm.lineWrap}>
                          <div className={c.shareRow}>
                            <Select
                              round={12}
                              className={fm.lineSelect}
                              value={s.party}
                              onChange={(e) => setShare(i, { party: e.target.value as 'department' | 'company' | '', partyId: '' })}
                              aria-label={`Share ${i + 1}: a department or a company`}
                            >
                              <option value="">Who</option>
                              <option value="department">A department</option>
                              <option value="company">A company</option>
                            </Select>
                            <Select
                              round={12}
                              className={fm.lineSelect}
                              value={s.partyId}
                              disabled={!s.party}
                              onChange={(e) => setShare(i, { partyId: e.target.value })}
                              aria-label={`Share ${i + 1}: which`}
                            >
                              <option value="">{s.party === 'company' ? 'Which company' : 'Which department'}</option>
                              {partyOptions(s.party).map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </Select>
                            <input
                              className={fm.lineAmount}
                              inputMode="decimal"
                              value={s.amount}
                              onChange={(e) => setShare(i, { amount: e.target.value })}
                              placeholder="0.00"
                              aria-label={`Share ${i + 1} amount`}
                            />
                            <button
                              type="button"
                              className={fm.remove}
                              disabled={draft.shares.length === 1}
                              onClick={() => setDraft((d) => ({ ...d, shares: d.shares.filter((_, j) => j !== i) }))}
                              aria-label={`Remove share ${i + 1}`}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className={fm.linesFoot}>
                        <button
                          type="button"
                          className={fm.addLine}
                          disabled={draft.shares.length >= PR_LIMITS.shares}
                          onClick={() => setDraft((d) => ({ ...d, shares: [...d.shares, emptyShare()] }))}
                        >
                          + Add a share
                        </button>
                        <span className={fm.linesTotal} data-off={shared >= total && shared > 0 ? 'true' : undefined}>
                          {ctx?.departmentName ?? 'Yours'} pays RM {money(Math.max(0, Math.round((total - shared) * 100) / 100))}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : null}

        {problem ? <Hint danger={!!(loadError ?? error)}>{problem}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}
