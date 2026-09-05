'use client'

import { earnedFloor } from '@/lib/commission/titles'
import { rankLabel, rankLetters } from '@/lib/commission/ranks'
import { compareByLadder } from '@/lib/ladder'
import { setPositionFromForm, updateStaffTax } from '../../../hierarchy-actions'
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
 * column is text, and the row's form carries the current upline as a hidden
 * value so a rank change never moves anyone. The rate mode saves with the
 * rank because it is the rank's own setting (Manual holds it; Scheme target
 * recomputes from it). Withholding Tax stays editable here because it is a
 * payroll fact of the person with no other home in the module.
 *
 * Every save goes through `setPosition`, which writes a new effective-dated
 * position and raises the title if the rank sits above it — never lowers it.
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
  const letters = rankLetters(
    ranks.map(r => ({ id: r.id, productRate: Number(r.product_rate), sortOrder: r.sort_order })),
  )
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
  const labelOf = (id: string) => {
    const r = rungs.find(x => x.id === id)
    return r ? rankLabel(letters.get(id) ?? '?', r.productRate) : '—'
  }

  return (
    <section>
      <SectionHead title="Team" count={`${people.length} PEOPLE`} />
      <Hint>
        <strong>Title</strong> is what they hold and only ever goes up — an applied run, or a rank
        above it set here, raises it; nothing here lowers it. The rows read the ladder top down,
        the most senior title first. <strong>Rank</strong> is the floor a
        month pays from, lettered from the top of the ladder. <strong>Manual</strong> keeps that
        rank even in a month below target; <strong>Scheme target</strong> recomputes the rate every
        month from group sales and drops back when the target is missed. <strong>Upline</strong> is
        the chart&apos;s — move people there. Every change writes a new effective-dated position; a
        month already computed keeps the chart it was computed against.
      </Hint>

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
                    <RowForm action={setPositionFromForm}>
                      {({ pending }) => (
                        <>
                          <td>
                            <Hidden name="staff_id" value={p.staff_id} />
                            <Hidden name="scheme_id" value={schemeId} />
                            {/* The chart's answer, carried along unchanged. */}
                            <Hidden name="upline_staff_id" value={p.upline_staff_id ?? ''} />
                            <Choice
                              name="rank_id"
                              defaultValue={p.rank_id ?? ''}
                              required
                              ariaLabel={`${p.employee_name} rank`}
                              width="w-40"
                            >
                              {p.rank_id ? null : <option value="">— pick a rank —</option>}
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
                      {!p.rank_id ? (
                        <span className="text-muted">not placed</span>
                      ) : p.upline_staff_id ? (
                        <span className="text-graphite">{nameOf.get(p.upline_staff_id) ?? 'an upline no longer here'}</span>
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
