import { formatMoney } from '@/lib/utils'
import {
  CRITERION_LABEL,
  buildPromotionSteps,
  isLadderGate,
  stepLogic,
  type PromotionRule,
  type PromotionStep,
} from '@/lib/commission/promotion-steps'
import { Hint, SectionHead } from '@/components/RowForm'
import type { MarginBandRow, PromotionRuleRow, RankRow } from './types'

/**
 * VIII. Promotion criteria — one block per step up the ladder.
 *
 * The rows were a flat list: `ta_7 → ta_8` five times, an "Alt" column of
 * 1 / 1 / 2 / 2 / 3 to say which rows go together, and an "Enforced" column
 * that read `no` all the way down. Now each step is headed by the two ranks
 * in words, its routes are lettered A / B / C with `and` / `or` down the
 * first column, the head says outright how the lines combine, and the one
 * line the engine actually applies — the ladder's group-sales target — wears
 * a chip instead of every other line wearing a `no`.
 *
 * Read-only: these are recorded for reference while the rules settle.
 */
export default function PromotionCriteria({
  ranks,
  rules,
  bands,
}: {
  ranks: RankRow[]
  rules: PromotionRuleRow[]
  bands: MarginBandRow[]
}) {
  const steps = buildPromotionSteps(ranks, rules)
  const bandLabel = (key: string) => bands.find(b => b.band_key === key)?.label ?? key

  return (
    <section>
      <SectionHead title="VIII. Promotion criteria" count="RECORDED · NOT ENFORCED" />
      <Hint>
        One block per step up the ladder. A <em>route</em> is met when every line in it holds;
        a step with several routes needs only one of them. Nothing reads these yet — the only gate
        the engine applies is the group-sales target on the ladder above, marked where a line
        matches it.
      </Hint>

      {steps.length === 0 ? (
        <p className="font-serif italic text-muted text-sm">
          The ladder is empty — add ranks in section II first.
        </p>
      ) : (
        <div className="space-y-7">
          {steps.map((step, i) => (
            <StepBlock key={`${step.fromKey}→${step.toKey}`} index={i + 1} step={step} bandLabel={bandLabel} />
          ))}
        </div>
      )}
    </section>
  )
}

function StepBlock({
  index,
  step,
  bandLabel,
}: {
  index: number
  step: PromotionStep
  bandLabel: (key: string) => string
}) {
  const multi = step.routes.length > 1
  // A note says what the figures cannot; a step whose lines need none
  // drops the column rather than carrying a blank one.
  const noted = step.routes.some(r => r.rules.some(x => x.note))

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
        <span className="font-mono text-[11px] text-muted tracking-[0.04em]">{index}.</span>
        <h3 className="m-0 text-base font-semibold text-ink">
          {step.fromLabel} <span className="font-normal text-muted">→</span> {step.toLabel}
        </h3>
        {/* The rank keys used to sit here (rs_5 → rs_6); the user had them
            taken out on 2026-09-05 — the letters say it. Only the anomaly
            still speaks. */}
        {step.onLadder ? null : (
          <span className="font-mono text-[11px] text-muted">not two adjacent rungs</span>
        )}
        <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.04em] text-muted">
          {stepLogic(step)}
        </span>
      </div>

      {step.routes.length === 0 ? (
        <p className="m-0 border border-dashed border-hairline rounded-md px-4 py-3 font-serif italic text-muted text-sm">
          Nothing recorded yet.
        </p>
      ) : (
        <div className="overflow-x-auto table-scroll">
          <table className="ledger-table">
            <thead>
              <tr>
                {multi ? <th className="w-20">Route</th> : null}
                <th>Criterion</th>
                <th className="right">Threshold</th>
                {noted ? <th>Note</th> : null}
              </tr>
            </thead>
            <tbody>
              {step.routes.flatMap(route =>
                route.rules.map((rule, j) => (
                  <tr key={rule.id}>
                    {multi ? (
                      <td className="font-mono text-xs">
                        {j > 0 ? (
                          <span className="text-muted">and</span>
                        ) : route.letter === 'A' ? (
                          route.letter
                        ) : (
                          <>
                            <span className="text-muted">or </span>
                            {route.letter}
                          </>
                        )}
                      </td>
                    ) : null}
                    <td>
                      {CRITERION_LABEL[rule.criterion]}
                      {isLadderGate(step, rule) ? (
                        <span className="chip ledger ml-2 whitespace-nowrap">LIVE · LADDER GATE</span>
                      ) : null}
                      {rule.is_enforced ? (
                        <span className="chip accent ml-2 whitespace-nowrap">ENFORCED</span>
                      ) : null}
                    </td>
                    <td className="num">{threshold(rule, bandLabel)}</td>
                    {noted ? (
                      <td className="font-serif italic text-xs text-muted">{rule.note}</td>
                    ) : null}
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function threshold(rule: PromotionRule, bandLabel: (key: string) => string): string {
  switch (rule.criterion) {
    case 'personal_sales':
    case 'group_sales': {
      const money = rule.threshold_amount === null ? '—' : formatMoney(Number(rule.threshold_amount))
      return rule.consecutive_months
        ? `${money} × ${rule.consecutive_months} consecutive months`
        : money
    }
    case 'kpi_items_per_pax':
      return rule.threshold_qty === null ? '—' : `${rule.threshold_qty} per head`
    case 'margin_band':
      return rule.margin_band_key === null ? '—' : bandLabel(rule.margin_band_key)
  }
}
