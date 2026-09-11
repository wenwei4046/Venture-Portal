import { describe, expect, it } from 'vitest'
import { buildStaffMatcher, normaliseInfotechCode, normaliseName } from './staff-match'

const roster = [
  { id: 'tammy', employee_name: 'TAMMY KHOO KHIM LING', infotech_code: 'HV022' },
  { id: 'kho', employee_name: 'KHO WEI JIE', infotech_code: 'HV013' },
  { id: 'li-sean', employee_name: 'LI SEAN', infotech_code: 'HV031' },
  { id: 'kris', employee_name: 'KRIS', infotech_code: null },
  { id: 'ceo', employee_name: 'LOO WEN WEI', infotech_code: null },
]

/**
 * After 2026-09-12 the portal's HV code and InfoTech's number are two
 * different things, so a file row is matched on `infotech_code` first and on
 * the name second — never on `employee_code`.
 */
describe('buildStaffMatcher', () => {
  const match = buildStaffMatcher(roster)

  it("matches InfoTech's number first — the portal's HV013 is somebody else now", () => {
    expect(match({ employeeCode: 'HV013', employeeName: 'KHO WEI JIE' })).toEqual({
      staff: roster[1],
      matchedBy: 'infotech_code',
    })
  })

  it('the number wins over the name: a renamed person is still the same number', () => {
    expect(match({ employeeCode: 'HV022', employeeName: 'TAMMY KHOO' }).staff?.id).toBe('tammy')
  })

  it('falls back to the name for somebody whose number is not known yet, ignoring case, spaces and punctuation', () => {
    expect(match({ employeeCode: 'HV040', employeeName: 'loo wen wei' })).toEqual({
      staff: roster[4],
      matchedBy: 'employee_name',
    })
    expect(match({ employeeCode: '', employeeName: 'Kris.' }).staff?.id).toBe('kris')
  })

  it('reads the number the way the file writes it — padded, in either case', () => {
    expect(match({ employeeCode: '  hv022 ', employeeName: '' }).staff?.id).toBe('tammy')
  })

  it('does not re-identify a known person by name under a different number', () => {
    // LI SEAN is HV031; a row saying HV999 is more likely a namesake than a
    // renumbering, and either way somebody has to look.
    const miss = match({ employeeCode: 'HV999', employeeName: 'LI SEAN' })
    expect(miss.staff).toBeNull()
    expect(miss.miss).toBe('number_conflict')
    expect(miss.reason).toBe(
      'LI SEAN is InfoTech No HV031 on the roster, but the file says HV999 — correct one of them and import again',
    )
    // A row with no number at all still finds them by name.
    expect(match({ employeeCode: '', employeeName: 'LI SEAN' }).matchedBy).toBe('employee_name')
  })

  it('matches nobody when neither the number nor the name is on the roster', () => {
    expect(match({ employeeCode: 'HV099', employeeName: 'NOBODY' })).toEqual({
      staff: null,
      miss: 'none',
      reason: 'No matching staff',
    })
  })

  it('refuses to guess between two people who share a name, and says who', () => {
    const twins = buildStaffMatcher([
      { id: 'a', employee_name: 'RACHAEL', infotech_code: null },
      { id: 'b', employee_name: 'Rachael', infotech_code: null },
    ])
    const miss = twins({ employeeCode: 'HV050', employeeName: 'RACHAEL' })
    expect(miss.staff).toBeNull()
    expect(miss.miss).toBe('ambiguous_name')
    expect(miss.reason).toContain('2 people on the roster share this name (RACHAEL, Rachael)')
    expect(miss.reason).toContain('InfoTech No')
  })

  it('a person with no name at all is never a name match', () => {
    const m = buildStaffMatcher([{ id: 'x', employee_name: '   ', infotech_code: null }])
    expect(m({ employeeCode: '', employeeName: '' }).staff).toBeNull()
  })
})

describe('normalisers', () => {
  it('normaliseName drops everything but letters and digits, lower-cased', () => {
    expect(normaliseName('SITI RAFIDAH BINTI FADLULLAH TEY')).toBe('sitirafidahbintifadlullahtey')
    expect(normaliseName("O'Brien-Lee 2")).toBe('obrienlee2')
  })

  it('normaliseInfotechCode trims and upper-cases; blank is null', () => {
    expect(normaliseInfotechCode(' hvi001 ')).toBe('HVI001')
    expect(normaliseInfotechCode('')).toBeNull()
    expect(normaliseInfotechCode('   ')).toBeNull()
    expect(normaliseInfotechCode(null)).toBeNull()
    expect(normaliseInfotechCode(undefined)).toBeNull()
  })
})
