'use client'

import { useEffect, useRef, useState } from 'react'
import { DateField } from '@/components/finv/DateField'
import { DialogButton, DialogForm, Field, FinDialog, Hint, Input } from '@/components/finv/Dialog'
import { money, neededSentence, num } from '@/components/finv/form-words'
import fm from '@/components/finv/form.module.css'
import { buildAllocationInvoiceLines, periodShortLabel } from '@/lib/staff-allocation'
import { STAFF_MODE_DEPT, billToValue, parseBillTo, plusDays, type BillKind, type InvoiceCategory } from '../_lib/invoice-form'
import type { InvoiceEditInitial } from '../_lib/invoice-model'
import { hubCreateLinesInvoice, hubUpdateInvoice } from '../invoice-actions'
import {
  BillToSelect,
  CategorySelect,
  ModeSelect,
  PartyFields,
  PeriodSelect,
  companyLabel,
  contactAddressOut,
  useHrFigures,
  type DialogCompany,
  type DialogDepartment,
  type PartyContact,
} from './InvoiceFormParts'
import { EMPTY_ADDRESS, addressFromParts, addressRefusal, isEmptyAddress } from '@/lib/address/address'
import { loadMalaysia } from '@/lib/address/malaysia'

// Multi-line invoice (2026-10-14, the Finance revamp v2 — D10, the prototype's
// `inv-form` with its lines): Bill to, Description, Category, Billing mode,
// the lines, Invoice date, Due date; *Total RM … · saved as a draft.* One
// invoice whose lines each carry a description and an amount — a category
// for every line, or one each (*Category per line*). A shared-services
// recharge to a company fills its five lines from HR's allocation, as the
// system's multi-line form did.
//
// The same dialog edits an invoice (the system's Edit mirrors its create form
// 1:1): a draft is rewritten whole; an issued or paid one keeps its number,
// its entry corrected in place, with a reason — and once money has come in,
// its amounts, its payer and its month stay as they are.
//
// On a desktop it is the kit's wide window, 680px (2026-10-30 — the user:
// "key line 时 key description 看到不是很清楚"): a line shows about 65
// characters of its description instead of 40. The phone's sheet is unchanged.

export interface InvoiceEditing {
  id: string
  no: string | null
  /** draft · issued · paid · paid_via_netting */
  status: string
  /** Money has come in against it. */
  settled: boolean
  initial: InvoiceEditInitial
  lines: Array<{ description: string | null; amount: number; category_code: string | null }>
}

interface LineRow {
  key: number
  desc: string
  amount: string
  category: string
}

const r2 = (n: number) => Math.round(n * 100) / 100
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function billToOf(i: InvoiceEditInitial): string {
  const kind = (i.billable_to_type ?? (i.company_id ? 'subsidiary' : '')) as BillKind | ''
  if (kind === 'subsidiary') return billToValue('subsidiary', i.company_id ?? '')
  if (kind === 'dept_pool') return billToValue('dept_pool', i.billable_to_department_id ?? '')
  return kind ? billToValue(kind) : ''
}

export default function InvoiceLinesDialog({
  open,
  onClose,
  onDone,
  period,
  today,
  companies,
  departments,
  categories,
  extraModes,
  editing = null,
}: {
  open: boolean
  onClose: () => void
  onDone: (message: string) => void
  /** The hub's month, `YYYY-MM-01`. */
  period: string
  today: string
  companies: DialogCompany[]
  departments: DialogDepartment[]
  categories: InvoiceCategory[]
  extraModes: ReadonlyArray<{ value: string; label: string }>
  /** Edit this invoice instead of making one. */
  editing?: InvoiceEditing | null
}) {
  const hubMonth = period.slice(0, 7)
  const init = editing?.initial ?? null
  const issued = !!editing && editing.status !== 'draft'
  const locked = issued && !!editing?.settled
  const keySeq = useRef(0)
  const nextKey = () => ++keySeq.current

  // Stored lines, or a simple invoice as its one line (its description stays the header's).
  const startLines = (): LineRow[] => {
    if (!editing) return [0, 1].map(() => ({ key: nextKey(), desc: '', amount: '', category: '' }))
    if (editing.lines.length > 0)
      return editing.lines.map((l) => ({ key: nextKey(), desc: l.description ?? '', amount: Number(l.amount).toFixed(2), category: l.category_code ?? '' }))
    return [{ key: nextKey(), desc: '', amount: Number(editing.initial.total_amount).toFixed(2), category: editing.initial.category_code ?? '' }]
  }
  const [lines, setLines] = useState<LineRow[]>(startLines)
  const sameCategory = lines.every((l) => l.category === lines[0]?.category)
  const [perLine, setPerLine] = useState(!sameCategory)
  const [category, setCategory] = useState(sameCategory ? (lines[0]?.category ?? '') : '')

  const [billTo, setBillTo] = useState(init ? billToOf(init) : '')
  const [name, setName] = useState(init?.billable_to_freetext_name ?? '')
  // The address in its six parts (2026-10-20); an invoice billed before them keeps its one-box text, on file.
  const [contact, setContact] = useState<PartyContact>(() => {
    const kept = addressFromParts(init?.billable_to_freetext_address_parts)
    const parts = kept && !isEmptyAddress(kept) ? kept : null
    return {
      address: parts ?? EMPTY_ADDRESS,
      addressOnFile: parts ? null : (init?.billable_to_freetext_address ?? null),
      phone: init?.billable_to_freetext_phone ?? '',
      email: init?.billable_to_freetext_email ?? '',
    }
  })
  const [desc, setDesc] = useState(init?.description ?? '')
  const [mode, setMode] = useState(init?.billing_mode ?? 'marketing_project')
  const [month, setMonth] = useState(init?.period_month ? init.period_month.slice(0, 7) : hubMonth)
  const [invoiceDate, setInvoiceDate] = useState(init ? (init.invoice_date ?? '') : today)
  const [dueDate, setDueDate] = useState(init ? (init.due_date ?? '') : plusDays(today, 30))
  const [reference, setReference] = useState(init?.reference_no ?? '')
  const [showPeriod, setShowPeriod] = useState(false)
  const [showRef, setShowRef] = useState(!!init?.reference_no)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const bill = parseBillTo(billTo)
  const company = companies.find((c) => c.id === bill.companyId) ?? null

  // ── A shared-services recharge to a company: its five lines from HR (making one, not editing) ──
  const staffMode = mode in STAFF_MODE_DEPT
  const hr = useHrFigures(!editing && bill.kind === 'subsidiary' && staffMode, mode, month)
  const autoLines = useRef<string | null>(null)
  const autoDesc = useRef<string | null>(null)
  const applied = useRef('')
  const linesKey = (ls: LineRow[]) => JSON.stringify(ls.map((l) => [l.desc, l.amount]))
  useEffect(() => {
    if (editing || bill.kind !== 'subsidiary' || hr.status !== 'ready') return
    const at = `${hr.key}|${bill.companyId}`
    if (applied.current === at) return
    applied.current = at
    const untouched = lines.every((l) => !l.desc && !l.amount) || linesKey(lines) === autoLines.current
    const figure = hr.byCompany.get(bill.companyId)
    if (!untouched || !figure?.staff) return
    const dept = STAFF_MODE_DEPT[mode]
    const short = periodShortLabel(month)
    const drafts = buildAllocationInvoiceLines(figure.staff, short, dept)
    const next = drafts.map((d) => ({ key: nextKey(), desc: d.description, amount: d.amount.toFixed(2), category: '' }))
    setLines(next)
    autoLines.current = linesKey(next)
    const nextDesc = `Salary - ${dept} - ${short}`
    if (!desc.trim() || desc === autoDesc.current) {
      setDesc(nextDesc)
      autoDesc.current = nextDesc
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hr.status, hr.key, bill.companyId, bill.kind])

  let hrNote: string | null = null
  if (hr.key && company) {
    const what = `${STAFF_MODE_DEPT[mode]} staff billing allocation`
    const when = `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`
    if (hr.status === 'loading') hrNote = `Reading the ${what}…`
    else if (hr.status === 'error') hrNote = `The ${what} could not be read — enter the lines.`
    else
      hrNote = hr.byCompany.get(company.id)?.staff
        ? `From the ${what}, ${when}.`
        : `No ${what} for ${companyLabel(company)} in ${when} — enter the lines.`
  }

  const setLine = (key: number, patch: Partial<LineRow>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const togglePerLine = () => {
    if (perLine) {
      setCategory(lines.find((l) => l.category)?.category ?? '')
      setPerLine(false)
      return
    }
    setLines((prev) => prev.map((l) => ({ ...l, category: l.category || category })))
    setPerLine(true)
  }
  // What a small button hides is not sent: the month it had, no reference.
  const togglePeriod = () => {
    if (showPeriod) setMonth(init?.period_month ? init.period_month.slice(0, 7) : hubMonth)
    setShowPeriod(!showPeriod)
  }
  const toggleRef = () => {
    if (showRef) setReference('')
    setShowRef(!showRef)
  }

  // ── What is still missing ──
  const filled = lines.filter((l) => num(l.amount) > 0)
  const total = r2(filled.reduce((s, l) => s + num(l.amount), 0))
  const need: string[] = []
  if (!bill.kind) need.push('Bill to')
  else if ((bill.kind === 'director' || bill.kind === 'freetext') && !name.trim()) need.push('a name')
  if (filled.length === 0) need.push('a line with an amount')
  else if (filled.length >= 2 && filled.some((l) => !l.desc.trim())) need.push('each line’s description')
  if (issued && !reason.trim()) need.push('a reason')
  const problem = neededSentence(need)
  const ok = problem === null

  const save = async () => {
    setTried(true)
    if (!ok || busy || !bill.kind) return
    setBusy(true)
    setError(null)
    // A typed party's address is checked against Malaysia's list here first (the server asks again).
    const refused =
      bill.kind === 'freetext' && !isEmptyAddress(contact.address) ? addressRefusal(contact.address, await loadMalaysia()) : null
    if (refused) {
      setError(refused)
      setBusy(false)
      return
    }
    const payload = {
      billKind: bill.kind,
      companyId: bill.kind === 'subsidiary' ? bill.companyId : undefined,
      deptId: bill.kind === 'dept_pool' ? bill.deptId : undefined,
      name: bill.kind === 'director' || bill.kind === 'freetext' ? name.trim() : undefined,
      ...(bill.kind === 'freetext' ? { ...contactAddressOut(contact), phone: contact.phone, email: contact.email } : {}),
      mode,
      period: month,
      invoiceDate,
      dueDate,
      description: desc.trim(),
      reference: reference.trim(),
      lines: filled.map((l) => ({ description: l.desc.trim(), amount: r2(num(l.amount)), categoryCode: perLine ? l.category : category })),
    }
    try {
      if (editing) {
        const res = await hubUpdateInvoice({ ...payload, id: editing.id, issued, reason: reason.trim() })
        if (!res.ok) return setError(res.reason)
        const no = editing.no ?? 'Draft'
        onDone(issued ? `${no} changed${res.value ? ` — ${res.value} corrected` : ''}` : `${no} saved`)
      } else {
        const res = await hubCreateLinesInvoice(payload)
        if (!res.ok) return setError(res.reason)
        onDone(`${res.value ?? 'The invoice'} saved as draft`)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'It did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const note = editing
    ? issued
      ? locked
        ? 'Money has come in against it: its amounts, who it bills and its month stay as they are. The entry posted at issue is corrected in place.'
        : 'The entry posted at issue is corrected in place, under the same number; the reason goes on the audit trail.'
      : `Total RM ${money(total)} · nothing posts until it is approved.`
    : `Total RM ${money(total)} · saved as a draft.`
  const statusWords = editing ? (editing.status === 'paid_via_netting' ? 'paid by netting' : editing.status) : ''

  return (
    <FinDialog
      open={open}
      onClose={() => !busy && onClose()}
      title={editing ? 'Edit invoice' : 'Multi-line invoice'}
      sub={editing ? (editing.no ? `${editing.no} · ${statusWords}` : 'Draft') : 'Saved as draft · approve to issue'}
      locked={busy}
      tall
      wide
    >
      <DialogForm
        buttons={
          <>
            <DialogButton disabled={busy} onClick={onClose}>
              Cancel
            </DialogButton>
            <DialogButton kind="primary" off={!ok} disabled={busy} onClick={save}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Save draft'}
            </DialogButton>
          </>
        }
      >
        <Field label="Bill to" htmlFor="il-bill">
          <BillToSelect
            id="il-bill"
            value={billTo}
            onChange={setBillTo}
            companies={companies}
            departments={departments}
            disabled={locked}
          />
        </Field>
        <PartyFields idPrefix="il" kind={bill.kind} name={name} onName={setName} contact={contact} onContact={setContact} disabled={locked} />

        <Field label="Description" htmlFor="il-desc">
          <Input id="il-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. HR shared service — Oct" />
        </Field>
        {perLine ? null : (
          <Field label="Category" htmlFor="il-category">
            <CategorySelect id="il-category" value={category} onChange={setCategory} categories={categories} />
          </Field>
        )}
        <Field label="Billing mode" htmlFor="il-mode">
          <ModeSelect id="il-mode" value={mode} onChange={setMode} extraModes={extraModes} keep={init?.billing_mode} />
        </Field>

        <Field label="Lines">
          <div className={fm.lines}>
            {lines.map((l, i) => (
              <div key={l.key} className={fm.lineWrap}>
                <div className={fm.lineRow} data-shape={perLine ? 'item-cat' : 'item'}>
                  <input
                    className={fm.lineText}
                    value={l.desc}
                    onChange={(e) => setLine(l.key, { desc: e.target.value })}
                    placeholder={`Line ${i + 1}`}
                    aria-label={`Line ${i + 1} description`}
                  />
                  {perLine ? (
                    <CategorySelect value={l.category} onChange={(c) => setLine(l.key, { category: c })} categories={categories} label={`Line ${i + 1} category`} blank="Category" inLine />
                  ) : null}
                  <input
                    className={fm.lineAmount}
                    inputMode="decimal"
                    value={l.amount}
                    readOnly={locked}
                    onChange={(e) => setLine(l.key, { amount: e.target.value })}
                    placeholder="0.00"
                    aria-label={`Line ${i + 1} amount`}
                  />
                  <button
                    type="button"
                    className={fm.remove}
                    onClick={() => setLines((prev) => prev.filter((o) => o.key !== l.key))}
                    disabled={locked || lines.length === 1}
                    aria-label={`Remove line ${i + 1}`}
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
                disabled={locked}
                onClick={() => setLines((prev) => [...prev, { key: nextKey(), desc: '', amount: '', category: perLine ? category : '' }])}
              >
                + Add line
              </button>
              <span className={fm.linesTotal}>RM {money(total)}</span>
            </div>
          </div>
          {hrNote ? <Hint>{hrNote}</Hint> : null}
        </Field>

        <Field label="Invoice date">
          <DateField value={invoiceDate} onChange={setInvoiceDate} today={today} label="Invoice date" emptyText="No invoice date" />
        </Field>
        <Field label="Due date">
          <DateField value={dueDate} onChange={setDueDate} today={today} label="Due date" emptyText="No due date" onClear={() => setDueDate('')} />
        </Field>

        {showPeriod ? (
          <Field label="Period" htmlFor="il-period">
            <PeriodSelect id="il-period" value={month} onChange={setMonth} around={hubMonth} disabled={locked} />
          </Field>
        ) : null}
        {showRef ? (
          <Field label="Reference no" htmlFor="il-ref">
            <Input id="il-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="PO number, contract ref" />
          </Field>
        ) : null}
        {issued ? (
          <Field label="Reason" htmlFor="il-reason">
            <Input id="il-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. fee agreed at 2,500" />
          </Field>
        ) : null}

        <div className={fm.more} role="group" aria-label="More">
          <button type="button" className={fm.moreBtn} aria-pressed={perLine} onClick={togglePerLine}>
            Category per line
          </button>
          <button type="button" className={fm.moreBtn} aria-pressed={showPeriod} onClick={togglePeriod} disabled={locked}>
            Period
          </button>
          <button type="button" className={fm.moreBtn} aria-pressed={showRef} onClick={toggleRef}>
            Reference no
          </button>
        </div>

        {error ? <Hint danger>{error}</Hint> : tried && problem ? <Hint>{problem}</Hint> : <Hint>{note}</Hint>}
      </DialogForm>
    </FinDialog>
  )
}
