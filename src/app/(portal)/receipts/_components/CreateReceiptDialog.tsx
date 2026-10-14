'use client'

import { useEffect, useState } from 'react'
import { DateField } from '@/components/finv/DateField'
import { DialogButton, DialogForm, Field, FinDialog, Hint, Input } from '@/components/finv/Dialog'
import { FilesField } from '@/components/finv/FilesField'
import { PartyInput } from '@/components/finv/PartyInput'
import { FILES_CAP, fileSize, neededSentence, num, poolName } from '@/components/finv/form-words'
import fm from '@/components/finv/form.module.css'
import { Select } from '@/components/hrv/select'
import { flash } from '@/components/hrv/toast'
import { typeLabel, type AccountType } from '@/lib/coa'
import { createReceiptFromDialog } from '../../payments/actions'
import { openCreateReceipt } from '../actions'
import type { VoucherFormOptions } from '../../payments/_lib/create-payment-options'

// Create receipt (2026-10-14, the Finance revamp v2 — D09, the prototype's
// `or-form`): Received from, Description, Into bank, Credited to pool, Amount
// RM, Received date; *Cancel* and *Save receipt*. The system books a receipt on
// an account, so Category stands beside the pool (the form page asks it too);
// the method, files and notes open from the small buttons, as Create
// payment's do. A receipt is received at once — bank and GL — as the form
// page's always was.

const METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
  { value: 'netting', label: 'Netting / offset' },
]
/** What a receipt mostly posts to first: what is owed to HV, then income. */
const TYPE_ORDER: AccountType[] = ['asset', 'revenue', 'other_income', 'liability', 'equity', 'fixed_asset', 'cost', 'expense']

export default function CreateReceiptDialog({ open, onClose, prefix, today }: { open: boolean; onClose: () => void; prefix: string; today: string }) {
  const [opts, setOpts] = useState<VoucherFormOptions | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [payer, setPayer] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [desc, setDesc] = useState('')
  const [bankId, setBankId] = useState('')
  const [pool, setPool] = useState('venture_pool')
  const [account, setAccount] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [showMethod, setShowMethod] = useState(false)
  const [showFiles, setShowFiles] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [method, setMethod] = useState('bank_transfer')
  const [files, setFiles] = useState<File[]>([])
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || opts) return
    let live = true
    setLoadError(null)
    openCreateReceipt().then(
      (res) => {
        if (!live) return
        if (res.ok) {
          setOpts(res.options)
          setBankId((b) => b || res.options.banks[0]?.id || '')
        } else setLoadError(res.reason)
      },
      () => live && setLoadError('The lists could not be read. Close and try again.'),
    )
    return () => {
      live = false
    }
  }, [open, opts])

  const reset = () => {
    setPayer('')
    setCompanyId('')
    setDesc('')
    setBankId(opts?.banks[0]?.id ?? '')
    setPool('venture_pool')
    setAccount('')
    setAmount('')
    setDate(today)
    setShowMethod(false)
    setShowFiles(false)
    setShowNotes(false)
    setMethod('bank_transfer')
    setFiles([])
    setNotes('')
    setError(null)
  }
  const close = () => {
    if (busy) return
    onClose()
    reset()
  }

  const need: string[] = []
  if (!payer.trim()) need.push('Received from')
  if (!(num(amount) > 0)) need.push('an amount')
  if (!account) need.push('a category')
  if (method !== 'netting' && !bankId) need.push('a bank')
  if (!desc.trim()) need.push('a description')
  const filesBytes = files.reduce((n, f) => n + f.size, 0)
  const problem =
    neededSentence(need, true) ?? (filesBytes > FILES_CAP ? `The files come to ${fileSize(filesBytes)} — under 4 MB goes in one save. Compress them or add some later.` : null)
  const ok = problem === null && !!opts

  const save = async () => {
    if (!ok || busy) return
    setBusy(true)
    setError(null)
    const fd = new FormData()
    fd.set('direction', 'credit')
    fd.set('voucher_type', 'receive_payment')
    fd.set('reference_type', '')
    fd.set('reference_id', '')
    fd.set('payee_name', payer.trim())
    fd.set('payee_company_id', companyId)
    if (bankId) fd.set('bank_account_id', bankId)
    fd.set('amount', num(amount).toFixed(2))
    fd.set('payment_date', date)
    fd.set('payment_method', method)
    fd.set('description', desc.trim())
    if (notes.trim()) fd.set('notes', notes.trim())
    fd.set('target_pool', pool)
    fd.set('source_pool', '')
    fd.set('account_code', account)
    files.forEach((f, i) => fd.append(`attachment_${i}`, f))
    fd.set('attachment_count', String(files.length))
    try {
      const res = await createReceiptFromDialog(fd)
      if (!res.ok) {
        setError(res.reason)
        return
      }
      onClose()
      reset()
      flash(`${res.voucherNo} received — bank and GL updated`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The receipt could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const accounts = opts?.accounts ?? []
  return (
    <FinDialog open={open} onClose={close} title="Create receipt" sub={`Official receipt · ${prefix}`} locked={busy} tall>
      <DialogForm
        buttons={
          <>
            <DialogButton disabled={busy} onClick={close}>
              Cancel
            </DialogButton>
            <DialogButton kind="primary" off={!ok} disabled={busy} onClick={save}>
              Save receipt
            </DialogButton>
          </>
        }
      >
        <Field label="Received from" htmlFor="cr-payer">
          <PartyInput
            id="cr-payer"
            placeholder="Payer name"
            value={payer}
            companies={opts?.companies ?? []}
            companyId={companyId}
            onChange={(name, id) => {
              setPayer(name)
              setCompanyId(id)
            }}
          />
        </Field>
        <Field label="Description" htmlFor="cr-desc">
          <Input id="cr-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What was received?" />
        </Field>
        <Field label="Into bank" htmlFor="cr-bank">
          <Select id="cr-bank" round={12} className={fm.select} value={bankId} onChange={(e) => setBankId(e.target.value)}>
            {method === 'netting' || !opts || opts.banks.length === 0 ? <option value="">{method === 'netting' ? 'No bank — netting' : opts ? 'No active bank account' : '…'}</option> : null}
            {(opts?.banks ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {`${b.bank_name} — ${b.account_number}`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Credited to pool" htmlFor="cr-pool">
          <Select id="cr-pool" round={12} className={fm.select} value={pool} onChange={(e) => setPool(e.target.value)}>
            {opts ? null : <option value="venture_pool">Venture</option>}
            {(opts?.pools ?? []).map((p) => (
              <option key={p.value} value={p.value}>
                {poolName(p.label)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category" htmlFor="cr-account">
          <Select id="cr-account" round={12} className={fm.select} value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">Choose a category</option>
            {TYPE_ORDER.map((t) => {
              const of = accounts.filter((a) => a.type === t)
              return of.length === 0 ? null : (
                <optgroup key={t} label={typeLabel(t)}>
                  {of.map((a) => (
                    <option key={a.code} value={a.code} data-search={a.code}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
              )
            })}
          </Select>
        </Field>
        <Field label="Amount RM" htmlFor="cr-amount">
          <Input id="cr-amount" mono align="right" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="Received date">
          <DateField value={date} onChange={setDate} today={today} label="Received date" />
        </Field>

        {showMethod ? (
          <Field label="Method" htmlFor="cr-method">
            <Select
              id="cr-method"
              round={12}
              className={fm.select}
              value={method}
              onChange={(e) => {
                setMethod(e.target.value)
                if (e.target.value !== 'netting' && !bankId) setBankId(opts?.banks[0]?.id ?? '')
              }}
            >
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {showFiles ? (
          <Field label="Attachments">
            <FilesField files={files} onChange={setFiles} />
          </Field>
        ) : null}
        {showNotes ? (
          <Field label="Notes" htmlFor="cr-notes">
            <Input id="cr-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="For Finance only" />
          </Field>
        ) : null}

        <div className={fm.more} role="group" aria-label="More">
          <button type="button" className={fm.moreBtn} aria-pressed={showMethod} onClick={() => setShowMethod((v) => !v)}>
            Method
          </button>
          <button type="button" className={fm.moreBtn} aria-pressed={showFiles} onClick={() => setShowFiles((v) => !v)}>
            Attachments
          </button>
          <button type="button" className={fm.moreBtn} aria-pressed={showNotes} onClick={() => setShowNotes((v) => !v)}>
            Notes
          </button>
        </div>

        {loadError ? <Hint danger>{loadError}</Hint> : error ? <Hint danger>{error}</Hint> : problem ? <Hint>{problem}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}
