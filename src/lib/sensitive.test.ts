import { describe, expect, it } from 'vitest'
import { MASKED, isMasked, needsTick, onFile, sees, sensitiveFromKeys, shown } from './sensitive'

describe('shown — a value as the viewer may see it (PR4)', () => {
  const hr = { sensitive: ['bank', 'nric', 'salary'] as const }
  const director = { sensitive: ['salary'] as const }
  const nobody = {}

  it('is the value for a holder of the tick', () => {
    expect(shown(hr, 'nric', '850101141234')).toBe('850101141234')
    expect(shown(hr, 'bank', '1234567890')).toBe('1234567890')
  })

  it('is •••• when on file and the tick is not theirs — absent ticks mean none', () => {
    expect(shown(director, 'nric', '850101141234')).toBe(MASKED)
    expect(shown(director, 'bank', '1234567890')).toBe(MASKED)
    expect(shown(nobody, 'bank', '1234567890')).toBe(MASKED)
  })

  it('leaves blank as blank — whether a field is filled in is not a secret', () => {
    expect(shown(director, 'nric', null)).toBeNull()
    expect(shown(director, 'nric', undefined)).toBeNull()
    expect(shown(director, 'nric', '')).toBe('')
    expect(shown(director, 'bank', '   ')).toBe('   ')
  })

  it('counts •••• as on file, blank as missing', () => {
    expect(onFile(MASKED)).toBe(true)
    expect(onFile('1234')).toBe(true)
    expect(onFile('')).toBe(false)
    expect(onFile(null)).toBe(false)
    expect(isMasked(MASKED)).toBe(true)
    expect(isMasked('1234')).toBe(false)
  })

  it('asks the ticks', () => {
    expect(sees(hr, 'salary')).toBe(true)
    expect(sees(director, 'bank')).toBe(false)
    expect(sees(nobody, 'salary')).toBe(false)
  })
})

describe('sensitiveFromKeys — current_sensitive_fields() for an account with no template', () => {
  it('rule for rule: Principal and HR see NRIC and bank, Finance bank, salary with salary_individual', () => {
    expect(sensitiveFromKeys(['salary_individual', 'team'], 'principal')).toEqual(['bank', 'nric', 'salary'])
    expect(sensitiveFromKeys(['salary_individual', 'team'], 'hr')).toEqual(['bank', 'nric', 'salary'])
    expect(sensitiveFromKeys(['treasury', 'payroll_payouts'], 'finance')).toEqual(['bank'])
    expect(sensitiveFromKeys(['dept_pool'], 'dept_manager')).toEqual([])
    expect(sensitiveFromKeys(['member_portal'], 'revenue_member')).toEqual([])
  })
})

describe('needsTick', () => {
  it('names the tick and where it is set', () => {
    expect(needsTick('bank', 'The payroll bank file')).toMatch(/^The payroll bank file needs Bank accounts ticked/)
    expect(needsTick('nric', 'A statutory file')).toMatch(/NRIC \/ IC ticked/)
  })
})
