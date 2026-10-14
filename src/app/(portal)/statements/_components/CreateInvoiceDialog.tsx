'use client'

import { useEffect, useRef, useState } from 'react'
import { DateField } from '@/components/finv/DateField'
import { DialogButton, DialogForm, Field, FinDialog, Hint, Input } from '@/components/finv/Dialog'
import { money, neededSentence, num } from '@/components/finv/form-words'
import fm from '@/components/finv/form.module.css'
import { Select } from '@/components/hrv/select'
import type { DirectorCtcComponents } from '@/lib/director-ctc-lines'
import { billingModeLabel } from '@/lib/invoice-labels'
import {
  STAFF_MODE_DEPT,
  monthEnd,
  parseBillTo,
  partialSentence,
  planCreateInvoices,
  plusDays,
  type InvoiceCategory,
  type InvoiceTarget,
} from '../_lib/invoice-form'
import { hubCreateInvoice, hubCreateLinesInvoice, type HubInvoiceParty } from '../invoice-actions'
import {
  BillToSelect,
  CategorySelect,
  ModeSelect,
  PartyFields,
  PeriodSelect,
  companyLabel,
  useHrFigures,
  type DialogCompany,
  type DialogDepartment,
  type PartyContact,
} from './InvoiceFormParts'

// Create invoice (2026-10-14, the Finance revamp v2 — D10, the prototype's
// `inv-form`): Bill to, Description, Category, Billing mode, Amount RM,
// Invoice date, Due date; *Cancel* and *Save draft*, the sub *Saved as draft ·
// approve to issue*. The system's Create Invoice made a batch — several
// companies, each split across billing modes, HR's staff and director figures
// filled in — so those open from the small buttons under the fields, as Create
// payment's do; a staff or director recharge on one company fills its amount
// from HR as the batch did. The invoice date follows the month until it is
// touched (2026-08-13), the due date is thirty days on.

interface CompanyRow {
  key: number
  companyId: string
  amount: string
}
interface PoolRow {
  key: number
  mode: string
  category: string
  amount: string
}

const r2 = (n: number) => Math.round(n * 100) / 100
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monthWords = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`

/** The description a recharge from HR's figures starts with, as the old batch wrote it. */
function hrDescription(mode: string, month: string): string {
  if (mode === 'director_attribution') return `Director salary CTC — ${monthWords(month)}`
  return `${STAFF_MODE_DEPT[mode]} staff cost allocation — ${monthWords(month)}`
}

export default function CreateInvoiceDialog({
  open,
  onClose,
  onDone,
  period,
  today,
  companies,
  departments,
  categories,
  extraModes,
}: {
  open: boolean
  onClose: () => void
  /** Saved: the hub's toast says this, and the list is read again. */
  onDone: (message: string) => void
  /** The hub's month, `YYYY-MM-01`. */
  period: string
  today: string
  companies: DialogCompany[]
  departments: DialogDepartment[]
  categories: InvoiceCategory[]
  extraModes: ReadonlyArray<{ value: string; label: string }>
}) {
  const hubMonth = period.slice(0, 7)
  const keySeq = useRef(0)
  const nextKey = () => ++keySeq.current

  const [billTo, setBillTo] = useState('')
  const [name, setName] = useState('')
  const [contact, setContact] = useState<PartyContact>({ address: '', phone: '', email: '' })
  const [desc, setDesc] = useState('')
  const [category, setCategory] = useState('')
  const [mode, setMode] = useState('hr_attribution')
  const [amount, setAmount] = useState('')
  const [month, setMonth] = useState(hubMonth)
  const [invoiceDate, setInvoiceDate] = useState(monthEnd(hubMonth))
  const [dateTouched, setDateTouched] = useState(false)
  const [dueDate, setDueDate] = useState(plusDays(today, 30))
  const [reference, setReference] = useState('')
  // What the small buttons open.
  const [several, setSeveral] = useState(false)
  const [rows, setRows] = useState<CompanyRow[]>([])
  const [split, setSplit] = useState(false)
  const [pools, setPools] = useState<PoolRow[]>([])
  const [showPeriod, setShowPeriod] = useState(false)
  const [showRef, setShowRef] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Some went in and some did not: the dialog only closes now. */
  const [partly, setPartly] = useState(false)

  const bill = parseBillTo(billTo)
  const company = companies.find((c) => c.id === bill.companyId) ?? null

  // ── HR's figures: a staff or director recharge on companies, not split ──
  const hr = useHrFigures((several || bill.kind === 'subsidiary') && !split, mode, month)
  /** The description HR's figures wrote — rewritten with them while untouched. */
  const autoDesc = useRef<string | null>(null)
  const fillDesc = (next: string) => {
    if (desc.trim() && desc !== autoDesc.current) return
    setDesc(next)
    autoDesc.current = next
  }
  /** The amount HR's figure put in the Amount field — replaced while untouched. */
  const autoAmount = useRef<string | null>(null)
  const applied = useRef('')
  useEffect(() => {
    if (several || bill.kind !== 'subsidiary' || hr.status !== 'ready') return
    const at = `${hr.key}|${bill.companyId}`
    if (applied.current === at) return
    applied.current = at
    const figure = hr.byCompany.get(bill.companyId)
    const untouched = amount === '' || amount === autoAmount.current
    if (!untouched) return
    const next = figure ? figure.amount.toFixed(2) : ''
    setAmount(next)
    autoAmount.current = next || null
    if (figure) fillDesc(hrDescription(mode, month))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hr.status, hr.key, bill.companyId, bill.kind, several])

  // Several companies: HR's companies replace the rows, once for each mode and month.
  const appliedRows = useRef('')
  useEffect(() => {
    if (!several || hr.status !== 'ready' || appliedRows.current === hr.key) return
    appliedRows.current = hr.key
    if (hr.byCompany.size === 0) return
    const order = new Map(companies.map((c, i) => [c.id, i]))
    const ids = [...hr.byCompany.keys()].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999))
    setRows(ids.map((id) => ({ key: nextKey(), companyId: id, amount: (hr.byCompany.get(id)?.amount ?? 0).toFixed(2) })))
    fillDesc(hrDescription(mode, month))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [several, hr.status, hr.key])

  const pickMonth = (m: string) => {
    setMonth(m)
    if (!dateTouched) setInvoiceDate(monthEnd(m))
  }

  const toggleSeveral = () => {
    if (several) {
      const first = rows.find((r) => r.companyId) ?? null
      setBillTo(first ? `co:${first.companyId}` : '')
      setAmount(first?.amount ?? '')
      autoAmount.current = null
      applied.current = ''
      setRows([])
      setSeveral(false)
      return
    }
    setRows([{ key: nextKey(), companyId: bill.kind === 'subsidiary' ? bill.companyId : '', amount: bill.kind === 'subsidiary' ? amount : '' }])
    appliedRows.current = ''
    setSeveral(true)
  }
  const toggleSplit = () => {
    if (split) {
      const first = pools[0]
      if (first?.mode) setMode(first.mode)
      if (first?.category) setCategory(first.category)
      setPools([])
      setSplit(false)
      return
    }
    setPools([
      { key: nextKey(), mode, category, amount: !several && num(amount) > 0 ? num(amount).toFixed(2) : '' },
      { key: nextKey(), mode: '', category: '', amount: '' },
    ])
    setSplit(true)
  }
  // What a small button hides is not sent: the hub's month again, no reference.
  const togglePeriod = () => {
    if (showPeriod) pickMonth(hubMonth)
    setShowPeriod(!showPeriod)
  }
  const toggleRef = () => {
    if (showRef) setReference('')
    setShowRef(!showRef)
  }
  const setRow = (key: number, patch: Partial<CompanyRow>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const setPool = (key: number, patch: Partial<PoolRow>) => setPools((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)))

  // ── What is still missing ──
  const filledRows = rows.filter((r) => r.companyId && num(r.amount) > 0)
  const rowSum = r2(filledRows.reduce((s, r) => s + num(r.amount), 0))
  const poolSum = r2(pools.reduce((s, p) => s + num(p.amount), 0))
  const need: string[] = []
  if (several) {
    if (filledRows.length === 0) need.push('a company and its amount')
  } else if (!bill.kind) need.push('Bill to')
  else if ((bill.kind === 'director' || bill.kind === 'freetext') && !name.trim()) need.push('a name')
  if (!desc.trim()) need.push('a description')
  if (split) {
    if (pools.some((p) => !p.mode || !p.category || !(num(p.amount) > 0))) need.push('each line’s billing mode, category and amount')
  } else if (!category) need.push('a category')
  if (!several && !(num(amount) > 0)) need.push('an amount')
  const twice = several ? filledRows.find((r, i) => filledRows.findIndex((o) => o.companyId === r.companyId) !== i) : undefined
  const loose = several && rows.some((r) => !r.companyId && num(r.amount) > 0)
  const samePool = split && pools.some((p, i) => p.mode && p.category && pools.findIndex((o) => o.mode === p.mode && o.category === p.category) !== i)
  const offBy = split && !several && num(amount) > 0 ? r2(num(amount) - poolSum) : 0
  const twiceName = twice ? companyLabel(companies.find((c) => c.id === twice.companyId) ?? { id: '', name: 'A company', short_code: '' }) : ''
  const problem =
    neededSentence(need) ??
    (twice ? `${twiceName} is listed twice — one row a company.` : null) ??
    (loose ? 'A row has an amount but no company.' : null) ??
    (samePool ? 'Two lines have the same billing mode and category — make them one.' : null) ??
    (Math.abs(offBy) > 0.005 ? `The lines add up to RM ${money(poolSum)} — the amount is RM ${money(num(amount))}.` : null)
  const ok = problem === null && !partly

  // ── HR's note, under what it filled ──
  let hrNote: string | null = null
  if (hr.key && hr.source) {
    const what = hr.source === 'director' ? 'director CTC' : `${STAFF_MODE_DEPT[mode]} staff billing allocation`
    const itemised = hr.source === 'director' ? ' Itemised as HR keyed it; a changed amount goes out as one line.' : ''
    const when = monthWords(month)
    if (hr.status === 'loading') hrNote = `Reading the ${what}…`
    else if (hr.status === 'error') hrNote = `The ${what} could not be read — enter the ${several ? 'amounts' : 'amount'}.`
    else if (several) hrNote = hr.byCompany.size > 0 ? `From the ${what}, ${when}.${itemised}` : `No ${what} for ${when} — enter the amounts.`
    else if (company)
      hrNote = hr.byCompany.has(company.id)
        ? `From the ${what}, ${when}.${itemised}`
        : `No ${what} for ${companyLabel(company)} in ${when} — enter the amount.`
  }

  const partyOf = (t: InvoiceTarget): HubInvoiceParty => ({
    billKind: t.billKind,
    companyId: t.companyId,
    deptId: t.deptId,
    name: t.name,
    ...(t.billKind === 'freetext' ? contact : {}),
  })

  const save = async () => {
    setTried(true)
    if (!ok || busy) return
    setBusy(true)
    setError(null)
    const targets: InvoiceTarget[] = several
      ? filledRows.map((r) => {
          const co = companies.find((c) => c.id === r.companyId)
          return { label: co ? companyLabel(co) : 'A company', billKind: 'subsidiary', companyId: r.companyId, amount: num(r.amount) }
        })
      : [
          {
            label:
              bill.kind === 'subsidiary'
                ? company
                  ? companyLabel(company)
                  : 'The company'
                : bill.kind === 'dept_pool'
                  ? (departments.find((d) => d.id === bill.deptId)?.name ?? 'The department')
                  : name.trim(),
            billKind: bill.kind ?? 'subsidiary',
            companyId: bill.kind === 'subsidiary' ? bill.companyId : undefined,
            deptId: bill.kind === 'dept_pool' ? bill.deptId : undefined,
            name: bill.kind === 'director' || bill.kind === 'freetext' ? name.trim() : undefined,
            amount: num(amount),
          },
        ]
    const ctc = new Map<string, DirectorCtcComponents>()
    if (!split && hr.source === 'director' && hr.status === 'ready') for (const [id, f] of hr.byCompany) if (f.ctc) ctc.set(id, f.ctc)
    const plan = planCreateInvoices({
      targets,
      pools: split ? pools.map((p) => ({ mode: p.mode, category: p.category, amount: num(p.amount) })) : [{ mode, category, amount: num(amount) }],
      split,
      several,
      period: month,
      ctc,
      modeLabel: (m) => billingModeLabel(m, extraModes),
    })
    const head = { period: month, invoiceDate, dueDate, description: desc.trim(), reference: reference.trim() }
    const made: string[] = []
    const failures: Array<{ label: string; reason: string }> = []
    for (const p of plan) {
      try {
        const res =
          p.kind === 'lines'
            ? await hubCreateLinesInvoice({ ...partyOf(p.target), ...head, mode: p.mode, lines: p.lines })
            : await hubCreateInvoice({ ...partyOf(p.target), ...head, mode: p.mode, category: p.category, amount: p.amount })
        if (res.ok) made.push(res.value ?? 'A draft')
        else failures.push({ label: p.label, reason: res.reason })
      } catch (err) {
        failures.push({ label: p.label, reason: err instanceof Error ? err.message : 'It did not go through.' })
      }
    }
    setBusy(false)
    if (failures.length === 0) {
      onDone(made.length === 1 ? `${made[0]} saved as draft` : `${made.length} invoices saved as drafts`)
      onClose()
      return
    }
    if (made.length > 0) {
      setPartly(true)
      onDone(`${made.length} of ${plan.length} invoices saved as drafts`)
      setError(partialSentence(made.length, failures))
    } else setError(failures.length === 1 ? failures[0].reason : partialSentence(0, failures))
  }

  const hint = error ? (
    <Hint danger>{error}</Hint>
  ) : tried && problem ? (
    <Hint>{problem}</Hint>
  ) : (
    <Hint>Saved as a draft. Approving issues it and posts it to the GL.</Hint>
  )

  return (
    <FinDialog open={open} onClose={() => !busy && onClose()} title="Create invoice" sub="Saved as draft · approve to issue" locked={busy} tall>
      <DialogForm
        buttons={
          partly ? (
            <DialogButton kind="primary" onClick={onClose}>
              Close
            </DialogButton>
          ) : (
            <>
              <DialogButton disabled={busy} onClick={onClose}>
                Cancel
              </DialogButton>
              <DialogButton kind="primary" off={!ok} disabled={busy} onClick={save}>
                {busy ? 'Saving…' : 'Save draft'}
              </DialogButton>
            </>
          )
        }
      >
        {several ? (
          <Field label="Bill to">
            <div className={fm.lines}>
              {rows.map((r, i) => (
                <div key={r.key} className={fm.lineWrap}>
                  <div className={fm.lineRow} data-shape="party">
                    <Select
                      round={12}
                      className={fm.lineSelect}
                      value={r.companyId}
                      onChange={(e) => setRow(r.key, { companyId: e.target.value })}
                      aria-label={`Company ${i + 1}`}
                    >
                      <option value="">Company</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id} data-search={c.short_code}>
                          {companyLabel(c)}
                        </option>
                      ))}
                    </Select>
                    <input
                      className={fm.lineAmount}
                      inputMode="decimal"
                      value={r.amount}
                      onChange={(e) => setRow(r.key, { amount: e.target.value })}
                      placeholder="0.00"
                      aria-label={`Company ${i + 1} amount`}
                    />
                    <button
                      type="button"
                      className={fm.remove}
                      onClick={() => setRows((prev) => prev.filter((o) => o.key !== r.key))}
                      disabled={rows.length === 1}
                      aria-label={`Remove company ${i + 1}`}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
              <div className={fm.linesFoot}>
                <button type="button" className={fm.addLine} onClick={() => setRows((prev) => [...prev, { key: nextKey(), companyId: '', amount: '' }])}>
                  + Add company
                </button>
                <span className={fm.linesTotal}>RM {money(rowSum)}</span>
              </div>
            </div>
            {hrNote ? <Hint>{hrNote}</Hint> : null}
          </Field>
        ) : (
          <>
            <Field label="Bill to" htmlFor="ci-bill">
              <BillToSelect id="ci-bill" value={billTo} onChange={setBillTo} companies={companies} departments={departments} />
            </Field>
            <PartyFields idPrefix="ci" kind={bill.kind} name={name} onName={setName} contact={contact} onContact={setContact} />
          </>
        )}

        <Field label="Description" htmlFor="ci-desc">
          <Input id="ci-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. HR shared service — Oct" />
        </Field>

        {split ? (
          <Field label="Split across billing modes">
            <div className={fm.lines}>
              {pools.map((p, i) => (
                <div key={p.key} className={fm.lineWrap}>
                  <div className={fm.lineRow} data-shape="pool">
                    <ModeSelect value={p.mode} onChange={(m) => setPool(p.key, { mode: m })} extraModes={extraModes} label={`Line ${i + 1} billing mode`} blank="Billing mode" inLine />
                    <CategorySelect value={p.category} onChange={(c) => setPool(p.key, { category: c })} categories={categories} label={`Line ${i + 1} category`} blank="Category" inLine />
                    <input
                      className={fm.lineAmount}
                      inputMode="decimal"
                      value={p.amount}
                      onChange={(e) => setPool(p.key, { amount: e.target.value })}
                      placeholder={several ? 'Share' : '0.00'}
                      aria-label={`Line ${i + 1} ${several ? 'share' : 'amount'}`}
                    />
                    <button
                      type="button"
                      className={fm.remove}
                      onClick={() => setPools((prev) => prev.filter((o) => o.key !== p.key))}
                      disabled={pools.length === 1}
                      aria-label={`Remove line ${i + 1}`}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
              <div className={fm.linesFoot}>
                <button type="button" className={fm.addLine} onClick={() => setPools((prev) => [...prev, { key: nextKey(), mode: '', category: '', amount: '' }])}>
                  + Add line
                </button>
                <span className={fm.linesTotal} data-off={Math.abs(offBy) > 0.005 ? 'true' : undefined}>
                  {several ? money(poolSum) : `RM ${money(poolSum)}`}
                </span>
              </div>
            </div>
            {several ? <Hint>Each company’s amount is split in these proportions — one invoice for each company and line.</Hint> : null}
          </Field>
        ) : (
          <>
            <Field label="Category" htmlFor="ci-category">
              <CategorySelect id="ci-category" value={category} onChange={setCategory} categories={categories} />
            </Field>
            <Field label="Billing mode" htmlFor="ci-mode">
              <ModeSelect id="ci-mode" value={mode} onChange={setMode} extraModes={extraModes} />
            </Field>
          </>
        )}

        {several ? null : (
          <Field label="Amount RM" htmlFor="ci-amount">
            <Input id="ci-amount" mono align="right" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            {hrNote ? <Hint>{hrNote}</Hint> : null}
          </Field>
        )}

        <Field label="Invoice date">
          <DateField
            value={invoiceDate}
            onChange={(d) => {
              setDateTouched(true)
              setInvoiceDate(d)
            }}
            today={today}
            label="Invoice date"
          />
        </Field>
        <Field label="Due date">
          <DateField value={dueDate} onChange={setDueDate} today={today} label="Due date" emptyText="No due date" onClear={() => setDueDate('')} />
        </Field>

        {showPeriod ? (
          <Field label="Period" htmlFor="ci-period">
            <PeriodSelect id="ci-period" value={month} onChange={pickMonth} around={hubMonth} />
          </Field>
        ) : null}
        {showRef ? (
          <Field label="Reference no" htmlFor="ci-ref">
            <Input id="ci-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="PO number, contract ref" />
          </Field>
        ) : null}

        <div className={fm.more} role="group" aria-label="More">
          <button type="button" className={fm.moreBtn} aria-pressed={several} onClick={toggleSeveral}>
            Several companies
          </button>
          <button type="button" className={fm.moreBtn} aria-pressed={split} onClick={toggleSplit}>
            Split billing modes
          </button>
          <button type="button" className={fm.moreBtn} aria-pressed={showPeriod} onClick={togglePeriod}>
            Period
          </button>
          <button type="button" className={fm.moreBtn} aria-pressed={showRef} onClick={toggleRef}>
            Reference no
          </button>
        </div>

        {hint}
      </DialogForm>
    </FinDialog>
  )
}
