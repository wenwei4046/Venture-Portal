'use client'

import { useMemo, useRef, useState, useTransition, useEffect } from 'react'
import Link from 'next/link'
import { formatMoney } from '@/lib/utils'
import { officeToday } from '@/lib/office-time'
import AccountPicker, { type AccountOption } from '@/components/AccountPicker'
import {
  createJournalVoucher,
  updateJournalVoucher,
  deleteJournalVoucher,
} from '../actions'

interface LineDraft {
  key: string
  account_code: string
  debit: string
  credit: string
  description: string
}

interface EntryLine {
  account_code: string
  debit: number | null
  credit: number | null
  description: string | null
}

interface ExistingEntry {
  id: string
  transaction_date: string
  description: string
  segment: string
  lines: EntryLine[]
}

// Actual gl_segment posting values (NOT the report filter list — that one
// folds treasury into Venture for filtering only).
const SEGMENT_OPTIONS = [
  { value: 'unallocated', label: 'Unallocated (top-level adjustment)' },
  { value: 'corporate', label: 'Venture (Office)' },
  { value: 'treasury', label: 'Treasury' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'hr', label: 'HR' },
  { value: 'finance', label: 'Finance' },
  { value: 'director_office', label: 'Director Office' },
  { value: 'director', label: 'Director' },
]

interface Props {
  accounts: AccountOption[]
  entry?: ExistingEntry
  /** Copy mode: prefill a CREATE form from an existing JV (?from=<id>).
   *  Unlike `entry`, nothing exists yet — posting only happens on submit. */
  prefill?: {
    description: string
    segment: string
    lines: EntryLine[]
  }
}

let keySeq = 0
function nextKey() {
  keySeq += 1
  return `line-${keySeq}`
}

function emptyLine(): LineDraft {
  return { key: nextKey(), account_code: '', debit: '', credit: '', description: '' }
}

/** The office's today (an ISO string's date is UTC's — yesterday until 08:00). */
function today() {
  return officeToday()
}

export default function JournalVoucherForm({ accounts, entry, prefill }: Props) {
  const isEdit = !!entry
  // Copy mode keeps the source's description/segment/lines but always dates
  // the new voucher TODAY (recurring adjustments are usually re-dated anyway).
  const seed = entry ?? (prefill ? { ...prefill, transaction_date: today() } : null)

  const [transactionDate, setTransactionDate] = useState<string>(
    entry?.transaction_date ?? today()
  )
  const [description, setDescription] = useState<string>(seed?.description ?? '')
  const [segment, setSegment] = useState<string>(seed?.segment ?? 'unallocated')
  const [lines, setLines] = useState<LineDraft[]>(() => {
    if (seed && seed.lines.length > 0) {
      return seed.lines.map((l) => ({
        key: nextKey(),
        account_code: l.account_code,
        debit: l.debit != null ? String(l.debit) : '',
        credit: l.credit != null ? String(l.credit) : '',
        description: l.description ?? '',
      }))
    }
    return [emptyLine(), emptyLine()]
  })

  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isDeleting, startDeleting] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (error && formRef.current) {
      formRef.current.classList.remove('shake-once')
      void formRef.current.offsetWidth
      formRef.current.classList.add('shake-once')
      const el = formRef.current
      const handler = () => el.classList.remove('shake-once')
      el.addEventListener('animationend', handler, { once: true })
      return () => el.removeEventListener('animationend', handler)
    }
  }, [error])

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l))
    )
  }

  function setDebit(key: string, value: string) {
    // Entering a debit clears the credit on the same line (debit XOR credit).
    updateLine(key, value ? { debit: value, credit: '' } : { debit: value })
  }

  function setCredit(key: string, value: string) {
    updateLine(key, value ? { credit: value, debit: '' } : { credit: value })
  }

  // A line added from the keyboard (Ins) or the button takes the cursor to
  // its account (2026-10-09, the handoff: "Ins adds a line").
  const focusNewLine = useRef(false)
  function addLine() {
    setLines((prev) => [...prev, emptyLine()])
    focusNewLine.current = true
  }
  useEffect(() => {
    if (!focusNewLine.current) return
    focusNewLine.current = false
    const rows = formRef.current?.querySelectorAll<HTMLElement>('[data-jv-line]')
    rows?.[rows.length - 1]?.querySelector<HTMLInputElement>('input')?.focus()
  }, [lines.length])

  function removeLine(key: string) {
    setLines((prev) => (prev.length > 2 ? prev.filter((l) => l.key !== key) : prev))
  }

  const totals = useMemo(() => {
    let debit = 0
    let credit = 0
    for (const l of lines) {
      debit += parseFloat(l.debit) || 0
      credit += parseFloat(l.credit) || 0
    }
    return { debit, credit, diff: debit - credit }
  }, [lines])

  const isBalanced = Math.abs(totals.diff) < 0.005
  const hasAmount = totals.debit > 0

  const everyLineValid = lines.every((l) => {
    const d = parseFloat(l.debit) || 0
    const c = parseFloat(l.credit) || 0
    const oneSide = (d > 0 && c === 0) || (c > 0 && d === 0)
    return l.account_code !== '' && oneSide
  })

  const canSubmit =
    description.trim().length > 0 &&
    lines.length >= 2 &&
    everyLineValid &&
    isBalanced &&
    hasAmount

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!canSubmit) return

    const payload = {
      transaction_date: transactionDate,
      description: description.trim(),
      segment,
      lines: lines.map((l) => ({
        account_code: l.account_code,
        debit: parseFloat(l.debit) || 0,
        credit: parseFloat(l.credit) || 0,
        description: l.description.trim() || undefined,
      })),
    }

    startTransition(async () => {
      try {
        if (isEdit && entry) {
          await updateJournalVoucher(entry.id, payload)
        } else {
          await createJournalVoucher(payload)
        }
      } catch (err) {
        // redirect() throws NEXT_REDIRECT on success — let it bubble.
        if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) throw err
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  function handleDelete() {
    if (!entry) return
    if (!window.confirm('Delete this journal voucher? This cannot be undone.')) return
    setError(null)
    startDeleting(async () => {
      try {
        await deleteJournalVoucher(entry.id)
        window.location.href = '/reconciliation/journal-entries'
      } catch (err) {
        if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) throw err
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  return (
    <form
      ref={formRef}
      onKeyDown={(e) => {
        if (e.key === 'Insert') {
          e.preventDefault()
          addLine()
        }
      }}
      onSubmit={handleSubmit}
      className="bg-surface border border-hairline rounded-md p-4 sm:p-8 max-w-4xl"
    >
      {/* ───────── Header fields ───────── */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="transaction_date"
            className="block text-sm font-sans font-medium text-graphite mb-1.5"
          >
            Transaction date <span className="text-danger">*</span>
          </label>
          <input
            id="transaction_date"
            name="transaction_date"
            type="date"
            required
            value={transactionDate}
            onChange={(e) => setTransactionDate(e.target.value)}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label
            htmlFor="description"
            className="block text-sm font-sans font-medium text-graphite mb-1.5"
          >
            Description <span className="text-danger">*</span>
          </label>
          <input
            id="description"
            name="description"
            type="text"
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., Reclassify prepaid insurance to expense"
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label
            htmlFor="segment"
            className="block text-sm font-sans font-medium text-graphite mb-1.5"
          >
            Segment <span className="text-danger">*</span>
          </label>
          <select
            id="segment"
            name="segment"
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
          >
            {SEGMENT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <p className="font-serif italic text-muted text-xs mt-1.5">
            Drives which department P&amp;L this voucher appears in. If the voucher
            also moves a bank account, the department&apos;s pool moves by the same
            amount. Unallocated stays out of every department view.
          </p>
        </div>
      </div>

      {/* ───────── Lines ───────── */}
      <div className="mb-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-sm font-sans font-medium text-graphite">
            Lines <span className="text-muted font-normal">(minimum 2)</span>
          </span>
        </div>

        <div className="border border-hairline rounded-md overflow-hidden">
          {/* Column header */}
          <div className="hidden sm:grid grid-cols-[2fr_1.2fr_1.2fr_1.8fr_auto] gap-2 px-3 py-2 bg-surface-2 text-xs uppercase tracking-wide font-sans text-muted">
            <div>Account</div>
            <div className="text-right">Debit</div>
            <div className="text-right">Credit</div>
            <div>Line description</div>
            <div className="w-7" aria-hidden />
          </div>

          {lines.map((line) => (
            <div
              key={line.key}
              data-jv-line
              className="grid grid-cols-1 sm:grid-cols-[2fr_1.2fr_1.2fr_1.8fr_auto] gap-2 px-3 py-2 border-t border-hairline first:border-t-0 sm:border-t items-center"
            >
              {/* Type-ahead account search (user 2026-06-12) — same picker as
                  the PV/invoice forms; headers hidden, type any part of the
                  code or name to narrow. */}
              <AccountPicker
                accounts={accounts}
                value={line.account_code}
                onChange={(code) => updateLine(line.key, { account_code: code })}
                name={`jv_line_acct_${line.key}`}
                placeholder="Type code or name…"
              />

              <input
                aria-label="Debit"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={line.debit}
                onChange={(e) => setDebit(line.key, e.target.value)}
                disabled={!!line.credit}
                placeholder="0.00"
                className="w-full px-2 py-1.5 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-num-ink text-right focus:outline-none focus:border-accent-border disabled:opacity-40 disabled:cursor-not-allowed"
              />

              <input
                aria-label="Credit"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={line.credit}
                onChange={(e) => setCredit(line.key, e.target.value)}
                disabled={!!line.debit}
                placeholder="0.00"
                className="w-full px-2 py-1.5 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-num-ink text-right focus:outline-none focus:border-accent-border disabled:opacity-40 disabled:cursor-not-allowed"
              />

              <input
                aria-label="Line description"
                type="text"
                value={line.description}
                onChange={(e) => updateLine(line.key, { description: e.target.value })}
                placeholder="Optional"
                className="w-full px-2 py-1.5 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
              />

              <button
                type="button"
                onClick={() => removeLine(line.key)}
                disabled={lines.length <= 2}
                aria-label="Remove line"
                className="justify-self-end text-muted hover:text-danger text-lg leading-none px-2 py-1 rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addLine}
          className="mt-3 text-sm text-accent hover:text-accent-hover font-sans transition-colors"
        >
          + Add line
        </button>
      </div>

      {/* ───────── Totals footer ───────── */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-[2fr_1.2fr_1.2fr_1.8fr_auto] gap-2 px-3 py-3 border-t-2 border-ink">
        <div className="font-serif italic text-ink text-sm self-center">Totals</div>
        <div className="num text-right">{formatMoney(totals.debit)}</div>
        <div className="num text-right">{formatMoney(totals.credit)}</div>
        <div className="self-center sm:col-span-2">
          <span className="font-sans text-xs uppercase tracking-wide text-muted mr-2">
            Difference
          </span>
          <span
            className={
              isBalanced
                ? 'font-mono tabular font-medium text-ledger text-sm'
                : 'font-mono tabular font-medium text-danger text-sm'
            }
          >
            {isBalanced ? 'Balanced' : formatMoney(totals.diff)}
          </span>
        </div>
      </div>

      {/* ───────── Error ───────── */}
      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 mb-6 text-sm font-sans">
          {error}
        </div>
      ) : null}

      {/* ───────── Actions ───────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 pt-4 border-t border-hairline">
        <button
          type="submit"
          disabled={isPending || isDeleting || !canSubmit}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending
            ? 'Saving…'
            : isEdit
              ? 'Save changes'
              : 'Post voucher'}
        </button>
        <Link
          href="/reconciliation/journal-entries"
          className="text-sm text-graphite hover:text-ink font-sans transition-colors text-center sm:text-left"
        >
          Cancel
        </Link>
        {isEdit ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending || isDeleting}
            className="text-sm text-danger hover:underline font-sans transition-colors sm:ml-auto disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? 'Deleting…' : 'Delete voucher'}
          </button>
        ) : (
          <span className="text-xs text-muted italic font-serif sm:ml-auto">
            Debits must equal credits before posting
          </span>
        )}
      </div>
    </form>
  )
}
