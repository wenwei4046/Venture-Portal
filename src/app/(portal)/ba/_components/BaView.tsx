'use client'

import { useMemo, useState, useTransition } from 'react'
import dayjs from 'dayjs'
import { calcBa, daysBetween } from '@/lib/ba'
import { formatMoneyBare } from '@/lib/utils'
import SortableTable from '@/components/SortableTable'
import { createBa, setBaStatus, type BaInput } from '../actions'

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
  status: 'active' | 'settled' | 'cancelled'
  notes: string | null
}

export interface CompanyOption {
  id: string
  label: string
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
  startDate: dayjs().format('YYYY-MM-DD'),
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
      className="fixed inset-0 z-50 bg-ink/40 flex items-start justify-center pt-24 px-4"
      onClick={onClose}
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

// ── Record form ─────────────────────────────────────────────────────────────
function RecordForm({
  companies,
  onDone,
}: {
  companies: CompanyOption[]
  onDone: () => void
}) {
  const [f, setF] = useState<CalcFields>(emptyCalc())
  const [baNo, setBaNo] = useState('')
  const [bankName, setBankName] = useState('')
  const [borrowerCompanyId, setBorrowerCompanyId] = useState('')
  const [borrowerName, setBorrowerName] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const c = useCalc(f)

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
      const r = await createBa(input)
      if (r.error) setError(r.error)
      else onDone()
    })
  }

  return (
    <div className="border border-hairline rounded-md bg-surface p-5 mb-8">
      <h2 className="font-serif text-lg text-ink mb-4">Record BA</h2>
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
          <button
            type="button"
            disabled={isPending || !(Number(f.face) > 0) || c.days <= 0}
            onClick={submit}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Save BA →'}
          </button>
          {error ? <p className="text-xs font-sans text-danger">{error}</p> : null}
          <p className="font-serif italic text-muted text-xs">
            Registry only — record the actual cash as a Fund In (owe HC) and a Fund Out
            (loan to the borrower) as usual.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Main view ───────────────────────────────────────────────────────────────
export default function BaView({
  rows,
  companies,
  openCalc,
}: {
  rows: BaRow[]
  companies: CompanyOption[]
  openCalc: boolean
}) {
  const [showCalc, setShowCalc] = useState(openCalc)
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()

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

  return (
    <div>
      {/* ── Summary + actions ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="border border-hairline rounded-md bg-surface p-4">
          <div className="font-serif italic text-graphite text-sm mb-1">Active face</div>
          <div className="font-serif text-xl text-num-ink tabular">RM {money(totals.face)}</div>
          <div className="font-mono text-[11px] text-muted mt-1">{active.length} active</div>
        </div>
        <div className="border border-hairline rounded-md bg-surface p-4">
          <div className="font-serif italic text-ledger text-sm mb-1">To charge borrowers</div>
          <div className="font-serif text-xl text-num-ink tabular">RM {money(totals.charge)}</div>
        </div>
        <div className="border border-hairline rounded-md bg-surface p-4">
          <div className="font-serif italic text-alert text-sm mb-1">To pay HC</div>
          <div className="font-serif text-xl text-num-ink tabular">RM {money(totals.owe)}</div>
        </div>
        <div className="border border-hairline rounded-md bg-surface p-4">
          <div className="font-serif italic text-graphite text-sm mb-1">HV margin</div>
          <div className="font-serif text-xl text-ledger tabular">RM {money(totals.margin)}</div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={() => setShowForm(v => !v)}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
        >
          {showForm ? 'Close form' : 'Record BA'}
        </button>
        <button
          type="button"
          onClick={() => setShowCalc(true)}
          className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
        >
          Calculator
        </button>
      </div>

      {showForm ? <RecordForm companies={companies} onDone={() => setShowForm(false)} /> : null}

      {/* ── List ── */}
      {rows.length === 0 ? (
        <div className="border border-hairline rounded-md bg-surface p-8 text-center">
          <p className="font-serif italic text-muted text-base">No BAs recorded yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <SortableTable<BaRow>
            rows={rows}
            getRowKey={r => r.id}
            defaultSort={{ key: 'period', dir: 'desc' }}
            searchKeys={['baNo', 'bankName', 'borrower', 'notes']}
            searchPlaceholder="Search ref / bank / borrower / notes…"
            columns={[
              {
                key: 'baNo',
                label: 'Ref',
                render: r => (
                  <div>
                    <div className="font-mono text-[12px] text-ink">{r.baNo ?? '—'}</div>
                    <div className="font-serif italic text-muted text-xs">{r.bankName ?? ''}</div>
                  </div>
                ),
                sortValue: r => r.baNo ?? '',
              },
              {
                key: 'borrower',
                label: 'Borrower',
                render: r => r.borrower,
                sortValue: r => r.borrower,
                filterable: true,
                cellClassName: 'font-serif text-[15px] text-ink',
              },
              {
                key: 'face',
                label: 'Face',
                align: 'right',
                render: r => money(r.faceAmount),
                sortValue: r => r.faceAmount,
                cellClassName: 'font-mono tabular',
              },
              {
                key: 'period',
                label: 'Period',
                align: 'right',
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
                key: 'margin',
                label: 'Margin',
                align: 'right',
                render: r =>
                  money(
                    calcBa({
                      face: r.faceAmount,
                      bankAnnualRate: r.bankAnnualRate,
                      days: r.tenorDays,
                      chargeRateMonthly: r.chargeRateMonthly,
                      hcRateMonthly: r.hcRateMonthly,
                    }).margin,
                  ),
                sortValue: r => r.faceAmount * (r.chargeRateMonthly - r.hcRateMonthly) * r.tenorDays,
                cellClassName: 'font-mono tabular font-semibold',
              },
              {
                key: 'status',
                label: 'Status',
                render: r => {
                  const daysLeft = dayjs(r.maturityDate).diff(dayjs(), 'day')
                  return (
                    <div>
                      <em
                        className={`font-serif text-sm ${
                          r.status === 'active'
                            ? daysLeft < 0
                              ? 'text-danger'
                              : daysLeft <= 14
                                ? 'text-alert'
                                : 'text-graphite'
                            : r.status === 'settled'
                              ? 'text-ledger'
                              : 'text-muted'
                        }`}
                      >
                        {r.status === 'active'
                          ? daysLeft < 0
                            ? `overdue ${-daysLeft}d`
                            : `matures in ${daysLeft}d`
                          : r.status}
                      </em>
                    </div>
                  )
                },
                sortValue: r => r.status,
                filterable: true,
                filterValue: r => r.status,
              },
              {
                key: 'action',
                label: '',
                sortable: false,
                align: 'right',
                render: r =>
                  r.status === 'active' ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          await setBaStatus(r.id, 'settled')
                        })
                      }
                      className="text-xs text-accent hover:text-accent-hover font-serif italic disabled:opacity-50"
                      title="Mark settled once collected from the borrower and repaid to HC"
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
                  ),
              },
            ]}
          />
        </div>
      )}

      <CalculatorModal open={showCalc} onClose={() => setShowCalc(false)} />
    </div>
  )
}
