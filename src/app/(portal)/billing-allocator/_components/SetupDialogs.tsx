'use client'

import { useMemo, useState } from 'react'
import { DialogButton, DialogConfirm, DialogForm, Field, FinDialog, Hint, Input } from '@/components/finv/Dialog'
import fm from '@/components/finv/form.module.css'
import { neededSentence, num } from '@/components/finv/form-words'
import { Select } from '@/components/hrv/select'
import type { AllocMethod } from '@/lib/billing-allocator'
// The accounts grouped as Invoice's dialogs group them (pure — not their select, which would bring Invoice's actions onto this page).
import { categoryGroups } from '../../statements/_lib/invoice-form'
import { deleteAllocCategory, deleteAllocTemplate, saveAllocCategory, saveAllocTemplate } from '../actions'
import type { AllocatorData, CategoryRow, TemplateRow } from './types'
import a from './alloc.module.css'

// The allocator's Setup, its dialogs (2026-10-14, the Finance revamp v2 —
// D11; the design lists the categories and templates, its *Edit* opens these,
// the system's in the kit's sheet): a category — its name and the account its
// invoice lines post to (none: the invoice's own default) — and a template —
// its name, method, default amount and category, and a Percentage template's
// default % a company. Each is deleted from its own dialog, asked first.

const METHODS: ReadonlyArray<{ value: AllocMethod; label: string }> = [
  { value: 'headcount', label: 'Headcount' },
  { value: 'percentage', label: 'Percentage' },
  { value: 'equal', label: 'Equal' },
  { value: 'custom', label: 'Custom' },
]

export function CategoryDialog({
  open,
  onClose,
  onDone,
  data,
  category,
}: {
  open: boolean
  onClose: () => void
  onDone: (message: string) => void
  data: AllocatorData
  /** Null: a new one. */
  category: CategoryRow | null
}) {
  const [name, setName] = useState(category?.name ?? '')
  const [code, setCode] = useState(category?.coaCode ?? '')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // *7012 · Rental Income* — the code first, as the allocator writes a category.
  const accounts = useMemo(() => data.coaAccounts.map((c) => ({ code: c.code, label: `${c.code} · ${c.name}`, type: c.type, parent_code: c.parent_code })), [data.coaAccounts])
  const problem = neededSentence(name.trim() ? [] : ['a name'])

  const run = async (call: () => Promise<{ error?: string }>, message: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = await call()
      if (res.error) throw new Error(res.error)
      onDone(message)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'It did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }
  const save = () => {
    setTried(true)
    if (problem || busy) return
    void run(() => saveAllocCategory({ id: category?.id, name, coaCode: code }), `${name.trim()} saved`)
  }

  if (confirming && category) {
    return (
      <FinDialog open={open} onClose={() => !busy && onClose()} title={`Delete ${category.name}?`} locked={busy}>
        <DialogConfirm
          text="Templates and allocations that name it keep their figures; they lose the category."
          confirmLabel={busy ? 'Deleting…' : 'Delete'}
          danger
          busy={busy}
          error={error}
          onCancel={() => {
            setConfirming(false)
            setError(null)
          }}
          onConfirm={() => void run(() => deleteAllocCategory(category.id), `${category.name} deleted`)}
        />
      </FinDialog>
    )
  }

  return (
    <FinDialog open={open} onClose={() => !busy && onClose()} title={category ? category.name : 'Add category'} sub="Setup · categories" locked={busy}>
      <DialogForm
        onSubmit={save}
        buttons={
          <>
            {category ? (
              <DialogButton disabled={busy} onClick={() => setConfirming(true)} className={a.undo}>
                Delete
              </DialogButton>
            ) : null}
            <DialogButton disabled={busy} onClick={onClose}>
              Cancel
            </DialogButton>
            <DialogButton kind="primary" off={!!problem} disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save'}
            </DialogButton>
          </>
        }
      >
        <Field label="Name" htmlFor="alloc-cat-name">
          <Input id="alloc-cat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rental" />
        </Field>
        <Field label="Account" htmlFor="alloc-cat-code">
          <Select id="alloc-cat-code" round={12} className={fm.select} value={code} onChange={(e) => setCode(e.target.value)}>
            <option value="">No account — the invoice’s default</option>
            {categoryGroups(accounts).map((g) => (
              <optgroup key={g.type} label={g.label}>
                {g.accounts.map((acct) => (
                  <option key={acct.code} value={acct.code} data-search={acct.code}>
                    {acct.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        {error ? <Hint danger>{error}</Hint> : tried && problem ? <Hint>{problem}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}

export function TemplateDialog({
  open,
  onClose,
  onDone,
  data,
  template,
}: {
  open: boolean
  onClose: () => void
  onDone: (message: string) => void
  data: AllocatorData
  /** Null: a new one. */
  template: TemplateRow | null
}) {
  const [name, setName] = useState(template?.name ?? '')
  const [method, setMethod] = useState<AllocMethod>(template?.method ?? 'headcount')
  const [amount, setAmount] = useState(template && template.amount > 0 ? String(template.amount) : '')
  const [categoryId, setCategoryId] = useState(template?.categoryId ?? '')
  const [pct, setPct] = useState<Record<string, string>>(() => Object.fromEntries((template?.splits ?? []).map((s) => [s.companyId, String(s.pct)])))
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const problem = neededSentence(name.trim() ? [] : ['a name'])
  const pctSum = Math.round(Object.values(pct).reduce((s, v) => s + num(v), 0) * 100) / 100

  const run = async (call: () => Promise<{ error?: string }>, message: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = await call()
      if (res.error) throw new Error(res.error)
      onDone(message)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'It did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }
  const save = () => {
    setTried(true)
    if (problem || busy) return
    void run(
      () =>
        saveAllocTemplate({
          id: template?.id,
          name,
          method,
          amount: num(amount),
          categoryId: categoryId || null,
          status: (template?.status as 'active' | 'inactive' | undefined) ?? 'active',
          // Kept whatever the method (as Setup always sent them): switched back to Percentage, they are there.
          splits: Object.entries(pct)
            .map(([companyId, v]) => ({ companyId, pct: num(v) }))
            .filter((x) => x.pct > 0),
        }),
      `${name.trim()} saved`,
    )
  }

  if (confirming && template) {
    return (
      <FinDialog open={open} onClose={() => !busy && onClose()} title={`Delete ${template.name}?`} locked={busy}>
        <DialogConfirm
          text="It leaves the Template list in + New allocation. Allocations made from it stay as they are."
          confirmLabel={busy ? 'Deleting…' : 'Delete'}
          danger
          busy={busy}
          error={error}
          onCancel={() => {
            setConfirming(false)
            setError(null)
          }}
          onConfirm={() => void run(() => deleteAllocTemplate(template.id), `${template.name} deleted`)}
        />
      </FinDialog>
    )
  }

  return (
    <FinDialog open={open} onClose={() => !busy && onClose()} title={template ? template.name : 'Add template'} sub="Setup · templates" locked={busy}>
      <DialogForm
        onSubmit={save}
        buttons={
          <>
            {template ? (
              <DialogButton disabled={busy} onClick={() => setConfirming(true)} className={a.undo}>
                Delete
              </DialogButton>
            ) : null}
            <DialogButton disabled={busy} onClick={onClose}>
              Cancel
            </DialogButton>
            <DialogButton kind="primary" off={!!problem} disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save'}
            </DialogButton>
          </>
        }
      >
        <Field label="Name" htmlFor="alloc-tpl-name">
          <Input id="alloc-tpl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Office Rental" />
        </Field>
        <Field label="Default RM" htmlFor="alloc-tpl-amount">
          <Input id="alloc-tpl-amount" mono align="right" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="Method" htmlFor="alloc-tpl-method">
          <Select id="alloc-tpl-method" round={12} className={fm.select} value={method} onChange={(e) => setMethod(e.target.value as AllocMethod)}>
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category" htmlFor="alloc-tpl-cat">
          <Select id="alloc-tpl-cat" round={12} className={fm.select} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">No category</option>
            {data.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.coaCode ? `${c.coaCode} · ${c.name}` : c.name}
              </option>
            ))}
          </Select>
        </Field>
        {method === 'percentage' ? (
          <Field label="Each company’s default %">
            <div className={a.split}>
              {data.companies.map((c) => (
                <div key={c.id} className={a.splitRow}>
                  <span className={a.splitLabel}>{c.label}</span>
                  <input
                    className={fm.lineAmount}
                    inputMode="decimal"
                    value={pct[c.id] ?? ''}
                    onChange={(e) => setPct({ ...pct, [c.id]: e.target.value })}
                    placeholder="0"
                    aria-label={`${c.label} %`}
                  />
                </div>
              ))}
              <div className={a.splitFoot}>
                <span>Total</span>
                <span className={a.splitTotal}>{pctSum}%</span>
              </div>
            </div>
          </Field>
        ) : null}
        {error ? <Hint danger>{error}</Hint> : tried && problem ? <Hint>{problem}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}
