import { describe, it, expect } from 'vitest'
import { deptRemaining, summariseRound, round2, type RoundLine } from './payroll-funding'

function line(partial: Partial<RoundLine>): RoundLine {
  return {
    pool_key: 'dept_pool_hr',
    dept_name: 'HR',
    required: 0,
    pool_balance: 0,
    committed: 0,
    input: 0,
    ...partial,
  }
}

describe('round2', () => {
  it('rounds to cents and tolerates junk', () => {
    expect(round2(1.014)).toBe(1.01)
    expect(round2(1.016)).toBe(1.02)
    expect(round2(10.004)).toBe(10)
    expect(round2(NaN)).toBe(0)
  })
})

describe('deptRemaining', () => {
  it('is required minus committed, floored at zero', () => {
    expect(deptRemaining({ required: 1000, committed: 0 })).toBe(1000)
    expect(deptRemaining({ required: 1000, committed: 400 })).toBe(600)
    expect(deptRemaining({ required: 1000, committed: 1000 })).toBe(0)
    // over-committed never goes negative
    expect(deptRemaining({ required: 1000, committed: 1200 })).toBe(0)
  })
})

describe('summariseRound', () => {
  it('full single-round funding is valid and clears the remainder', () => {
    const lines = [
      line({ pool_key: 'dept_pool_hr', required: 21351.1, pool_balance: 21666.52, input: 21351.1 }),
      line({ pool_key: 'dept_pool_finance', required: 23882.01, pool_balance: 23431.43, input: 23882.01 }),
    ]
    const s = summariseRound(lines, 45233.11, 0)
    expect(s.sumInput).toBe(45233.11)
    expect(s.remainingBefore).toBe(45233.11)
    expect(s.remainingAfter).toBe(0)
    expect(s.canSubmit).toBe(true)
    // Finance pool would go slightly negative — flagged as overdraw, still allowed.
    expect(s.overdrawRows.map(r => r.pool_key)).toEqual(['dept_pool_finance'])
    expect(s.overCommitRows).toHaveLength(0)
  })

  it('partial round leaves a positive remainder and stays submittable', () => {
    // Marketing owes 43,691.34 but pool only has 11,374.21 → fund just the cash it has.
    const lines = [
      line({ pool_key: 'dept_pool_marketing', required: 43691.34, pool_balance: 11374.21, input: 11374.21 }),
    ]
    const s = summariseRound(lines, 95390.7, 0)
    expect(s.sumInput).toBe(11374.21)
    expect(s.remainingBefore).toBe(95390.7)
    expect(s.remainingAfter).toBe(84016.49)
    expect(s.canSubmit).toBe(true)
    expect(s.overdrawRows).toHaveLength(0) // funded exactly the pool balance
  })

  it('overdraw (input > pool cash) is a warning, not a blocker', () => {
    const lines = [
      line({ pool_key: 'dept_pool_marketing', required: 43691.34, pool_balance: 11374.21, input: 20000 }),
    ]
    const s = summariseRound(lines, 95390.7, 0)
    expect(s.overdrawRows).toHaveLength(1)
    expect(s.canSubmit).toBe(true) // still valid — pool just goes negative
  })

  it('over-committing a department beyond what it owes is blocked', () => {
    const lines = [
      // HR owes 1000 total, 400 already funded → only 600 left, but 800 typed.
      line({ pool_key: 'dept_pool_hr', required: 1000, committed: 400, pool_balance: 9999, input: 800 }),
    ]
    const s = summariseRound(lines, 1000, 400)
    expect(s.overCommitRows).toHaveLength(1)
    expect(s.canSubmit).toBe(false)
  })

  it('a round exceeding the outstanding remainder is blocked', () => {
    const lines = [line({ required: 5000, committed: 0, pool_balance: 9999, input: 5000 })]
    // Only 3000 left on the whole request.
    const s = summariseRound(lines, 8000, 5000)
    expect(s.remainingBefore).toBe(3000)
    expect(s.canSubmit).toBe(false)
  })

  it('a zero/empty round is not submittable', () => {
    const lines = [line({ required: 1000, pool_balance: 1000, input: 0 })]
    const s = summariseRound(lines, 1000, 0)
    expect(s.canSubmit).toBe(false)
  })

  it('second round after a prior partial completes the request', () => {
    // Prior round funded 11,374.21 of Marketing; now fund the rest by overdraw.
    const lines = [
      line({
        pool_key: 'dept_pool_marketing',
        required: 43691.34,
        committed: 11374.21,
        pool_balance: 0,
        input: 32317.13,
      }),
    ]
    const s = summariseRound(lines, 95390.7, 63073.57)
    expect(s.remainingBefore).toBe(32317.13)
    expect(s.remainingAfter).toBe(0)
    expect(s.overdrawRows).toHaveLength(1) // pool empty → full overdraw
    expect(s.overCommitRows).toHaveLength(0) // exactly clears Marketing's remainder
    expect(s.canSubmit).toBe(true)
  })
})
