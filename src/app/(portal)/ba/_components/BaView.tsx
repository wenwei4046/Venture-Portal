'use client'

import { useId, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { backdropDismiss } from '@/components/modal-dismiss'
import dayjs from 'dayjs'
import { officeToday } from '@/lib/office-time'
import { baLimitWarning, baMissing, baTermsOf, calcBa, type BaTermsFields } from '@/lib/ba'
import Link from 'next/link'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import { stagedOnce, stageInto } from '@/lib/storage/stage'
import SortableTable from '@/components/SortableTable'
import { useRowLinks } from '@/components/row-links'
import type { RowMenuItem } from '@/components/RowMenu'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import {
  createBa,
  updateBa,
  deleteBa,
  setBaStatus,
  setBaLimit,
  uploadBaAttachment,
  getBaAttachmentUrl,
  deleteBaAttachment,
  extractBaFromDocument,
  generateBaPv,
  type BaInput,
} from '../actions'
import BillInterestDialog from './BillInterestDialog'

export interface BaRow {
  id: string
  baNo: string | null
  bankName: string | null
  faceAmount: number
  bankAnnualRate: number
  startDate: string
  tenorDays: number
  maturityDate: string
  chargeRateMonthly: number
  hcRateMonthly: number
  borrower: string
  borrowerCompanyId: string | null
  status: 'active' | 'settled' | 'cancelled'
  notes: string | null
  interestInvoice: { no: string | null; status: string } | null
  interestPv: { no: string | null; status: string } | null
  attachments: Array<{ id: string; name: string }>
}

export interface CompanyOption {
  id: string
  label: string
}

export interface BankOption {
  id: string
  label: string
}

export interface LimitRow {
  companyId: string
  label: string
  limit: number
  used: number
}

const money = (n: number) => formatMoneyBare(n)

/** A financing's charge, what HC is owed, the margin — lib/ba, as everywhere. */
const calcOf = (r: BaRow) =>
  calcBa({
    face: r.faceAmount,
    bankAnnualRate: r.bankAnnualRate,
    days: r.tenorDays,
    chargeRateMonthly: r.chargeRateMonthly,
    hcRateMonthly: r.hcRateMonthly,
  })

// ── Shared calculator fields (used by the modal and the record form) ────────
// The rules are lib/ba's (`baTermsOf`), the Finance phone app's sheet's too.
type CalcFields = BaTermsFields

const emptyCalc = (): CalcFields => ({
  face: '',
  bankRatePct: '',
  startDate: officeToday(),
  endDate: '',
  days: '90',
  chargePct: '2.5',
  hcPct: '1.5',
})

function useCalc(fields: CalcFields) {
  return useMemo(() => baTermsOf(fields), [fields])
}

// ── The form's pieces (2026-10-10, the user's Claude Design handoff — its
// financing form): a six-column grid, the label over each field and a line
// under it; the box carries an RM before it or a unit after it. ─────────────

function Field({
  id,
  label,
  span,
  below,
  belowTone,
  children,
}: {
  id: string
  label: string
  span: 2 | 3 | 6
  below?: ReactNode
  belowTone?: 'in' | 'owe'
  children: ReactNode
}) {
  return (
    <div className={`fund-f fund-s${span}`}>
      <label className="fund-f-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {below ? <div className={`fund-f-below${belowTone ? ` fund-${belowTone}` : ''}`}>{below}</div> : null}
    </div>
  )
}

function BoxInput({
  id,
  value,
  onChange,
  type = 'text',
  prefix,
  suffix,
  big = false,
  mono = false,
  right = false,
  placeholder,
  inputMode,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  type?: string
  prefix?: string
  suffix?: string
  big?: boolean
  mono?: boolean
  right?: boolean
  placeholder?: string
  inputMode?: 'decimal' | 'numeric'
}) {
  return (
    <div className={`fund-box${big ? ' fund-big' : ''}`}>
      {prefix ? <span className="fund-box-pre">{prefix}</span> : null}
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${mono ? 'mono' : ''}${right ? ' text-right' : ''}`}
      />
      {suffix ? <span className="fund-box-suf">{suffix}</span> : null}
    </div>
  )
}

const DAY_CHIPS = [30, 60, 90, 120, 180]

/** Face amount, the dates and the rates — the calculator's fields, each rate
 *  with what it comes to under it, as it is typed. */
function TermsFields({ uid, f, set, c }: { uid: string; f: CalcFields; set: (patch: Partial<CalcFields>) => void; c: ReturnType<typeof useCalc> }) {
  const face = Number(f.face) || 0
  return (
    <>
      <Field id={`${uid}-face`} label="Face amount" span={6} below={face > 0 ? `RM ${money(face)}` : null}>
        <BoxInput id={`${uid}-face`} big prefix="RM" mono right placeholder="0.00" inputMode="decimal" value={f.face} onChange={(v) => set({ face: v })} />
      </Field>
      <Field id={`${uid}-start`} label="Start date" span={2}>
        <BoxInput id={`${uid}-start`} type="date" mono value={f.startDate} onChange={(v) => set({ startDate: v })} />
      </Field>
      <Field id={`${uid}-days`} label="Days" span={2}>
        {/* While a maturity date drives it, the days follow from the dates. */}
        <BoxInput
          id={`${uid}-days`}
          suffix="days"
          mono
          right
          inputMode="numeric"
          value={f.endDate ? String(c.days) : f.days}
          onChange={(v) => set({ days: v, endDate: '' })}
        />
        <div className="fund-chips" role="group" aria-label="Days presets">
          {DAY_CHIPS.map((d) => {
            const on = !f.endDate && f.days === String(d)
            return (
              <button key={d} type="button" aria-pressed={on} className={on ? 'fund-on' : undefined} onClick={() => set({ days: String(d), endDate: '' })}>
                {d}
              </button>
            )
          })}
        </div>
      </Field>
      <Field id={`${uid}-end`} label="Maturity" span={2} below={f.endDate ? 'set by date · days follow' : 'from start + days'}>
        <BoxInput id={`${uid}-end`} type="date" mono value={f.endDate || c.maturity} onChange={(v) => set({ endDate: v })} />
      </Field>
      <Field id={`${uid}-bank`} label="Bank rate" span={2} below={`= RM ${money(c.bankInterest)} · ref only`}>
        <BoxInput id={`${uid}-bank`} suffix="%/yr" mono right placeholder="4.00" inputMode="decimal" value={f.bankRatePct} onChange={(v) => set({ bankRatePct: v })} />
      </Field>
      <Field id={`${uid}-charge`} label="Charge borrower" span={2} below={`= RM ${money(c.chargeToBorrower)}`} belowTone="in">
        <BoxInput id={`${uid}-charge`} suffix="%/mo" mono right inputMode="decimal" value={f.chargePct} onChange={(v) => set({ chargePct: v })} />
      </Field>
      <Field id={`${uid}-hc`} label="To HC" span={2} below={`= RM ${money(c.oweToHc)}`} belowTone="owe">
        <BoxInput id={`${uid}-hc`} suffix="%/mo" mono right inputMode="decimal" value={f.hcPct} onChange={(v) => set({ hcPct: v })} />
      </Field>
    </>
  )
}

/** What the terms come to: the days, the charge (bill · 5028) and what HC is
 *  owed (pay · 6001) as tiles, HV's margin in a framed box, and the reference
 *  lines under it. */
function Results({ c }: { c: ReturnType<typeof useCalc> }) {
  return (
    <div className="fund-res">
      <div className="fund-res-days">
        {c.days} days · matures {c.maturity ? dayjs(c.maturity).format('D MMM YYYY') : '—'}
      </div>
      <div className="fund-res-tiles">
        <div className="fund-tile fund-in">
          <div className="fund-tile-l">Charge borrower</div>
          <div className="fund-tile-v">{money(c.chargeToBorrower)}</div>
          <div className="fund-tile-n">bill · 5028</div>
        </div>
        <div className="fund-tile fund-owe">
          <div className="fund-tile-l">Owe HC</div>
          <div className="fund-tile-v">{money(c.oweToHc)}</div>
          <div className="fund-tile-n">pay · 6001</div>
        </div>
      </div>
      <div className="fund-margin">
        <span className="fund-margin-l">HV margin</span>
        <span className={`fund-margin-v${c.margin < 0 ? ' fund-neg' : ''}`}>{money(c.margin)}</span>
      </div>
      <div className="fund-res-lines">
        <div>
          <span>Collect at maturity / repay HC</span>
          <span className="fund-res-fig">
            {money(c.collectTotal)} / {money(c.repayHcTotal)}
          </span>
        </div>
        <div>
          <span>Bank interest (HC&apos;s cost, ref)</span>
          <span className="fund-res-fig">{money(c.bankInterest)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Financing calculator (no save) — the form's terms and results ──────────
function CalculatorModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const uid = useId()
  const [f, setF] = useState<CalcFields>(emptyCalc())
  const c = useCalc(f)
  if (!open) return null
  return (
    <div className="fund-scrim" {...backdropDismiss(onClose)}>
      <div className="fund-modal" role="dialog" aria-modal="true" aria-label="Financing calculator" onClick={(e) => e.stopPropagation()}>
        <div className="fund-modal-head">
          <h2>Financing calculator</h2>
          <button type="button" className="fund-x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="fund-form-grid">
          <div className="fund-fields">
            <TermsFields uid={uid} f={f} set={(patch) => setF((prev) => ({ ...prev, ...patch }))} c={c} />
          </div>
          <Results c={c} />
        </div>
      </div>
    </div>
  )
}

// ── Record / edit form ──────────────────────────────────────────────────────
const pct = (rate: number) => String(parseFloat((rate * 100).toFixed(3)))

function RecordForm({
  companies,
  limits,
  autoReadAvailable,
  editing,
  onDone,
}: {
  companies: CompanyOption[]
  limits: LimitRow[]
  autoReadAvailable: boolean
  editing: BaRow | null
  onDone: () => void
}) {
  const uid = useId()
  const [f, setF] = useState<CalcFields>(
    editing
      ? {
          face: String(editing.faceAmount),
          bankRatePct: editing.bankAnnualRate > 0 ? pct(editing.bankAnnualRate) : '',
          startDate: editing.startDate,
          endDate: '',
          days: String(editing.tenorDays),
          chargePct: pct(editing.chargeRateMonthly),
          hcPct: pct(editing.hcRateMonthly),
        }
      : emptyCalc(),
  )
  const [baNo, setBaNo] = useState(editing?.baNo ?? '')
  const [bankName, setBankName] = useState(editing?.bankName ?? '')
  const [borrowerCompanyId, setBorrowerCompanyId] = useState(editing?.borrowerCompanyId ?? '')
  const [borrowerName, setBorrowerName] = useState(
    editing && !editing.borrowerCompanyId ? editing.borrower : '',
  )
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const [file, setFile] = useState<File | null>(null)
  // Auto-read, then kept on save: one staged copy of the advice for both (lib/storage/stage.ts, 2026-10-24).
  const [stage] = useState(() => stagedOnce())
  const fileRef = useRef<HTMLInputElement>(null)
  const [readNote, setReadNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isReading, startReading] = useTransition()
  const c = useCalc(f)

  // Over-limit check — WARNS only, never blocks (user 2026-08-11: 超了警告但不挡; lib/ba).
  const limitWarning = useMemo(
    () => baLimitWarning({ companyId: borrowerCompanyId, face: Number(f.face) || 0, limits, editing }),
    [borrowerCompanyId, f.face, limits, editing],
  )

  // What saving still needs (2026-10-10, the handoff: a ref and a borrower too).
  const missing = baMissing({ face: Number(f.face) || 0, days: c.days, baNo, borrowerCompanyId, borrowerName })

  const autoRead = () => {
    if (!file) return
    setError(null)
    setReadNote(null)
    const fd = new FormData()
    startReading(async () => {
      try {
        fd.set('file', await stage(file))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'The document could not be sent.')
        return
      }
      const r = await extractBaFromDocument(fd)
      if (r.error) {
        setError(r.error)
        return
      }
      const x = r.fields
      if (!x) return
      // Prefill ONLY what the reader saw — the user reviews before saving
      // (user: "我会检查对不对才储存开invoice").
      if (x.baNo) setBaNo(x.baNo)
      if (x.bankName) setBankName(x.bankName)
      if (x.borrowerName) setBorrowerName(x.borrowerName)
      setF(prev => ({
        ...prev,
        face: x.faceAmount != null ? String(x.faceAmount) : prev.face,
        bankRatePct: x.bankAnnualRatePct != null ? String(x.bankAnnualRatePct) : prev.bankRatePct,
        startDate: x.startDate ?? prev.startDate,
        endDate: x.maturityDate ?? prev.endDate,
        days: x.maturityDate ? prev.days : x.tenorDays != null ? String(x.tenorDays) : prev.days,
      }))
      setReadNote(
        `Read ✓ — check every field before saving${x.remarks ? ` · reader notes: ${x.remarks}` : ''}`,
      )
    })
  }

  const submit = () => {
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
      borrowerCompanyId: borrowerCompanyId || null,
      borrowerName,
      notes,
    }
    startTransition(async () => {
      let savedId: string | null = null
      if (editing) {
        const r = await updateBa(editing.id, input)
        if (r.error) {
          setError(r.error)
          return
        }
        savedId = editing.id
      } else {
        const r = await createBa(input)
        if (r.error) {
          setError(r.error)
          return
        }
        savedId = r.id ?? null
      }
      if (file && savedId) {
        const fd = new FormData()
        const id = savedId
        const up = await stage(file).then(
          (line) => {
            fd.set('file', line)
            return uploadBaAttachment(id, fd)
          },
          (err: unknown) => ({ error: err instanceof Error ? err.message : 'the document could not be sent' }),
        )
        if (up.error) {
          setError(`BA saved, but the document upload failed: ${up.error}`)
          return
        }
      }
      onDone()
    })
  }

  // Record financing (2026-10-10, the handoff's form, kept inline on the
  // page): the bank's advice, then the borrower, then the terms; the results
  // beside them with the limit check, and Save once it has what it needs.
  return (
    <section className="fund-rec" aria-labelledby={`${uid}-title`}>
      <div className="fund-modal-head">
        <h2 id={`${uid}-title`}>
          {editing ? (
            <>
              Editing — {editing.baNo ?? editing.id.slice(0, 8)} <span className="fund-rec-warn">saving overwrites this BA</span>
            </>
          ) : (
            'Record financing'
          )}
        </h2>
        <button type="button" className="fund-x" aria-label="Close" onClick={onDone}>
          ×
        </button>
      </div>

      {/* ── Bank document: attach + auto-read ── */}
      <div className="fund-file">
        <span className="fund-file-pick">
          <button type="button" className="fund-file-btn" onClick={() => fileRef.current?.click()}>
            Choose file
          </button>
          <span className="fund-file-name">{file?.name ?? 'No file chosen'}</span>
        </span>
        <input
          ref={fileRef}
          type="file"
          aria-label="Bank advice file"
          accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
        {autoReadAvailable ? (
          <button
            type="button"
            disabled={!file || isReading}
            onClick={autoRead}
            title="Read the BA document and prefill the fields — you review before saving"
            className="fund-btn-line"
          >
            {isReading ? 'Reading…' : 'Auto-read →'}
          </button>
        ) : null}
        <span className="fund-file-note">PDF or photo of the bank&apos;s advice — filed with the record on save.</span>
        {readNote ? <span className="fund-file-read">{readNote}</span> : null}
      </div>

      <div className="fund-form-grid fund-wide">
        <div className="fund-fields">
          <h3 className="fund-f-sec">Bank advice</h3>
          <Field id={`${uid}-ref`} label="BA ref #" span={3}>
            <BoxInput id={`${uid}-ref`} mono placeholder="e.g. BA-2610-02" value={baNo} onChange={setBaNo} />
          </Field>
          <Field id={`${uid}-bankname`} label="Bank" span={3}>
            <BoxInput id={`${uid}-bankname`} placeholder="e.g. Maybank Islamic" value={bankName} onChange={setBankName} />
          </Field>
          <h3 className="fund-f-sec">Borrower</h3>
          <Field id={`${uid}-company`} label="Company" span={3}>
            <select id={`${uid}-company`} className="fund-select" value={borrowerCompanyId} onChange={e => setBorrowerCompanyId(e.target.value)}>
              <option value="">— pick or type name →</option>
              {companies.map(co => (
                <option key={co.id} value={co.id}>
                  {co.label}
                </option>
              ))}
            </select>
          </Field>
          <Field id={`${uid}-free`} label="Or free text" span={3}>
            <BoxInput id={`${uid}-free`} placeholder="Name if not a group company" value={borrowerName} onChange={setBorrowerName} />
          </Field>
          <h3 className="fund-f-sec">Terms</h3>
          <TermsFields uid={uid} f={f} set={patch => setF(prev => ({ ...prev, ...patch }))} c={c} />
          <Field id={`${uid}-notes`} label="Notes" span={6}>
            <BoxInput id={`${uid}-notes`} placeholder="Optional" value={notes} onChange={setNotes} />
          </Field>
        </div>
        <div className="fund-side">
          <Results c={c} />
          {limitWarning ? <p className="fund-warn">⚠ {limitWarning} — saving is still allowed.</p> : null}
          <div className="fund-save-row">
            <button type="button" className="fund-btn-save" disabled={isPending || missing.length > 0} onClick={submit}>
              {isPending ? 'Saving…' : editing ? 'Save changes →' : 'Save financing →'}
            </button>
            <span className="fund-save-note">
              Registry + interest only — the principal never moves through HV&apos;s bank. Bill the borrower / pay HC from the row after
              saving.
            </span>
          </div>
          {missing.length > 0 ? <p className="fund-save-need">To save, fill in {missing.join(', ')}.</p> : null}
          {error ? <p className="fund-error">{error}</p> : null}
        </div>
      </div>
    </section>
  )
}

// ── Per-company limit cards (user 2026-08-11: "我要类似这样的limit control") ──
// Glanceable, bank-app style: outstanding vs limit with a % bar, available,
// weighted avg bank rate, and every active BA by maturity. 2026-10-10 — the
// handoff's cards: each with its own Edit limit, "No active BA." when there
// is none; the old table of limits is gone, a company without a card gets one
// from the line under them.
type LimitCardData = LimitRow & { active: BaRow[]; avgRatePa: number | null; pct: number | null; available: number }

function LimitCard({ c }: { c: LimitCardData }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const tone = c.pct == null ? 'none' : c.pct >= 100 ? 'danger' : c.pct >= 70 ? 'alert' : 'ledger'

  const open = () => {
    setDraft(c.limit > 0 ? String(c.limit) : '')
    setMsg(null)
    setEditing(true)
  }
  const save = () => {
    const v = Number(draft)
    if (!draft.trim() || Number.isNaN(v) || v < 0) {
      setMsg('Limit must be a number ≥ 0')
      return
    }
    setMsg(null)
    startTransition(async () => {
      const r = await setBaLimit(c.companyId, v)
      if (r?.error) setMsg(r.error)
      else setEditing(false)
    })
  }

  return (
    <div className="fund-lim" data-tone={tone}>
      <div className="fund-lim-top">
        <div className="min-w-0">
          <span className="fund-lim-name">{c.label}</span>
          <span className="fund-lim-kind">BA limit</span>
        </div>
        <span className="fund-lim-pct">{c.pct != null ? `${Math.round(c.pct)}% of limit` : 'no limit set'}</span>
      </div>
      <div className="fund-lim-used">RM {money(c.used)}</div>
      <div className="fund-lim-line">
        outstanding · limit {c.limit > 0 ? `RM ${money(c.limit)}` : '—'} ·{' '}
        <span className={c.available < 0 ? 'fund-lim-over' : undefined}>available {c.limit > 0 ? `RM ${money(c.available)}` : '—'}</span>
        {c.avgRatePa != null ? ` · avg rate ${parseFloat((c.avgRatePa * 100).toFixed(2))}% p.a.` : ''}
      </div>
      <div className="fund-lim-bar">
        <div style={{ width: `${c.pct != null ? Math.min(100, Math.max(2, c.pct)) : 0}%` }} />
      </div>
      <div className="fund-lim-bas">
        {c.active.map(r => {
          const daysLeft = dayjs(r.maturityDate).diff(officeToday(), 'day')
          return (
            <div key={r.id} className="fund-lim-ba" data-tone={daysLeft < 0 ? 'late' : daysLeft <= 14 ? 'soon' : undefined}>
              ⏰ RM {money(r.faceAmount)}
              {r.bankName ? ` — ${r.bankName}` : ''} ·{' '}
              {daysLeft < 0 ? `overdue ${-daysLeft}d` : `matures ${dayjs(r.maturityDate).format('D MMM YYYY')} (${daysLeft}d)`}
              {r.baNo ? ` · ${r.baNo}` : ''}
            </div>
          )
        })}
        {c.active.length === 0 ? <div className="fund-lim-none">No active BA.</div> : null}
      </div>
      {editing ? (
        <div className="fund-lim-edit">
          <input
            type="text"
            inputMode="decimal"
            aria-label={`Limit for ${c.label}`}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="0.00"
          />
          <button type="button" className="fund-btn-line" disabled={isPending || !draft.trim()} onClick={save}>
            {isPending ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="fund-btn-quiet" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="fund-lim-foot">
          <button type="button" className="fund-btn-line" onClick={open}>
            Edit limit
          </button>
        </div>
      )}
      {msg ? <p className="fund-lim-msg">{msg}</p> : null}
    </div>
  )
}

function LimitCards({ rows, limits }: { rows: BaRow[]; limits: LimitRow[] }) {
  const cards = useMemo<LimitCardData[]>(() => {
    return limits
      .filter(l => l.limit > 0 || l.used > 0)
      .map(l => {
        const active = rows
          .filter(r => r.status === 'active' && r.borrowerCompanyId === l.companyId)
          .sort((a, b) => a.maturityDate.localeCompare(b.maturityDate))
        const rated = active.filter(r => r.bankAnnualRate > 0)
        const ratedFace = rated.reduce((s, r) => s + r.faceAmount, 0)
        const avgRatePa =
          ratedFace > 0
            ? rated.reduce((s, r) => s + r.faceAmount * r.bankAnnualRate, 0) / ratedFace
            : null
        const pct = l.limit > 0 ? (l.used / l.limit) * 100 : null
        return {
          ...l,
          active,
          avgRatePa,
          pct,
          available: Math.round((l.limit - l.used) * 100) / 100,
        }
      })
  }, [rows, limits])

  if (cards.length === 0) return null
  return (
    <div className="fund-lims">
      {cards.map(c => (
        <LimitCard key={c.companyId} c={c} />
      ))}
    </div>
  )
}

/** A company with no card yet is given its limit here (what the old Limits
 *  table's "Show all companies" did). */
function AddLimit({ limits }: { limits: LimitRow[] }) {
  const uid = useId()
  const options = limits.filter(l => !(l.limit > 0 || l.used > 0))
  const [companyId, setCompanyId] = useState('')
  const [draft, setDraft] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  if (options.length === 0) return null

  const save = () => {
    const v = Number(draft)
    if (!companyId || !draft.trim() || Number.isNaN(v) || v < 0) {
      setMsg('Pick a company and a limit ≥ 0')
      return
    }
    setMsg(null)
    startTransition(async () => {
      const r = await setBaLimit(companyId, v)
      if (r?.error) setMsg(r.error)
      else {
        setCompanyId('')
        setDraft('')
        setMsg('Saved ✓')
      }
    })
  }

  return (
    <div className="fund-lim-add" role="group" aria-labelledby={`${uid}-l`}>
      <span id={`${uid}-l`} className="fund-lim-add-l">
        Set a limit for another company
      </span>
      <select aria-label="Company" className="fund-select" value={companyId} onChange={e => setCompanyId(e.target.value)}>
        <option value="">— pick a company —</option>
        {options.map(o => (
          <option key={o.companyId} value={o.companyId}>
            {o.label}
          </option>
        ))}
      </select>
      <input type="text" inputMode="decimal" aria-label="Limit" placeholder="Limit (RM)" value={draft} onChange={e => setDraft(e.target.value)} />
      <button type="button" className="fund-btn-line" disabled={isPending || !companyId || !draft.trim()} onClick={save}>
        {isPending ? 'Saving…' : 'Save'}
      </button>
      {msg ? <span className="fund-lim-msg">{msg}</span> : null}
    </div>
  )
}

// ── Generate-PV modal (pick bank + date) ────────────────────────────────────
// Also used by a financing's own page (/ba/[id], 2026-10-09) — its Generate PV.
export function PvModal({
  row,
  banks,
  onClose,
  onDone,
}: {
  row: BaRow
  banks: BankOption[]
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const uid = useId()
  const [bankId, setBankId] = useState(banks[0]?.id ?? '')
  const [date, setDate] = useState(row.maturityDate)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const owe = calcOf(row).oweToHc
  const ref = row.baNo ?? row.id.slice(0, 8)

  const go = () => {
    setError(null)
    startTransition(async () => {
      const r = await generateBaPv(row.id, bankId, date)
      if (r.error) setError(r.error)
      else onDone(`PV ${r.voucherNo ?? ''} created as draft — submit it for approval in Payments`)
    })
  }

  return (
    <div className="fund-scrim" {...backdropDismiss(onClose)}>
      <div className="fund-modal fund-narrow" role="dialog" aria-modal="true" aria-label={`Generate PV — ${ref}`} onClick={e => e.stopPropagation()}>
        <div className="fund-modal-head">
          <h2>Generate PV — {ref}</h2>
          <button type="button" className="fund-x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="fund-pv-owe">
          Interest to HOUZS Century: RM {money(owe)}
          <span> · 6001 Interest Expense - BA · venture pool</span>
        </p>
        <div className="fund-fields">
          <Field id={`${uid}-bank`} label="Pay from bank" span={6}>
            <select id={`${uid}-bank`} className="fund-select" value={bankId} onChange={e => setBankId(e.target.value)}>
              {banks.map(b => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </Field>
          <Field id={`${uid}-date`} label="Payment date" span={6}>
            <BoxInput id={`${uid}-date`} type="date" mono value={date} onChange={setDate} />
          </Field>
        </div>
        <div className="fund-save-row">
          <button type="button" className="fund-btn-save" disabled={isPending || !bankId} onClick={go}>
            {isPending ? 'Creating…' : 'Create PV (draft) →'}
          </button>
          <span className="fund-save-note">Goes through the normal flow: draft → submit → Principal approves → paid.</span>
        </div>
        {error ? <p className="fund-error">{error}</p> : null}
      </div>
    </div>
  )
}

// ── Attachment chips (open via signed URL, add, remove) ─────────────────────
/** full: the names in full (a financing's own page has the room). */
export function AttachmentChips({ row, full = false }: { row: BaRow; full?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  const open = (attachmentId: string) => {
    startTransition(async () => {
      const r = await getBaAttachmentUrl(attachmentId)
      if (r.url) window.open(r.url, '_blank', 'noopener')
      else if (r.error) alert(r.error)
    })
  }
  const upload = (f: File | null) => {
    if (!f) return
    const fd = new FormData()
    startTransition(async () => {
      // Sent ahead of the action (2026-10-24, lib/storage/stage.ts) — up to 100 MB, not a body's 4 MB.
      const r = await stageInto(fd, 'file', f).then(
        () => uploadBaAttachment(row.id, fd),
        (err: unknown) => ({ error: err instanceof Error ? err.message : 'The document could not be sent.' }),
      )
      if (r.error) alert(r.error)
    })
  }
  const remove = (attachmentId: string) => {
    if (!confirm('Remove this document from the BA?')) return
    startTransition(async () => {
      const r = await deleteBaAttachment(attachmentId)
      if (r.error) alert(r.error)
    })
  }

  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {row.attachments.map(a => (
        <span key={a.id} className="inline-flex items-center">
          <button
            type="button"
            disabled={isPending}
            onClick={() => open(a.id)}
            title={a.name}
            className="text-[11px] font-mono text-accent hover:text-accent-hover disabled:opacity-50"
          >
            📎{!full && a.name.length > 14 ? `${a.name.slice(0, 12)}…` : a.name}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => remove(a.id)}
            title="Remove document"
            className="text-[10px] text-muted hover:text-danger ml-0.5 disabled:opacity-50"
          >
            ×
          </button>
        </span>
      ))}
      <button
        type="button"
        disabled={isPending}
        onClick={() => fileRef.current?.click()}
        title="Attach the bank's BA document"
        className="text-[11px] text-muted hover:text-accent disabled:opacity-50"
      >
        {row.attachments.length === 0 ? '📎+' : '+'}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={e => {
          upload(e.target.files?.[0] ?? null)
          e.target.value = ''
        }}
      />
    </span>
  )
}

// ── Interest billing as a chip (2026-10-10, the handoff) ───────────────────
// Billed green once the borrower's invoice exists, to bill amber until then;
// the invoice and the PV to HC on hover. Billing and paying HC live on the
// row's right-click and on the financing's own page.
export function BillingChip({ row }: { row: BaRow }) {
  const billed = !!row.interestInvoice
  const title = [
    row.interestInvoice ? `Invoice ${row.interestInvoice.no ?? ''} · ${row.interestInvoice.status}` : 'Not invoiced yet',
    row.interestPv ? `PV ${row.interestPv.no ?? ''} · ${row.interestPv.status}` : 'HC not paid yet',
  ].join(' — ')
  return (
    <span className={`chip ${billed ? 'ledger' : 'alert'}`} title={title}>
      <i className="dot" />
      {billed ? 'billed' : 'to bill'}
    </span>
  )
}

/** A financing's status as the sheet's chip (2026-10-09): active by its days
 *  left — amber within 14, red past maturity — settled green. */
export function BaStatusChip({ row, large = false }: { row: Pick<BaRow, 'status' | 'maturityDate'>; large?: boolean }) {
  const daysLeft = dayjs(row.maturityDate).diff(officeToday(), 'day')
  const [tone, label] =
    row.status === 'active'
      ? daysLeft < 0
        ? ['danger', `overdue ${-daysLeft}d`]
        : daysLeft <= 14
          ? ['alert', `matures in ${daysLeft}d`]
          : ['info', `matures in ${daysLeft}d`]
      : row.status === 'settled'
        ? ['ledger', 'settled']
        : ['', 'cancelled']
  return (
    <span className={`chip${large ? ' lg' : ''}${tone ? ` ${tone}` : ''}`}>
      <i className="dot" />
      {label}
    </span>
  )
}

const periodText = (r: BaRow) => `${r.tenorDays}d · ${dayjs(r.startDate).format('D MMM')} – ${dayjs(r.maturityDate).format('D MMM')}`
const billingText = (r: BaRow) => (r.interestInvoice ? 'billed' : 'to bill')

// ── Main view ───────────────────────────────────────────────────────────────
export default function BaView({
  rows,
  companies,
  banks,
  limits,
  autoReadAvailable,
  openCalc,
  canSetDefault = false,
  canRecord = true,
}: {
  rows: BaRow[]
  companies: CompanyOption[]
  banks: BankOption[]
  limits: LimitRow[]
  autoReadAvailable: boolean
  openCalc: boolean
  /** The viewer may keep the register's arrangement as everyone's default. */
  canSetDefault?: boolean
  /** The viewer may record financing (Treasury · Create) — the button is theirs alone. */
  canRecord?: boolean
}) {
  const [showCalc, setShowCalc] = useState(openCalc)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<BaRow | null>(null)
  const [pvRow, setPvRow] = useState<BaRow | null>(null)
  // Bill borrower asks first (2026-10-16): it makes the borrower's invoice.
  const [billRow, setBillRow] = useState<BaRow | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const startEdit = (r: BaRow) => {
    setEditing(r)
    setShowForm(true)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const active = rows.filter(r => r.status === 'active')
  const totals = active.reduce(
    (acc, r) => {
      const c = calcOf(r)
      return {
        face: acc.face + r.faceAmount,
        charge: acc.charge + c.chargeToBorrower,
        owe: acc.owe + c.oweToHc,
        margin: acc.margin + c.margin,
      }
    },
    { face: 0, charge: 0, owe: 0, margin: 0 },
  )

  // What a row can do besides being opened (2026-10-10, the handoff: the
  // register keeps only Mark settled; the rest moved to the right-click).
  const setStatus = (r: BaRow, status: 'active' | 'settled') =>
    startTransition(async () => {
      const res = await setBaStatus(r.id, status)
      if (res?.error) setBanner(res.error)
    })
  const remove = (r: BaRow) => {
    if (!confirm(`Delete BA ${r.baNo ?? r.id.slice(0, 8)}? Its filed documents are removed too.`)) return
    startTransition(async () => {
      const res = await deleteBa(r.id)
      if (res?.error) setBanner(res.error)
    })
  }

  // A financing's own page (2026-10-09, the handoff): a double-click opens it.
  const links = useRowLinks<BaRow>({
    href: r => `/ba/${r.id}`,
    title: r => r.baNo ?? r.id.slice(0, 8),
    more: r => {
      const items: RowMenuItem[] = []
      if (!r.interestInvoice) items.push({ key: 'bill', label: 'Bill borrower', hint: 'invoice · 5028', onSelect: () => setBillRow(r) })
      if (!r.interestPv) items.push({ key: 'pay', label: 'Pay HC', hint: 'PV · 6001', onSelect: () => setPvRow(r) })
      if (r.status === 'settled') items.push({ key: 'reopen', label: 'Reopen', onSelect: () => setStatus(r, 'active') })
      items.push({
        key: 'edit',
        label: 'Edit',
        hint: r.interestInvoice || r.interestPv ? 'void the invoice / PV first' : undefined,
        onSelect: () => startEdit(r),
      })
      items.push({ key: 'delete', label: 'Delete', danger: true, onSelect: () => remove(r) })
      return items
    },
  })
  const toggleForm = () => {
    if (showForm) {
      setShowForm(false)
      setEditing(null)
    } else {
      setEditing(null)
      setShowForm(true)
    }
  }
  const shownLimits = limits.filter(l => l.limit > 0 || l.used > 0)
  const limitTotal = shownLimits.reduce((t, l) => t + l.limit, 0)
  const usedTotal = shownLimits.reduce((t, l) => t + l.used, 0)

  // Invoice Financing on the sheet (2026-10-09, the user's Claude Design
  // handoff — was "Bank BA"): the head with Calculator and Record financing,
  // four cards, the Financing register first and the Limits after it.
  return (
    <div>
      <div className="mb-3">
        <Link href="/fund-in" className="text-[13px] text-graphite hover:text-ink font-sans transition-colors">
          ← Fund In
        </Link>
      </div>
      <div className="page-head">
        <div className="min-w-0">
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · INVOICE FINANCING
          </div>
          <h1 className="page-title">Invoice Financing</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" className="btn-quiet-sheet" onClick={() => setShowCalc(true)}>
            Calculator
          </button>
          {canRecord ? (
            <button type="button" className="btn-pri-sheet" onClick={toggleForm}>
              {showForm ? 'Close form' : 'Record financing'}
            </button>
          ) : null}
        </div>
      </div>

      <StatCards label="Invoice Financing">
        <StatCard tone="primary" label="Active face" value={formatMoney(totals.face)} icon="bank" note={`${active.length} active`} />
        <StatCard tone="ledger" label="To charge borrowers" value={formatMoney(totals.charge)} icon="send" note="Bill the borrower · 5028" />
        <StatCard tone="danger" label="To pay HC" value={formatMoney(totals.owe)} icon="wallet" note="Pay HC · 6001" />
        <StatCard tone="ledger" label="HV margin" value={formatMoney(totals.margin)} icon="trend" note="Charge − owe HC" />
      </StatCards>

      {banner ? (
        <div className="border border-hairline rounded-md bg-surface px-4 py-2 mb-4 flex items-center justify-between">
          <span className="font-sans text-sm text-graphite">{banner}</span>
          <button type="button" onClick={() => setBanner(null)} className="text-muted hover:text-ink text-xs font-sans ml-4" aria-label="Dismiss">
            ✕
          </button>
        </div>
      ) : null}

      {showForm && canRecord ? (
        <RecordForm
          key={editing?.id ?? 'new'}
          companies={companies}
          limits={limits}
          autoReadAvailable={autoReadAvailable}
          editing={editing}
          onDone={() => {
            setShowForm(false)
            setEditing(null)
          }}
        />
      ) : null}

      <section className="mb-9 fin-queue">
        <div className="sect-head">
          <h2>Financing register</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            {rows.length} {rows.length === 1 ? 'BA' : 'BAs'}
          </span>
        </div>
      {rows.length === 0 ? (
        <div className="border border-hairline rounded-md bg-surface p-8 text-center">
          <p className="font-sans text-muted text-sm">No financing recorded yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <SortableTable<BaRow>
            layoutId="ba.facilities"
            layoutTitle="Financing register"
            canSetDefault={canSetDefault}
            scrollBox
            resizeMode="neighbour"
            onRowOpen={links.onRowOpen}
            onRowContextMenu={links.onRowContextMenu}
            rows={rows}
            getRowKey={r => r.id}
            defaultSort={{ key: 'period', dir: 'desc' }}
            searchKeys={['baNo', 'bankName', 'borrower', 'notes']}
            searchPlaceholder="Search ref / bank / borrower / notes…"
            // ▽ on every column; Face, Period, Charge and Owe HC by Range too
            // (2026-10-10, the handoff) — the amounts in ringgit as shown.
            columns={[
              {
                key: 'baNo',
                group: '基本',
                label: 'Ref',
                render: r => (
                  <div>
                    <div className="font-sans text-[12px] font-medium text-ink whitespace-nowrap">{r.baNo ?? '—'}</div>
                    <div className="text-muted text-xs">{r.bankName ?? ''}</div>
                    <AttachmentChips row={r} />
                  </div>
                ),
                sortValue: r => r.baNo ?? '',
                filterable: true,
              },
              {
                key: 'borrower',
                group: '基本',
                label: 'Borrower',
                render: r => r.borrower,
                sortValue: r => r.borrower,
                filterable: true,
                cellClassName: 'text-ink',
              },
              {
                key: 'face',
                group: '金额',
                label: 'Face',
                align: 'right',
                render: r => money(r.faceAmount),
                sortValue: r => r.faceAmount,
                filterable: true,
                filterValue: r => money(r.faceAmount),
                range: 'number',
                cellClassName: 'font-mono tabular',
              },
              {
                key: 'period',
                group: '日期',
                label: 'Period',
                render: periodText,
                sortValue: r => new Date(r.startDate),
                filterable: true,
                filterValue: periodText,
                range: 'date',
              },
              {
                key: 'charge',
                group: '金额',
                label: 'Charge',
                align: 'right',
                render: r => money(calcOf(r).chargeToBorrower),
                sortValue: r => calcOf(r).chargeToBorrower,
                filterable: true,
                filterValue: r => money(calcOf(r).chargeToBorrower),
                range: 'number',
                cellClassName: 'font-mono tabular fund-fig-in',
              },
              {
                key: 'owe',
                group: '金额',
                label: 'Owe HC',
                align: 'right',
                render: r => money(calcOf(r).oweToHc),
                sortValue: r => calcOf(r).oweToHc,
                filterable: true,
                filterValue: r => money(calcOf(r).oweToHc),
                range: 'number',
                cellClassName: 'font-mono tabular',
              },
              {
                key: 'interest',
                group: '金额',
                label: 'Interest billing',
                render: r => <BillingChip row={r} />,
                sortValue: billingText,
                filterable: true,
                filterValue: billingText,
              },
              {
                key: 'status',
                group: '基本',
                label: 'Status',
                render: r => <BaStatusChip row={r} />,
                sortValue: r => r.status,
                filterable: true,
                filterValue: r => r.status,
              },
              {
                key: 'action',
                pinned: 'end',
                label: '',
                sortable: false,
                align: 'right',
                render: r =>
                  r.status === 'active' ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => setStatus(r, 'settled')}
                      className="fund-btn-line"
                      title="Mark settled once collected from the borrower and repaid to HC — releases the limit"
                    >
                      Mark settled
                    </button>
                  ) : null,
              },
            ]}
          />
        </div>
      )}

        {links.menu}
      </section>

      <section className="mb-9">
        <div className="sect-head">
          <h2>Limits</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            {shownLimits.length} {shownLimits.length === 1 ? 'COMPANY' : 'COMPANIES'}
            {limitTotal > 0 ? ` · ${Math.round((usedTotal / limitTotal) * 100)}% USED` : ''}
          </span>
        </div>
        <LimitCards rows={rows} limits={limits} />
        <AddLimit limits={limits} />
      </section>

      <CalculatorModal open={showCalc} onClose={() => setShowCalc(false)} />
      {pvRow ? (
        <PvModal
          row={pvRow}
          banks={banks}
          onClose={() => setPvRow(null)}
          onDone={m => {
            setPvRow(null)
            setBanner(m)
          }}
        />
      ) : null}
      <BillInterestDialog
        row={billRow}
        onClose={() => setBillRow(null)}
        onDone={no => {
          setBillRow(null)
          setBanner(`Invoice ${no ?? ''} created as draft — review & issue it in Statements`)
        }}
      />
    </div>
  )
}
