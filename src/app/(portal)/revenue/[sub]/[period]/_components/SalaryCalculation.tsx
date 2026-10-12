'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { formatMoney } from '@/lib/utils'
import { monthShort } from '@/lib/commission/row-origin'
import { computeRevenuePay } from '@/lib/revenue-pay'
import {
  MAX_DESCRIPTION,
  PAY_LINE_KINDS,
  claimLines,
  draftLines,
  editableLines,
  draftOf,
  draftsDiffer,
  newDraft,
  payLineKind,
  payLineLabel,
  payLineTotals,
  payLinesToSave,
  seenOf,
  type PayLine,
  type PayLineDraft,
  type PayLineKind,
} from '@/lib/revenue-pay-lines'
import type { CommissionWorkbenchData } from '../../../_lib/commission-workbench'
import { savePayLines } from '../../../pay-line-actions'
import s from './commission-workbench.module.css'
import x from './salary-calculation.module.css'
import { Select } from '@/components/hrv/select'

const money = formatMoney
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * An upsell or a drop inside the commission above (2026-10-12, the user: "for
 * the drop and up sales … list with add and deduction (sales order)"): the
 * salary lists each one under the commission it is part of — its own line,
 * with the bill it changed — so the figure is never one number nobody can
 * take apart.
 */
export interface SalaryAdjustment {
  key: string
  kind: 'upsell' | 'drop'
  /** Its word, when it is more than the kind — "Cancelled" (2026-10-13). */
  label?: string
  /** The paper number HR knows the bill by — HC13254. */
  ref: string
  /** The ERP's document it was found on — HC-SO-013387 — when known. */
  bill: string | null
  /** The month the bill was settled in, `YYYY-MM-01`. */
  from: string | null
  /** A downline's upsell or drop reaching this person as override: whose. Null for their own. */
  via: string | null
  /** What it adds (+) or takes back (−) of this person's commission. */
  amount: number
  /** The bill's own page, when the portal holds it. */
  href: string | null
}

interface Props {
  staffName: string
  /** The first of the month. */
  period: string
  /** The ledger's draft commission above — personal + overriding + group reward. */
  commission: number
  /** The upsells and drops inside `commission`, each its own line. */
  adjustments?: readonly SalaryAdjustment[]
  /** The person's salary inputs, or undefined when this session may not see them. */
  source: CommissionWorkbenchData['payRows'][number] | undefined
  payUnavailable: boolean
  /** Why the month's pay lines cannot change, or null while they can. */
  closedReason: string | null
}

/**
 * The salary a salesperson's month comes to, under their ledger on Comm Cal —
 * and, since 2026-09-27, the place HR adds to it. The pencil opens the month's
 * PAY LINES: a special claim, an allowance, an incentive, a deduction, each
 * with an amount (user: "我就选 special claim，然后 key in 金额。这个就是 edit
 * 他的 payroll"). The table below recomputes as they are typed; Save writes the
 * lines and, when the month already has a payroll row, moves it in the same
 * transaction (`revenue_save_pay_lines`). The rules are
 * `lib/revenue-pay-lines.ts`: earnings in full and outside the statutory wage,
 * a deduction off take-home pay only.
 */
export default function SalaryCalculation({ staffName, period, commission, adjustments = [], source, payUnavailable, closedReason }: Props) {
  const [open, setOpen] = useState(false)
  /** Null while not editing. */
  const [drafts, setDrafts] = useState<PayLineDraft[] | null>(null)
  /** The lines the editor opened on — what the save RPC checks against. */
  const [openedFrom, setOpenedFrom] = useState<PayLine[]>([])
  const [problem, setProblem] = useState<{ key: string | null; message: string } | null>(null)
  const [showClosed, setShowClosed] = useState(false)
  const [savedNote, setSavedNote] = useState('')
  /**
   * The lines just saved, shown until the page's refreshed data brings them
   * back — `base` is what was stored when the save went out. Without it the
   * table fell back to the old lines for a second or two after Save, as if the
   * save had been lost.
   */
  const [justSaved, setJustSaved] = useState<{ base: string; lines: ReturnType<typeof draftLines> } | null>(null)
  const [saving, startSaving] = useTransition()
  const nextKey = useRef(0)
  const focusKey = useRef<string | null>(null)
  const kindFields = useRef(new Map<string, HTMLSelectElement>())

  const stored = source?.lines ?? []
  const storedKey = seenOf(stored).join('|')
  const waitingForRefresh = justSaved !== null && justSaved.base === storedKey
  const editing = drafts !== null
  const monthName = new Date(`${period}T00:00:00Z`).toLocaleDateString('en-MY', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  // A line an approved member claim put here (2026-10-08) is the claim's: it
  // counts in the pay, shows in the editor, and is never sent back to change.
  const fromClaims = claimLines(stored).map(line => ({ ...line, key: line.id }))
  const shown = editing ? [...fromClaims, ...draftLines(drafts)]
    : waitingForRefresh ? justSaved.lines
    : stored.map(line => ({ ...line, key: line.id }))
  const totals = payLineTotals(shown)
  const salary = source ? computeRevenuePay({
    ...source.input,
    payLineEarnings: totals.earnings,
    payLineDeductions: totals.deductions,
    commission: commission + source.commissionElsewhere + source.payrollAdjustment,
  }) : null
  const earningLines = shown.filter(line => !payLineKind(line.kind).deduction)
  const deductionLines = shown.filter(line => payLineKind(line.kind).deduction)
  // The commission before its upsells and drops; with them it is `commission` again.
  const adjusted = round2(adjustments.reduce((total, a) => total + a.amount, 0))
  const dirty = editing && draftsDiffer(drafts, editableLines(openedFrom))

  // A new line, or the first one on opening, takes the focus on its type.
  useEffect(() => {
    if (!focusKey.current) return
    kindFields.current.get(focusKey.current)?.focus()
    focusKey.current = null
  }, [drafts])

  // The refreshed lines have arrived: they are the truth again.
  useEffect(() => {
    if (justSaved && justSaved.base !== storedKey) setJustSaved(null)
  }, [justSaved, storedKey])

  // Typed lines are not thrown away by a stray tab close.
  useEffect(() => {
    if (!dirty) return
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [dirty])

  function freshKey() {
    nextKey.current += 1
    return `new-${nextKey.current}`
  }

  function startEditing() {
    setOpen(true)
    setSavedNote('')
    setProblem(null)
    if (closedReason) { setShowClosed(true); return }
    const start = editableLines(stored).map(draftOf)
    const first = start[0]?.key ?? freshKey()
    setOpenedFrom(stored)
    setDrafts(start.length ? start : [newDraft(first)])
    focusKey.current = first
  }

  function update(key: string, patch: Partial<Pick<PayLineDraft, 'kind' | 'description' | 'amount'>>) {
    setDrafts(current => current?.map(d => d.key === key ? { ...d, ...patch } : d) ?? null)
    setProblem(null)
  }

  function addLine() {
    const key = freshKey()
    setDrafts(current => [...(current ?? []), newDraft(key)])
    setProblem(null)
    focusKey.current = key
  }

  function removeLine(key: string) {
    setDrafts(current => current?.filter(d => d.key !== key) ?? null)
    setProblem(null)
  }

  function cancel() {
    setDrafts(null)
    setProblem(null)
  }

  function save() {
    if (!source || !drafts) return
    const check = payLinesToSave(drafts)
    if (!check.ok) { setProblem({ key: check.key, message: check.message }); return }
    setProblem(null)
    startSaving(async () => {
      try {
        const result = await savePayLines({ staffId: source.staffId, period, lines: check.lines, seen: seenOf(openedFrom) })
        setJustSaved({ base: storedKey, lines: [...fromClaims, ...draftLines(drafts)] })
        setDrafts(null)
        setSavedNote(result.payrollUpdated
          ? `Pay lines saved — ${staffName}’s ${monthName} payroll is updated.`
          : `Pay lines saved. They go into ${staffName}’s ${monthName} payroll when the month’s payroll row is made.`)
      } catch (err) {
        setProblem({ key: null, message: err instanceof Error ? err.message : 'Could not save the pay lines. Reload and try again.' })
      }
    })
  }

  return <div className={x.salary}>
    <details className={s.salaryDetails} open={open} onToggle={e => setOpen(e.currentTarget.open)}>
      <summary>Salary calculation · current preview</summary>
      {salary && source ? <>
        <p className={s.muted}>Uses this commission draft and the available payroll inputs. Allowances and overtime use {source.input.daysWorked} / {source.input.daysInMonth} days.</p>
        {showClosed && closedReason && !editing && <p className={s.warning} role="status">Pay lines for {monthName} can no longer change: {closedReason}</p>}
        {savedNote && !editing && <p className={s.notice} role="status">{savedNote}</p>}
        {editing && <div className={x.editor} role="group" aria-labelledby={`pay-lines-${source.staffId}`}
          onKeyDown={e => { if (e.key === 'Escape' && !saving) { e.stopPropagation(); cancel() } }}>
          <div className={x.editorHead}>
            <strong id={`pay-lines-${source.staffId}`}>Pay lines · {monthName}</strong>
            <span>A special claim, allowance or incentive is paid in full, with no EPF, SOCSO or EIS. A deduction comes off take-home pay.</span>
          </div>
          {fromClaims.length > 0 && <ul className={x.lines} aria-label="Lines from approved claims">
            {fromClaims.map(line => <li key={line.key} className={x.claimLine}>
              <span>{payLineLabel(line)}</span>
              <small>From a claim approved in Member Services — it changes only with the claim</small>
              <span className={x.claimAmount}>{money(line.amount)}</span>
            </li>)}
          </ul>}
          {drafts.length === 0 && <p className={x.empty}>No lines. Save to clear the month, or add one.</p>}
          <ul className={x.lines}>
            {drafts.map((draft, index) => <li key={draft.key} className={x.line} data-problem={problem?.key === draft.key ? 'true' : undefined}>
              <Select bare aria-label={`Line ${index + 1} type`} value={draft.kind} disabled={saving}
                ref={el => { if (el) kindFields.current.set(draft.key, el); else kindFields.current.delete(draft.key) }}
                onChange={e => update(draft.key, { kind: e.target.value as PayLineKind })}>
                {PAY_LINE_KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
              </Select>
              <input aria-label={`Line ${index + 1} description`} placeholder="Description (optional)" value={draft.description}
                maxLength={MAX_DESCRIPTION} disabled={saving} onChange={e => update(draft.key, { description: e.target.value })} />
              <label className={x.amount}>
                <span aria-hidden>RM</span>
                <input aria-label={`Line ${index + 1} amount`} inputMode="decimal" placeholder="0.00" value={draft.amount}
                  disabled={saving} onChange={e => update(draft.key, { amount: e.target.value })} />
              </label>
              <button type="button" className={x.remove} aria-label={`Remove line ${index + 1}`} title="Remove this line"
                disabled={saving} onClick={() => removeLine(draft.key)}>✕</button>
            </li>)}
          </ul>
          {problem && <p className={s.warning} role="alert">{problem.message}</p>}
          <div className={x.actions}>
            <button type="button" className={s.button} onClick={addLine} disabled={saving}>+ Add line</button>
            <span className={x.spacer} />
            <button type="button" className={s.ghostButton} onClick={cancel} disabled={saving}>Cancel</button>
            <button type="button" className={s.primaryButton} onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save lines'}</button>
          </div>
        </div>}
        <div className={s.tableFrame}>
          <table className={`${s.table} ${s.salaryTable}`} aria-label="Current salary calculation">
            <thead><tr><th>Component</th><th className={s.numeric}>Amount</th></tr></thead>
            <tbody>
              <tr><td>Current commission<small>Personal + overriding + group reward{adjustments.length > 0 ? ' — the upsells and drops below apart' : ''}</small></td><td className={s.numeric}>{money(round2(commission - adjusted))}</td></tr>
              {adjustments.map(a => <tr key={a.key} className={x.adjustmentRow} data-kind={a.kind}>
                <td>{a.label ?? (a.kind === 'drop' ? 'Drop sales' : 'Upsell')} · {a.href ? <Link href={a.href}>{a.ref}</Link> : a.ref}
                  <small>{[a.bill ? `Sales order ${a.bill}` : null, a.from ? `${monthShort(a.from)} bill` : null,
                    a.via ? `override on ${a.via}’s` : null].filter(Boolean).join(' · ')}</small></td>
                <td className={s.numeric}>{a.amount < 0 ? <span className="neg">{money(a.amount)}</span> : `+ ${money(a.amount)}`}</td></tr>)}
              <tr><td>Other programmes<small>Already applied for this month</small></td><td className={s.numeric}>{money(source.commissionElsewhere)}</td></tr>
              <tr><td>Payroll adjustment</td><td className={s.numeric}>{money(source.payrollAdjustment)}</td></tr>
              <tr><td>Employer contributions deducted<small>EPF + SOCSO + EIS, funded from commission</small></td><td className={s.numeric}>{money(-salary.employerContributions)}</td></tr>
              <tr><td>Statutory allowance<small>Prorated</small></td><td className={s.numeric}>{money(salary.proratedStatutoryAllowance)}</td></tr>
              <tr><td>Other allowances</td><td className={s.numeric}>{money(source.input.nonStatutoryAllowance)}</td></tr>
              <tr><td>Overtime<small>Prorated</small></td><td className={s.numeric}>{money(salary.proratedOt)}</td></tr>
              {earningLines.map(line => <tr key={line.key} className={x.lineRow}>
                <td>{payLineLabel(line)}<small>Pay line · paid in full, no EPF / SOCSO / EIS</small></td>
                <td className={s.numeric}>{money(line.amount)}</td></tr>)}
              <tr><td>Payroll deductions</td><td className={s.numeric}>{money(-source.input.deductionAmount)}</td></tr>
              <tr className={s.salarySubtotal}><td>Gross pay</td><td className={s.numeric}>{money(salary.gross)}</td></tr>
              <tr><td>Employee contributions<small>EPF + SOCSO + EIS</small></td><td className={s.numeric}>{money(-salary.employeeContributions)}</td></tr>
              <tr><td>{source.input.taxMode === 'withholding' ? 'Withholding tax' : source.input.taxMode === 'pcb' ? 'PCB tax' : 'Tax · none'}</td><td className={s.numeric}>{money(-(salary.pcb + salary.withholdingTax))}</td></tr>
              <tr><td>SKBBK</td><td className={s.numeric}>{money(-source.input.skbbkAmount)}</td></tr>
              {deductionLines.map(line => <tr key={line.key} className={x.lineRow}>
                <td>{payLineLabel(line)}<small>Pay line · off take-home pay</small></td>
                <td className={s.numeric}>{money(-line.amount)}</td></tr>)}
            </tbody>
            <tfoot><tr><td>Estimated take-home pay{editing && dirty ? <small>With the lines being edited — not saved yet</small> : null}</td><td className={s.numeric}>{money(salary.net)}</td></tr></tfoot>
          </table>
        </div>
      </> : <p className={s.muted}>{payUnavailable ? 'Salary preview is unavailable for this session.' : 'Payroll inputs are not set for this person.'} Commission can still be reviewed above.</p>}
    </details>
    {source && !editing && !waitingForRefresh && <button type="button" className={x.editButton} onClick={startEditing}
      aria-label={`Edit ${staffName}’s pay lines`} aria-disabled={closedReason ? 'true' : undefined}
      title={closedReason ?? 'Add a special claim, allowance, incentive or deduction'}>
      <PencilIcon />
    </button>}
  </div>
}

function PencilIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
}
