import { describe, it, expect } from 'vitest'
import {
  boundaryRefusal,
  lineRefusal,
  recruitRefusal,
  type BoundaryPerson,
  type LineManager,
} from './hierarchy-boundary'

const rev = (name: string): BoundaryPerson => ({
  name,
  commissionDept: true,
  department: 'Revenue Department',
})
const fin = (name: string): BoundaryPerson => ({
  name,
  commissionDept: false,
  department: 'Finance',
})
const leader = (name: string, over: Partial<LineManager> = {}): LineManager => ({
  ...rev(name),
  title: 'Team Leader',
  canRecruit: true,
  ...over,
})

describe('boundaryRefusal', () => {
  it('allows a line that stays inside the commission department', () => {
    expect(boundaryRefusal(rev('Ali'), rev('Ben'))).toBeNull()
  })

  it('allows a line between two departments that are not paid by commission', () => {
    // The old freedom, untouched. There is no second graph over Finance and HR,
    // so there is nothing for a rule here to keep in step.
    expect(boundaryRefusal(fin('Farah'), { name: 'Hana', commissionDept: false, department: 'HR' }))
      .toBeNull()
  })

  it('refuses a commission-department person reporting outwards', () => {
    const note = boundaryRefusal(rev('Ali'), fin('Farah'))
    expect(note).toContain('Ali')
    expect(note).toContain('Farah')
    expect(note).toContain('Revenue Department')
    expect(note).toContain('Finance')
    // The refusal has to carry the way out, or it sends somebody hunting for a
    // rule nobody wrote down.
    expect(note).toContain('move Farah into it first')
  })

  it('refuses an outsider reporting into the commission department', () => {
    // Symmetric on purpose: this direction breaks the same equality from the
    // other side — the manager grows a report the commission chart cannot show.
    const note = boundaryRefusal(fin('Farah'), rev('Ben'))
    expect(note).toContain('Farah')
    expect(note).toContain('Ben')
    expect(note).toContain('Revenue Department')
  })

  it('allows a detach, including out of the commission department', () => {
    // The top of a commission department reporting to nobody is the shape the
    // user asked for, not a boundary crossing.
    expect(boundaryRefusal(rev('Ben'), null)).toBeNull()
    expect(boundaryRefusal(fin('Farah'), null)).toBeNull()
  })

  it('still reads as English when somebody has no department', () => {
    const note = boundaryRefusal(rev('Ali'), {
      name: 'Nobody',
      commissionDept: false,
      department: null,
    })
    expect(note).toContain('no department')
    expect(note).not.toContain('null')
  })
})

describe('recruitRefusal', () => {
  it('allows a manager whose title may hold downlines', () => {
    expect(recruitRefusal(rev('Ali'), leader('Ben'))).toBeNull()
  })

  it('allows the department head, who has no rung and may hold everybody (2026-09-11)', () => {
    // `comm_title_can_recruit` answers true for a title that heads the
    // department, so the facts arrive with canRecruit = true and no rung.
    expect(recruitRefusal(rev('Ali'), leader('Peter', { title: 'Revenue Director', canRecruit: true }))).toBeNull()
    expect(lineRefusal(rev('Ali'), leader('Peter', { title: 'Revenue Director', canRecruit: true }))).toBeNull()
  })

  it('refuses a title that cannot hold downlines — an RS under an RS is not a line', () => {
    const note = recruitRefusal(rev('Ali'), leader('Ben', { title: 'Revenue Specialist', canRecruit: false }))
    expect(note).toBe(
      'Ali cannot report to Ben: a Revenue Specialist cannot hold downlines. Inside a commission department the reporting line is also the commission upline, so pick somebody whose title may recruit.',
    )
  })

  it('reads a title the ladder does not carry as "no", and says so for no title at all', () => {
    expect(recruitRefusal(rev('Ali'), leader('Ben', { title: 'Consultant', canRecruit: null }))).toContain(
      'a Consultant cannot hold downlines',
    )
    expect(recruitRefusal(rev('Ali'), leader('Ben', { title: null, canRecruit: null }))).toContain(
      'holds no title on the commission ladder',
    )
  })

  it('says nothing outside a commission department, and nothing about a detach', () => {
    expect(recruitRefusal(fin('Farah'), { ...leader('Hana'), commissionDept: false, canRecruit: false })).toBeNull()
    expect(recruitRefusal(rev('Ali'), null)).toBeNull()
  })
})

describe('lineRefusal', () => {
  it('applies the boundary before the recruit rule', () => {
    // An outsider is refused for being outside, not for a title the Revenue
    // ladder does not carry.
    const note = lineRefusal(rev('Ali'), { ...fin('Farah'), title: 'Manager', canRecruit: null })
    expect(note).toContain('Finance')
    expect(note).not.toContain('cannot hold downlines')
  })

  it('then the recruit rule, then nothing', () => {
    expect(lineRefusal(rev('Ali'), leader('Ben', { title: 'Revenue Specialist', canRecruit: false }))).toContain(
      'cannot hold downlines',
    )
    expect(lineRefusal(rev('Ali'), leader('Ben'))).toBeNull()
  })
})
