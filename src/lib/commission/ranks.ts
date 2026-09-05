/**
 * Rank letters.
 *
 * A rank IS its rate (user 2026-09-05): "Rank A equal to 9%". The title is
 * what somebody keeps; the rank is what a month pays, and it moves with the
 * target or with a placement — a Team Leader who misses target is still a
 * Team Leader, paid a rank down. So a rung is no longer named after its title
 * ("Team Leader - 9%" was the title again with the rate stapled on). It is
 * lettered from the TOP of the ladder: SS for the highest rate, then A, B,
 * C … downward ("可能从 Rank H 以此类推到 Rank A，最高到 SS，这样反推过去").
 * Six rungs read SS · A · B · C · D · E. A rung added above shifts every
 * letter down — that is the point, the letters count from the top.
 *
 * Nothing here is a second source of truth. `comm_ranks.label` is rewritten
 * from `resequenceLadder` after every ladder write (config-actions.ts), and
 * `rank_key` — the identity statements and promotion rules hang on — is
 * minted from the title and the rate, so a letter shifting never touches
 * history.
 */

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

export interface LetteredRung {
  id: string
  /** 0.08 = 8%. */
  productRate: number
  sortOrder: number
}

/**
 * The letter each rung wears, by id. The highest rate is SS; equal rates
 * (which `uq_comm_rank_rate` refuses, but a caller may hand in anyway) fall
 * back on ladder order, higher sort_order above.
 */
export function rankLetters<R extends LetteredRung>(rungs: readonly R[]): Map<string, string> {
  const ordered = [...rungs].sort(
    (a, b) => b.productRate - a.productRate || b.sortOrder - a.sortOrder,
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

export interface ResequencedRung {
  id: string
  sortOrder: number
  label: string
}

/**
 * The ladder rewritten so its ORDER is the rate order — `sort_order` 10, 20,
 * 30 … from the lowest rate up, and the label from the top down. Run after
 * every ladder write: a rung keyed in at 6.5% lands between 6% and 7% instead
 * of at the bottom, and every letter above it moves along. The engine climbs
 * by sort_order, so this is also what keeps "one rung at a time" meaning
 * "the next rate up".
 */
export function resequenceLadder<R extends LetteredRung>(rungs: readonly R[]): ResequencedRung[] {
  const ascending = [...rungs].sort(
    (a, b) => a.productRate - b.productRate || a.sortOrder - b.sortOrder,
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
