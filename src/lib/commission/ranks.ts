/**
 * Rank letters.
 *
 * A rank is its pay: a percentage or a monthly group package. The title is
 * what somebody keeps; the rank is what a month pays, and it moves with the
 * target or with a placement — a Team Leader who misses target is still a
 * Team Leader, paid a rank down. So a rung is no longer named after its title
 * ("Team Leader - 9%" was the title again with the rate stapled on). It is
 * lettered from the TOP of the ladder: packages above percentages, SS then
 * A, B, C … downward ("可能从 Rank H 以此类推到 Rank A，最高到 SS，这样反推过去").
 * Six rungs read SS · A · B · C · D · E. A rung added above shifts every
 * letter down — that is the point, the letters count from the top.
 *
 * Nothing here is a second source of truth. `comm_ranks.label` is rewritten
 * from `resequenceLadder` after every ladder write (config-actions.ts), and
 * `rank_key` — the identity statements and promotion rules hang on — is
 * minted from the title and the rate, so a letter shifting never touches
 * history.
 */

import { formatMoney } from '@/lib/utils'

/** 0 → SS, 1 → A, 2 → B … 26 → Z, 27 → AA (a ladder nobody will build). */
export function rankLetter(indexFromTop: number): string {
  if (indexFromTop <= 0) return 'SS'
  let n = indexFromTop
  let out = ''
  while (n > 0) {
    const r = (n - 1) % 26
    out = String.fromCharCode(65 + r) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

export interface RankPay {
  /** 0.08 = 8%. */
  productRate: number
  /** Positive = a fixed incentive per qualifying group, replacing percentage pay. */
  groupIncentiveAmount?: number
  /** Separate non-cash subsidy cap per qualifying group. */
  groupSubsidyCap?: number
}

export interface RankPayRow {
  product_rate: number | string
  group_incentive_amount?: number | string
  group_subsidy_cap?: number | string
}

export function rankPayOf(row: RankPayRow): RankPay {
  return {
    productRate: Number(row.product_rate),
    groupIncentiveAmount: Number(row.group_incentive_amount ?? 0),
    groupSubsidyCap: Number(row.group_subsidy_cap ?? 0),
  }
}

/** Shared catalogue validation; the database enforces the same package boundaries. */
export function rankPayError(pay: RankPay): string | null {
  if (!Number.isFinite(pay.productRate) || pay.productRate < 0 || pay.productRate > 1) {
    return 'Commission rate must be between 0 and 100%'
  }
  for (const [label, amount] of [
    ['Group incentive', pay.groupIncentiveAmount ?? 0],
    ['Subsidy cap', pay.groupSubsidyCap ?? 0],
  ] as const) {
    if (!Number.isFinite(amount) || amount < 0 || amount >= 10_000_000_000_000) {
      return `${label} must be a non-negative amount below RM 10 trillion`
    }
    if (Number(amount.toFixed(2)) !== amount) {
      return `${label} must have at most two decimal places`
    }
  }
  if ((pay.groupIncentiveAmount ?? 0) > 0 && pay.productRate !== 0) {
    return 'A group incentive replaces percentage commission — set the rate to 0%'
  }
  if ((pay.groupSubsidyCap ?? 0) > 0 && (pay.groupIncentiveAmount ?? 0) <= 0) {
    return 'A subsidy cap needs a group incentive package'
  }
  return null
}

/** Ascending: every package is above every percentage; package values break ties. */
export function compareRankPay(a: RankPay, b: RankPay): number {
  const aIncentive = a.groupIncentiveAmount ?? 0
  const bIncentive = b.groupIncentiveAmount ?? 0
  return Number(aIncentive > 0) - Number(bIncentive > 0)
    || aIncentive - bIncentive
    || ((aIncentive > 0 && bIncentive > 0) ? (a.groupSubsidyCap ?? 0) - (b.groupSubsidyCap ?? 0) : 0)
    || a.productRate - b.productRate
    || (a.groupSubsidyCap ?? 0) - (b.groupSubsidyCap ?? 0)
}

export interface LetteredRung extends RankPay {
  id: string
  sortOrder: number
}

/**
 * The letter each rung wears, by id. Packages come first, then percentages.
 * Identical pay falls back on ladder order and id for stable lettering.
 */
export function rankLetters<R extends LetteredRung>(rungs: readonly R[]): Map<string, string> {
  const ordered = [...rungs].sort(
    (a, b) => compareRankPay(b, a) || b.sortOrder - a.sortOrder || b.id.localeCompare(a.id),
  )
  return new Map(ordered.map((r, i) => [r.id, rankLetter(i)]))
}

/** "Rank B" — what `comm_ranks.label` holds. */
export function rankName(letter: string): string {
  return `Rank ${letter}`
}

/** 0.08 → "8%", 0.065 → "6.5%". */
export function ratePct(rate: number): string {
  return `${Math.round(rate * 10_000) / 100}%`
}

/** "Rank B · 8%" — the long form for a picker, a legend, a chip. */
export function rankLabel(letter: string, rate: number): string {
  return `${rankName(letter)} · ${ratePct(rate)}`
}

/**
 * "Rank B · 8%" from a row that already wears its label — a rank of the
 * catalogue (`comm_rank_defs`), or a rung, whose label is a trigger-kept copy
 * of its rank's (2026-09-05). Pages that only display a rank read this
 * instead of re-lettering the ladder themselves.
 */
export function rankLabelOf(row: RankPayRow & { label: string }): string {
  return `${row.label} · ${rankPayLabelOf(row)}`
}

/** The package replaces the percentage; a zero rate must not hide what this rank pays. */
export function rankPayLabel(pay: RankPay): string {
  if ((pay.groupIncentiveAmount ?? 0) <= 0) return ratePct(pay.productRate)
  const incentive = `${formatMoney(pay.groupIncentiveAmount)}/group`
  return (pay.groupSubsidyCap ?? 0) > 0
    ? `${incentive} + subsidy up to ${formatMoney(pay.groupSubsidyCap)}/group`
    : incentive
}

export function rankPayLabelOf(row: RankPayRow): string {
  return rankPayLabel(rankPayOf(row))
}

export interface ResequencedRung {
  id: string
  sortOrder: number
  label: string
}

/**
 * The ladder rewritten so its ORDER is the pay order — `sort_order` 10, 20,
 * 30 … from the lowest rate up, and the label from the top down. Run after
 * every ladder write: a rung keyed in at 6.5% lands between 6% and 7% instead
 * of at the bottom, and every letter above it moves along. The engine climbs
 * by sort_order, so this is also what keeps "one rung at a time" meaning
 * "the next rate up".
 */
export function resequenceLadder<R extends LetteredRung>(rungs: readonly R[]): ResequencedRung[] {
  const ascending = [...rungs].sort(
    (a, b) => compareRankPay(a, b) || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
  )
  const n = ascending.length
  return ascending.map((r, i) => ({
    id: r.id,
    sortOrder: (i + 1) * 10,
    label: rankName(rankLetter(n - 1 - i)),
  }))
}

/**
 * A new rung's `rank_key`: the title's initials and the rate — "Senior Team
 * Leader" at 11% → `stl_11`, the convention the seeded Fair ladder already
 * follows (`rs_5` … `stl_10`). Never the letter: keys are the identity a
 * statement snapshots and a promotion rule points at, and letters move.
 * A key already on the ladder gets a numeric suffix rather than a rejection.
 */
export function mintRankKey(titleName: string, rate: number, taken: ReadonlySet<string>): string {
  const initials = titleName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(w => w[0])
    .join('')
  const pct = String(Math.round(rate * 10_000) / 100).replace('.', '_')
  const base = `${initials || 'rank'}_${pct}`
  if (!taken.has(base)) return base
  for (let i = 2; ; i++) {
    const candidate = `${base}_${i}`
    if (!taken.has(candidate)) return candidate
  }
}
