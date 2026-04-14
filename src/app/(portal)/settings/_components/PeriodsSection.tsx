'use client'

import { useState, useTransition, useMemo } from 'react'
import dayjs from 'dayjs'
import { closePeriod, reopenPeriod } from '../actions'

interface LockRow {
  period_month: string
  is_locked: boolean
  closed_at: string | null
  notes: string | null
}

interface Props {
  locks: LockRow[]
}

export default function PeriodsSection({ locks }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notesFor, setNotesFor] = useState<string | null>(null)

  const lockMap = useMemo(() => {
    const m = new Map<string, LockRow>()
    for (const l of locks) {
      m.set(dayjs(l.period_month).format('YYYY-MM-DD'), l)
    }
    return m
  }, [locks])

  const months = useMemo(() => {
    const now = dayjs().startOf('month')
    const list: { period: string; label: string; isFuture: boolean; isCurrent: boolean }[] = []
    for (let i = -11; i <= 0; i++) {
      const m = now.add(i, 'month')
      list.push({
        period: m.format('YYYY-MM-DD'),
        label: m.format('MMM YYYY'),
        isFuture: false,
        isCurrent: i === 0,
      })
    }
    return list.reverse()
  }, [])

  function handleClose(period: string, notes: string | null) {
    setError(null)
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('period_month', period)
        if (notes) fd.set('notes', notes)
        await closePeriod(fd)
        setNotesFor(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  function handleReopen(period: string) {
    setError(null)
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('period_month', period)
        await reopenPeriod(fd)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-serif text-2xl text-ink">Period closing</h2>
        <p className="font-serif italic text-graphite text-sm mt-1">
          Close a completed month to freeze its transactions. Principal only. Reopen any time for corrections.
        </p>
      </div>

      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 mb-4 text-sm font-sans">
          {error}
        </div>
      ) : null}

      <div className="border border-hairline rounded-md bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans bg-surface-2/30">
              <th className="text-left py-3 px-4 font-medium">Month</th>
              <th className="text-left py-3 px-4 font-medium">Status</th>
              <th className="text-left py-3 px-4 font-medium">Closed</th>
              <th className="text-left py-3 px-4 font-medium">Notes</th>
              <th className="text-right py-3 px-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => {
              const lock = lockMap.get(m.period)
              const isLocked = !!lock?.is_locked
              const closedAt = lock?.closed_at ? dayjs(lock.closed_at).format('D MMM YYYY') : '—'
              const showNoteEditor = notesFor === m.period
              return (
                <tr key={m.period} className="border-b border-hairline last:border-0 align-top">
                  <td className="py-3 px-4 font-serif text-ink">
                    {m.label}
                    {m.isCurrent ? <span className="ml-2 text-xs font-serif italic text-muted">current</span> : null}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`font-serif italic text-sm ${isLocked ? 'text-danger' : 'text-ledger'}`}>
                      {isLocked ? 'closed' : 'open'}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-graphite">{closedAt}</td>
                  <td className="py-3 px-4 font-serif text-graphite text-sm">{lock?.notes ?? '—'}</td>
                  <td className="py-3 px-4 text-right">
                    {isLocked ? (
                      <button
                        type="button"
                        onClick={() => handleReopen(m.period)}
                        disabled={isPending}
                        className="text-xs text-accent hover:text-accent-hover font-serif italic disabled:opacity-50"
                      >
                        Reopen
                      </button>
                    ) : m.isCurrent ? (
                      <span className="text-xs text-muted font-serif italic">—</span>
                    ) : showNoteEditor ? (
                      <form
                        className="flex items-center gap-2 justify-end"
                        action={(fd) => handleClose(m.period, (fd.get('notes') as string) || null)}
                      >
                        <input
                          name="notes"
                          type="text"
                          placeholder="Optional notes"
                          className="px-2 py-1 bg-paper border border-hairline rounded-md text-xs text-ink focus:outline-none focus:border-accent-border w-48"
                        />
                        <button
                          type="submit"
                          disabled={isPending}
                          className="text-xs bg-accent text-white px-3 py-1 rounded-md font-serif italic disabled:opacity-50"
                        >
                          Confirm close
                        </button>
                        <button
                          type="button"
                          onClick={() => setNotesFor(null)}
                          className="text-xs text-muted hover:text-ink font-sans"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setNotesFor(m.period)}
                        disabled={isPending}
                        className="text-xs text-danger hover:text-danger font-serif italic disabled:opacity-50"
                      >
                        Close period
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
