'use client'

import { useRef, useState } from 'react'
import { earnedFloor } from '@/lib/commission/titles'
import { rankLabelOf } from '@/lib/commission/ranks'
import { compareByLadder } from '@/lib/ladder'
import { headsLabel } from '@/lib/department-heads'
import { addMember, removeMember, setStaffRank, updateStaffTax, type RankOutcome } from '../../../hierarchy-actions'
import DirectorsSection from './DirectorsSection'
import PersonContextMenu from './PersonContextMenu'
import type { PopAnchor } from './MovePopover'
import type { MembershipDestination } from '../../../_lib/membership-destinations'
import {
  ActionForm,
  Choice,
  Field,
  Hidden,
  Hint,
  RowForm,
  SaveButton,
  SectionHead,
  Tick,
  toPct,
} from '@/components/RowForm'
import type { DirectorRow, MemberCandidate, RankRow, SalespersonRow, TitleRow } from '../../../_components/config/types'

/** A refusal: `.sheet-notice`'s geometry on the danger wash. */
const DANGER_NOTE = 'my-3.5 rounded-md border border-danger/50 bg-danger-bg px-3.5 py-[11px] text-[12px] leading-[1.65] text-danger'
/** A field's caption, in the summary cards' small caps. */
const CAPTION = 'text-[10px] font-medium uppercase tracking-[0.06em]'

/**
 * The Team table — one row per member of this sub-department.
 *
 * It used to be Rules IX, with an upline picker on every row. The user moved
 * it beside the chart on 2026-09-05 and drew the line: "在 team 那边是不能换
 * 任何东西的，只可以换它的 rank 罢了" — the chart is where somebody moves
 * between trees, and the table shows what the chart drew. So the Upline
 * column is text.
 *
 * Two shapes since 2026-09-10 (memberships per sub-department):
 *
 *   home    the department's oldest sub-department. Everybody in the
 *           department is a row; the title is the company title (People
 *           changes it); only the RANK is set here. The Upline column is who
 *           they report to.
 *   other   a world of its own. The rows are its MEMBERS; the Title column is
 *           a picker (the title held here, which may differ from the company
 *           one shown beneath it); members are added at the top and removed
 *           on the row. None of it touches People.
 *
 * The rate mode saves with the rank because it is the rank's own setting
 * (Manual holds it; Scheme target recomputes from it). Withholding Tax stays
 * editable here because it is a payroll fact of the person with no other
 * home in the module.
 *
 * Above the members sits who the sub-department REPORTS TO — its Revenue
 * Director(s), 2026-09-11 (`DirectorsSection`). A director is never a row
 * here: they hold no rank. The Upline column of somebody at the top of a
 * tree names them instead of "top of a tree", because that is who the leader
 * reports to — a reporting line, with no override.
 *
 * Every save goes through `setStaffRank`, which writes a new effective-dated
 * position. It comes back with a note — the rank now sits above the title,
 * or why it could not be set — by returning, not throwing, so `RowForm`'s
 * error slot never sees it. The banner below is where such a note lands.
 */
export default function TeamTable({
  people,
  ranks,
  titles,
  candidates,
  directors,
  directorCandidates,
  subDepartmentId,
  schemeId,
  subDeptName,
  isHome,
  membershipDestinations = [],
}: {
  people: SalespersonRow[]
  ranks: RankRow[]
  titles: TitleRow[]
  candidates: MemberCandidate[]
  directors: DirectorRow[]
  directorCandidates: DirectorRow[]
  subDepartmentId: string
  schemeId: string
  subDeptName: string
  isHome: boolean
  membershipDestinations?: MembershipDestination[]
}) {
  const [note, setNote] = useState<RankOutcome | null>(null)
  const [addingMember, setAddingMember] = useState<{ person: SalespersonRow; anchor: PopAnchor } | null>(null)
  const menuTrigger = useRef<HTMLButtonElement | null>(null)
  const closeMembershipMenu = () => {
    setAddingMember(null)
    menuTrigger.current?.focus({ preventScroll: true })
  }
  const nameOf = new Map(people.map(p => [p.staff_id, p.employee_name]))
  // Who the top of a tree reports to: the sub-department's directors, A→Z.
  const reportsTo = headsLabel(directors.map(d => d.employee_name))

  // The ladder, top down — the most senior title first, the same title
  // together, names A→Z on a rung — the order the People roster reads in
  // (user, 2026-09-05: "从 title level 最高排到 level 最低"). Somebody whose
  // title is not on the ladder comes after everybody who is.
  const ordered = [...people].sort((a, b) =>
    compareByLadder(
      { name: a.employee_name, title: a.title_name, levelRank: a.title_level_rank },
      { name: b.employee_name, title: b.title_name, levelRank: b.title_level_rank },
    ),
  )

  // The shape titles.ts reasons about — the earned floor a title lifts a
  // scheme-target month above the placed rank.
  const rungs = ranks.map(r => ({
    id: r.id,
    titleId: r.title_id,
    canRecruit: r.can_recruit,
    sortOrder: r.sort_order,
    personalSalesThreshold: r.personal_sales_threshold,
    productRate: Number(r.product_rate),
  }))
  // "Rank B · 8%" — the rung's label is a trigger-kept copy of its rank's
  // (comm_rank_defs, 2026-09-05), so nothing is re-lettered here.
  const labelOf = (id: string) => {
    const r = ranks.find(x => x.id === id)
    return r ? rankLabelOf(r) : '—'
  }
  // Only a title with a rung on THIS ladder can be held here: a membership
  // needs a rank to be paid from.
  const onLadder = new Set(ranks.map(r => r.title_id))
  const holdableTitles = titles.filter(t => onLadder.has(t.id))

  const done = (r: unknown) => setNote((r as RankOutcome | undefined) ?? null)

  return (
    <section>
      {/* A saved change's note is the sheet's peach notice in black; a refusal
          keeps the danger wash. */}
      {note?.note ? (
        <div
          role={note.ok ? 'status' : 'alert'}
          className={note.ok ? 'sheet-notice' : DANGER_NOTE}
        >
          {note.note}
        </div>
      ) : null}

      <DirectorsSection
        directors={directors}
        candidates={directorCandidates}
        subDepartmentId={subDepartmentId}
        subDeptName={subDeptName}
        onDone={done}
      />

      <SectionHead title="Team" count={`${people.length} PEOPLE`} />
      <Hint>
        {isHome ? (
          <>
            <strong>Title</strong> is what they hold and only ever goes up — an applied run raises
            it; nothing here lowers it. The rows read the ladder top down, the most senior title
            first. <strong>Rank</strong> is the floor a month pays from, lettered from the top of
            the ladder; a title gives its rank automatically, and only a raise is set here.{' '}
            <strong>Manual</strong> keeps that rank even in a month below target;{' '}
            <strong>Scheme target</strong> recomputes the rate every month from group sales and
            drops back when the target is missed. <strong>Upline</strong> is who they report to —
            the one line both charts draw; move people on the chart or on People. Every change
            writes a new effective-dated position; a month already computed keeps the chart it was
            computed against.
          </>
        ) : (
          <>
            {subDeptName} is its own world. <strong>Title</strong> is the title held <strong>here</strong>,
            which may differ from the company title beneath it; it only ever goes up — an applied
            run raises it. <strong>Rank</strong> follows that title and only a raise is set here.{' '}
            <strong>Upline</strong> is who they earn under here, moved on the chart. Add members
            above; remove one on their row once nobody earns under them. None of this touches
            People, and a month already computed keeps the chart it was computed against.
          </>
        )}
        {ranks.some(r => Number(r.group_incentive_amount) > 0) ? (
          <> Group packages are checked each month, including a manually assigned package rank. If no direct group qualifies, the percentage rank below the package applies for that month.</>
        ) : null}
      </Hint>

      {candidates.length > 0 ? (
        <div className="sheet-toolbar">
          {/* RowForm rather than ActionForm: its `onDone` carries the action's
              result, and a refusal here is a returned note, not a throw. */}
          <RowForm action={addMember} onDone={done}>
            {({ pending }) => (
              // The Add button stands as tall as the toolbar's selects.
              <div className="flex flex-1 flex-wrap items-end gap-3 [&_button]:min-h-[36px]">
                <Hidden name="scheme_id" value={schemeId} />
                <label className="flex flex-col gap-1">
                  <span className={CAPTION}>Add to {subDeptName}</span>
                  <Choice name="staff_id" defaultValue="" required ariaLabel={`Person to add to ${subDeptName}`} width="w-56">
                    <option value="">— pick somebody —</option>
                    {candidates.map(c => (
                      <option key={c.staff_id} value={c.staff_id}>
                        {c.employee_name}
                        {c.company_title_name ? ` · ${c.company_title_name}` : ''}
                      </option>
                    ))}
                  </Choice>
                </label>
                <label className="flex flex-col gap-1">
                  <span className={CAPTION}>Title here</span>
                  <Choice name="title_id" defaultValue="" required ariaLabel={`Title held in ${subDeptName}`} width="w-52">
                    <option value="">— pick a title —</option>
                    {holdableTitles.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </Choice>
                </label>
                <SaveButton pending={pending} label="Add" />
                {candidates.length === 0 ? (
                  <span className="text-xs">Everybody in the department is already here.</span>
                ) : holdableTitles.length === 0 ? (
                  <span className="text-xs">
                    No title has a rung on this ladder yet — set the Title ladder under Rules first.
                  </span>
                ) : null}
              </div>
            )}
          </RowForm>
        </div>
      ) : null}

      {people.length === 0 ? (
        <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
          <p className="text-md font-bold mb-2">No members yet.</p>
          <p className="text-sm">
            {isHome
              ? 'Add salespeople under People Management with a commission department and a ladder title.'
              : `Add the first member of ${subDeptName} above.`}
          </p>
        </div>
      ) : (
        // The table is its own framed well on the sheet; the wrapper only scrolls.
        <div className="overflow-x-auto table-scroll">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Title</th>
                <th>Rank</th>
                <th className="w-44">Rate mode</th>
                <th>Upline</th>
                <th className="w-40">Withholding</th>
                <th>Membership</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map(p => {
                const placed = p.rank_id ? rungs.find(r => r.id === p.rank_id) : undefined
                const earned = p.rate_mode === 'fixed' ? undefined : earnedFloor(rungs, p.title_id)
                const liftedTo =
                  earned && placed && earned.sortOrder > placed.sortOrder ? earned : undefined

                return (
                  <tr key={p.staff_id}>
                    <td>
                      <span className="font-medium">{p.employee_name}</span>
                      {p.employee_code ? (
                        <span className="ml-2 font-mono text-[11px]">{p.employee_code}</span>
                      ) : null}
                      {p.direct_line_limit != null ? (
                        <div className="text-[11px] mt-0.5">
                          {p.direct_line_count ?? 0}/{p.direct_line_limit} DIRECTS{p.expansion_earned_at ? ' · SDL EARNED' : ''}
                        </div>
                      ) : null}
                    </td>
                    <RowForm action={setStaffRank} onDone={done}>
                      {({ pending }) => (
                        <>
                          <td>
                            <Hidden name="staff_id" value={p.staff_id} />
                            <Hidden name="scheme_id" value={schemeId} />
                            {p.based_here ? (
                              <>
                                {p.title_name ?? <span>— none yet —</span>}
                                {/* The rung — the rows are in its order. */}
                                {p.title_level_rank !== null ? (
                                  <span
                                    className="ml-2 font-mono text-[10px]"
                                    title={`Level ${p.title_level_rank} · ${p.title_level_name}`}
                                  >
                                    L{p.title_level_rank}
                                  </span>
                                ) : null}
                              </>
                            ) : (
                              <>
                                <Choice
                                  name="title_id"
                                  defaultValue={p.title_id ?? ''}
                                  required
                                  ariaLabel={`${p.employee_name} title here`}
                                  width="w-48"
                                >
                                  {holdableTitles.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                  ))}
                                </Choice>
                                {p.company_title_name && p.company_title_name !== p.title_name ? (
                                  <div className="text-[11px] mt-0.5">
                                    {p.company_title_name} on People
                                  </div>
                                ) : null}
                              </>
                            )}
                          </td>
                          <td>
                            <Choice
                              name="rank_id"
                              defaultValue={p.rank_id ?? ''}
                              required
                              ariaLabel={`${p.employee_name} rank`}
                              width="w-40"
                            >
                              {p.rank_id ? null : <option value="">— no rank yet —</option>}
                              {ranks.map(r => (
                                <option key={r.id} value={r.id}>{labelOf(r.id)}</option>
                              ))}
                            </Choice>
                            {liftedTo ? (
                              <div className="text-[11px] mt-0.5">
                                paid from {labelOf(liftedTo.id)} — earned by title
                              </div>
                            ) : null}
                          </td>
                          <td className="whitespace-nowrap">
                            <Choice
                              name="rate_mode"
                              defaultValue={p.rate_mode ?? ''}
                              ariaLabel={`${p.employee_name} rate mode`}
                              width="w-36"
                            >
                              <option value="">scheme default</option>
                              <option value="fixed">Manual</option>
                              <option value="variable">Scheme target</option>
                            </Choice>
                            <span className="ml-2"><SaveButton pending={pending} label="✓" /></span>
                          </td>
                        </>
                      )}
                    </RowForm>
                    <td className="whitespace-nowrap">
                      {p.upline_staff_id ? (
                        <span>{nameOf.get(p.upline_staff_id) ?? 'somebody not on this chart'}</span>
                      ) : reportsTo ? (
                        <span
                          title="The top of a tree reports to the sub-department's director — a reporting line only, no override."
                        >
                          top of a tree · reports to {reportsTo}
                        </span>
                      ) : (
                        <span>top of a tree</span>
                      )}
                      {p.placed_since ? (
                        <span className="ml-2 font-mono text-[10px]">since {p.placed_since}</span>
                      ) : null}
                    </td>
                    <td>
                      <ActionForm action={updateStaffTax}>
                        {({ pending }) => (
                          <div className="flex items-center gap-2">
                            <Hidden name="staff_id" value={p.staff_id} />
                            <Tick name="withholding" defaultChecked={p.tax_mode === 'withholding'} ariaLabel={`${p.employee_name} withholding`} />
                            <Field name="withholding_rate" type="number" step="0.01" width="w-16" defaultValue={toPct(p.withholding_rate)} ariaLabel="withholding rate" />
                            <span className="text-xs">%</span>
                            <SaveButton pending={pending} label="✓" />
                          </div>
                        )}
                      </ActionForm>
                    </td>
                    <td>
                      {/* A link-button: underlined at rest, as a link in a sheet table is. */}
                      <button type="button" className="text-xs underline underline-offset-[3px] decoration-ink/35 hover:decoration-ink whitespace-nowrap"
                        aria-label={`Add ${p.employee_name} to department`} aria-haspopup="menu"
                        onClick={event => {
                          const rect = event.currentTarget.getBoundingClientRect()
                          menuTrigger.current = event.currentTarget
                          setNote(null)
                          setAddingMember({ person: p, anchor: { left: rect.left, top: rect.top, bottom: rect.bottom } })
                        }}>Add to department</button>
                      {!p.based_here ? (
                        <RowForm action={removeMember} onDone={done} confirm={`Remove ${p.employee_name} from ${subDeptName}?`}>
                          {({ pending }) => (
                            <>
                              <Hidden name="staff_id" value={p.staff_id} />
                              <Hidden name="scheme_id" value={schemeId} />
                              <SaveButton pending={pending} label="Remove" />
                            </>
                          )}
                        </RowForm>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {addingMember ? <PersonContextMenu key={addingMember.person.staff_id} startAtDepartments anchor={addingMember.anchor}
        person={{ staffId: addingMember.person.staff_id, name: addingMember.person.employee_name, titleId: addingMember.person.title_id }}
        destinations={membershipDestinations} onClose={closeMembershipMenu}
        onAdded={message => { closeMembershipMenu(); setNote({ ok: true, note: message }) }} /> : null}
    </section>
  )
}
