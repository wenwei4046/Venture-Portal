'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DateField } from '@/components/finv/DateField'
import { DialogButton, DialogForm, Field, FinDialog, Hint, Input } from '@/components/finv/Dialog'
import fm from '@/components/finv/form.module.css'
import { Select } from '@/components/hrv/select'
import { baLimitWarning, baMissing, baTermsOf, type BaTermsFields } from '@/lib/ba'
import { dayWords, f2 } from '@/lib/fin-app/page-model'
import { stagedOnce } from '@/lib/storage/stage'
import type { BankOption, BaRow, CompanyOption, LimitRow } from '@/app/(portal)/ba/_components/BaView'
import { createBa, extractBaFromDocument, generateBaPv, setBaLimit, updateBa, uploadBaAttachment, type BaInput } from '@/app/(portal)/ba/actions'

// Invoice Financing's windows on the phone (2026-10-15, part 5c): the desktop
// page's — Record financing (and its Edit), the Calculator, Generate PV, a
// company's limit — in the kit's sheet, every field and rule kept: the bank's
// advice filed with the record (and read into the fields, where the reader is
// on), the borrower, the terms with what each rate comes to as it is typed,
// what the terms come to, the over-limit warning (it warns, never blocks) and
// what saving still needs. The rules are lib/ba's, the desktop form's too; the
// writes the page's own actions, answered in words.

const DAY_CHIPS = [30, 60, 90, 120, 180]
const DOC_TYPES = 'application/pdf,image/png,image/jpeg,image/webp,image/gif'

const pct = (rate: number) => String(parseFloat((rate * 100).toFixed(3)))
const emptyTerms = (today: string): BaTermsFields => ({ face: '', bankRatePct: '', startDate: today, endDate: '', days: '90', chargePct: '2.5', hcPct: '1.5' })
const termsOf = (r: BaRow): BaTermsFields => ({
  face: String(r.faceAmount),
  bankRatePct: r.bankAnnualRate > 0 ? pct(r.bankAnnualRate) : '',
  startDate: r.startDate,
  endDate: '',
  days: String(r.tenorDays),
  chargePct: pct(r.chargeRateMonthly),
  hcPct: pct(r.hcRateMonthly),
})

type Terms = ReturnType<typeof baTermsOf>

/** Face, the dates and the rates — each rate with what it comes to under it, as it is typed. */
function TermsFields({ id, f, set, c, today }: { id: string; f: BaTermsFields; set: (patch: Partial<BaTermsFields>) => void; c: Terms; today: string }) {
  const face = Number(f.face) || 0
  return (
    <>
      <Field label="Face amount" htmlFor={`${id}-face`}>
        <Input id={`${id}-face`} mono align="right" inputMode="decimal" placeholder="RM 0.00" value={f.face} onChange={(e) => set({ face: e.target.value })} />
        {face > 0 ? <Hint>RM {f2(face)}</Hint> : null}
      </Field>
      <div className={fm.duo}>
        <Field label="Start date" htmlFor={`${id}-start`}>
          <DateField id={`${id}-start`} value={f.startDate} onChange={(v) => set({ startDate: v })} today={today} />
        </Field>
        <Field label="Days" htmlFor={`${id}-days`}>
          {/* While a maturity date drives it, the days follow from the dates. */}
          <Input id={`${id}-days`} mono align="right" inputMode="numeric" value={f.endDate ? String(c.days) : f.days} onChange={(e) => set({ days: e.target.value, endDate: '' })} />
        </Field>
      </div>
      <div className={fm.more} role="group" aria-label="Days presets">
        {DAY_CHIPS.map((d) => (
          <button key={d} type="button" className={fm.moreBtn} aria-pressed={!f.endDate && f.days === String(d)} onClick={() => set({ days: String(d), endDate: '' })}>
            {d} days
          </button>
        ))}
      </div>
      <Field label="Maturity" htmlFor={`${id}-end`}>
        <DateField
          id={`${id}-end`}
          value={f.endDate}
          onChange={(v) => set({ endDate: v })}
          today={today}
          emptyText={c.maturity ? `${dayWords(c.maturity)} · from start + days` : 'From start + days'}
          onClear={() => set({ endDate: '' })}
        />
        {f.endDate ? <Hint>Set by date · days follow</Hint> : null}
      </Field>
      <Field label="Bank rate · %/yr" htmlFor={`${id}-bank`}>
        <Input id={`${id}-bank`} mono align="right" inputMode="decimal" placeholder="4.00" value={f.bankRatePct} onChange={(e) => set({ bankRatePct: e.target.value })} />
        <Hint>= RM {f2(c.bankInterest)} · ref only</Hint>
      </Field>
      <div className={fm.duo}>
        <Field label="Charge borrower · %/mo" htmlFor={`${id}-charge`}>
          <Input id={`${id}-charge`} mono align="right" inputMode="decimal" value={f.chargePct} onChange={(e) => set({ chargePct: e.target.value })} />
          <Hint>= RM {f2(c.chargeToBorrower)}</Hint>
        </Field>
        <Field label="To HC · %/mo" htmlFor={`${id}-hc`}>
          <Input id={`${id}-hc`} mono align="right" inputMode="decimal" value={f.hcPct} onChange={(e) => set({ hcPct: e.target.value })} />
          <Hint>= RM {f2(c.oweToHc)}</Hint>
        </Field>
      </div>
    </>
  )
}

/** What the terms come to: the days and maturity, the charge (bill · 5028), what HC is owed (pay · 6001), HV's margin, and the reference lines. */
function Results({ c }: { c: Terms }) {
  const row = (label: string, value: string, note?: string) => (
    <div className={fm.summaryRow}>
      <span className={fm.summaryLabel}>
        {label}
        {note ? <span className={fm.tag}>{note}</span> : null}
      </span>
      <span className={fm.summaryValue}>{value}</span>
    </div>
  )
  return (
    <div className={fm.summary} aria-label="What the terms come to">
      <div className={fm.summaryRow} data-head="true">
        <span className={fm.summaryLabel}>
          {c.days} days · matures {c.maturity ? dayWords(c.maturity) : '—'}
        </span>
      </div>
      {row('Charge borrower', f2(c.chargeToBorrower), 'bill · 5028')}
      {row('Owe HC', f2(c.oweToHc), 'pay · 6001')}
      {row('Collect / repay HC', `${f2(c.collectTotal)} / ${f2(c.repayHcTotal)}`)}
      {row("Bank interest (HC's cost, ref)", f2(c.bankInterest))}
      <div className={fm.summaryTotal}>
        <span className={fm.summaryTotalLabel}>HV margin</span>
        <span className={fm.summaryTotalValue}>{c.margin < 0 ? `(${f2(-c.margin)})` : f2(c.margin)}</span>
      </div>
    </div>
  )
}

/** Record financing, or Edit one: the bank's advice, the borrower, the terms — saved with its document. */
export function BaFormSheet({
  open,
  editing,
  companies,
  limits,
  autoRead,
  today,
  onClose,
  onDone,
}: {
  open: boolean
  editing: BaRow | null
  companies: CompanyOption[]
  limits: LimitRow[]
  /** The document reader is set up (ANTHROPIC_API_KEY) — Auto-read is offered. */
  autoRead: boolean
  today: string
  onClose: () => void
  onDone: (id: string, said: string) => void
}) {
  const [f, setF] = useState<BaTermsFields>(emptyTerms(today))
  const [baNo, setBaNo] = useState('')
  const [bankName, setBankName] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [borrowerName, setBorrowerName] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  // Read, then kept on save: one staged copy of the bank's advice for both (lib/storage/stage.ts, 2026-10-23).
  const [stage] = useState(() => stagedOnce())
  const fileRef = useRef<HTMLInputElement>(null)
  const [readNote, setReadNote] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)

  // Opened: the form starts on the financing being edited, or blank.
  useEffect(() => {
    if (!open) return
    setF(editing ? termsOf(editing) : emptyTerms(today))
    setBaNo(editing?.baNo ?? '')
    setBankName(editing?.bankName ?? '')
    setCompanyId(editing?.borrowerCompanyId ?? '')
    setBorrowerName(editing && !editing.borrowerCompanyId ? editing.borrower : '')
    setNotes(editing?.notes ?? '')
    setFile(null)
    setReadNote(null)
    setError(null)
    setTried(false)
  }, [open, editing, today])

  const c = useMemo(() => baTermsOf(f), [f])
  const set = (patch: Partial<BaTermsFields>) => setF((prev) => ({ ...prev, ...patch }))
  const warning = baLimitWarning({ companyId, face: Number(f.face) || 0, limits, editing })
  const missing = baMissing({ face: Number(f.face) || 0, days: c.days, baNo, borrowerCompanyId: companyId, borrowerName })

  const read = async () => {
    if (!file || reading) return
    setError(null)
    setReadNote(null)
    setReading(true)
    const fd = new FormData()
    try {
      fd.set('file', await stage(file))
      const r = await extractBaFromDocument(fd)
      if (r.error) return setError(r.error)
      const x = r.fields
      if (!x) return
      // Prefill ONLY what the reader saw — the user reviews before saving.
      if (x.baNo) setBaNo(x.baNo)
      if (x.bankName) setBankName(x.bankName)
      if (x.borrowerName) setBorrowerName(x.borrowerName)
      setF((prev) => ({
        ...prev,
        face: x.faceAmount != null ? String(x.faceAmount) : prev.face,
        bankRatePct: x.bankAnnualRatePct != null ? String(x.bankAnnualRatePct) : prev.bankRatePct,
        startDate: x.startDate ?? prev.startDate,
        endDate: x.maturityDate ?? prev.endDate,
        days: x.maturityDate ? prev.days : x.tenorDays != null ? String(x.tenorDays) : prev.days,
      }))
      setReadNote(`Read ✓ — check every field before saving${x.remarks ? ` · reader notes: ${x.remarks}` : ''}`)
    } catch {
      setError('The document could not be read just now. Try again, or fill the fields in.')
    } finally {
      setReading(false)
    }
  }

  const save = async () => {
    setTried(true)
    if (missing.length > 0 || busy) return
    setBusy(true)
    setError(null)
    const input: BaInput = {
      baNo,
      bankName,
      faceAmount: Number(f.face) || 0,
      bankAnnualRatePct: Number(f.bankRatePct) || 0,
      startDate: f.startDate,
      tenorDays: c.days,
      chargeRatePctMonthly: Number(f.chargePct) || 0,
      hcRatePctMonthly: Number(f.hcPct) || 0,
      borrowerCompanyId: companyId || null,
      borrowerName,
      notes,
    }
    try {
      let id: string | null = null
      if (editing) {
        const r = await updateBa(editing.id, input)
        if (r.error) return setError(r.error)
        id = editing.id
      } else {
        const r = await createBa(input)
        if (r.error) return setError(r.error)
        id = r.id ?? null
      }
      if (!id) return setError('Saved, but the financing could not be found. Refresh the page.')
      if (file) {
        const fd = new FormData()
        const up = await stage(file).then(
          (line) => {
            fd.set('file', line)
            return uploadBaAttachment(id, fd)
          },
          (err: unknown) => ({ error: err instanceof Error ? err.message : 'the document could not be sent' }),
        )
        if (up.error) {
          // Saved: say what did not go, and leave — saving again would make it twice.
          onDone(id, `Saved — the document did not upload: ${up.error}`)
          return
        }
      }
      onDone(id, editing ? 'Financing saved' : 'Financing recorded')
    } catch {
      setError('That did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FinDialog
      open={open}
      onClose={onClose}
      title={editing ? 'Edit financing' : 'Record financing'}
      sub={editing ? `${editing.baNo ?? editing.id.slice(0, 8)} · saving overwrites it` : 'Invoice Financing'}
      locked={busy || reading}
      tall
    >
      <DialogForm
        onSubmit={save}
        buttons={
          <>
            <DialogButton onClick={onClose} disabled={busy}>
              Cancel
            </DialogButton>
            <DialogButton type="submit" kind="primary" off={missing.length > 0} disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Save financing'}
            </DialogButton>
          </>
        }
      >
        <Field label="Bank advice">
          <div className={fm.files}>
            <div className={fm.file}>
              <span className={fm.fileName}>{file?.name ?? 'No file chosen'}</span>
              {file ? (
                <button type="button" className={fm.fileRemove} onClick={() => setFile(null)}>
                  Remove
                </button>
              ) : null}
            </div>
          </div>
          <div className={fm.more}>
            <button type="button" className={fm.moreBtn} onClick={() => fileRef.current?.click()}>
              Choose file
            </button>
            {autoRead ? (
              <button type="button" className={fm.moreBtn} disabled={!file || reading} onClick={read}>
                {reading ? 'Reading…' : 'Auto-read →'}
              </button>
            ) : null}
          </div>
          <input
            ref={fileRef}
            type="file"
            hidden
            aria-label="Bank advice file"
            accept={DOC_TYPES}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null)
              e.target.value = ''
            }}
          />
          {readNote ? <Hint>{readNote}</Hint> : null}
        </Field>
        <div className={fm.duo}>
          <Field label="BA ref #" htmlFor="ba-ref">
            <Input id="ba-ref" mono placeholder="e.g. BA-2610-02" value={baNo} onChange={(e) => setBaNo(e.target.value)} />
          </Field>
          <Field label="Bank" htmlFor="ba-bank">
            <Input id="ba-bank" placeholder="e.g. Maybank Islamic" value={bankName} onChange={(e) => setBankName(e.target.value)} />
          </Field>
        </div>
        <Field label="Borrower" htmlFor="ba-company">
          <Select id="ba-company" round={12} className={fm.select} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">— pick or type a name below —</option>
            {companies.map((co) => (
              <option key={co.id} value={co.id}>
                {co.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Or free text" htmlFor="ba-free">
          <Input id="ba-free" placeholder="Name if not a group company" value={borrowerName} onChange={(e) => setBorrowerName(e.target.value)} />
        </Field>
        <TermsFields id="ba-terms" f={f} set={set} c={c} today={today} />
        <Field label="Notes" htmlFor="ba-notes">
          <Input id="ba-notes" placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Results c={c} />
        {warning ? <Hint danger>⚠ {warning} — saving is still allowed.</Hint> : null}
        {error ? <Hint danger>{error}</Hint> : missing.length > 0 ? <Hint danger={tried}>To save, fill in {missing.join(', ')}.</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}

/** The financing calculator — the form's terms and what they come to, nothing saved. */
export function BaCalcSheet({ open, today, onClose }: { open: boolean; today: string; onClose: () => void }) {
  const [f, setF] = useState<BaTermsFields>(emptyTerms(today))
  useEffect(() => {
    if (open) setF(emptyTerms(today))
  }, [open, today])
  const c = useMemo(() => baTermsOf(f), [f])
  return (
    <FinDialog open={open} onClose={onClose} title="Financing calculator" tall>
      <DialogForm
        onSubmit={onClose}
        buttons={
          <DialogButton type="submit" kind="primary">
            Done
          </DialogButton>
        }
      >
        <TermsFields id="calc" f={f} set={(patch) => setF((prev) => ({ ...prev, ...patch }))} c={c} today={today} />
        <Results c={c} />
      </DialogForm>
    </FinDialog>
  )
}

/** Generate PV — the interest owed to HOUZS Century, paid from a bank on a day, as a draft voucher. */
export function BaPvSheet({
  target,
  banks,
  today,
  onClose,
  onDone,
}: {
  target: { id: string; ref: string; owe: number; maturity: string } | null
  banks: BankOption[]
  today: string
  onClose: () => void
  onDone: (said: string) => void
}) {
  const [bankId, setBankId] = useState('')
  const [date, setDate] = useState(today)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!target) return
    setBankId(banks[0]?.id ?? '')
    setDate(target.maturity)
    setError(null)
  }, [target, banks])

  const go = async () => {
    if (!target || !bankId || busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await generateBaPv(target.id, bankId, date)
      if (r.error) return setError(r.error)
      onDone(`PV ${r.voucherNo ?? ''} created as draft — submit it for approval in Payments`)
    } catch {
      setError('That did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FinDialog open={!!target} onClose={onClose} title={`Generate PV — ${target?.ref ?? ''}`} sub="6001 Interest Expense - BA · venture pool" locked={busy}>
      <DialogForm
        onSubmit={go}
        buttons={
          <>
            <DialogButton onClick={onClose} disabled={busy}>
              Cancel
            </DialogButton>
            <DialogButton type="submit" kind="primary" off={!bankId} disabled={busy}>
              {busy ? 'Creating…' : 'Create PV (draft)'}
            </DialogButton>
          </>
        }
      >
        <div className={fm.summary}>
          <div className={fm.summaryTotal}>
            <span className={fm.summaryTotalLabel}>Interest to HOUZS Century</span>
            <span className={fm.summaryTotalValue}>RM {f2(target?.owe ?? 0)}</span>
          </div>
        </div>
        <Field label="Pay from bank" htmlFor="ba-pv-bank">
          <Select id="ba-pv-bank" round={12} className={fm.select} value={bankId} onChange={(e) => setBankId(e.target.value)}>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Payment date" htmlFor="ba-pv-date">
          <DateField id="ba-pv-date" value={date} onChange={setDate} today={today} />
        </Field>
        {error ? <Hint danger>{error}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}

/** A company's BA limit — one with a card (Edit limit), or another company's first (Set a limit). */
export function BaLimitSheet({
  target,
  others,
  onClose,
  onDone,
}: {
  /** A company's card, or `'new'` — pick one of `others`. */
  target: { companyId: string; label: string; limit: number } | 'new' | null
  others: Array<{ id: string; label: string }>
  onClose: () => void
  onDone: (said: string) => void
}) {
  const [companyId, setCompanyId] = useState('')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!target) return
    setCompanyId(target === 'new' ? '' : target.companyId)
    setDraft(target !== 'new' && target.limit > 0 ? String(target.limit) : '')
    setError(null)
  }, [target])

  const v = Number(draft)
  const ok = !!companyId && draft.trim() !== '' && !Number.isNaN(v) && v >= 0
  const save = async () => {
    if (busy) return
    if (!ok) return setError(target === 'new' ? 'Pick a company and a limit ≥ 0' : 'Limit must be a number ≥ 0')
    setBusy(true)
    setError(null)
    try {
      const r = await setBaLimit(companyId, v)
      if (r?.error) return setError(r.error)
      onDone('Limit saved')
    } catch {
      setError('That did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const name: ReactNode = target && target !== 'new' ? target.label : 'Another company'
  return (
    <FinDialog open={!!target} onClose={onClose} title={target === 'new' ? 'Set a limit' : 'Edit limit'} sub={name} locked={busy}>
      <DialogForm
        onSubmit={save}
        buttons={
          <>
            <DialogButton onClick={onClose} disabled={busy}>
              Cancel
            </DialogButton>
            <DialogButton type="submit" kind="primary" off={!ok} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </DialogButton>
          </>
        }
      >
        {target === 'new' ? (
          <Field label="Company" htmlFor="ba-lim-co">
            <Select id="ba-lim-co" round={12} className={fm.select} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">— pick a company —</option>
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="BA limit · RM" htmlFor="ba-lim-v">
          <Input id="ba-lim-v" mono align="right" inputMode="decimal" placeholder="0.00" value={draft} onChange={(e) => setDraft(e.target.value)} />
        </Field>
        {error ? <Hint danger>{error}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}
