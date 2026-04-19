'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { submitRequestCredit } from '../actions'

interface Props {
  subsidiaries: { id: string; name: string; short_code: string }[]
}

interface LineItem {
  subsidiary_id: string
  amount: string
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function plus30(iso: string): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function RequestCreditForm({ subsidiaries }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState(currentMonth())
  const [invoiceDate, setInvoiceDate] = useState(todayIso())
  const [dueDate, setDueDate] = useState(plus30(todayIso()))
  const [description, setDescription] = useState('')
  const [referenceNo, setReferenceNo] = useState('')
  const [items, setItems] = useState<LineItem[]>([{ subsidiary_id: '', amount: '' }])

  function updateItem(idx: number, patch: Partial<LineItem>) {
    setItems((curr) => curr.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  function addItem() {
    setItems((curr) => [...curr, { subsidiary_id: '', amount: '' }])
  }

  function removeItem(idx: number) {
    setItems((curr) => (curr.length === 1 ? curr : curr.filter((_, i) => i !== idx)))
  }

  const validItems = items.filter((r) => r.subsidiary_id && parseFloat(r.amount) > 0)
  const total = validItems.reduce((s, r) => s + parseFloat(r.amount || '0'), 0)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await submitRequestCredit({
          period: `${period}-01`,
          invoiceDate,
          dueDate,
          description,
          referenceNo: referenceNo.trim() || null,
          lineItems: validItems.map((r) => ({
            subsidiary_id: r.subsidiary_id,
            amount: parseFloat(r.amount),
          })),
        })
        router.refresh()
        setItems([{ subsidiary_id: '', amount: '' }])
        setDescription('')
        setReferenceNo('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to submit')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-3xl">
      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 text-sm font-sans">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1">
            Credit to pool
          </label>
          <input
            type="text"
            value="Marketing Department Pool"
            disabled
            className="w-full px-3 py-2 bg-surface border border-hairline rounded-md text-sm text-muted font-mono"
          />
        </div>
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1">
            Period <span className="text-danger">*</span>
          </label>
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            required
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1">
          <label className="block text-sm font-sans font-medium text-graphite">
            Subsidiaries <span className="text-danger">*</span>
          </label>
          <span className="text-xs font-mono text-muted">
            {validItems.length} row{validItems.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="border border-hairline rounded-md bg-surface overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
            <div className="col-span-8">Subsidiary</div>
            <div className="col-span-3 text-right">Amount (RM)</div>
            <div className="col-span-1"></div>
          </div>
          {items.map((row, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center px-3 py-2 border-b border-hairline last:border-0">
              <select
                value={row.subsidiary_id}
                onChange={(e) => updateItem(idx, { subsidiary_id: e.target.value })}
                className="col-span-8 px-3 py-1.5 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
              >
                <option value="">— Select subsidiary —</option>
                {subsidiaries.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                min="0"
                value={row.amount}
                onChange={(e) => updateItem(idx, { amount: e.target.value })}
                placeholder="0.00"
                className="col-span-3 px-3 py-1.5 bg-paper border border-hairline rounded-md text-sm text-right font-mono text-ink focus:outline-none focus:border-accent-border"
              />
              <button
                type="button"
                onClick={() => removeItem(idx)}
                disabled={items.length === 1}
                className="col-span-1 text-sm text-muted hover:text-danger disabled:opacity-30"
                aria-label="Remove row"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addItem}
          className="mt-2 text-sm text-accent hover:text-accent-hover font-serif italic"
        >
          + Add subsidiary
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1">
            Invoice date <span className="text-danger">*</span>
          </label>
          <input
            type="date"
            value={invoiceDate}
            onChange={(e) => {
              setInvoiceDate(e.target.value)
              setDueDate(plus30(e.target.value))
            }}
            required
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1">
            Due date
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
          />
          <p className="font-serif italic text-muted text-xs mt-1">Default: 30 days after invoice date</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-sans font-medium text-graphite mb-1">
          Description <span className="text-danger">*</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          required
          placeholder="What is this invoice for?"
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
        />
        <p className="font-serif italic text-muted text-xs mt-1">Applied to all invoices in this batch</p>
      </div>

      <div>
        <label className="block text-sm font-sans font-medium text-graphite mb-1">
          Reference no <em className="text-muted text-xs">(optional)</em>
        </label>
        <input
          type="text"
          value={referenceNo}
          onChange={(e) => setReferenceNo(e.target.value)}
          placeholder="PO number, contract ref"
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
        />
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-hairline">
        <p className="font-mono text-xs text-muted">
          {validItems.length} invoice{validItems.length === 1 ? '' : 's'} will be created · Total RM{' '}
          {total.toLocaleString('en-MY', { minimumFractionDigits: 2 })}
        </p>
        <button
          type="submit"
          disabled={isPending || validItems.length === 0}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2.5 rounded-md transition-colors disabled:opacity-50"
        >
          {isPending ? 'Submitting…' : 'Submit to Finance'}
        </button>
      </div>
    </form>
  )
}
