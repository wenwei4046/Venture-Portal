'use client'

import { useEffect, useRef, useState } from 'react'
import { DateField } from '@/components/finv/DateField'
import { DialogButton, DialogForm, Field, FinDialog, Hint, Input } from '@/components/finv/Dialog'
import { money, neededSentence, num } from '@/components/finv/form-words'
import fm from '@/components/finv/form.module.css'
import { Select } from '@/components/hrv/select'
import {
  PART_KINDS,
  STAFF_MODE_DEPT,
  billToValue,
  hrDescription,
  hrSource,
  parseBillTo,
  partialSentence,
  planCompanyInvoices,
  rechargeParts,
  type BillKind,
  type InvoiceCategory,
  type RechargePart,
} from '../_lib/invoice-form'
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

// Create invoice (2026-10-30 — the user: "single-invoice 和 multi-invoice 的
// 功能能不能做在一起？", then, on its sample, "可以"): one window for an invoice
// of one line or several, where Single invoice and Multi-line invoice were two.
// Bill to with the Invoice date beside it, today ("把 invoice date 放上去，和
// bill to 同排"; "invoice date 默认今天"); the Description; the Billing mode,
// none until picked; the lines, each its Account, its words and its amount on
// one row ("类别 - 全部一行"; "把 description 和 category 倒反…改成 account"),
// every line's account needed; then the Due date, none until picked ("due
// date default 不用"). A lone line may leave its words blank: it takes the
// Description, as Single invoice's one field did. A shared-services or a
// director recharge to a company fills its lines from HR's figures ("hr 的
// 分摊我也是想要用 Multi-line 的"; "往后 director 的我也要 split category"),
// each line's account still the reader's to pick.
//
// Several companies (from Single invoice): an invoice for each, each its
// amount — HR's figure, filled in, for a recharge. Its lines are not drawn:
// HR's figure goes out itemised as HR keyed it, on an account picked once for
// each kind of line (*Account for each line*), and an amount Finance changed
// as one line on Salary's; a typed amount is one line on the one *Account*.
// Single invoice's Split billing modes went ("split billing mode 拿掉先" —
// never used).
//
// The same window edits an invoice (the system's Edit mirrors its create form
// 1:1): a draft is rewritten whole; an issued or paid one keeps its number,
// its entry corrected in place, with a reason — and once money has come in,
// its amounts, its payer and its month stay as they are.
//
// On a desktop it is the kit's wide window, 680px (2026-10-30 — the user:
// "key line 时 key description 看到不是很清楚"). The phone's sheet is unchanged.

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
  account: string
  desc: string
  amount: string
  /** HR's kind of line (Salary, EPF …), for a line HR's figures wrote. */
  kind?: string
}
interface CompanyRow {
  key: number
  companyId: string
  amount: string
}

const r2 = (n: number) => Math.round(n * 100) / 100
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monthWords = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`

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
  const blankLine = (): LineRow => ({ key: nextKey(), account: '', desc: '', amount: '' })

  // Stored lines, or a simple invoice as its one line (its description stays the header's).
  const startLines = (): LineRow[] => {
    if (!editing) return [blankLine()]
    if (editing.lines.length > 0)
      return editing.lines.map((l) => ({ key: nextKey(), account: l.category_code ?? '', desc: l.description ?? '', amount: Number(l.amount).toFixed(2) }))
    return [{ key: nextKey(), account: editing.initial.category_code ?? '', desc: '', amount: Number(editing.initial.total_amount).toFixed(2) }]
  }
  const [lines, setLines] = useState<LineRow[]>(startLines)

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
  // None until picked: the two windows started on different modes, and a mode routes the invoice's pool.
  const [mode, setMode] = useState(init?.billing_mode ?? '')
  const [month, setMonth] = useState(init?.period_month ? init.period_month.slice(0, 7) : hubMonth)
  const [invoiceDate, setInvoiceDate] = useState(init ? (init.invoice_date ?? '') : today)
  const [dueDate, setDueDate] = useState(init ? (init.due_date ?? '') : '')
  const [reference, setReference] = useState(init?.reference_no ?? '')
  const [showPeriod, setShowPeriod] = useState(false)
  const [showRef, setShowRef] = useState(!!init?.reference_no)
  const [reason, setReason] = useState('')
  // Several companies: a row a company and its amount; the one account, or one for each kind of HR's lines.
  const [several, setSeveral] = useState(false)
  const [rows, setRows] = useState<CompanyRow[]>([])
  const [account, setAccount] = useState('')
  const [kindAccounts, setKindAccounts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Some went in and some did not: the dialog only closes now. */
  const [partly, setPartly] = useState(false)

  const bill = parseBillTo(billTo)
  const company = companies.find((c) => c.id === bill.companyId) ?? null

  // ── HR's figures: a shared-services or director recharge to a company, or to several (making one, not editing) ──
  const hr = useHrFigures(!editing && hrSource(mode) !== null && (several || bill.kind === 'subsidiary'), mode, month)
  const partsOf = (companyId: string): RechargePart[] => {
    const figure = hr.status === 'ready' ? hr.byCompany.get(companyId) : undefined
    return figure ? rechargeParts(figure, mode, month) : []
  }
  /** The description HR's figures wrote — rewritten with them while untouched. */
  const autoDesc = useRef<string | null>(null)
  const fillDesc = (next: string) => {
    if (desc.trim() && desc !== autoDesc.current) return
    setDesc(next)
    autoDesc.current = next
  }
  /** The lines HR's figures wrote — replaced while untouched. */
  const autoLines = useRef<string | null>(null)
  const applied = useRef('')
  const linesKey = (ls: LineRow[]) => JSON.stringify(ls.map((l) => [l.desc, l.amount]))
  useEffect(() => {
    if (editing || several || bill.kind !== 'subsidiary' || hr.status !== 'ready') return
    const at = `${hr.key}|${bill.companyId}`
    if (applied.current === at) return
    applied.current = at
    const ours = linesKey(lines) === autoLines.current
    if (!ours && !lines.every((l) => !l.desc && !l.amount)) return
    const parts = partsOf(bill.companyId)
    if (parts.length === 0) {
      // HR has nothing for this company: HR's lines go, and the note says so.
      if (ours && lines.some((l) => l.kind)) {
        const blank = [blankLine()]
        setLines(blank)
        autoLines.current = null
      }
      return
    }
    // A kind's account, picked on the lines HR wrote before, stays with the kind.
    const picked = new Map(lines.filter((l) => l.kind && l.account).map((l) => [l.kind, l.account]))
    const next = parts.map((p) => ({ key: nextKey(), account: picked.get(p.kind) ?? '', desc: p.description, amount: p.amount.toFixed(2), kind: p.kind }))
    setLines(next)
    autoLines.current = linesKey(next)
    fillDesc(hrDescription(mode, month))
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

  const setLine = (key: number, patch: Partial<LineRow>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const setRow = (key: number, patch: Partial<CompanyRow>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const filled = lines.filter((l) => num(l.amount) > 0)
  const total = r2(filled.reduce((s, l) => s + num(l.amount), 0))
  const filledRows = rows.filter((r) => r.companyId && num(r.amount) > 0)
  const rowSum = r2(filledRows.reduce((s, r) => s + num(r.amount), 0))
  /** Several companies: the kinds of HR's lines its companies are billed in, each wanting an account. */
  const kinds = several ? PART_KINDS.filter((k) => filledRows.some((r) => partsOf(r.companyId).some((p) => p.kind === k))) : []

  const toggleSeveral = () => {
    if (several) {
      // Back to one party: the first company, its amount as the one line — HR's lines for it, where HR has them.
      const first = rows.find((r) => r.companyId) ?? null
      setBillTo(first ? billToValue('subsidiary', first.companyId) : '')
      const carried = [{ ...blankLine(), account: kinds.length > 0 ? (kindAccounts[kinds[0]] ?? '') : account, amount: first?.amount ?? '' }]
      setLines(carried)
      autoLines.current = linesKey(carried)
      applied.current = ''
      setRows([])
      setSeveral(false)
      return
    }
    setRows([{ key: nextKey(), companyId: bill.kind === 'subsidiary' ? bill.companyId : '', amount: bill.kind === 'subsidiary' && total > 0 ? total.toFixed(2) : '' }])
    setAccount(filled.find((l) => l.account)?.account ?? '')
    appliedRows.current = ''
    setSeveral(true)
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
  const need: string[] = []
  if (several) {
    if (filledRows.length === 0) need.push('a company and its amount')
  } else if (!bill.kind) need.push('Bill to')
  else if ((bill.kind === 'director' || bill.kind === 'freetext') && !name.trim()) need.push('a name')
  if (!desc.trim()) need.push('a description')
  if (!mode) need.push('a billing mode')
  if (several) {
    if (kinds.length > 0 ? kinds.some((k) => !kindAccounts[k]) : !account) need.push(kinds.length > 0 ? 'an account for each line' : 'an account')
  } else if (filled.length === 0) need.push('a line with an amount')
  else {
    if (filled.some((l) => !l.account)) need.push('each line’s account')
    if (filled.length >= 2 && filled.some((l) => !l.desc.trim())) need.push('each line’s description')
  }
  if (issued && !reason.trim()) need.push('a reason')
  const twice = several ? filledRows.find((r, i) => filledRows.findIndex((o) => o.companyId === r.companyId) !== i) : undefined
  const loose = several && rows.some((r) => !r.companyId && num(r.amount) > 0)
  const twiceName = twice ? companyLabel(companies.find((c) => c.id === twice.companyId) ?? { id: '', name: 'A company', short_code: '' }) : ''
  const problem =
    neededSentence(need) ?? (twice ? `${twiceName} is listed twice — one row a company.` : null) ?? (loose ? 'A row has an amount but no company.' : null)
  const ok = problem === null && !partly

  // ── HR's note, under what it filled ──
  let hrNote: string | null = null
  if (hr.key && hr.source) {
    const what = hr.source === 'director' ? 'director CTC' : `${STAFF_MODE_DEPT[mode]} staff billing allocation`
    const when = monthWords(month)
    if (hr.status === 'loading') hrNote = `Reading the ${what}…`
    else if (hr.status === 'error') hrNote = `The ${what} could not be read — enter the ${several ? 'amounts' : 'lines'}.`
    else if (several) hrNote = hr.byCompany.size > 0 ? `From the ${what}, ${when}.` : `No ${what} for ${when} — enter the amounts.`
    else if (company)
      hrNote = partsOf(company.id).length > 0 ? `From the ${what}, ${when}.` : `No ${what} for ${companyLabel(company)} in ${when} — enter the lines.`
  }

  const head = () => ({ mode, period: month, invoiceDate, dueDate, description: desc.trim(), reference: reference.trim() })

  const saveSeveral = async () => {
    const plan = planCompanyInvoices({
      rows: filledRows.map((r) => ({ companyId: r.companyId, amount: r2(num(r.amount)) })),
      parts: partsOf,
      description: desc.trim(),
      account,
      kinds,
      kindAccounts,
    })
    const made: string[] = []
    const failures: Array<{ label: string; reason: string }> = []
    for (const p of plan) {
      const co = companies.find((c) => c.id === p.companyId)
      const label = co ? companyLabel(co) : 'A company'
      try {
        const res = await hubCreateLinesInvoice({ billKind: 'subsidiary', companyId: p.companyId, ...head(), lines: p.lines })
        if (res.ok) made.push(res.value ?? 'A draft')
        else failures.push({ label, reason: res.reason })
      } catch (err) {
        failures.push({ label, reason: err instanceof Error ? err.message : 'It did not go through.' })
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

  const save = async () => {
    setTried(true)
    if (!ok || busy) return
    setBusy(true)
    setError(null)
    if (several) return saveSeveral()
    if (!bill.kind) return setBusy(false)
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
      ...head(),
      // A lone line's blank words are the invoice's description: typed once, as Single invoice's one field was.
      lines: filled.map((l) => ({ description: l.desc.trim() || (filled.length === 1 ? desc.trim() : ''), amount: r2(num(l.amount)), categoryCode: l.account })),
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
    : several
      ? `Total RM ${money(rowSum)} · one invoice for each company, saved as drafts.`
      : `Total RM ${money(total)} · saved as a draft.`
  const statusWords = editing ? (editing.status === 'paid_via_netting' ? 'paid by netting' : editing.status) : ''

  return (
    <FinDialog
      open={open}
      onClose={() => !busy && onClose()}
      title={editing ? 'Edit invoice' : 'Create invoice'}
      sub={editing ? (editing.no ? `${editing.no} · ${statusWords}` : 'Draft') : 'Saved as draft · approve to issue'}
      locked={busy}
      tall
      wide
    >
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
                {busy ? 'Saving…' : editing ? 'Save changes' : 'Save draft'}
              </DialogButton>
            </>
          )
        }
      >
        <div className={fm.pair}>
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
            <Field label="Bill to" htmlFor="il-bill">
              <BillToSelect id="il-bill" tall value={billTo} onChange={setBillTo} companies={companies} departments={departments} disabled={locked} />
            </Field>
          )}
          <Field label="Invoice date">
            <DateField value={invoiceDate} onChange={setInvoiceDate} today={today} label="Invoice date" emptyText="No invoice date" />
          </Field>
        </div>
        {several ? null : (
          <PartyFields idPrefix="il" kind={bill.kind} name={name} onName={setName} contact={contact} onContact={setContact} disabled={locked} />
        )}

        <Field label="Description" htmlFor="il-desc">
          <Input id="il-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. HR shared service — Oct" />
        </Field>
        <Field label="Billing mode" htmlFor="il-mode">
          <ModeSelect id="il-mode" value={mode} onChange={setMode} extraModes={extraModes} keep={init?.billing_mode} blank="Choose a billing mode" />
        </Field>

        {!several ? (
          <Field label="Lines">
            <div className={fm.lines}>
              {lines.map((l, i) => (
                <div key={l.key} className={fm.lineWrap}>
                  <div className={fm.lineRow} data-shape="acct-item">
                    <CategorySelect
                      value={l.account}
                      onChange={(c) => setLine(l.key, { account: c })}
                      categories={categories}
                      label={`Line ${i + 1} account`}
                      blank="Account"
                      inLine
                    />
                    <input
                      className={fm.lineText}
                      value={l.desc}
                      onChange={(e) => setLine(l.key, { desc: e.target.value })}
                      placeholder={lines.length === 1 ? 'Same as the description' : `Line ${i + 1}`}
                      aria-label={`Line ${i + 1} description`}
                    />
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
                <button type="button" className={fm.addLine} disabled={locked} onClick={() => setLines((prev) => [...prev, blankLine()])}>
                  + Add line
                </button>
                <span className={fm.linesTotal}>RM {money(total)}</span>
              </div>
            </div>
            {hrNote ? <Hint>{hrNote}</Hint> : null}
          </Field>
        ) : kinds.length > 0 ? (
          <Field label="Account for each line">
            <div className={fm.lines}>
              {kinds.map((k) => (
                <div key={k} className={fm.lineWrap}>
                  <div className={fm.lineRow} data-shape="part">
                    <span className={fm.partName}>{k}</span>
                    <CategorySelect
                      value={kindAccounts[k] ?? ''}
                      onChange={(c) => setKindAccounts((prev) => ({ ...prev, [k]: c }))}
                      categories={categories}
                      label={`${k} account`}
                      blank="Account"
                      inLine
                    />
                  </div>
                </div>
              ))}
            </div>
            <Hint>{`Each company’s invoice is itemised as HR keyed it, each line on its account. A changed amount goes out as one line, on ${kinds[0]}’s account.`}</Hint>
          </Field>
        ) : (
          <Field label="Account" htmlFor="il-account">
            <CategorySelect id="il-account" value={account} onChange={setAccount} categories={categories} blank="Choose an account" />
          </Field>
        )}

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
          {editing ? null : (
            <button type="button" className={fm.moreBtn} aria-pressed={several} onClick={toggleSeveral}>
              Several companies
            </button>
          )}
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
