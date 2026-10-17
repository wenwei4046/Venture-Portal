import { describe, expect, it } from 'vitest'
import { greetingName, keptParts, nameParts } from './person-name'

// The names on the roster are written every way (2026-10-17): surname first, an English name alone, an English name
// first, a Malay name with BINTI, a stray space. The split is the database's (`person_name_parts`).
describe('a full name’s parts', () => {
  it('the first word, then the rest — as the user asked, LOO WEN WEI greets as LOO', () => {
    expect(nameParts('LOO WEN WEI')).toEqual({ first: 'LOO', last: 'WEN WEI' })
    expect(nameParts('PETER')).toEqual({ first: 'PETER', last: null })
    expect(nameParts('ESTHER ')).toEqual({ first: 'ESTHER', last: null })
    expect(nameParts('  JAMES   SEOW ')).toEqual({ first: 'JAMES', last: 'SEOW' })
    expect(nameParts('NUR AIN MASTURINA BINTI MOHD JUSAIDI')).toEqual({ first: 'NUR', last: 'AIN MASTURINA BINTI MOHD JUSAIDI' })
    expect(nameParts('')).toEqual({ first: null, last: null })
    expect(nameParts(null)).toEqual({ first: null, last: null })
  })
  it('a page shows what the record keeps; a row with neither, the full name’s parts', () => {
    expect(keptParts({ employee_name: 'WONG JOEY', first_name: 'JOEY', last_name: 'WONG' })).toEqual({ first: 'JOEY', last: 'WONG' })
    expect(keptParts({ employee_name: 'WONG JOEY', first_name: 'JOEY', last_name: null })).toEqual({ first: 'JOEY', last: null })
    expect(keptParts({ employee_name: 'WONG JOEY' })).toEqual({ first: 'WONG', last: 'JOEY' })
  })
})

describe('the greeting’s name', () => {
  it('is one word: the first name kept, else the full name’s first — never two (was "LOO WEN")', () => {
    expect(greetingName('LOO WEN WEI', 'LOO')).toBe('LOO')
    expect(greetingName('LOO WEN WEI')).toBe('LOO')
    expect(greetingName('WONG JOEY', 'JOEY')).toBe('JOEY')
    expect(greetingName('Principal')).toBe('Principal')
    expect(greetingName('LOO WEN WEI', '  ')).toBe('LOO')
  })
})
