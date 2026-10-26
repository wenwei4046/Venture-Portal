'use client'

import { useEffect, useState } from 'react'
import { DateField } from '@/components/finv/DateField'
import { DialogButton, DialogForm, Field, FinDialog, Hint, Input, TextArea } from '@/components/finv/Dialog'
import { neededSentence, num } from '@/components/finv/form-words'
import fm from '@/components/finv/form.module.css'
import { Select } from '@/components/hrv/select'
import { typeLabel, type AccountType } from '@/lib/coa'
import { amendDraftOf, amendFormData, amendsNothing, type AmendDraft, type AmendTerms, type DealSide } from '@/lib/fund-amend'
import { sourceEditForm, sourceEditsNothing, type SourceEditFields } from '@/lib/fund-source-edit'
import { amendLoanInWords } from '@/app/(portal)/fund-out/actions'
import { amendFundSourceInWords, openSourceEditOptions, updateFundSourceInWords } from '@/app/(portal)/fund-in/actions'
import type { NewSourceOptions } from '@/app/(portal)/fund-in/_lib/new-source-options'

// A deal's terms in the Finance phone app (2026-10-16, part E4b — the pages
// its record opened on the portal, each a sheet now): *Amend terms* — the
// edit page's two ways (from a month on; the whole deal again, a correction),
// its fields in the app's words — and a fund source still waiting for the
// Principal, *Edit*. Each sends only what was changed (lib/fund-amend,
// lib/fund-source-edit) to the page's own action, answered in words.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthWords = (ym: string) => (/^\d{4}-\d{2}$/.test(ym) ? `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}` : ym)
const ACCOUNT_TYPES: AccountType[] = ['liability', 'equity']

/** A whole number of months from 1 to 120, or blank. */
const monthsProblem = (raw: string, blankOk: boolean) => {
  const t = raw.trim()
  if (t === '') return blankOk ? null : 'The months are needed.'
  const n = Number(t)
  return Number.isInteger(n) && n >= 1 && n <= 120 ? null : 'The months are a whole number from 1 to 120.'
}
const rateProblem = (raw: string) => {
  const t = raw.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 && n < 100 ? null : 'The rate is from 0 to under 100% a month.'
}

/**
 * Amend terms — a booked deal's terms, from a month on or the whole deal again (Treasury · Approve). Without Approve
 * (Treasury · Edit, 2026-10-24) a from-month change is filed for the Principal and applied once approved.
 */
export function AmendTermsSheet({
  open,
  onClose,
  onDone,
  side,
  id,
  party,
  terms,
  direct = true,
  today,
}: {
  open: boolean
  onClose: () => void
  onDone: (message: string) => void
  side: DealSide
  id: string
  party: string
  terms: AmendTerms
  /** Treasury · Approve: the change applies now. Without it the change is filed for the Principal. */
  direct?: boolean
  /** The office's today. */
  today: string
}) {
  const out = side === 'out'
  const [d, setD] = useState<AmendDraft>(() => amendDraftOf(terms))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<AmendDraft>) => {
    setError(null)
    setD((prev) => ({ ...prev, ...patch }))
  }
  const reset = () => {
    setD(amendDraftOf(terms))
    setError(null)
  }
  const close = () => {
    if (busy) return
    onClose()
    reset()
  }

  const from = d.mode === 'from'
  const sent = amendFormData(side, id, terms, d)
  const problem = from
    ? !/^\d{4}-\d{2}$/.test(d.effectiveFrom)
      ? 'Pick the month it takes effect from.'
      : (rateProblem(d.ratePct) ?? (d.noFixedTerm ? null : monthsProblem(d.remaining, true)))
    : (rateProblem(d.ratePct) ??
      monthsProblem(d.months, !out) ??
      (amendsNothing(sent) ? 'Nothing is changed yet.' : null))

  const save = async () => {
    if (problem || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = out ? await amendLoanInWords(d.mode, sent) : await amendFundSourceInWords(d.mode, sent)
      if (!res.ok) {
        setError(res.reason)
        return
      }
      const was = d
      onClose()
      reset()
      onDone(
        res.filed
          ? `Terms change from ${monthWords(was.effectiveFrom)} filed — waiting for the Principal`
          : was.mode === 'from'
            ? `New terms from ${monthWords(was.effectiveFrom)}`
            : 'Terms saved — the whole deal recalculated',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The terms could not be changed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FinDialog
      open={open}
      onClose={close}
      title="Amend terms"
      sub={terms.termsFrom ? `${party} · terms since ${monthWords(terms.termsFrom)}` : party}
      locked={busy}
      tall
    >
      <DialogForm
        onSubmit={() => void save()}
        buttons={
          <>
            <DialogButton disabled={busy} onClick={close}>
              Cancel
            </DialogButton>
            <DialogButton kind="primary" off={!!problem} disabled={busy} onClick={() => void save()}>
              {busy ? (direct ? 'Saving…' : 'Filing…') : !direct ? 'Submit for approval' : from ? `Apply from ${monthWords(d.effectiveFrom)}` : 'Save'}
            </DialogButton>
          </>
        }
      >
        {/* The whole deal again is the Principal's own (a correction); a filed change is a from-month one. */}
        {direct ? (
          <Field label="Takes effect" htmlFor="am-mode">
            <Select id="am-mode" round={12} className={fm.select} value={d.mode} onChange={(e) => set({ mode: e.target.value as AmendDraft['mode'] })}>
              <option value="from">From a month on</option>
              <option value="whole">The whole deal again — a correction</option>
            </Select>
          </Field>
        ) : (
          <Hint>Filed for the Principal — it applies once approved in Approvals; the terms stay as they are till then.</Hint>
        )}
        {from ? (
          <div className={fm.duo}>
            <Field label="Effective from" htmlFor="am-from">
              <Input id="am-from" type="month" mono value={d.effectiveFrom} onChange={(e) => set({ effectiveFrom: e.target.value })} />
            </Field>
            <Field label="Rate % /mo" htmlFor="am-rate">
              <Input id="am-rate" mono align="right" inputMode="decimal" value={d.ratePct} onChange={(e) => set({ ratePct: e.target.value })} placeholder="0.000" />
            </Field>
          </div>
        ) : (
          <div className={fm.duo}>
            <Field label="Rate % /mo" htmlFor="am-rate">
              <Input id="am-rate" mono align="right" inputMode="decimal" value={d.ratePct} onChange={(e) => set({ ratePct: e.target.value })} placeholder="0.000" />
            </Field>
            <Field label="Term · months" htmlFor="am-months">
              <Input id="am-months" mono align="right" inputMode="numeric" value={d.months} onChange={(e) => set({ months: e.target.value })} placeholder={out ? '' : 'No fixed term'} />
            </Field>
          </div>
        )}
        {from ? (
          <>
            <Field label="Months left" htmlFor="am-remaining">
              <Input
                id="am-remaining"
                mono
                align="right"
                inputMode="numeric"
                disabled={d.noFixedTerm}
                value={d.noFixedTerm ? '' : d.remaining}
                onChange={(e) => set({ remaining: e.target.value })}
                placeholder="Maturity stays"
              />
            </Field>
            <div className={fm.checks}>
              <label className={fm.check}>
                <input type="checkbox" checked={d.noFixedTerm} onChange={(e) => set({ noFixedTerm: e.target.checked })} />
                <span className={fm.checkName}>No fixed term from then</span>
              </label>
              <label className={fm.check}>
                <input type="checkbox" checked={d.interestOnOriginal} onChange={(e) => set({ interestOnOriginal: e.target.checked, interestKeepsBase: false })} />
                <span className={fm.checkName}>Interest on the original principal</span>
              </label>
              <label className={fm.check}>
                <input type="checkbox" checked={d.interestKeepsBase} onChange={(e) => set({ interestKeepsBase: e.target.checked, interestOnOriginal: false })} />
                <span className={fm.checkName}>Interest on the principal it was on before</span>
              </label>
              <label className={fm.check}>
                <input type="checkbox" checked={d.compound} onChange={(e) => set({ compound: e.target.checked })} />
                <span className={fm.checkName}>Compound interest</span>
              </label>
            </div>
            <Field label="Reason" htmlFor="am-reason">
              <Input id="am-reason" value={d.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="e.g. rate renegotiated, term extended" />
            </Field>
          </>
        ) : (
          <>
            <Field label={out ? 'Disbursed' : 'Repayment starts'}>
              <DateField value={d.start} onChange={(v) => set({ start: v })} today={today} label={out ? 'Disbursed' : 'Repayment starts'} />
            </Field>
            <div className={fm.checks}>
              <label className={fm.check}>
                <input type="checkbox" checked={d.compound} onChange={(e) => set({ compound: e.target.checked })} />
                <span className={fm.checkName}>Compound interest</span>
              </label>
            </div>
            <Field label={out ? 'Repayment terms' : 'Notes'} htmlFor="am-text">
              <TextArea id="am-text" rows={2} value={d.text} onChange={(e) => set({ text: e.target.value })} />
            </Field>
          </>
        )}
        {error ? <Hint danger>{error}</Hint> : problem && problem !== 'Nothing is changed yet.' ? <Hint>{problem}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}

/** A fund source still waiting for the Principal, edited (Treasury · Edit) — its type and who it is from stay. */
export function EditSourceSheet({
  open,
  onClose,
  onDone,
  id,
  party,
  kind,
  fields,
  today,
}: {
  open: boolean
  onClose: () => void
  onDone: (message: string) => void
  id: string
  party: string
  /** "Subsidiary", "Director loan" … */
  kind: string
  fields: SourceEditFields
  today: string
}) {
  const [opts, setOpts] = useState<Pick<NewSourceOptions, 'accounts' | 'banks'> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [f, setF] = useState<SourceEditFields>(fields)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The lists are read when the sheet opens — never with every visit to the deal.
  useEffect(() => {
    if (!open || opts) return
    let live = true
    setLoadError(null)
    openSourceEditOptions().then(
      (res) => live && setOpts(res),
      () => live && setLoadError('The lists could not be read. Close and try again.'),
    )
    return () => {
      live = false
    }
  }, [open, opts])

  // The bank it lands in, unset, is the primary's at approval — the select opens on it, as the edit page's does.
  const primary = opts ? (opts.banks.find((b) => b.is_primary)?.id ?? opts.banks[0]?.id ?? '') : ''
  const base: SourceEditFields = { ...fields, bankId: fields.bankId || primary }
  const now: SourceEditFields = { ...f, bankId: f.bankId || primary }
  const set = (patch: Partial<SourceEditFields>) => {
    setError(null)
    setF((prev) => ({ ...prev, ...patch }))
  }
  const reset = () => {
    setF(fields)
    setError(null)
  }
  const close = () => {
    if (busy) return
    onClose()
    reset()
  }

  const sent = sourceEditForm(id, base, now)
  const need: string[] = []
  if (!(num(f.amount) > 0)) need.push('an amount')
  if (f.ratePct.trim() === '') need.push('a rate')
  if (!f.effectiveDate) need.push('the date')
  if (!f.repaymentDate) need.push('the first repayment')
  const problem =
    neededSentence(need, true) ??
    rateProblem(f.ratePct) ??
    monthsProblem(f.months, true) ??
    (f.effectiveDate > today
      ? 'The date cannot be in the future — interest runs from the day it came in.'
      : f.repaymentDate < f.effectiveDate
        ? 'The first repayment is on or after the day it came in.'
        : sourceEditsNothing(sent)
          ? 'Nothing is changed yet.'
          : null)
  const ok = problem === null && !!opts && !loadError

  const save = async () => {
    if (!ok || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await updateFundSourceInWords(sent)
      if (!res.ok) {
        setError(res.reason)
        return
      }
      onClose()
      reset()
      onDone(`Fund source from ${party} saved — still waiting for approval`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The fund source could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const accounts = opts?.accounts ?? []
  return (
    <FinDialog open={open} onClose={close} title="Edit fund source" sub={`${kind} · ${party}`} locked={busy} tall>
      <DialogForm
        onSubmit={() => void save()}
        buttons={
          <>
            <DialogButton disabled={busy} onClick={close}>
              Cancel
            </DialogButton>
            <DialogButton kind="primary" off={!ok} disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save'}
            </DialogButton>
          </>
        }
      >
        <div className={fm.duo}>
          <Field label="Amount RM" htmlFor="es-amount">
            <Input id="es-amount" mono align="right" inputMode="decimal" value={f.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="0.00" />
          </Field>
          <Field label="Rate % /mo" htmlFor="es-rate">
            <Input id="es-rate" mono align="right" inputMode="decimal" value={f.ratePct} onChange={(e) => set({ ratePct: e.target.value })} placeholder="0.000" />
          </Field>
        </div>
        <Field label="Into bank" htmlFor="es-bank">
          <Select id="es-bank" round={12} className={fm.select} value={now.bankId} onChange={(e) => set({ bankId: e.target.value })}>
            {!opts || opts.banks.length === 0 ? <option value="">{opts ? 'No active bank account' : '…'}</option> : null}
            {(opts?.banks ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {`${b.bank_name} — ${b.account_number}${b.is_primary ? ' (primary)' : ''}`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date">
          <DateField value={f.effectiveDate} onChange={(v) => set({ effectiveDate: v })} today={today} label="Date" />
        </Field>
        <div className={fm.duo}>
          <Field label="Term · months" htmlFor="es-months">
            <Input id="es-months" mono align="right" inputMode="numeric" value={f.months} onChange={(e) => set({ months: e.target.value })} placeholder="No fixed term" />
          </Field>
          <Field label="First repayment">
            <DateField value={f.repaymentDate} onChange={(v) => set({ repaymentDate: v })} today={today} label="First repayment" />
          </Field>
        </div>
        <Field label="Account" htmlFor="es-account">
          <Select id="es-account" round={12} className={fm.select} value={f.accountCode} onChange={(e) => set({ accountCode: e.target.value })}>
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
        <Field label="Notes" htmlFor="es-notes">
          <TextArea id="es-notes" rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Context, an email, an approval reference…" />
        </Field>
        {loadError ? <Hint danger>{loadError}</Hint> : error ? <Hint danger>{error}</Hint> : problem && problem !== 'Nothing is changed yet.' ? <Hint>{problem}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}
