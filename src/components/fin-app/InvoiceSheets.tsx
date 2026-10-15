'use client'

import { useEffect, useState } from 'react'
import { DateField } from '@/components/finv/DateField'
import { DialogButton, DialogForm, Field, FinDialog, Hint, Input } from '@/components/finv/Dialog'
import { money, neededSentence, num } from '@/components/finv/form-words'
import fm from '@/components/finv/form.module.css'
import { Select } from '@/components/hrv/select'
import { contractEditForm, contractEditsNothing, contractNewForm, type ContractFields } from '@/lib/contract-edit'
import { openInvoiceSettle } from '@/app/(portal)/payments/create-actions'
import { settleInvoiceFromSheet } from '@/app/(portal)/payments/actions'
import { createContractInWords, updateContractInWords } from '@/app/(portal)/billing/actions'
import type { InvoicePreset } from '@/app/(portal)/payments/_lib/invoice-presets'

// Invoice's windows in the Finance phone app that were the portal's pages
// (2026-10-16, part E4b): a department pool's (or a director's) invoice
// settled on its official receipt — the voucher page's `?invoice_id=` form,
// netting by default since no bank moves — and a marketing project's contract,
// new or edited (`/billing/contracts/…`). Each the page's own action, answered
// in words; an edit sends only what changed (lib/contract-edit).

const METHODS = [
  { value: 'netting', label: 'Netting / offset' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
]

type Banks = Array<{ id: string; bank_name: string; account_number: string; current_balance: number }>

/**
 * Settle on a receipt — what `/payments/new?invoice_id=` makes for an invoice to a department pool, a director or a
 * name: the balance still owed (as the page has it, not to be changed), the pool its billing mode lands in, netting
 * (no bank moves — the bank is then only noted), the date and the words.
 */
export function SettleReceiptSheet({
  invoiceId,
  label,
  today,
  onClose,
  onDone,
}: {
  /** The invoice being settled — open while there is one. */
  invoiceId: string | null
  /** "HV-INV-…" — the title's. */
  label: string
  today: string
  onClose: () => void
  onDone: (voucherNo: string) => void
}) {
  const open = invoiceId !== null
  const [read, setRead] = useState<{ id: string; preset: InvoicePreset; poolLabel: string; banks: Banks } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [method, setMethod] = useState('netting')
  const [bankId, setBankId] = useState('')
  const [date, setDate] = useState(today)
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // What the voucher page starts from, read when the sheet opens.
  useEffect(() => {
    if (!invoiceId || read?.id === invoiceId) return
    let live = true
    setRead(null)
    setLoadError(null)
    openInvoiceSettle(invoiceId).then(
      (res) => {
        if (!live) return
        if (!res.ok) {
          setLoadError(res.reason)
          return
        }
        const p = res.preset
        setRead({ id: invoiceId, preset: p, poolLabel: res.poolLabel, banks: res.banks })
        // An invoice to a subsidiary moves money; to a pool, a director or a name it nets (the page's default).
        setMethod(p.billable_to_type !== null && p.billable_to_type !== 'subsidiary' ? 'netting' : 'bank_transfer')
        setBankId(res.banks[0]?.id ?? '')
        setDate(today)
        setDesc(`Settle invoice ${p.invoice_no} — ${p.company_name}`)
        setError(null)
      },
      () => live && setLoadError('The invoice could not be read. Close and try again.'),
    )
    return () => {
      live = false
    }
  }, [invoiceId, read?.id, today])

  const close = () => {
    if (busy) return
    onClose()
  }
  const p = read?.preset ?? null
  const netting = method === 'netting'
  const need: string[] = []
  if (!netting && !bankId) need.push('the bank')
  if (!desc.trim()) need.push('a description')
  const problem = neededSentence(need, true) ?? (date > today ? 'The date cannot be in the future.' : null)
  const ok = !!p && !loadError && problem === null

  const save = async () => {
    if (!ok || busy || !p) return
    setBusy(true)
    setError(null)
    // The voucher page's names, so createPaymentVoucher reads what it always did.
    const fd = new FormData()
    fd.set('direction', 'credit')
    fd.set('voucher_type', 'billing_payment')
    fd.set('invoice_id', p.id)
    fd.set('reference_type', '')
    fd.set('reference_id', '')
    fd.set('payee_name', p.company_name)
    fd.set('payee_company_id', p.company_id ?? '')
    if (bankId) fd.set('bank_account_id', bankId)
    fd.set('amount', p.total_amount.toFixed(2))
    fd.set('payment_date', date)
    fd.set('payment_method', method)
    fd.set('description', desc.trim())
    fd.set('target_pool', p.target_pool)
    fd.set('source_pool', '')
    try {
      const res = await settleInvoiceFromSheet(fd)
      if (!res.ok) {
        setError(res.reason)
        return
      }
      onClose()
      onDone(res.voucherNo)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The receipt could not be written.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FinDialog open={open} onClose={close} title={`Settle ${label}`} sub={p ? `${p.company_name} · official receipt` : 'Official receipt'} locked={busy} tall>
      <DialogForm
        onSubmit={() => void save()}
        buttons={
          <>
            <DialogButton disabled={busy} onClick={close}>
              Cancel
            </DialogButton>
            <DialogButton kind="primary" off={!ok} disabled={busy} onClick={() => void save()}>
              {busy ? 'Settling…' : 'Settle & create receipt'}
            </DialogButton>
          </>
        }
      >
        <div className={fm.summary}>
          <div className={fm.summaryRow}>
            <span className={fm.summaryLabel}>{p?.invoice_no ?? label}</span>
            <span className={fm.summaryValue}>{p ? `RM ${money(p.total_amount)}` : '…'}</span>
          </div>
          <div className={fm.summaryRow}>
            <span className={fm.summaryLabel}>Into pool</span>
            <span className={fm.summaryValue}>{read?.poolLabel ?? '…'}</span>
          </div>
          <div className={fm.summaryTotal}>
            <span className={fm.summaryTotalLabel}>Received</span>
            <span className={fm.summaryTotalValue}>{p ? `RM ${money(p.total_amount)}` : '…'}</span>
          </div>
        </div>
        <Field label="Method" htmlFor="sr-method">
          <Select id="sr-method" round={12} className={fm.select} value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={netting ? 'Into bank · not moved' : 'Into bank'} htmlFor="sr-bank">
          <Select id="sr-bank" round={12} className={fm.select} value={bankId} onChange={(e) => setBankId(e.target.value)}>
            {!read || read.banks.length === 0 ? <option value="">{read ? 'No active bank account' : '…'}</option> : null}
            {(read?.banks ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {`${b.bank_name} — ${b.account_number}`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Received date">
          <DateField value={date} onChange={setDate} today={today} label="Received date" />
        </Field>
        <Field label="Description" htmlFor="sr-desc">
          <Input id="sr-desc" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </Field>
        {loadError ? <Hint danger>{loadError}</Hint> : error ? <Hint danger>{error}</Hint> : problem && p ? <Hint>{problem}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}

/** A marketing project's contract — new (sent to the Principal), or edited (only what changed is sent). */
export function ContractSheet({
  open,
  onClose,
  onDone,
  contract,
  companies,
  today,
}: {
  open: boolean
  onClose: () => void
  onDone: (message: string) => void
  /** The contract edited — none for a new one. */
  contract: ({ id: string } & ContractFields) | null
  companies: Array<{ id: string; name: string; short_code: string }>
  today: string
}) {
  const blank: ContractFields = { companyId: '', description: '', amount: '', startDate: '', endDate: '' }
  const was: ContractFields = contract ?? blank
  const [f, setF] = useState<ContractFields>(was)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<ContractFields>) => {
    setError(null)
    setF((prev) => ({ ...prev, ...patch }))
  }
  const close = () => {
    if (busy) return
    onClose()
    setF(was)
    setError(null)
  }

  const sent = contract ? contractEditForm(contract.id, was, f) : contractNewForm(f)
  const need: string[] = []
  if (!f.companyId) need.push('the subsidiary')
  if (!f.description.trim()) need.push('a description')
  if (!(num(f.amount) > 0)) need.push('an amount')
  const problem = neededSentence(need, true) ?? (contract && contractEditsNothing(sent) ? 'Nothing is changed yet.' : null)

  const save = async () => {
    if (problem || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = contract ? await updateContractInWords(sent) : await createContractInWords(sent)
      if (!res.ok) {
        setError(res.reason)
        return
      }
      onClose()
      if (!contract) setF(blank)
      onDone(contract ? 'Contract saved' : 'Contract sent to the Principal for approval')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The contract could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FinDialog open={open} onClose={close} title={contract ? 'Edit contract' : 'New marketing contract'} sub={contract ? contract.description : undefined} locked={busy} tall>
      <DialogForm
        onSubmit={() => void save()}
        buttons={
          <>
            <DialogButton disabled={busy} onClick={close}>
              Cancel
            </DialogButton>
            <DialogButton kind="primary" off={!!problem} disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : contract ? 'Save' : 'Create contract'}
            </DialogButton>
          </>
        }
      >
        <Field label="Subsidiary" htmlFor="ct-company">
          <Select id="ct-company" round={12} className={fm.select} value={f.companyId} onChange={(e) => set({ companyId: e.target.value })}>
            <option value="">Choose a company</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id} data-search={c.short_code}>
                {`${c.short_code} — ${c.name}`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Project description" htmlFor="ct-desc">
          <Input id="ct-desc" value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="e.g. Q2 2026 Social Media Campaign" />
        </Field>
        <Field label="Contract amount RM" htmlFor="ct-amount">
          <Input id="ct-amount" mono align="right" inputMode="decimal" value={f.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="0.00" />
        </Field>
        <div className={fm.duo}>
          <Field label="Start date">
            <DateField value={f.startDate} onChange={(v) => set({ startDate: v })} today={today} label="Start date" emptyText="None" onClear={() => set({ startDate: '' })} />
          </Field>
          <Field label="End date">
            <DateField value={f.endDate} onChange={(v) => set({ endDate: v })} today={today} label="End date" emptyText="None" onClear={() => set({ endDate: '' })} />
          </Field>
        </div>
        {error ? <Hint danger>{error}</Hint> : problem && problem !== 'Nothing is changed yet.' && (f.companyId || f.description || f.amount) ? <Hint>{problem}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}
