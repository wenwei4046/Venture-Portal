'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  COST_MODEL_LABEL,
  costModelSummary,
  switchConsequence,
  switchedNote,
  type CostModel,
  type DepartmentMode,
} from '@/lib/department-mode'
import { setDepartmentCostModel } from '@/app/(portal)/settings/department-mode-actions'

// The on/off switch between cost center and centralized (user 2026-09-30).
// On = centralized. It says what the switch will do before doing it — and
// switching to centralized can clear draft splits, so it asks first, inline.
// Whether it is live follows the person signed in (`canSwitch`), not the view
// they are looking through: the Principal flips it from HR's or Finance's view.
//
//   panel — on a department's own page, with the mode's one-line meaning
//   cell  — a row of Settings › Departments

export default function DepartmentModeSwitch({
  department,
  variant = 'panel',
}: {
  department: DepartmentMode
  variant?: 'panel' | 'cell'
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const model = department.costModel
  const centralized = model === 'centralized'
  const target: CostModel = centralized ? 'cost_center' : 'centralized'

  function confirm() {
    setError(null)
    startTransition(async () => {
      const result = await setDepartmentCostModel(department.id, target)
      if (!result.ok) {
        setError(result.reason)
        return
      }
      setAsking(false)
      setNote(switchedNote(department.name, target, result.clearedPeople))
      router.refresh()
    })
  }

  const toggle = (
    <button
      type="button"
      role="switch"
      aria-checked={centralized}
      aria-label={`${department.name} is centralized`}
      title={department.canSwitch ? undefined : 'Only the Principal can switch this'}
      disabled={!department.canSwitch || isPending}
      onClick={() => {
        setNote(null)
        setError(null)
        setAsking(true)
      }}
      className="dept-mode-switch"
    >
      <span className="dept-mode-track" aria-hidden />
      {COST_MODEL_LABEL[model]}
    </button>
  )

  const question = asking ? (
    <div className="dept-mode-ask" role="group" aria-label={`Switch ${department.name} to ${COST_MODEL_LABEL[target]}`}>
      <p>{switchConsequence(department, target)}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={confirm}
          disabled={isPending}
          // White on the portal's blue; the sheet's own rule turns it back to
          // black on its orange ("anything painted orange carries black lettering").
          className="bg-accent hover:bg-accent-hover text-white disabled:opacity-40 text-sm px-3 py-1.5 rounded-control transition-colors"
        >
          {isPending ? 'Switching…' : `Switch to ${COST_MODEL_LABEL[target]}`}
        </button>
        <button
          type="button"
          onClick={() => setAsking(false)}
          disabled={isPending}
          className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-3 py-1.5 rounded-control transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  ) : null

  const status = (
    <>
      {note ? <p className="text-xs mt-1.5 mb-0" role="status">{note}</p> : null}
      {error ? <p className="text-danger text-xs mt-1.5 mb-0" role="alert">{error}</p> : null}
    </>
  )

  if (variant === 'cell') {
    return (
      <div className="dept-mode-cell">
        {toggle}
        {question}
        {status}
      </div>
    )
  }

  return (
    <section className="dept-mode" aria-label={`${department.name} department mode`}>
      <div className="dept-mode-row">
        <span className="dept-mode-eyebrow">{department.name} · department mode</span>
        {toggle}
        <span className="dept-mode-meaning">{costModelSummary(model)}</span>
      </div>
      {!department.canSwitch ? (
        <p className="text-[11px] mt-1.5 mb-0">Switched by the Principal.</p>
      ) : null}
      {question}
      {status}
    </section>
  )
}
