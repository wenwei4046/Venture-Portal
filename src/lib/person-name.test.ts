import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CHINESE_SURNAMES, CHINESE_SYLLABLE, FATHERS_NAME_STARTS, greetingName, keptParts, nameParts } from './person-name'

// The first name is the person's own, the last their surname (2026-10-17 — the user: "full name = loo wen wei, wen wei
// ( first name ) , loo ( last name )"). The roster is written every way — surname first, an English name in front, an
// English name alone, a Malay name with BINTI, a given name on its own — so the split reads it before it cuts it. The
// database makes the same split (`person_name_parts`, mig 20261017180000).
describe('a full name’s parts', () => {
  it('a Chinese name written surname first: the rest is the first name — LOO WEN WEI → WEN WEI · LOO', () => {
    expect(nameParts('LOO WEN WEI')).toEqual({ first: 'WEN WEI', last: 'LOO' })
    expect(nameParts('TAN AH KOW')).toEqual({ first: 'AH KOW', last: 'TAN' })
    expect(nameParts('tan ah kow')).toEqual({ first: 'ah kow', last: 'tan' })
    expect(nameParts('\tLOO\nWEN  WEI ')).toEqual({ first: 'WEN WEI', last: 'LOO' })
  })
  it('an English name in front of the Chinese one is the first name', () => {
    expect(nameParts('  KELVIN   TAN ')).toEqual({ first: 'KELVIN', last: 'TAN' })
    expect(nameParts('CHLOE LIM SU YIN')).toEqual({ first: 'CHLOE', last: 'LIM SU YIN' })
    expect(nameParts('ANDY TING')).toEqual({ first: 'ANDY', last: 'TING' })
  })
  it('a surname with an English name after it: the English name', () => {
    expect(nameParts('SIA DANIEL')).toEqual({ first: 'DANIEL', last: 'SIA' })
    expect(nameParts('GOH JOEY')).toEqual({ first: 'JOEY', last: 'GOH' })
  })
  it('two words it cannot tell apart stay the first name whole — the safer greeting', () => {
    expect(nameParts('MEI LING')).toEqual({ first: 'MEI LING', last: null })
    expect(nameParts('CHIN YAN')).toEqual({ first: 'CHIN YAN', last: null })
    expect(nameParts('KEN TAN')).toEqual({ first: 'KEN TAN', last: null })
    expect(nameParts('Finance Manager')).toEqual({ first: 'Finance Manager', last: null })
  })
  it('a Malay or Indian name: what comes before BIN / BINTI / A/L / a later SYED', () => {
    expect(nameParts('AHMAD FAIZ BIN ABU')).toEqual({ first: 'AHMAD FAIZ', last: 'BIN ABU' })
    expect(nameParts('NUR AMIRA BINTI ISMAIL')).toEqual({ first: 'NUR AMIRA', last: 'BINTI ISMAIL' })
    expect(nameParts('SITI NORA SYED HASSAN')).toEqual({ first: 'SITI NORA', last: 'SYED HASSAN' })
    expect(nameParts('RAVI A/L KUMAR')).toEqual({ first: 'RAVI', last: 'A/L KUMAR' })
  })
  it('one word is the first name; nothing is none', () => {
    expect(nameParts('DANIEL')).toEqual({ first: 'DANIEL', last: null })
    expect(nameParts('MARY ')).toEqual({ first: 'MARY', last: null })
    expect(nameParts('')).toEqual({ first: null, last: null })
    expect(nameParts(null)).toEqual({ first: null, last: null })
  })
  it('a Chinese syllable is one as Malaysia romanises it — an English name is not', () => {
    for (const word of ['KAR', 'JIUN', 'HUAN', 'SHUANG', 'YIK', 'MEI', 'TING', 'SEAN', 'CHOOI', 'YEOW']) expect(CHINESE_SYLLABLE.test(word)).toBe(true)
    for (const word of ['JAMES', 'JOEY', 'JONAS', 'LUCAS', 'ANDY', 'MELVIN', 'KAH-WAI']) expect(CHINESE_SYLLABLE.test(word)).toBe(false)
  })
  it('a page shows what the record keeps; a row with neither, the full name’s parts', () => {
    expect(keptParts({ employee_name: 'GOH JOEY', first_name: 'Joey', last_name: 'GOH' })).toEqual({ first: 'Joey', last: 'GOH' })
    expect(keptParts({ employee_name: 'GOH JOEY', first_name: 'JOEY', last_name: null })).toEqual({ first: 'JOEY', last: null })
    expect(keptParts({ employee_name: 'LOO WEN WEI' })).toEqual({ first: 'WEN WEI', last: 'LOO' })
  })
})

describe('the database splits alike', () => {
  const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261017180000_first_name_is_the_given_name.sql'), 'utf8')
  const list = (name: string) => {
    const body = sql.match(new RegExp(`${name} CONSTANT text\\[\\] := ARRAY\\[([^\\]]*)\\]`))?.[1] ?? ''
    return [...body.matchAll(/'([^']*)'/g)].map(m => m[1])
  }
  it('the same surnames, the same starts of a father’s name, the same syllable', () => {
    expect(list('c_surnames')).toEqual([...CHINESE_SURNAMES])
    expect(list('c_fathers')).toEqual([...FATHERS_NAME_STARTS])
    expect(sql.match(/c_syllable CONSTANT text := '([^']*)'/)?.[1]).toBe(CHINESE_SYLLABLE.source)
  })
  it('no surname twice, every one in capitals', () => {
    expect(new Set(CHINESE_SURNAMES).size).toBe(CHINESE_SURNAMES.length)
    for (const s of CHINESE_SURNAMES) expect(s).toBe(s.toUpperCase())
  })
})

describe('the greeting’s name', () => {
  it('is the first name kept, else the full name’s — WEN WEI, never "LOO WEN"', () => {
    expect(greetingName('LOO WEN WEI', 'WEN WEI')).toBe('WEN WEI')
    expect(greetingName('LOO WEN WEI')).toBe('WEN WEI')
    expect(greetingName('GOH JOEY', 'Joey')).toBe('Joey')
    expect(greetingName('Principal')).toBe('Principal')
    expect(greetingName('LOO WEN WEI', '  ')).toBe('WEN WEI')
  })
})
