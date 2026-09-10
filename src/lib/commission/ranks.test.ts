import { describe, expect, it } from 'vitest'
import {
  compareRankPay,
  mintRankKey,
  rankLabel,
  rankLabelOf,
  rankLetter,
  rankLetters,
  rankPayError,
  rankPayLabel,
  rankPayOf,
  ratePct,
  resequenceLadder,
} from './ranks'

// The Fair ladder as it is live: six rungs, 5% to 10%, sort_order 10 … 60.
const FAIR = [
  { id: 'rs_5', productRate: 0.05, sortOrder: 10 },
  { id: 'rs_6', productRate: 0.06, sortOrder: 20 },
  { id: 'ta_7', productRate: 0.07, sortOrder: 30 },
  { id: 'ta_8', productRate: 0.08, sortOrder: 40 },
  { id: 'tl_9', productRate: 0.09, sortOrder: 50 },
  { id: 'stl_10', productRate: 0.1, sortOrder: 60 },
]

describe('rankLetter', () => {
  it('is SS at the top, then A, B, C …', () => {
    expect([0, 1, 2, 3, 8].map(rankLetter)).toEqual(['SS', 'A', 'B', 'C', 'H'])
  })

  it('keeps going past Z rather than breaking', () => {
    expect(rankLetter(26)).toBe('Z')
    expect(rankLetter(27)).toBe('AA')
  })
})

describe('rankLabelOf', () => {
  it('reads the label a row already wears — a rank of the catalogue, or a rung — and appends the rate', () => {
    expect(rankLabelOf({ label: 'Rank B', product_rate: 0.08 })).toBe('Rank B · 8%')
    // PostgREST hands decimals over as strings.
    expect(rankLabelOf({ label: 'Rank SS', product_rate: '0.100000' })).toBe('Rank SS · 10%')
  })

  it('shows fixed group pay and its separate subsidy cap instead of 0%', () => {
    expect(rankLabelOf({
      label: 'Rank SS', product_rate: '0.000000',
      group_incentive_amount: '6000.00', group_subsidy_cap: '2000.00',
    })).toBe('Rank SS · RM 6,000.00/group + subsidy up to RM 2,000.00/group')
    expect(rankPayLabel({ productRate: 0, groupIncentiveAmount: 1250.50 }))
      .toBe('RM 1,250.50/group')
  })
})

describe('group packages', () => {
  const packageRank = {
    id: 'stl_package', productRate: 0, groupIncentiveAmount: 6000,
    groupSubsidyCap: 2000, sortOrder: 0,
  }

  it('puts a zero-rate package above all percentage ranks in letters and engine order', () => {
    const ranks = [...FAIR, packageRank]
    expect(rankLetters(ranks).get('stl_package')).toBe('SS')
    expect(rankLetters(ranks).get('stl_10')).toBe('A')
    expect(resequenceLadder(ranks).at(-1))
      .toEqual({ id: 'stl_package', sortOrder: 70, label: 'Rank SS' })
    expect(compareRankPay(packageRank, { productRate: 1 })).toBeGreaterThan(0)
  })

  it('orders package incentive before subsidy and rate, then resolves equal pay consistently', () => {
    const ranks = [
      { ...packageRank, id: 'lower', groupIncentiveAmount: 5000, groupSubsidyCap: 5000 },
      { ...packageRank, id: 'less_subsidy', groupSubsidyCap: 1000 },
      { ...packageRank, id: 'higher_rate', productRate: 0.01 },
      { ...packageRank, id: 'z' },
      { ...packageRank, id: 'a' },
    ]
    expect(resequenceLadder(ranks).map(r => r.id))
      .toEqual(['lower', 'less_subsidy', 'a', 'z', 'higher_rate'])
    const letters = rankLetters([...ranks].reverse())
    expect(letters.get('higher_rate')).toBe('SS')
    expect(letters.get('z')).toBe('A')
    expect(letters.get('a')).toBe('B')
  })

  it('normalizes database numeric strings and treats older percentage rows as zero-package pay', () => {
    expect(rankPayOf({ product_rate: '0.033000' }))
      .toEqual({ productRate: 0.033, groupIncentiveAmount: 0, groupSubsidyCap: 0 })
    expect(rankPayOf({ product_rate: '0', group_incentive_amount: '6000.00', group_subsidy_cap: '2000.00' }))
      .toEqual({ productRate: 0, groupIncentiveAmount: 6000, groupSubsidyCap: 2000 })
  })

  it('accepts percentage ranks and replacement packages', () => {
    expect(rankPayError({ productRate: 0.033 })).toBeNull()
    expect(rankPayError(packageRank)).toBeNull()
    expect(rankPayError({ productRate: 0, groupIncentiveAmount: 10.12 })).toBeNull()
  })

  it('refuses additive percentage pay and subsidy without a package', () => {
    expect(rankPayError({ ...packageRank, productRate: 0.04 })).toMatch(/replaces percentage/)
    expect(rankPayError({ productRate: 0.04, groupSubsidyCap: 2000 })).toMatch(/needs a group incentive/)
  })

  it('refuses invalid, negative, non-finite and sub-cent amounts', () => {
    for (const amount of [-1, NaN, Infinity, 10_000_000_000_000, 0.001]) {
      expect(rankPayError({ productRate: 0, groupIncentiveAmount: amount })).not.toBeNull()
      expect(rankPayError({ ...packageRank, groupSubsidyCap: amount })).not.toBeNull()
    }
    for (const rate of [-0.01, 1.01, NaN, Infinity]) {
      expect(rankPayError({ productRate: rate })).toMatch(/between 0 and 100/)
    }
  })
})

describe('rankLetters over the catalogue', () => {
  it('lets a rank nobody has put a title on take its letter — the ladder does not get to skip it', () => {
    // Fair's six, plus an unused 11% rank keyed in on the Ranks tab.
    const letters = rankLetters([...FAIR, { id: 'unused_11', productRate: 0.11, sortOrder: 70 }])
    expect(letters.get('unused_11')).toBe('SS')
    expect(letters.get('stl_10')).toBe('A')
    expect(letters.get('rs_5')).toBe('F')
  })
})

describe('rankLetters', () => {
  it('letters the ladder from the highest rate down — the user\'s example: Team Leader is Rank A at 9%, Rank B at 8%', () => {
    const letters = rankLetters(FAIR)
    expect(letters.get('stl_10')).toBe('SS')
    expect(letters.get('tl_9')).toBe('A')
    expect(letters.get('ta_8')).toBe('B')
    expect(letters.get('ta_7')).toBe('C')
    expect(letters.get('rs_6')).toBe('D')
    expect(letters.get('rs_5')).toBe('E')
  })

  it('reads the rate, not the order the rows arrived in', () => {
    const shuffled = [FAIR[3], FAIR[0], FAIR[5], FAIR[1], FAIR[4], FAIR[2]]
    expect(rankLetters(shuffled).get('stl_10')).toBe('SS')
    expect(rankLetters(shuffled).get('rs_5')).toBe('E')
  })

  it('a rung added above shifts every letter down — the letters count from the top', () => {
    const letters = rankLetters([...FAIR, { id: 'tl_11', productRate: 0.11, sortOrder: 70 }])
    expect(letters.get('tl_11')).toBe('SS')
    expect(letters.get('stl_10')).toBe('A')
    expect(letters.get('rs_5')).toBe('F')
  })

  it('breaks an equal rate on ladder order, higher rung above', () => {
    const letters = rankLetters([
      { id: 'low', productRate: 0.07, sortOrder: 10 },
      { id: 'high', productRate: 0.07, sortOrder: 20 },
    ])
    expect(letters.get('high')).toBe('SS')
    expect(letters.get('low')).toBe('A')
  })
})

describe('labels', () => {
  it('formats the rate without float noise', () => {
    expect(ratePct(0.08)).toBe('8%')
    expect(ratePct(0.065)).toBe('6.5%')
    expect(ratePct(0.1)).toBe('10%')
  })

  it('is "Rank B · 8%" in long form', () => {
    expect(rankLabel('B', 0.08)).toBe('Rank B · 8%')
  })
})

describe('resequenceLadder', () => {
  it('leaves a ladder already in rate order with the same sort_orders and the letters as labels', () => {
    expect(resequenceLadder(FAIR)).toEqual([
      { id: 'rs_5', sortOrder: 10, label: 'Rank E' },
      { id: 'rs_6', sortOrder: 20, label: 'Rank D' },
      { id: 'ta_7', sortOrder: 30, label: 'Rank C' },
      { id: 'ta_8', sortOrder: 40, label: 'Rank B' },
      { id: 'tl_9', sortOrder: 50, label: 'Rank A' },
      { id: 'stl_10', sortOrder: 60, label: 'Rank SS' },
    ])
  })

  it('moves a rung keyed in at the bottom to where its rate belongs', () => {
    // upsertRank appends a new rung at the bottom (sort_order 70); a 6.5%
    // rung belongs between 6% and 7%, and everything above it steps up one.
    const out = resequenceLadder([...FAIR, { id: 'x_6_5', productRate: 0.065, sortOrder: 70 }])
    expect(out.map(r => r.id)).toEqual(['rs_5', 'rs_6', 'x_6_5', 'ta_7', 'ta_8', 'tl_9', 'stl_10'])
    expect(out.map(r => r.sortOrder)).toEqual([10, 20, 30, 40, 50, 60, 70])
    expect(out.find(r => r.id === 'x_6_5')?.label).toBe('Rank D')
    expect(out.find(r => r.id === 'stl_10')?.label).toBe('Rank SS')
  })

  it('is empty for an empty ladder', () => {
    expect(resequenceLadder([])).toEqual([])
  })
})

describe('mintRankKey', () => {
  it('is the title\'s initials and the rate, as the seeded ladder is', () => {
    expect(mintRankKey('Senior Team Leader', 0.11, new Set())).toBe('stl_11')
    expect(mintRankKey('Revenue Specialist', 0.05, new Set())).toBe('rs_5')
  })

  it('writes a fractional rate with an underscore', () => {
    expect(mintRankKey('Team Assistant', 0.065, new Set())).toBe('ta_6_5')
  })

  it('suffixes a key the ladder already carries instead of refusing', () => {
    const taken = new Set(['ta_7', 'ta_7_2'])
    expect(mintRankKey('Team Assistant', 0.07, taken)).toBe('ta_7_3')
  })

  it('never mints an empty key', () => {
    expect(mintRankKey('***', 0.05, new Set())).toBe('rank_5')
  })
})
