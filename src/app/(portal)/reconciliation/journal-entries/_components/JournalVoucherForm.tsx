'use client'

import { useMemo, useRef, useState, useTransition, useEffect } from 'react'
import Link from 'next/link'
import { formatMoneyBare } from '@/lib/utils'
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

// 2026-10-10 — the handoff: a line nobody filled in (no account, no amount,
// no note) is a leftover — it neither holds Post back nor posts.
function isBlankLine(l: LineDraft): boolean {
  return l.account_code === '' && !l.debit.trim() && !l.credit.trim() && !l.description.trim()
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

  // A voucher of a department added since the list was written (IT, Revenue Department …) keeps its segment:
  // a select whose value is not among its options shows — and saves — the first one, Unallocated (2026-10-15).
  const seededSegment = seed?.segment ?? 'unallocated'
  const segmentOptions = SEGMENT_OPTIONS.some((o) => o.value === seededSegment)
    ? SEGMENT_OPTIONS
    : [...SEGMENT_OPTIONS, { value: seededSegment, label: seededSegment.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) }]

  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isDeleting, startDeleting] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const descriptionRef = useRef<HTMLInputElement>(null)

  // 2026-10-10 — the handoff: the form opens with the cursor in Description.
  useEffect(() => {
    descriptionRef.current?.focus()
  }, [])

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

  // What is checked and posted: every line but the untouched leftovers.
  const filledLines = lines.filter((l) => !isBlankLine(l))
  const everyLineValid = filledLines.every((l) => {
    const d = parseFloat(l.debit) || 0
    const c = parseFloat(l.credit) || 0
    const oneSide = (d > 0 && c === 0) || (c > 0 && d === 0)
    return l.account_code !== '' && oneSide
  })

  const canSubmit =
    description.trim().length > 0 &&
    filledLines.length >= 2 &&
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
      lines: filledLines.map((l) => ({
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

  // Whether the entry balances, as the handoff's chip says it (2026-10-09).
  const balanceTone = isBalanced && hasAmount ? 'ok' : totals.debit > 0 || totals.credit > 0 ? 'bad' : 'idle'
  const balanceText =
    balanceTone === 'ok'
      ? 'Balanced'
      : balanceTone === 'bad'
        ? `Out of balance · ${formatMoneyBare(Math.abs(totals.diff))}`
        : 'Debits must equal credits before posting'

  // The voucher per the user's Claude Design handoff (2026-10-09): Date,
  // Description and Segment on one row; the lines under a navy band with
  // + Add line (Ins) and the totals at their foot; the balance chip; Post
  // entry only once the entry balances. Ins anywhere in the form adds a line.
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
      className="jv-form"
    >
      <div className="jv-head">
        <label className="jv-field">
          <span>Date</span>
          <input
            id="transaction_date"
            name="transaction_date"
            type="date"
            required
            value={transactionDate}
            onChange={(e) => setTransactionDate(e.target.value)}
            className="jv-input font-mono"
          />
        </label>
        <label className="jv-field">
          <span>Description</span>
          <input
            ref={descriptionRef}
            id="description"
            name="description"
            type="text"
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Reclassify prepaid insurance to expense"
            className="jv-input"
          />
        </label>
        <label className="jv-field">
          <span>Segment</span>
          <select id="segment" name="segment" value={segment} onChange={(e) => setSegment(e.target.value)} className="jv-input">
            {segmentOptions.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="jv-hint">
        The segment decides which department&apos;s P&amp;L the voucher appears in; if it also moves a bank account, that
        department&apos;s pool moves by the same amount. Unallocated stays out of every department view. At least two lines.
      </p>

      <div className="jv-lines">
        <div className="jv-row jv-row-head">
          <span>Account</span>
          <span className="r">Debit</span>
          <span className="r">Credit</span>
          <span className="jv-note">Line note</span>
          <span />
        </div>
        {lines.map((line) => (
          <div key={line.key} data-jv-line className="jv-row">
            {/* Type-ahead account search (user 2026-06-12) — same picker as
                the PV/invoice forms; headers hidden. */}
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
              className="jv-input jv-num"
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
              className="jv-input jv-num"
            />
            <input
              aria-label="Line description"
              type="text"
              value={line.description}
              onChange={(e) => updateLine(line.key, { description: e.target.value })}
              placeholder="Optional"
              className="jv-input jv-note"
            />
            <button type="button" onClick={() => removeLine(line.key)} disabled={lines.length <= 2} aria-label="Remove line" className="jv-del">
              ×
            </button>
          </div>
        ))}
        <div className="jv-row jv-row-foot">
          <button type="button" onClick={addLine} className="jv-add">
            + Add line
            <kbd>Ins</kbd>
          </button>
          <span className="r num">{formatMoneyBare(totals.debit)}</span>
          <span className="r num">{formatMoneyBare(totals.credit)}</span>
          <span className="jv-note" />
          <span />
        </div>
      </div>

      {error ? <div className="sheet-danger mt-4">{error}</div> : null}

      <div className="jv-bottom">
        <span className={`jv-bal ${balanceTone}`} role="status">
          <span className="dot" />
          {balanceText}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {isEdit ? (
            <button type="button" onClick={handleDelete} disabled={isPending || isDeleting} className="btn-quiet-sheet text-danger">
              {isDeleting ? 'Deleting…' : 'Delete voucher'}
            </button>
          ) : null}
          <Link href="/reconciliation/journal-entries" className="btn-quiet-sheet">
            Cancel
          </Link>
          <button type="submit" disabled={isPending || isDeleting || !canSubmit} className="btn-pri-sheet">
            {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Post entry'}
          </button>
        </div>
      </div>
    </form>
  )
}
