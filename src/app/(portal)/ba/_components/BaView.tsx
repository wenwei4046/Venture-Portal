'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { backdropDismiss } from '@/components/modal-dismiss'
import dayjs from 'dayjs'
import { officeToday } from '@/lib/office-time'
import { calcBa, daysBetween } from '@/lib/ba'
import Link from 'next/link'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import SortableTable from '@/components/SortableTable'
import { useRowLinks } from '@/components/row-links'
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
  generateBaInvoice,
  generateBaPv,
  type BaInput,
} from '../actions'

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

// ── Shared calculator fields (used by the modal and the record form) ────────
interface CalcFields {
  face: string
  bankRatePct: string
  startDate: string
  endDate: string
  days: string
  chargePct: string
  hcPct: string
}

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
  return useMemo(() => {
    const days =
      fields.endDate && fields.startDate
        ? daysBetween(fields.startDate, fields.endDate)
        : Number(fields.days) || 0
    const result = calcBa({
      face: Number(fields.face) || 0,
      bankAnnualRate: (Number(fields.bankRatePct) || 0) / 100,
      days,
      chargeRateMonthly: (Number(fields.chargePct) || 0) / 100,
      hcRateMonthly: (Number(fields.hcPct) || 0) / 100,
    })
    const maturity =
      fields.endDate ||
      (fields.startDate && days > 0
        ? dayjs(fields.startDate).add(days, 'day').format('YYYY-MM-DD')
        : '')
    return { days, maturity, ...result }
  }, [fields])
}

function CalcInput({
  label,
  value,
  onChange,
  type = 'text',
  suffix,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  suffix?: string
}) {
  return (
    <label className="block">
      <span className="block text-xs font-sans text-graphite mb-1">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-1.5 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border"
        />
        {suffix ? <span className="text-xs text-muted font-mono">{suffix}</span> : null}
      </span>
    </label>
  )
}

function CalcResults({ c }: { c: ReturnType<typeof useCalc> }) {
  return (
    <div className="border border-hairline rounded-md bg-surface p-4 space-y-1.5">
      <div className="flex justify-between font-mono text-sm">
        <span className="text-muted">Days / maturity</span>
        <span className="text-ink">
          {c.days} d{c.maturity ? ` · ${c.maturity}` : ''}
        </span>
      </div>
      <div className="flex justify-between font-mono text-sm">
        <span className="text-muted">Bank interest (HC&apos;s cost, ref)</span>
        <span className="text-graphite">{money(c.bankInterest)}</span>
      </div>
      <div className="flex justify-between font-mono text-sm">
        <span className="text-ledger">Charge borrower</span>
        <span className="text-ledger font-semibold">{money(c.chargeToBorrower)}</span>
      </div>
      <div className="flex justify-between font-mono text-sm">
        <span className="text-alert">Owe HC</span>
        <span className="text-alert font-semibold">{money(c.oweToHc)}</span>
      </div>
      <div className="flex justify-between font-mono text-sm border-t border-hairline pt-1.5">
        <span className="text-ink">HV margin</span>
        <span className="text-ink font-semibold">{money(c.margin)}</span>
      </div>
      <div className="flex justify-between font-mono text-xs text-muted">
        <span>Collect at maturity / repay HC</span>
        <span>
          {money(c.collectTotal)} / {money(c.repayHcTotal)}
        </span>
      </div>
    </div>
  )
}

function CalcFieldsGrid({
  f,
  set,
}: {
  f: CalcFields
  set: (patch: Partial<CalcFields>) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <CalcInput label="Face amount (RM)" value={f.face} onChange={v => set({ face: v })} />
      <CalcInput
        label="Bank rate (%/yr, ref)"
        value={f.bankRatePct}
        onChange={v => set({ bankRatePct: v })}
        suffix="%/yr"
      />
      <CalcInput
        label="Start date"
        type="date"
        value={f.startDate}
        onChange={v => set({ startDate: v })}
      />
      <CalcInput
        label="Maturity (or leave blank, use days)"
        type="date"
        value={f.endDate}
        onChange={v => set({ endDate: v })}
      />
      <CalcInput label="Days" value={f.days} onChange={v => set({ days: v, endDate: '' })} />
      <div className="grid grid-cols-2 gap-3">
        <CalcInput
          label="Charge"
          value={f.chargePct}
          onChange={v => set({ chargePct: v })}
          suffix="%/mo"
        />
        <CalcInput label="To HC" value={f.hcPct} onChange={v => set({ hcPct: v })} suffix="%/mo" />
      </div>
    </div>
  )
}

// ── Calculator modal (no save) ──────────────────────────────────────────────
function CalculatorModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState<CalcFields>(emptyCalc())
  const c = useCalc(f)
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 bg-scrim/45 flex items-start justify-center pt-24 px-4"
      {...backdropDismiss(onClose)}
    >
      <div
        className="bg-paper border border-hairline rounded-md shadow-lg max-w-xl w-full p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-serif text-xl text-ink">BA Calculator</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-ink text-sm font-sans"
          >
            ✕ Close
          </button>
        </div>
        <div className="space-y-4">
          <CalcFieldsGrid f={f} set={patch => setF(prev => ({ ...prev, ...patch }))} />
          <CalcResults c={c} />
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
  const [readNote, setReadNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isReading, startReading] = useTransition()
  const c = useCalc(f)

  // Over-limit check — WARNS only, never blocks (user 2026-08-11: 超了警告但不挡).
  // When editing an active BA, its own face is already inside `used`.
  const limitWarning = useMemo(() => {
    if (!borrowerCompanyId) return null
    const l = limits.find(x => x.companyId === borrowerCompanyId)
    if (!l || l.limit <= 0) return null
    const face = Number(f.face) || 0
    if (face <= 0) return null
    const own =
      editing && editing.status === 'active' && editing.borrowerCompanyId === borrowerCompanyId
        ? editing.faceAmount
        : 0
    const after = l.used - own + face
    if (after <= l.limit) return null
    return `Over limit: ${l.label} has RM ${money(l.used - own)} active of RM ${money(l.limit)} — this BA takes it to RM ${money(after)}`
  }, [borrowerCompanyId, f.face, limits, editing])

  const autoRead = () => {
    if (!file) return
    setError(null)
    setReadNote(null)
    const fd = new FormData()
    fd.set('file', file)
    startReading(async () => {
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
        fd.set('file', file)
        const up = await uploadBaAttachment(savedId, fd)
        if (up.error) {
          setError(`BA saved, but the document upload failed: ${up.error}`)
          return
        }
      }
      onDone()
    })
  }

  return (
    <div className="border border-hairline rounded-md bg-surface p-5 mb-8">
      <h2 className="font-serif text-lg text-ink mb-4">
        {editing ? (
          <>
            Editing — {editing.baNo ?? editing.id.slice(0, 8)}{' '}
            <span className="font-serif italic text-alert text-sm">saving overwrites this BA</span>
          </>
        ) : (
          'Record BA'
        )}
      </h2>

      {/* ── Bank document: attach + auto-read ── */}
      <div className="border border-hairline rounded-md bg-paper p-3 mb-4 flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="text-xs font-sans text-graphite"
        />
        {autoReadAvailable ? (
          <button
            type="button"
            disabled={!file || isReading}
            onClick={autoRead}
            title="Read the BA document and prefill the fields — you review before saving"
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-xs px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
          >
            {isReading ? 'Reading…' : 'Auto-read →'}
          </button>
        ) : null}
        <span className="font-serif italic text-muted text-xs">
          PDF or photo of the bank&apos;s BA advice — filed with the record on save.
        </span>
        {readNote ? <span className="font-sans text-xs text-ledger">{readNote}</span> : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <CalcInput label="BA ref #" value={baNo} onChange={setBaNo} />
            <CalcInput label="Bank" value={bankName} onChange={setBankName} />
          </div>
          <CalcFieldsGrid f={f} set={patch => setF(prev => ({ ...prev, ...patch }))} />
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-sans text-graphite mb-1">Borrower (company)</span>
              <select
                value={borrowerCompanyId}
                onChange={e => setBorrowerCompanyId(e.target.value)}
                className="w-full px-3 py-1.5 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
              >
                <option value="">— pick or type name →</option>
                {companies.map(co => (
                  <option key={co.id} value={co.id}>
                    {co.label}
                  </option>
                ))}
              </select>
            </label>
            <CalcInput label="Borrower (free text)" value={borrowerName} onChange={setBorrowerName} />
          </div>
          <CalcInput label="Notes" value={notes} onChange={setNotes} />
        </div>
        <div className="space-y-3">
          <CalcResults c={c} />
          {limitWarning ? (
            <p className="text-xs font-sans text-danger border border-danger/40 rounded-md px-3 py-2">
              ⚠ {limitWarning} — saving is still allowed.
            </p>
          ) : null}
          <button
            type="button"
            disabled={isPending || !(Number(f.face) > 0) || c.days <= 0}
            onClick={submit}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors disabled:opacity-50"
          >
            {isPending ? 'Saving…' : editing ? 'Save changes →' : 'Save BA →'}
          </button>
          {error ? <p className="text-xs font-sans text-danger">{error}</p> : null}
          <p className="font-serif italic text-muted text-xs">
            Registry + interest only — the principal never moves through HV&apos;s bank. Bill the
            borrower / pay HC from the row after saving.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Limits section ──────────────────────────────────────────────────────────
function LimitsSection({ limits }: { limits: LimitRow[] }) {
  const [open, setOpen] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const withLimitOrUse = limits.filter(l => l.limit > 0 || l.used > 0)
  const shown = open ? limits : withLimitOrUse

  const save = (companyId: string) => {
    const v = Number(drafts[companyId])
    if (Number.isNaN(v) || v < 0) {
      setMsg('Limit must be a number ≥ 0')
      return
    }
    setMsg(null)
    startTransition(async () => {
      const r = await setBaLimit(companyId, v)
      setMsg(r.error ? r.error : 'Saved ✓')
    })
  }

  return (
    <div className="border border-hairline rounded-md bg-surface p-5 mb-8">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-serif text-lg text-ink">
          Limits <span className="font-serif italic text-muted text-sm">per borrower — active face counts, settled releases; over-limit warns but never blocks</span>
        </h2>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="text-xs text-accent hover:text-accent-hover font-serif italic"
        >
          {open ? 'Show set only' : `Show all companies (${limits.length})`}
        </button>
      </div>
      {shown.length === 0 ? (
        <p className="font-serif italic text-muted text-sm">
          No limits set yet — Show all companies and give each borrower a limit.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Company</th>
                <th className="num">Limit</th>
                <th className="num">Active (used)</th>
                <th className="num">Available</th>
                <th className="right">Set</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(l => {
                const available = Math.round((l.limit - l.used) * 100) / 100
                const over = l.limit > 0 && l.used > l.limit
                return (
                  <tr key={l.companyId}>
                    <td className="font-serif text-[15px] text-ink">{l.label}</td>
                    <td className="num">{l.limit > 0 ? money(l.limit) : '—'}</td>
                    <td className={`num ${over ? 'text-danger font-semibold' : ''}`}>
                      {money(l.used)}
                      {over ? ' ⚠' : ''}
                    </td>
                    <td className={`num ${available < 0 ? 'text-danger' : 'text-ledger'}`}>
                      {l.limit > 0 ? money(available) : '—'}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <input
                        type="text"
                        placeholder={l.limit > 0 ? String(l.limit) : '0'}
                        value={drafts[l.companyId] ?? ''}
                        onChange={e =>
                          setDrafts(prev => ({ ...prev, [l.companyId]: e.target.value }))
                        }
                        className="w-28 px-2 py-1 bg-paper border border-hairline rounded-md text-xs font-mono tabular text-ink text-right focus:outline-none focus:border-accent-border mr-2"
                      />
                      <button
                        type="button"
                        disabled={isPending || !(drafts[l.companyId] ?? '').trim()}
                        onClick={() => save(l.companyId)}
                        className="text-xs text-accent hover:text-accent-hover font-serif italic disabled:opacity-50"
                      >
                        Save
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {msg ? <p className="text-xs font-sans text-graphite mt-2">{msg}</p> : null}
    </div>
  )
}

// ── Per-company limit cards (user 2026-08-11: "我要类似这样的limit control") ──
// Glanceable, bank-app style: outstanding vs limit with a % bar, available,
// weighted avg bank rate, and the soonest maturities. Values to SET live in
// the Limits table; these cards are the display.
function LimitCards({ rows, limits }: { rows: BaRow[]; limits: LimitRow[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const cards = useMemo(() => {
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      {cards.map(c => {
        const tone =
          c.pct == null
            ? '--graphite'
            : c.pct >= 100
              ? '--danger'
              : c.pct >= 70
                ? '--alert'
                : '--ledger'
        return (
          <div key={c.companyId} className="border border-hairline rounded-md bg-surface p-4">
            <div className="flex items-baseline justify-between mb-1">
              <div className="font-serif text-base text-ink">
                {c.label} <span className="font-serif italic text-muted text-xs">BA limit</span>
              </div>
              {c.pct != null ? (
                <span
                  className="font-mono text-xs font-semibold"
                  style={{ color: `rgb(var(${tone}))` }}
                >
                  {Math.round(c.pct)}% of limit
                </span>
              ) : (
                <span className="font-serif italic text-muted text-xs">no limit set</span>
              )}
            </div>
            <div className="statement-amount text-num-ink mb-1">RM {money(c.used)}</div>
            <div className="font-mono text-[11px] text-muted mb-2">
              outstanding · limit {c.limit > 0 ? `RM ${money(c.limit)}` : '—'} ·{' '}
              <span className={c.available < 0 ? 'text-danger font-semibold' : ''}>
                available {c.limit > 0 ? `RM ${money(c.available)}` : '—'}
              </span>
              {c.avgRatePa != null
                ? ` · avg rate ${parseFloat((c.avgRatePa * 100).toFixed(2))}% p.a.`
                : ''}
            </div>
            {c.pct != null ? (
              <div className="h-2 rounded-full bg-surface-2 border border-hairline overflow-hidden mb-2">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, Math.max(2, c.pct))}%`,
                    backgroundColor: `rgb(var(${tone}))`,
                  }}
                />
              </div>
            ) : null}
            {(expanded[c.companyId] ? c.active : c.active.slice(0, 2)).map(r => {
              const daysLeft = dayjs(r.maturityDate).diff(officeToday(), 'day')
              return (
                <div
                  key={r.id}
                  className={`font-mono text-[11px] rounded-md px-2 py-1 mt-1 ${
                    daysLeft < 0 ? 'text-danger' : daysLeft <= 14 ? 'text-alert' : 'text-graphite'
                  }`}
                  style={{
                    backgroundColor: `rgb(var(${
                      daysLeft < 0 ? '--danger-bg' : daysLeft <= 14 ? '--alert-bg' : '--surface-2'
                    }))`,
                  }}
                >
                  ⏰ RM {money(r.faceAmount)}
                  {r.bankName ? ` — ${r.bankName}` : ''}{' '}
                  {daysLeft < 0
                    ? `overdue ${-daysLeft}d`
                    : `matures ${dayjs(r.maturityDate).format('D MMM YYYY')} (${daysLeft}d)`}
                  {r.baNo ? ` · ${r.baNo}` : ''}
                </div>
              )
            })}
            {c.active.length > 2 ? (
              <button
                type="button"
                onClick={() =>
                  setExpanded(prev => ({ ...prev, [c.companyId]: !prev[c.companyId] }))
                }
                className="font-mono text-[11px] text-accent hover:text-accent-hover mt-1"
              >
                {expanded[c.companyId] ? 'Show less ↑' : `+${c.active.length - 2} more active ↓`}
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

// ── Generate-PV modal (pick bank + date) ────────────────────────────────────
// Also used by a financing's own page (/ba/[id], 2026-10-09).
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
  const [bankId, setBankId] = useState(banks[0]?.id ?? '')
  const [date, setDate] = useState(row.maturityDate)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const owe = calcBa({
    face: row.faceAmount,
    bankAnnualRate: row.bankAnnualRate,
    days: row.tenorDays,
    chargeRateMonthly: row.chargeRateMonthly,
    hcRateMonthly: row.hcRateMonthly,
  }).oweToHc

  const go = () => {
    setError(null)
    startTransition(async () => {
      const r = await generateBaPv(row.id, bankId, date)
      if (r.error) setError(r.error)
      else onDone(`PV ${r.voucherNo ?? ''} created as draft — submit it for approval in Payments`)
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-scrim/45 flex items-start justify-center pt-24 px-4"
      {...backdropDismiss(onClose)}
    >
      <div
        className="bg-paper border border-hairline rounded-md shadow-lg max-w-md w-full p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-serif text-xl text-ink">Pay HC — BA {row.baNo ?? row.id.slice(0, 8)}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink text-sm font-sans">
            ✕
          </button>
        </div>
        <div className="space-y-3">
          <p className="font-mono text-sm text-alert">
            Interest to HOUZS Century: RM {money(owe)}
            <span className="text-muted text-xs"> · 6001 Interest Expense - BA · venture pool</span>
          </p>
          <label className="block">
            <span className="block text-xs font-sans text-graphite mb-1">Pay from bank</span>
            <select
              value={bankId}
              onChange={e => setBankId(e.target.value)}
              className="w-full px-3 py-1.5 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
            >
              {banks.map(b => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
          <CalcInput label="Payment date" type="date" value={date} onChange={setDate} />
          <button
            type="button"
            disabled={isPending || !bankId}
            onClick={go}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors disabled:opacity-50"
          >
            {isPending ? 'Creating…' : 'Create PV (draft) →'}
          </button>
          {error ? <p className="text-xs font-sans text-danger">{error}</p> : null}
          <p className="font-serif italic text-muted text-xs">
            Goes through the normal flow: draft → submit → Principal approves → paid.
          </p>
        </div>
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
    fd.set('file', f)
    startTransition(async () => {
      const r = await uploadBaAttachment(row.id, fd)
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

// ── Interest cell: invoice + PV status / generate buttons ───────────────────
export function InterestCell({
  row,
  onPv,
  onMsg,
}: {
  row: BaRow
  onPv: () => void
  onMsg: (m: string) => void
}) {
  const [isPending, startTransition] = useTransition()

  const invoice = () => {
    startTransition(async () => {
      const r = await generateBaInvoice(row.id)
      if (r.error) onMsg(r.error)
      else onMsg(`Invoice ${r.invoiceNo ?? ''} created as draft — review & issue it in Statements`)
    })
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      {row.interestInvoice ? (
        <span className="font-mono text-[11px] text-ledger" title={`Invoice status: ${row.interestInvoice.status}`}>
          ✓ {row.interestInvoice.no ?? 'invoice'} · {row.interestInvoice.status}
        </span>
      ) : (
        <button
          type="button"
          disabled={isPending}
          onClick={invoice}
          title="Draft an invoice to the borrower for the 2.5% line (5028 Interest Income - BA)"
          className="text-[11px] text-accent hover:text-accent-hover font-serif italic disabled:opacity-50"
        >
          {isPending ? '…' : 'Bill borrower →'}
        </button>
      )}
      {row.interestPv ? (
        <span className="font-mono text-[11px] text-alert" title={`PV status: ${row.interestPv.status}`}>
          ✓ {row.interestPv.no ?? 'PV'} · {row.interestPv.status}
        </span>
      ) : (
        <button
          type="button"
          onClick={onPv}
          title="Draft a PV to HOUZS Century for the 1.5% line (6001 Interest Expense - BA)"
          className="text-[11px] text-accent hover:text-accent-hover font-serif italic"
        >
          Pay HC →
        </button>
      )}
    </div>
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

// ── Main view ───────────────────────────────────────────────────────────────
export default function BaView({
  rows,
  companies,
  banks,
  limits,
  autoReadAvailable,
  openCalc,
}: {
  rows: BaRow[]
  companies: CompanyOption[]
  banks: BankOption[]
  limits: LimitRow[]
  autoReadAvailable: boolean
  openCalc: boolean
}) {
  const [showCalc, setShowCalc] = useState(openCalc)
  const [showForm, setShowForm] = useState(false)
  const [showLimits, setShowLimits] = useState(false)
  const [editing, setEditing] = useState<BaRow | null>(null)
  const [pvRow, setPvRow] = useState<BaRow | null>(null)
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
      const c = calcBa({
        face: r.faceAmount,
        bankAnnualRate: r.bankAnnualRate,
        days: r.tenorDays,
        chargeRateMonthly: r.chargeRateMonthly,
        hcRateMonthly: r.hcRateMonthly,
      })
      return {
        face: acc.face + r.faceAmount,
        charge: acc.charge + c.chargeToBorrower,
        owe: acc.owe + c.oweToHc,
        margin: acc.margin + c.margin,
      }
    },
    { face: 0, charge: 0, owe: 0, margin: 0 },
  )

  // A financing's own page (2026-10-09, the handoff): a double-click opens it.
  const links = useRowLinks<BaRow>({ href: r => `/ba/${r.id}`, title: r => r.baNo ?? r.id.slice(0, 8) })
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
          <p className="page-sub">
            HC&apos;s facility with the bank — the principal never touches HV&apos;s account, but the interest is real: bill the
            borrower (5028) and pay HC (6001) straight from each row. Bank interest is reference only (HC&apos;s cost).
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" className="btn-quiet-sheet" onClick={() => setShowCalc(true)}>
            Calculator
          </button>
          <button type="button" className="btn-pri-sheet" onClick={toggleForm}>
            {showForm ? 'Close form' : 'Record financing'}
          </button>
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
          <button type="button" onClick={() => setBanner(null)} className="text-muted hover:text-ink text-xs font-sans ml-4">
            ✕
          </button>
        </div>
      ) : null}

      {showForm ? (
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
            scrollBox
            resizeMode="neighbour"
            onRowOpen={links.onRowOpen}
            onRowContextMenu={links.onRowContextMenu}
            rows={rows}
            getRowKey={r => r.id}
            defaultSort={{ key: 'period', dir: 'desc' }}
            searchKeys={['baNo', 'bankName', 'borrower', 'notes']}
            searchPlaceholder="Search ref / bank / borrower / notes…"
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
                cellClassName: 'font-mono tabular',
              },
              {
                key: 'period',
                group: '日期',
                label: 'Period',
                render: r => (
                  <span className="font-mono text-xs">
                    {dayjs(r.startDate).format('D MMM')} → {dayjs(r.maturityDate).format('D MMM YYYY')}
                    <span className="text-muted"> · {r.tenorDays}d</span>
                  </span>
                ),
                sortValue: r => new Date(r.startDate),
              },
              {
                key: 'charge',
                group: '金额',
                label: 'Charge',
                align: 'right',
                render: r =>
                  money(
                    calcBa({
                      face: r.faceAmount,
                      bankAnnualRate: r.bankAnnualRate,
                      days: r.tenorDays,
                      chargeRateMonthly: r.chargeRateMonthly,
                      hcRateMonthly: r.hcRateMonthly,
                    }).chargeToBorrower,
                  ),
                sortValue: r => r.faceAmount * r.chargeRateMonthly * r.tenorDays,
                cellClassName: 'font-mono tabular text-ledger',
              },
              {
                key: 'owe',
                group: '金额',
                label: 'Owe HC',
                align: 'right',
                render: r =>
                  money(
                    calcBa({
                      face: r.faceAmount,
                      bankAnnualRate: r.bankAnnualRate,
                      days: r.tenorDays,
                      chargeRateMonthly: r.chargeRateMonthly,
                      hcRateMonthly: r.hcRateMonthly,
                    }).oweToHc,
                  ),
                sortValue: r => r.faceAmount * r.hcRateMonthly * r.tenorDays,
                cellClassName: 'font-mono tabular text-alert',
              },
              {
                key: 'interest',
                group: '金额',
                label: 'Interest billing',
                align: 'right',
                sortable: false,
                render: r => (
                  <InterestCell row={r} onPv={() => setPvRow(r)} onMsg={m => setBanner(m)} />
                ),
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
                render: r => (
                  <div className="flex flex-col items-end gap-0.5">
                    {r.status === 'active' ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(async () => {
                            await setBaStatus(r.id, 'settled')
                          })
                        }
                        className="text-xs text-accent hover:text-accent-hover font-serif italic disabled:opacity-50"
                        title="Mark settled once collected from the borrower and repaid to HC — releases the limit"
                      >
                        Mark settled
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(async () => {
                            await setBaStatus(r.id, 'active')
                          })
                        }
                        className="text-xs text-muted hover:text-ink font-serif italic disabled:opacity-50"
                      >
                        Reopen
                      </button>
                    )}
                    <span className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => startEdit(r)}
                        title={
                          r.interestInvoice || r.interestPv
                            ? 'Void/delete the generated invoice/PV first, then edit'
                            : 'Load this BA into the form to correct it'
                        }
                        className="text-xs text-muted hover:text-accent font-serif italic disabled:opacity-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          if (!confirm(`Delete BA ${r.baNo ?? r.id.slice(0, 8)}? Its filed documents are removed too.`)) return
                          startTransition(async () => {
                            const res = await deleteBa(r.id)
                            if (res.error) alert(res.error)
                          })
                        }}
                        title="Delete this BA (blocked while a generated invoice/PV exists)"
                        className="text-xs text-muted hover:text-danger font-serif italic disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                ),
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
          <button type="button" className="btn-quiet-sheet" onClick={() => setShowLimits(v => !v)}>
            {showLimits ? 'Done' : 'Edit limits'}
          </button>
        </div>
        {showLimits ? <LimitsSection limits={limits} /> : null}
        <LimitCards rows={rows} limits={limits} />
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
    </div>
  )
}
