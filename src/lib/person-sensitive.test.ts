import { describe, expect, it } from 'vitest'
import { isSensitiveTickList, sameSensitiveTicks, sensitiveOf, sensitiveTicksFromRows, toggleSensitive } from './person-sensitive'

// One person's Salary / NRIC / Bank over their template's (2026-10-16 — the owner: "Edit Permission 的优先级是高于
// Title 和 Template 的"; mig 20261016210000).
describe('a person’s own sensitive fields', () => {
  it('lays their ticks over the template’s, in the matrix’s order', () => {
    expect(sensitiveOf(['bank'], [{ field: 'salary', granted: true }])).toEqual(['salary', 'bank'])
    expect(sensitiveOf(['salary', 'nric', 'bank'], [{ field: 'salary', granted: false }])).toEqual(['nric', 'bank'])
    expect(sensitiveOf([], [])).toEqual([])
  })

  it('a click flips one field, and landing back on the template stores no tick', () => {
    const on = toggleSensitive([], [], 'salary')
    expect(on).toEqual([{ field: 'salary', granted: true }])
    expect(toggleSensitive([], on, 'salary')).toEqual([])
    expect(toggleSensitive(['bank'], [], 'bank')).toEqual([{ field: 'bank', granted: false }])
  })

  it('compares whatever the order, and reads rows dropping what it does not know', () => {
    expect(sameSensitiveTicks([{ field: 'nric', granted: true }, { field: 'bank', granted: false }], [{ field: 'bank', granted: false }, { field: 'nric', granted: true }])).toBe(true)
    expect(sameSensitiveTicks([{ field: 'nric', granted: true }], [])).toBe(false)
    expect(sensitiveTicksFromRows([{ field: 'nric', granted: true }, { field: 'pin', granted: true }])).toEqual([{ field: 'nric', granted: true }])
  })

  it('takes a field, on or off, each once — at most the three', () => {
    expect(isSensitiveTickList([{ field: 'salary', granted: true }, { field: 'bank', granted: false }])).toBe(true)
    expect(isSensitiveTickList([])).toBe(true)
    expect(isSensitiveTickList([{ field: 'salary', granted: true }, { field: 'salary', granted: false }])).toBe(false)
    expect(isSensitiveTickList([{ field: 'pin', granted: true }])).toBe(false)
    expect(isSensitiveTickList([{ field: 'salary' }])).toBe(false)
    expect(isSensitiveTickList('salary')).toBe(false)
    expect(isSensitiveTickList([{ field: 'salary', granted: true }, { field: 'nric', granted: true }, { field: 'bank', granted: true }, { field: 'bank', granted: false }])).toBe(false)
  })
})
