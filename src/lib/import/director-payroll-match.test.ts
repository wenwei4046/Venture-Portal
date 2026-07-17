import { describe, it, expect } from 'vitest'
import { matchDirector, normaliseName, type DirectorRef } from './director-payroll-match'

const DIRECTORS: DirectorRef[] = [
  { id: '1', code: 'WW', name: 'Chew Wen Wei' },
  { id: '2', code: 'WS', name: 'Chew Wen Shan' },
  { id: '3', code: 'MK', name: 'Mah Kah Meng' },
  { id: '4', code: 'WL', name: 'Wong Li' },
]

describe('normaliseName', () => {
  it('lowercases and strips punctuation/spaces', () => {
    expect(normaliseName('CHEW WEN-WEI')).toBe('chewwenwei')
    expect(normaliseName("Mah Kah Meng A/L Mah")).toBe('mahkahmengalmah')
  })
})

describe('matchDirector', () => {
  it('matches exact name regardless of case and spacing', () => {
    expect(matchDirector('CHEW WEN WEI', DIRECTORS)?.code).toBe('WW')
    expect(matchDirector('chewwenshan', DIRECTORS)?.code).toBe('WS')
  })

  it('matches when the file name contains the director name (longer legal name)', () => {
    expect(matchDirector('MAH KAH MENG A/L MAH KOK', DIRECTORS)?.code).toBe('MK')
  })

  it('does not containment-match names shorter than 6 normalised chars', () => {
    // "Wong Li" normalises to "wongli" (6 chars) — allowed
    expect(matchDirector('WONG LI A/P WONG', DIRECTORS)?.code).toBe('WL')
    // but a 2-char fragment must never hit
    expect(matchDirector('LI', DIRECTORS)).toBeNull()
  })

  it('returns null for staff who are not directors', () => {
    expect(matchDirector('NURAZIRA BINTI ALI', DIRECTORS)).toBeNull()
    expect(matchDirector('', DIRECTORS)).toBeNull()
  })

  it('prefers exact match over containment', () => {
    const dirs: DirectorRef[] = [
      { id: 'a', code: 'AA', name: 'Chew Wen' },
      { id: 'b', code: 'BB', name: 'Chew Wen Wei' },
    ]
    expect(matchDirector('Chew Wen Wei', dirs)?.code).toBe('BB')
  })
})
