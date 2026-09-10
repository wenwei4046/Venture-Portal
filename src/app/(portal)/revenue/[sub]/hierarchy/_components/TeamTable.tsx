'use client'

import { useState } from 'react'
import { earnedFloor } from '@/lib/commission/titles'
import { rankLabelOf } from '@/lib/commission/ranks'
import { compareByLadder } from '@/lib/ladder'
import { setStaffRank, updateStaffTax, type RankOutcome } from '../../../hierarchy-actions'
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
import type { RankRow, SalespersonRow } from '../../../_components/config/types'

/**
 * The Team table — one row per salesperson, the rank the one thing it edits.
 *
 * It used to be Rules IX, with an upline picker on every row. The user moved
 * it beside the chart on 2026-09-05 and drew the line: "在 team 那边是不能换
 * 任何东西的，只可以换它的 rank 罢了" — the chart is where somebody moves
 * between trees, and the table shows what the chart drew. So the Upline
 * column is text: since 2026-09-10 it is who they REPORT to, the one line
 * both charts draw, and the commission position follows it in the database.
 * The rate mode saves with the rank because it is the rank's own setting
 * (Manual holds it; Scheme target recomputes from it). Withholding Tax stays
 * editable here because it is a payroll fact of the person with no other
 * home in the module.
 *
 * Every save goes through `setStaffRank`, which writes a new effective-dated
 * position. It comes back with a note — the rank now sits above the title,
 * or why it could not be set — by returning, not throwing, so `RowForm`'s
 * error slot never sees it. The banner below is where such a note lands.
 */
export default function TeamTable({
  people,
  ranks,
  schemeId,
}: {
  people: SalespersonRow[]
  ranks: RankRow[]
  schemeId: string
}) {
  const [note, setNote] = useState<RankOutcome | null>(null)
  const nameOf = new Map(people.map(p => [p.staff_id, p.employee_name]))

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

  return (
    <section>
      <SectionHead title="Team" count={`${people.length} PEOPLE`} />
      <Hint>
        <strong>Title</strong> is what they hold and only ever goes up — an applied run raises it;
        nothing here lowers it. The rows read the ladder top down, the most senior title first.{' '}
        <strong>Rank</strong> is the floor a month pays from, lettered from the top of the ladder;
        a title gives its rank automatically, and only a raise is set here. <strong>Manual</strong>{' '}
        keeps that rank even in a month below target; <strong>Scheme target</strong> recomputes the
        rate every month from group sales and drops back when the target is missed.{' '}
        <strong>Upline</strong> is who they report to — the one line both charts draw; move people
        on the chart or on People. Every change writes a new effective-dated position; a month
        already computed keeps the chart it was computed against.
      </Hint>

      {note?.note ? (
        <div
          className={`rounded-md p-3 mb-4 text-sm font-sans border ${
            note.ok ? 'bg-accent-bg border-accent-border text-accent' : 'bg-danger-bg border-danger/50 text-danger'
          }`}
        >
          {note.note}
        </div>
      ) : null}

      {people.length === 0 ? (
        <div className="border border-hairline rounded-md bg-surface p-8 text-center">
          <p className="font-serif text-lg text-ink mb-2">No salespeople yet.</p>
          <p className="font-serif italic text-muted text-sm">
            Add them under People Management with a commission department, then give them a rank
            here.
          </p>
        </div>
      ) : (
        <div className="border border-hairline rounded-md bg-surface overflow-x-auto table-scroll">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Title</th>
                <th>Rank</th>
                <th className="w-44">Rate mode</th>
                <th>Upline</th>
                <th className="w-40">Withholding</th>
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
                      <span className="text-ink">{p.employee_name}</span>
                      {p.employee_code ? (
                        <span className="ml-2 font-mono text-xs text-muted">{p.employee_code}</span>
                      ) : null}
                    </td>
                    <td className="font-serif italic text-sm text-graphite">
                      {p.title_name ?? <span className="text-muted">— none yet —</span>}
                      {/* The rung — the rows are in its order. */}
                      {p.title_level_rank !== null ? (
                        <span
                          className="ml-2 font-mono not-italic text-[10px] text-muted"
                          title={`Level ${p.title_level_rank} · ${p.title_level_name}`}
                        >
                          L{p.title_level_rank}
                        </span>
                      ) : null}
                    </td>
                    <RowForm
                      action={setStaffRank}
                      onDone={r => setNote((r as RankOutcome | undefined) ?? null)}
                    >
                      {({ pending }) => (
                        <>
                          <td>
                            <Hidden name="staff_id" value={p.staff_id} />
                            <Hidden name="scheme_id" value={schemeId} />
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
                              <div className="font-serif italic text-xs text-muted mt-1">
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
                    <td className="font-serif italic text-sm whitespace-nowrap">
                      {p.reports_to ? (
                        <span className="text-graphite">{nameOf.get(p.reports_to) ?? 'somebody not on this chart'}</span>
                      ) : (
                        <span className="text-muted">top of a tree</span>
                      )}
                      {p.placed_since ? (
                        <span className="ml-2 font-mono not-italic text-[10px] text-muted">since {p.placed_since}</span>
                      ) : null}
                    </td>
                    <td>
                      <ActionForm action={updateStaffTax}>
                        {({ pending }) => (
                          <div className="flex items-center gap-2">
                            <Hidden name="staff_id" value={p.staff_id} />
                            <Tick name="withholding" defaultChecked={p.tax_mode === 'withholding'} ariaLabel={`${p.employee_name} withholding`} />
                            <Field name="withholding_rate" type="number" step="0.01" width="w-16" defaultValue={toPct(p.withholding_rate)} ariaLabel="withholding rate" />
                            <span className="text-xs text-muted">%</span>
                            <SaveButton pending={pending} label="✓" />
                          </div>
                        )}
                      </ActionForm>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
