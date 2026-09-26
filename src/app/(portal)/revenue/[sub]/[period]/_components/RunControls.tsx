'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { computeRun, reopenRun } from '../../../run-actions'

interface Props {
  period: string
  /** Which sub-department's run this is — the engine reads ITS scheme. */
  subDepartmentId: string
  runId: string | null
  status: 'none' | 'draft' | 'computed' | 'applied' | 'locked'
  warningCount: number
  hasImport: boolean
  /**
   * "September 2026" when this month was settled by hand — before the first
   * month the portal pays (2026-09-26). Such a month takes no run: a clean
   * compute syncs to payroll, and its pay was made outside the portal.
   */
  settledBefore?: string | null
}

/**
 * A clean computation syncs to payroll in the same transaction. Warnings keep
 * the result here for correction; reopen removes only this programme's share.
 */
export default function RunControls({
  period,
  subDepartmentId,
  runId,
  status,
  warningCount,
  hasImport,
  settledBefore = null,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<'reopen' | null>(null)

  function run(work: () => Promise<string | null>) {
    setError(null)
    setNote(null)
    startTransition(async () => {
      try {
        const message = await work()
        setNote(message)
        setConfirming(null)
        router.refresh()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'That did not work'
        if (msg.includes('NEXT_REDIRECT')) return
        setError(msg)
      }
    })
  }

  const compute = () =>
    run(async () => {
      const s = await computeRun(period, subDepartmentId)
      return `Computed ${s.staffCount} statement(s) · ${
        s.payrollSynced
          ? `payroll synced · ${s.releasedCount} order(s) released`
          : `${s.warnings.length} warning(s) to clear before payroll can sync`
      }${
        s.deferredCount > 0 ? ` · ${s.deferredCount} still waiting on a deposit` : ''
      }.`
    })

  const reopen = () =>
    run(async () => {
      await reopenRun(runId as string)
      return 'Reopened. This sub-department’s commission has been removed from payroll. Other sub-departments and titles already raised are preserved.'
    })

  if (settledBefore && status === 'none') {
    return (
      <p className="font-serif italic text-graphite text-xs max-w-md text-right m-0">
        Settled by hand — the portal pays from {settledBefore}, so this month takes no run and
        nothing here reaches payroll. The commission shown is the rules applied to its bills.
      </p>
    )
  }

  if (confirming === 'reopen') {
    return (
      <Panel>
        <p className="font-serif text-sm text-ink">Reopen the {period.slice(0, 7)} run?</p>
        <p className="font-serif italic text-graphite text-xs">
          This sub-department&apos;s amount is removed from payroll and its orders return for
          recalculation. Amounts from other sub-departments stay in payroll. Only possible while
          payroll is still a draft.
        </p>
        <Row>
          <Primary onClick={reopen} disabled={isPending}>
            {isPending ? 'Reopening…' : 'Reopen'}
          </Primary>
          <Cancel onClick={() => setConfirming(null)} disabled={isPending} />
        </Row>
        {error && <Err>{error}</Err>}
      </Panel>
    )
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-3">
        {status === 'applied' || status === 'locked' ? (
          <button
            onClick={() => setConfirming('reopen')}
            disabled={isPending || status === 'locked'}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-control transition-colors disabled:opacity-50"
          >
            Reopen
          </button>
        ) : (
          <>
            <button
              onClick={compute}
              disabled={isPending || !hasImport}
              title={hasImport ? undefined : 'Import the month first'}
              className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-control transition-colors disabled:opacity-50"
            >
              {isPending ? 'Computing & syncing…' : status === 'none' ? 'Compute & sync payroll' : 'Recompute & sync payroll'}
            </button>
          </>
        )}
      </div>
      {status === 'applied' && !note && (
        <span className="font-serif italic text-ledger text-xs">Synced to payroll</span>
      )}
      {status === 'computed' && warningCount > 0 && !note && (
        <span className="font-serif italic text-danger text-xs max-w-md text-right">
          Payroll awaits correction of {warningCount} warning(s), then recompute.
        </span>
      )}
      {note && <span className="font-serif italic text-ledger text-xs max-w-md text-right">{note}</span>}
      {error && <Err>{error}</Err>}
    </div>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-end gap-2 bg-surface border border-accent-border rounded-card p-4 max-w-md text-right">
      {children}
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2 items-center">{children}</div>
}

function Primary({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-control disabled:opacity-50"
    >
      {children}
    </button>
  )
}

function Cancel({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="text-xs font-sans text-muted hover:text-ink px-2"
    >
      Cancel
    </button>
  )
}

function Err({ children }: { children: React.ReactNode }) {
  return <span className="font-serif italic text-danger text-xs max-w-md text-right">{children}</span>
}
