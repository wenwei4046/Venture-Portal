import { describe, expect, it } from 'vitest'
import { codeKey, compareHeights, heightKey, valueKey } from './keys'

/**
 * The twins of catalogue_height_key and catalogue_value_key (migration
 * 20260924030000 §2) and catalogue_code_key (20260924020000). Every expectation in
 * the agreeing blocks was checked against the SQL functions themselves, loaded
 * verbatim from the migrations into PGlite. `it.fails` marks an input on which
 * the two twins are known to DISAGREE: the assertion is the SQL's answer.
 */

describe('heightKey — catalogue_height_key', () => {
  it.each([
    ['30', '30'],
    ['25"', '25'],
    ['75cm', '75cm'],
    ['75CM', '75cm'],
    [' 30 ', '30'],
    ['10”', '10'], // curly closing inch mark
    ['10“', '10'], // curly opening inch mark
    ["30'", '30'],
    ['30""', '30'], // the doubled inch mark the ERP's own pools carry
    ['3 0', '30'], // spaces are dropped, not folded
    ['30\t', '30'],
  ])('%j → %j', (raw, key) => {
    expect(heightKey(raw)).toBe(key)
  })

  it('folds every spelling of one seat height onto one key', () => {
    const spellings = ['30', '30"', '30”', ' 30 ', "30'", '30""']
    expect(new Set(spellings.map(heightKey))).toEqual(new Set(['30']))
  })

  it('keeps DEFAULT and STD apart — nothing says they are the same size', () => {
    expect(heightKey('DEFAULT')).toBe('default')
    expect(heightKey('STD')).toBe('std')
    expect(heightKey('DEFAULT')).not.toBe(heightKey('STD'))
  })

  it('keeps 75cm and 75 apart — the unit is part of the height', () => {
    expect(heightKey('75cm')).not.toBe(heightKey('75'))
  })

  it.each(['', '   ', '"', '”“', null, undefined])('%j has no key — null, never ""', raw => {
    expect(heightKey(raw)).toBeNull()
  })
})

describe('valueKey — catalogue_value_key', () => {
  it.each([
    ['DEFAULT', 'default'],
    ['Default', 'default'],
    ['No Leg', 'no leg'],
    ['NO  LEG', 'no leg'], // a run of spaces folds to one
    [' Default ', 'default'],
    ['DIVAN 10”', 'divan 10"'], // curly straightened, not dropped
    ['10“', '10"'],
    ['Right Drawer (10”)', 'right drawer (10")'],
  ])('%j → %j', (raw, key) => {
    expect(valueKey(raw)).toBe(key)
  })

  it("meets the summary's spelling with the pool's", () => {
    // buildVariantSummary upper-cases the leg (`LEG DEFAULT`, `NO LEG`); the pool says `Default`, `No Leg`
    expect(valueKey('DEFAULT')).toBe(valueKey('Default'))
    expect(valueKey('NO LEG')).toBe(valueKey('No Leg'))
    expect(valueKey('10”')).toBe(valueKey('10"'))
  })

  it('unlike heightKey, keeps the inch mark: 10" and 10 are two values', () => {
    expect(valueKey('10"')).not.toBe(valueKey('10'))
  })

  it.each(['', '   ', null, undefined])('%j has no key — null', raw => {
    expect(valueKey(raw)).toBeNull()
  })

  // The SQL folds `\s+` to one space BEFORE its BTRIM (2026-09-24), so a tab or
  // a newline at either end goes, as JS trim() takes it off.
  it('a tab or newline at either end goes', () => {
    expect(valueKey('\tNo Leg\n')).toBe('no leg')
  })
})

describe('codeKey — catalogue_code_key', () => {
  it.each([
    [' 8030-1a(lhf) ', '8030-1A(LHF)'],
    ['ak-ultimate matt (k)', 'AK-ULTIMATE MATT (K)'],
    ['AK-  ULTIMATE', 'AK- ULTIMATE'], // a run of spaces folds to one, it is not removed
  ])('%j → %j', (raw, key) => {
    expect(codeKey(raw)).toBe(key)
  })

  it('folds nothing else — AK- and AKEMI stay different words', () => {
    expect(codeKey('AK-ULTIMATE MATT (K)')).not.toBe(codeKey('AKEMI ULTIMATE MATT (K)'))
  })

  it('8030-Console and 8030-CONSOLE share a key (the ERP holds them as two rows)', () => {
    expect(codeKey('8030-Console')).toBe(codeKey('8030-CONSOLE'))
  })

  it.each([null, undefined, '', '   '])('%j → "" (never null, unlike the other two keys)', raw => {
    expect(codeKey(raw)).toBe('')
  })

  it('a tab at either end goes (the SQL folds whitespace before its BTRIM)', () => {
    expect(codeKey('8030-1A\t')).toBe('8030-1A')
  })
})

describe('compareHeights', () => {
  it('sorts numerically, cm heights by their number, words last', () => {
    const heights = ['35', 'DEFAULT', '75cm', '24', '60cm', '30"', '22', 'STD']
    expect([...heights].sort(compareHeights)).toEqual(['22', '24', '30"', '35', '60cm', '75cm', 'DEFAULT', 'STD'])
  })

  it('is numeric, not lexicographic', () => {
    expect(compareHeights('8', '10')).toBeLessThan(0)
    expect(compareHeights('10', '8')).toBeGreaterThan(0)
  })

  it('two spellings of one number fall back to text order', () => {
    expect(compareHeights('30', '30"')).toBeLessThan(0)
    expect(compareHeights('30"', '30')).toBeGreaterThan(0)
  })

  it('a number sorts before a word either way round', () => {
    expect(compareHeights('24', 'DEFAULT')).toBe(-1)
    expect(compareHeights('DEFAULT', '24')).toBe(1)
  })

  it('an identical height compares equal', () => {
    expect(compareHeights('30', '30')).toBe(0)
    expect(compareHeights('STD', 'STD')).toBe(0)
  })
})
