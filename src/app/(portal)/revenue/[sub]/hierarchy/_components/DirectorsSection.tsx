'use client'

import { Choice, Hidden, Hint, RowForm, SaveButton, SectionHead } from '@/components/RowForm'
import { addDirector, removeDirector } from '../../../hierarchy-actions'
import type { DirectorRow } from '../../../_components/config/types'

/**
 * Who the sub-department REPORTS TO — its Revenue Director(s) (user,
 * 2026-09-11).
 *
 * "Revenue Director 本身不会进入任何 Rank … 整个 Department 都是直接 report to
 *  Revenue Director … 有些 department 会同时 report 给两位 Revenue Director."
 *
 * A director is somebody whose title heads the department (People › Roles,
 * "Heads the department"). Naming them here draws them above every tree on
 * the chart, with a line down to each team leader and each standalone
 * member. It is a reporting line only: a director holds no rank, is never a
 * member, and no override climbs to them — so adding or removing one moves
 * nothing in the commission hierarchy.
 *
 * Both writes come back with a note rather than a throw (`RankOutcome`), so
 * a refusal from the database lands in the Team tab's banner in its own words.
 */
export default function DirectorsSection({
  directors,
  candidates,
  subDepartmentId,
  subDeptName,
  onDone,
}: {
  directors: DirectorRow[]
  candidates: DirectorRow[]
  subDepartmentId: string
  subDeptName: string
  onDone: (result: unknown) => void
}) {
  return (
    <section className="mb-8">
      <SectionHead
        title="Reports to"
        count={`${directors.length} ${directors.length === 1 ? 'DIRECTOR' : 'DIRECTORS'}`}
      />
      <Hint>
        {subDeptName} reports to the Revenue Director(s) below. Every team leader and every
        standalone member stands directly under them on the chart — a reporting line only: a
        director holds no rank, and no override reaches them. Which title heads the department is
        set under People › Roles.
      </Hint>

      <div className="border border-hairline rounded-md bg-surface p-4">
        {directors.length === 0 ? (
          <p className="font-serif italic text-sm text-muted mb-3">Nobody directs {subDeptName} yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2 mb-3" aria-label={`Directors of ${subDeptName}`}>
            {directors.map(d => (
              <li
                key={d.staff_id}
                className="inline-flex items-center gap-3 border border-hairline rounded-control bg-paper px-3 py-1.5 text-sm"
              >
                <span className="text-ink">{d.employee_name}</span>
                {d.title_name ? (
                  <span className="font-mono text-[10px] uppercase tracking-wide text-muted">{d.title_name}</span>
                ) : null}
                <RowForm
                  action={removeDirector}
                  onDone={onDone}
                  confirm={`${subDeptName} no longer reports to ${d.employee_name}?`}
                >
                  {({ pending }) => (
                    <>
                      <Hidden name="sub_department_id" value={subDepartmentId} />
                      <Hidden name="staff_id" value={d.staff_id} />
                      <SaveButton pending={pending} label="Remove" />
                    </>
                  )}
                </RowForm>
              </li>
            ))}
          </ul>
        )}

        {/* RowForm rather than ActionForm: its `onDone` carries the action's
            result, and a refusal here is a returned note, not a throw. */}
        <RowForm action={addDirector} onDone={onDone}>
          {({ pending }) => (
            <div className="flex flex-wrap items-end gap-3">
              <Hidden name="sub_department_id" value={subDepartmentId} />
              <label className="flex flex-col gap-1">
                <span className="font-mono text-mono-xs text-muted uppercase tracking-wide">
                  {subDeptName} reports to
                </span>
                <Choice
                  name="staff_id"
                  defaultValue=""
                  required
                  ariaLabel={`Director to add to ${subDeptName}`}
                  width="w-56"
                >
                  <option value="">— pick a director —</option>
                  {candidates.map(c => (
                    <option key={c.staff_id} value={c.staff_id}>
                      {c.employee_name}
                      {c.title_name ? ` · ${c.title_name}` : ''}
                    </option>
                  ))}
                </Choice>
              </label>
              <SaveButton pending={pending} label="Add" />
              {candidates.length === 0 ? (
                <span className="font-serif italic text-xs text-muted">
                  {directors.length > 0
                    ? 'Every head of the department already directs it.'
                    : 'Nobody in the department holds a title that heads it — tick "Heads the department" on the title under People › Roles.'}
                </span>
              ) : null}
            </div>
          )}
        </RowForm>
      </div>
    </section>
  )
}
