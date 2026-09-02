'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { applyRun, computeRun, reopenRun } from '../../../run-actions'

interface Props {
  period: string
  /** Which sub-department's run this is — the engine reads ITS scheme. */
  subDepartmentId: string
  runId: string | null
  status: 'none' | 'draft' | 'computed' | 'applied' | 'locked'
  warningCount: number
  hasImport: boolean
}

/**
 * Compute → review → Apply, and the way back.
 *
 * The Apply button is disabled while any warning stands. That is not a nag:
 * every warning the engine raises is a case where it knows the figure is wrong
 * (an unclassified item group whose revenue it silently dropped, a salesperson
 * with sales and no rank paid at 0%, a placement that should not exist). The
 * RPC refuses the same cases, so this is only the polite half.
 */
export default function RunControls({
  period,
  subDepartmentId,
  runId,
  status,
  warningCount,
  hasImport,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<'apply' | 'reopen' | null>(null)

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
      return `Computed ${s.staffCount} statement(s) · ${s.releasedCount} order(s) released${
        s.deferredCount > 0 ? ` · ${s.deferredCount} still waiting on a deposit` : ''
      }.`
    })

  const apply = () =>
    run(async () => {
      const s = await applyRun(runId as string)
      return `Written into payroll: ${s.staffWritten} salesperson(s), ${s.ordersReleased} order(s) closed${
        s.titlesPromoted > 0 ? `, ${s.titlesPromoted} title(s) raised` : ''
      }.`
    })

  const reopen = () =>
    run(async () => {
      await reopenRun(runId as string)
      return 'Reopened. The commission figures have been taken back out of payroll. A title this run raised stays raised.'
    })

  const canApply = status === 'computed' && warningCount === 0

  if (confirming === 'apply') {
    return (
      <Panel>
        <p className="font-serif text-sm text-ink">
          Write this run into the {period.slice(0, 7)} payroll?
        </p>
        <p className="font-serif italic text-graphite text-xs">
          Each salesperson&apos;s <strong>commission_amount</strong> is set to their statement total, and
          every order this run pays for is closed so no later month can pay it again. Nothing is
          disbursed — the payroll run still has to be submitted and approved.
        </p>
        <Row>
          <Primary onClick={apply} disabled={isPending}>
            {isPending ? 'Applying…' : 'Apply to payroll'}
          </Primary>
          <Cancel onClick={() => setConfirming(null)} disabled={isPending} />
        </Row>
        {error && <Err>{error}</Err>}
      </Panel>
    )
  }

  if (confirming === 'reopen') {
    return (
      <Panel>
        <p className="font-serif text-sm text-ink">Reopen the {period.slice(0, 7)} run?</p>
        <p className="font-serif italic text-graphite text-xs">
          The commission already written into payroll goes back to zero and the orders it closed
          return to the pool, so a later run can pay them. Only possible while the payroll month is
          still a draft.
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
              {isPending ? 'Computing…' : status === 'none' ? 'Compute run' : 'Recompute'}
            </button>
            <button
              onClick={() => setConfirming('apply')}
              disabled={isPending || !canApply}
              title={
                status !== 'computed'
                  ? 'Compute the run first'
                  : warningCount > 0
                    ? `${warningCount} warning(s) to clear first`
                    : undefined
              }
              className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-control transition-colors disabled:opacity-40"
            >
              Apply to payroll →
            </button>
          </>
        )}
      </div>
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
