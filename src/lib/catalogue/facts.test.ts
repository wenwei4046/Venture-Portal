import { describe, expect, it } from 'vitest'
import { parseLineFacts, type LineFacts } from './facts'

/**
 * The twin of catalogue_line_facts (migration 20260924030000 §3). Every
 * expectation in the agreeing blocks is what the SQL function itself returned
 * for the same input (loaded verbatim into PGlite). The summaries are the ERP's
 * own buildVariantSummary output (scm/shared/variant-summary.ts and its tests).
 * `it.fails` marks an input the two twins answer differently: the assertion is
 * the SQL's answer.
 */

function facts(over: Partial<LineFacts> = {}): LineFacts {
  return {
    fabric: null,
    seat: null,
    leg: null,
    divan: null,
    gap: null,
    total: null,
    specials: [],
    parsedFrom: null,
    ...over,
  }
}

const NOTHING = facts()

describe('parseLineFacts — the ERP summary grammar', () => {
  it('a sofa module: fabric / SEAT / LEG / SPECIAL', () => {
    // The fabric is the first WORD: the ERP prints `<fabricCode> <colour>`.
    expect(parseLineFacts('BO315-01 PEARL / SEAT 35 / LEG DEFAULT / SPECIAL: Nylon Fabric')).toEqual(
      facts({ fabric: 'BO315-01', seat: '35', leg: 'DEFAULT', specials: ['Nylon Fabric'], parsedFrom: 'description2' }),
    )
  })

  it('a bed frame: DIVAN d + LEG l / GAP g / T.Heights t', () => {
    expect(parseLineFacts('NB-04 / DIVAN 8" + LEG 4" / GAP 12" / T.Heights 24"')).toEqual(
      facts({ fabric: 'NB-04', divan: '8"', leg: '4"', gap: '12"', total: '24"', parsedFrom: 'description2' }),
    )
  })

  it('NO LEG after a divan reads as the pool value "No Leg"', () => {
    expect(parseLineFacts('PC151-01 / DIVAN 10" + NO LEG / GAP 14" / T.Heights 24"')).toEqual(
      facts({ fabric: 'PC151-01', divan: '10"', leg: 'No Leg', gap: '14"', total: '24"', parsedFrom: 'description2' }),
    )
  })

  it.each<[string, Partial<LineFacts>]>([
    [
      'CH141-8-ARMY / SEAT 30 / LEG DEFAULT / SPECIAL: Change 8030 Backcushion + Wooden Arm',
      { fabric: 'CH141-8-ARMY', seat: '30', leg: 'DEFAULT', specials: ['Change 8030 Backcushion', 'Wooden Arm'] },
    ],
    ['AMBER-01 / DIVAN 10" + LEG 0" / GAP 10"', { fabric: 'AMBER-01', divan: '10"', leg: '0"', gap: '10"' }],
    [
      'PC151-01 / DIVAN 8" + LEG 1" / GAP 12" / T.Heights 21"',
      { fabric: 'PC151-01', divan: '8"', leg: '1"', gap: '12"', total: '21"' },
    ],
    // No fabric segment at all: the specials are the first segment.
    ['SPECIAL: Nylon Fabric + Right Drawer (10")', { specials: ['Nylon Fabric', 'Right Drawer (10")'] }],
  ])('a real ERP summary: %s', (d2, want) => {
    expect(parseLineFacts(d2)).toEqual(facts({ ...want, parsedFrom: 'description2' }))
  })

  it('keeps a special’s printed choices on it; the price lookup strips them later', () => {
    expect(
      parseLineFacts('BO315-01 PEARL / SEAT 30 / LEG DEFAULT / SPECIAL: Right Drawer (10") + Back Cover').specials,
    ).toEqual(['Right Drawer (10")', 'Back Cover'])
  })

  it('a bare LEG segment, and a bare NO LEG / NOLEG', () => {
    expect(parseLineFacts('X / LEG 4"')).toEqual(facts({ fabric: 'X', leg: '4"', parsedFrom: 'description2' }))
    expect(parseLineFacts('X / NO LEG')).toEqual(facts({ fabric: 'X', leg: 'No Leg', parsedFrom: 'description2' }))
    expect(parseLineFacts('X / NOLEG')).toEqual(facts({ fabric: 'X', leg: 'No Leg', parsedFrom: 'description2' }))
  })

  it('a DIVAN with no leg keeps its value as printed — curly inch mark and all', () => {
    expect(parseLineFacts('X / DIVAN 10”')).toEqual(facts({ fabric: 'X', divan: '10”', parsedFrom: 'description2' }))
  })

  it('the divan takes everything up to the LEG; NOLEG and a tight + both read', () => {
    expect(parseLineFacts('X / DIVAN 8" + 2" + LEG 4"')).toMatchObject({ divan: '8" + 2"', leg: '4"' })
    expect(parseLineFacts('X / DIVAN 10"+LEG 4"')).toMatchObject({ divan: '10"', leg: '4"' })
    expect(parseLineFacts('X / DIVAN 10" + NOLEG')).toMatchObject({ divan: '10"', leg: 'No Leg' })
  })

  it('a leg with no value after the divan is left inside the divan, as the SQL leaves it', () => {
    expect(parseLineFacts('X / DIVAN 10" + LEG ')).toMatchObject({ divan: '10" + LEG', leg: null })
  })

  it('keywords are case-insensitive; values keep their case', () => {
    expect(parseLineFacts('x / seat 30 / leg default')).toEqual(
      facts({ fabric: 'x', seat: '30', leg: 'default', parsedFrom: 'description2' }),
    )
  })

  it('T.Heights reads with a space after the dot, and in the singular', () => {
    expect(parseLineFacts('X / T. Heights 24"').total).toBe('24"')
    expect(parseLineFacts('X / T.Height 24"').total).toBe('24"')
  })

  it('a FREE campaign marker is never read as a fabric, even first', () => {
    expect(parseLineFacts('FREE · CNY / SEAT 30')).toEqual(facts({ seat: '30', parsedFrom: 'description2' }))
    expect(parseLineFacts('FREE / SEAT 30')).toEqual(facts({ seat: '30', parsedFrom: 'description2' }))
    expect(parseLineFacts('X / FREE · CNY / SEAT 30')).toEqual(facts({ fabric: 'X', seat: '30', parsedFrom: 'description2' }))
  })

  it('FREEDOM is a word, not the FREE marker', () => {
    expect(parseLineFacts('FREEDOM / SEAT 30').fabric).toBe('FREEDOM')
  })

  it('segments split on a slash with whitespace both sides — any run of it', () => {
    expect(parseLineFacts('X  /  SEAT 30')).toMatchObject({ fabric: 'X', seat: '30' })
    expect(parseLineFacts('X\t/\tSEAT 30')).toMatchObject({ fabric: 'X', seat: '30' })
  })

  it('a slash without a space after it does not separate', () => {
    expect(parseLineFacts('PEARL / SEAT 30 /').seat).toBe('30 /')
  })

  it('specials split on " + " only; a tight + stays inside one special', () => {
    expect(parseLineFacts('X / SPECIAL: A+B + C').specials).toEqual(['A+B', 'C'])
  })

  it('the last SPECIAL segment wins, as the last LEG does', () => {
    expect(parseLineFacts('X / SEAT 30 / SPECIAL: a + b / SPECIAL: c').specials).toEqual(['c'])
    expect(parseLineFacts('X / SEAT 30 / LEG 6" / NO LEG').leg).toBe('No Leg')
  })

  it('an empty SPECIAL still counts as the grammar — with no specials', () => {
    expect(parseLineFacts('SPECIAL:')).toEqual(facts({ parsedFrom: 'description2' }))
    expect(parseLineFacts('X / SPECIAL:   ')).toEqual(facts({ fabric: 'X', parsedFrom: 'description2' }))
  })
})

describe('parseLineFacts — text that parses to nothing', () => {
  it('hand-typed AutoCount text matches none of the grammar: the line is costed on its SKU alone', () => {
    expect(parseLineFacts('Divan:10”+NoLeg/Gap:12”/Col:TBC')).toEqual(NOTHING)
  })

  it('a lone first segment is not a fabric without a specification beside it', () => {
    expect(parseLineFacts('PEARL')).toEqual(NOTHING)
  })

  it('SEAT with no value is not a seat', () => {
    expect(parseLineFacts('X / SEAT')).toEqual(NOTHING)
  })

  it.each(['', '   ', null, undefined])('%j → nothing', d2 => {
    expect(parseLineFacts(d2)).toEqual(NOTHING)
  })

  it('hands back a fresh specials list every time', () => {
    const first = parseLineFacts(null)
    first.specials.push('mutated')
    expect(parseLineFacts(null).specials).toEqual([])
    expect(parseLineFacts('PEARL').specials).toEqual([])
  })
})

describe('parseLineFacts — raw.variants win over description2', () => {
  it('reads the ERP’s structured variants and ignores the summary', () => {
    const raw = { variants: { fabricCode: 'BO315-01', seatHeight: '35', legHeight: 'Default', specials: ['Nylon Fabric', ' ', null] } }
    expect(parseLineFacts('ignored / SEAT 99', raw)).toEqual(
      facts({ fabric: 'BO315-01', seat: '35', leg: 'Default', specials: ['Nylon Fabric'], parsedFrom: 'variants' }),
    )
  })

  it('the POS vocabulary: fabricColor, depth, sofaLegHeight', () => {
    const raw = { variants: { fabricColor: 'PEARL', depth: 30, sofaLegHeight: '6"' } }
    expect(parseLineFacts(null, raw)).toEqual(facts({ fabric: 'PEARL', seat: '30', leg: '6"', parsedFrom: 'variants' }))
  })

  it('a bed frame’s variants; numbers become text, values are trimmed', () => {
    const raw = { variants: { divanHeight: 10, gap: '12"', totalHeight: ' 24" ' } }
    expect(parseLineFacts(null, raw)).toEqual(facts({ divan: '10', gap: '12"', total: '24"', parsedFrom: 'variants' }))
  })

  it('a specials STRING is one special — it is never split on +', () => {
    expect(parseLineFacts(null, { variants: { specials: 'Nylon Fabric + Wooden Arm' } }).specials).toEqual([
      'Nylon Fabric + Wooden Arm',
    ])
    expect(parseLineFacts(null, { variants: { specials: '  ' } }).specials).toEqual([])
  })

  it('an empty variants object still answers — from the variants, with nothing in them', () => {
    expect(parseLineFacts('X / SEAT 30', { variants: {} })).toEqual(facts({ parsedFrom: 'variants' }))
  })

  // Tuples, because it.each spreads an array case into arguments.
  it.each<[unknown]>([[null], [['a']], ['SEAT 40']])('variants that are not an object (%j) fall back to the summary', variants => {
    expect(parseLineFacts('X / SEAT 30', { variants })).toEqual(facts({ fabric: 'X', seat: '30', parsedFrom: 'description2' }))
  })

  it.each<[unknown]>([[{ other: 1 }], ['text'], [42], [null], [[{ variants: { seatHeight: '40' } }]]])(
    'raw %j carries no variants',
    raw => {
      expect(parseLineFacts('X / SEAT 30', raw)).toEqual(facts({ fabric: 'X', seat: '30', parsedFrom: 'description2' }))
    },
  )
})

describe('parseLineFacts — edges both twins answer alike (aligned 2026-09-24)', () => {
  // A BLANK key falls through to its alternative, as a missing one does — the
  // ERP's own buildVariantSummary (`||`); the SQL twin reads
  // COALESCE(NULLIF(BTRIM(a), ''), NULLIF(BTRIM(b), '')).
  it('a blank fabricCode falls back to fabricColor', () => {
    expect(parseLineFacts(null, { variants: { fabricCode: '', fabricColor: 'PEARL' } }).fabric).toBe('PEARL')
  })

  it('a blank seatHeight falls back to depth', () => {
    expect(parseLineFacts(null, { variants: { seatHeight: '', depth: '30' } }).seat).toBe('30')
  })

  it('a blank legHeight falls back to sofaLegHeight', () => {
    expect(parseLineFacts(null, { variants: { legHeight: ' ', sofaLegHeight: '6"' } }).leg).toBe('6"')
  })

  // Both split the UNTRIMMED text on `\s+/\s+`, so a separator at either end
  // is still a separator.
  it('a leading " / " leaves an empty first segment and the rest still parses', () => {
    expect(parseLineFacts(' / SEAT 30')).toEqual(facts({ seat: '30', parsedFrom: 'description2' }))
  })

  it('a trailing " / " is a separator, so the seat is "30", not "30 /"', () => {
    expect(parseLineFacts('PEARL / SEAT 30 / ').seat).toBe('30')
  })
})
