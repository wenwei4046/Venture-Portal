'use client'

import { useEffect, useState } from 'react'
import { DialogButton, DialogConfirm, DialogForm, Field, FinDialog, Hint } from '@/components/finv/Dialog'
import { money } from '@/components/finv/form-words'
import fm from '@/components/finv/form.module.css'
import type { CompanyBillingDelta } from '@/lib/payroll-billing-delta'
import type { DeptComponentGroup } from '@/lib/staff-allocation'
import type { InvoiceCategory } from '../_lib/invoice-form'
import {
  hubGenerateMarketing,
  hubGenerateOwnShare,
  hubGeneratePayrollInvoices,
  hubOwnSharePreview,
  hubPayrollDelta,
  hubPayrollPreview,
  hubTopUpPayroll,
  type HubResult,
} from '../invoice-actions'
import { CategorySelect, PeriodSelect } from './InvoiceFormParts'

// The hub's generators (2026-10-14, the Finance revamp v2 — D10's *Create
// invoice ▾ › Generate Marketing invoices* and *Payroll ▾*): the system's
// own, in the kit's sheet. Each reads what it would write before it writes
// it — HR's staff billing allocation per company, payroll against the issued
// payroll invoices, HV's own share per department — on the hub's month (or
// another, by its Period), and writes drafts only.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monthWords = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`
const PARTS: Array<[keyof DeptComponentGroup['components'], string]> = [
  ['salary', 'Salary'],
  ['allowance', 'Allowance'],
  ['epf', 'EPF'],
  ['socso', 'SOCSO'],
  ['eis', 'EIS'],
]
const r2 = (n: number) => Math.round(n * 100) / 100
const groupTotal = (g: DeptComponentGroup) => r2(PARTS.reduce((s, [k]) => s + g.components[k], 0))
const partsLine = (g: DeptComponentGroup) =>
  PARTS.filter(([k]) => g.components[k] > 0)
    .map(([k, label]) => `${label} ${money(g.components[k])}`)
    .join(' · ')
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Read a preview each time the month moves while open. */
function usePreview<T>(open: boolean, month: string, read: (month: string) => Promise<HubResult<T>>) {
  const [state, setState] = useState<{ month: string; value: T | null; error: string | null; loading: boolean }>({ month: '', value: null, error: null, loading: false })
  useEffect(() => {
    if (!open) return
    let live = true
    setState({ month, value: null, error: null, loading: true })
    read(month).then(
      (res) => live && setState({ month, value: res.ok ? res.value : null, error: res.ok ? null : res.reason, loading: false }),
      () => live && setState({ month, value: null, error: 'It could not be read. Close and try again.', loading: false }),
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, month])
  return state
}

interface GeneratorProps {
  open: boolean
  onClose: () => void
  onDone: (message: string) => void
  /** The hub's month, `YYYY-MM-01`. */
  period: string
}

// ── Generate Marketing invoices ──

export function MarketingDialog({ open, onClose, onDone, period }: GeneratorProps) {
  const month = period.slice(0, 7)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const go = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await hubGenerateMarketing(month)
      if (!res.ok) return setError(res.reason)
      const { generated, kept } = res.value
      onDone(`${plural(generated, 'Marketing invoice', 'Marketing invoices')} generated as drafts${kept > 0 ? ` · ${kept} kept as they were` : ''}`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'It did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <FinDialog open={open} onClose={() => !busy && onClose()} title="Generate Marketing invoices" locked={busy}>
      <DialogConfirm
        text={`Draft invoices for ${monthWords(month)} from the active marketing projects. Issued ones are kept as they are.`}
        confirmLabel={busy ? 'Generating…' : 'Generate'}
        busy={busy}
        error={error}
        onCancel={onClose}
        onConfirm={go}
      />
    </FinDialog>
  )
}

// ── Generate payroll invoices ──

export function PayrollInvoicesDialog({ open, onClose, onDone, period, categories }: GeneratorProps & { categories: InvoiceCategory[] }) {
  const hubMonth = period.slice(0, 7)
  const [month, setMonth] = useState(hubMonth)
  const [category, setCategory] = useState('5050')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const preview = usePreview(open, month, hubPayrollPreview)
  const companies = preview.value ?? []
  const total = r2(companies.reduce((s, c) => s + c.total, 0))
  const ok = !preview.loading && companies.length > 0 && !!category

  const go = async () => {
    if (!ok || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await hubGeneratePayrollInvoices(month, category)
      if (!res.ok) return setError(res.reason)
      onDone(`${plural(res.value.generated, 'payroll invoice', 'payroll invoices')} generated as drafts`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'It did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FinDialog open={open} onClose={() => !busy && onClose()} title="Generate payroll invoices" sub="One draft a company · HR, Finance and Director Office" locked={busy}>
      <DialogForm
        buttons={
          <>
            <DialogButton disabled={busy} onClick={onClose}>
              Cancel
            </DialogButton>
            <DialogButton kind="primary" off={!ok} disabled={busy} onClick={go}>
              {busy ? 'Generating…' : 'Generate drafts'}
            </DialogButton>
          </>
        }
      >
        <Field label="Period" htmlFor="pi-period">
          <PeriodSelect id="pi-period" value={month} onChange={setMonth} around={hubMonth} />
        </Field>
        <Field label="Category" htmlFor="pi-category">
          <CategorySelect id="pi-category" value={category} onChange={setCategory} categories={categories} />
        </Field>
        {preview.loading ? (
          <Hint>Reading HR’s staff billing allocation…</Hint>
        ) : preview.error ? (
          <Hint danger>{preview.error}</Hint>
        ) : companies.length === 0 ? (
          <Hint>No staff billing allocation for {monthWords(month)} — nothing to bill.</Hint>
        ) : (
          <Field label={`${plural(companies.length, 'company', 'companies')} · RM ${money(total)}`}>
            {companies.map((c) => (
              <div key={c.companyId} className={fm.summary} role="group" aria-label={c.name}>
                <div className={fm.summaryRow} data-head="true">
                  <span className={fm.summaryLabel}>{c.shortCode ? `${c.name} (${c.shortCode})` : c.name}</span>
                  <span className={fm.summaryValue}>{money(c.total)}</span>
                </div>
                {c.groups.map((g) => (
                  <div key={g.segment}>
                    <div className={fm.summaryRow}>
                      <span className={fm.summaryLabel}>{g.deptLabel}</span>
                      <span className={fm.summaryValue}>{money(groupTotal(g))}</span>
                    </div>
                    <div className={fm.summaryParts}>{partsLine(g)}</div>
                  </div>
                ))}
              </div>
            ))}
          </Field>
        )}
        {error ? <Hint danger>{error}</Hint> : <Hint>Drafts — each line posts to its department’s P&amp;L once the invoice is approved.</Hint>}
      </DialogForm>
    </FinDialog>
  )
}

// ── Reconcile payroll (对数补差, 2026-09-04) ──

function tagOf(r: CompanyBillingDelta): { text: string; tone: 'ledger' | 'alert' | 'danger' } | null {
  if (r.delta === 0) return { text: 'matches ✓', tone: 'ledger' }
  if (!r.hasIssuedInvoice) return { text: 'not invoiced', tone: 'alert' }
  if (r.positiveTotal > 0.005) return { text: `under-billed ${money(r.positiveTotal)}`, tone: 'danger' }
  return null
}

export function ReconcileDialog({ open, onClose, onDone, period }: GeneratorProps) {
  const hubMonth = period.slice(0, 7)
  const [month, setMonth] = useState(hubMonth)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const delta = usePreview(open, month, hubPayrollDelta)
  const rows = delta.value ?? []
  const under = rows.filter((r) => r.hasIssuedInvoice && r.positiveTotal > 0.005)
  const missing = rows.filter((r) => !r.hasIssuedInvoice && r.positiveTotal > 0.005)
  const over = rows.filter((r) => r.negatives.length > 0)
  const topUp = r2(under.reduce((s, r) => s + r.positiveTotal, 0))
  const ok = !delta.loading && under.length > 0

  const go = async () => {
    if (!ok || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await hubTopUpPayroll(month)
      if (!res.ok) return setError(res.reason)
      onDone(`Adjustment drafts for ${res.value.generated.join(', ') || 'none'} — review and issue them as usual`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'It did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FinDialog open={open} onClose={() => !busy && onClose()} title="Reconcile payroll" sub="Payroll now against the issued payroll invoices" locked={busy}>
      <DialogForm
        buttons={
          <>
            <DialogButton disabled={busy} onClick={onClose}>
              Close
            </DialogButton>
            <DialogButton kind="primary" off={!ok} disabled={busy} onClick={go}>
              {busy ? 'Drafting…' : under.length === 0 ? 'Nothing to top up' : `Top up · ${plural(under.length, 'draft', 'drafts')} · RM ${money(topUp)}`}
            </DialogButton>
          </>
        }
      >
        <Field label="Period" htmlFor="rp-period">
          <PeriodSelect id="rp-period" value={month} onChange={setMonth} around={hubMonth} />
        </Field>
        {delta.loading ? (
          <Hint>Reading payroll and the payroll invoices…</Hint>
        ) : delta.error ? (
          <Hint danger>{delta.error}</Hint>
        ) : rows.length === 0 ? (
          <Hint>No payroll allocation and no payroll invoice in {monthWords(month)} — nothing to compare.</Hint>
        ) : (
          <Field label="Billed → should">
            {rows.map((r) => {
              const tag = tagOf(r)
              return (
                <div key={r.companyId} className={fm.summary} role="group" aria-label={r.name}>
                  <div className={fm.summaryRow} data-head="true">
                    <span className={fm.summaryLabel}>
                      {r.shortCode || r.name}
                      {tag ? (
                        <span className={fm.tag} data-tone={tag.tone}>
                          {tag.text}
                        </span>
                      ) : null}
                      {r.negatives.length > 0 ? (
                        <span className={fm.tag} data-tone="alert">
                          over-billed
                        </span>
                      ) : null}
                    </span>
                    <span className={fm.summaryValue}>{r.delta === 0 ? '—' : `${r.delta > 0 ? '+' : '−'}${money(Math.abs(r.delta))}`}</span>
                  </div>
                  <div className={fm.summaryRow}>
                    <span className={fm.summaryLabel}>Billed {money(r.billed)}</span>
                    <span className={fm.summaryValue}>should {money(r.should)}</span>
                  </div>
                  {r.segments
                    .filter((s) => s.delta !== 0)
                    .map((s) => (
                      <div key={s.segment} className={fm.summaryParts}>
                        {`${s.deptLabel}: ${money(s.billed)} → ${money(s.should)} (${s.delta > 0 ? '+' : '−'}${money(Math.abs(s.delta))})`}
                        {s.componentDeltas ? ` · ${s.componentDeltas.map((c) => `${c.label} ${money(c.amount)}`).join(' / ')}` : ''}
                      </div>
                    ))}
                </div>
              )
            })}
          </Field>
        )}
        {missing.length > 0 ? (
          <Hint>{missing.map((r) => r.shortCode || r.name).join(', ')} {missing.length === 1 ? 'has' : 'have'} no payroll invoice this month — Generate payroll invoices makes it; it is not topped up here.</Hint>
        ) : null}
        {over.length > 0 ? <Hint>Over-billed parts are not undone here — a payroll invoice takes no credit note; Finance settles them by hand.</Hint> : null}
        {error ? <Hint danger>{error}</Hint> : <Hint>The top-ups are drafts dated the month’s last day — they count in that month once issued.</Hint>}
      </DialogForm>
    </FinDialog>
  )
}

// ── Own-share → Venture (Office) ──

export function OwnShareDialog({ open, onClose, onDone, period, categories }: GeneratorProps & { categories: InvoiceCategory[] }) {
  const hubMonth = period.slice(0, 7)
  const [month, setMonth] = useState(hubMonth)
  const [category, setCategory] = useState('5050')
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const preview = usePreview(open, month, hubOwnSharePreview)
  // The registry's ticks, each time the month's share is read.
  const [seeded, setSeeded] = useState('')
  if (preview.value && !preview.loading && seeded !== preview.month) {
    setSeeded(preview.month)
    setTicked(new Set(preview.value.billBack))
  }
  const groups = preview.value?.groups ?? []
  const chosen = groups.filter((g) => ticked.has(g.segment))
  const total = r2(chosen.reduce((s, g) => s + groupTotal(g), 0))
  const ok = !preview.loading && chosen.length > 0 && !!category

  const go = async () => {
    if (!ok || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await hubGenerateOwnShare(month, category, [...ticked])
      if (!res.ok) return setError(res.reason)
      onDone(`Own-share invoice to Venture (Office) generated as a draft · RM ${money(res.value.total)}`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'It did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FinDialog open={open} onClose={() => !busy && onClose()} title="Own-share → Venture (Office)" sub="One internal invoice · no cash moves" locked={busy}>
      <DialogForm
        buttons={
          <>
            <DialogButton disabled={busy} onClick={onClose}>
              Cancel
            </DialogButton>
            <DialogButton kind="primary" off={!ok} disabled={busy} onClick={go}>
              {busy ? 'Generating…' : 'Generate draft'}
            </DialogButton>
          </>
        }
      >
        <Field label="Period" htmlFor="os-period">
          <PeriodSelect id="os-period" value={month} onChange={setMonth} around={hubMonth} />
        </Field>
        <Field label="Category" htmlFor="os-category">
          <CategorySelect id="os-category" value={category} onChange={setCategory} categories={categories} />
        </Field>
        {preview.loading ? (
          <Hint>Reading HV’s own share…</Hint>
        ) : preview.error ? (
          <Hint danger>{preview.error}</Hint>
        ) : groups.length === 0 ? (
          <Hint>No own share in {monthWords(month)} — every department’s payroll was billed to the companies.</Hint>
        ) : (
          <Field label={`Bill to Venture (Office) · RM ${money(total)}`}>
            <div className={fm.checks} role="group" aria-label="Departments">
              {groups.map((g) => (
                <div key={g.segment}>
                  <label className={fm.check}>
                    <input
                      type="checkbox"
                      checked={ticked.has(g.segment)}
                      onChange={() =>
                        setTicked((prev) => {
                          const next = new Set(prev)
                          if (next.has(g.segment)) next.delete(g.segment)
                          else next.add(g.segment)
                          return next
                        })
                      }
                    />
                    <span className={fm.checkName}>{g.deptLabel}</span>
                    <span className={fm.checkValue}>{money(groupTotal(g))}</span>
                  </label>
                  <div className={fm.summaryParts}>{partsLine(g)}</div>
                </div>
              ))}
            </div>
          </Field>
        )}
        {error ? (
          <Hint danger>{error}</Hint>
        ) : (
          <Hint>A department left unticked keeps its share in its own pool. The ticks are Settings › Departments’; a change here is this run only. It settles by netting.</Hint>
        )}
      </DialogForm>
    </FinDialog>
  )
}
